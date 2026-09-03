import assert from "node:assert/strict";
import { OrderStatus } from "@prisma/client";
import { prisma } from "../lib/db/client";
import { runBoundedAgent } from "../lib/ai/agent";
import { agentTools, assertActionAllowedForStatus } from "../lib/ai/execute";
import { processPaymentCapture } from "../lib/razorpay/webhook";
import { seedDatabase } from "../prisma/seed";

async function runBoundedAgentTests() {
  console.log("\n=======================================================");
  console.log("🤖 RUNNING BOUNDED AI AGENT TESTS (10 REQUIRED SCENARIOS)");
  console.log("=======================================================\n");

  // Step 1: Clean seed state
  console.log("▶ STEP 1: Seeding database for clean test environment");
  await seedDatabase();

  // -------------------------------------------------------------
  // TEST 1: Valid payment-link decision
  // -------------------------------------------------------------
  console.log("▶ TEST 1: Valid payment-link decision");
  const result1 = await runBoundedAgent("conv_trusted");

  console.log("Decision 1:", JSON.stringify(result1.decision, null, 2));

  assert.equal(result1.decision.action, "createPaymentLink", "Action should be createPaymentLink");
  assert.equal(result1.recommendation.recommendedAdvancePercentage, 30, "Advance percentage should be 30%");
  assert.equal(result1.recommendation.recommendedAdvanceAmount, 22200, "Advance amount should be ₹22,200");
  assert.equal(result1.decision.requiresApproval, true, "Should require approval when requireApprovalForFinancialActions is true");
  assert.ok(result1.decision.customerRequest.includes("40"), "Customer request should reference 40 shirts");
  console.log("✅ TEST 1 PASSED: Agent correctly decided createPaymentLink (₹22,200) and staged for merchant approval.\n");

  // -------------------------------------------------------------
  // TEST 2: Credit request when credit is disabled
  // -------------------------------------------------------------
  console.log("▶ TEST 2: Credit request when credit is disabled");
  const result2 = await runBoundedAgent("conv_credit");

  console.log("Decision 2:", JSON.stringify(result2.decision, null, 2));

  assert.equal(result2.recommendation.violations.length > 0, true, "Should flag credit disallowed violation");
  assert.ok(
    result2.recommendation.violations.some((v) => v.includes("Credit terms are not allowed")),
    "Should include credit disallowed in violations",
  );
  assert.equal(result2.recommendation.recommendedAdvancePercentage, 25, "Should enforce minimum 25% advance");
  assert.equal(result2.recommendation.recommendedAdvanceAmount, 6860, "Advance amount should be ₹6,860 (25% of 27,440)");
  console.log("✅ TEST 2 PASSED: Credit request denied and converted to mandatory 25% advance.\n");

  // -------------------------------------------------------------
  // TEST 3: Discount exceeding merchant limit
  // -------------------------------------------------------------
  console.log("▶ TEST 3: Discount exceeding merchant limit");
  const result3 = await runBoundedAgent("conv_discount");

  console.log("Decision 3:", JSON.stringify(result3.decision, null, 2));

  assert.equal(result3.decision.action, "createFollowUp", "Action should be createFollowUp counter-offer");
  assert.equal(result3.recommendation.approvedDiscountPercentage, 5, "Discount capped at 5%");
  assert.equal(result3.recommendation.canIssuePaymentLink, false, "Payment link issuance prohibited for excessive discount");
  assert.ok(
    result3.recommendation.violations.some((v) => v.includes("exceeds the 5% maximum")),
    "Should flag discount exceeding policy limit",
  );
  console.log("✅ TEST 3 PASSED: 20% discount capped at 5% and routed to follow-up counter-offer.\n");

  // -------------------------------------------------------------
  // TEST 4: Invalid payment amount (Backend Authoritative Guard)
  // -------------------------------------------------------------
  console.log("▶ TEST 4: Invalid payment amount (Reject LLM Hallucinated / Tampered Amount)");
  const trustedOrder = await prisma.order.findFirst({
    where: { conversationId: "conv_trusted" },
  });
  assert.ok(trustedOrder, "Trusted order must exist");

  // LLM attempts to pass arbitrary invalid amount (e.g. ₹9,999 instead of policy ₹22,200)
  const invalidAmountRes = await agentTools.createPaymentLink({
    orderId: trustedOrder.id,
    amount: 9999, // Inconsistent with policy advance (22,200)
    description: "Tampered amount link",
  });

  console.log("Invalid Amount Result:", JSON.stringify(invalidAmountRes, null, 2));
  assert.equal(invalidAmountRes.success, false, "Must reject inconsistent amount");
  assert.ok(
    invalidAmountRes.error?.includes("Financial validation failed"),
    "Error message must specify financial validation failure",
  );

  const invalidAmountAudit = await prisma.agentActionLog.findFirst({
    where: { action: "createPaymentLink", success: false },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(invalidAmountAudit, "Action failure must be audited in agentActionLog");
  console.log("✅ TEST 4 PASSED: Authoritative backend rejected inconsistent amount from LLM.\n");

  // -------------------------------------------------------------
  // TEST 5: Invalid order state (State Machine Guard)
  // -------------------------------------------------------------
  console.log("▶ TEST 5: Invalid order state (State Machine Guard)");

  // Attempting createPaymentLink on an order in PAID or FULFILLED status
  assert.throws(
    () => {
      assertActionAllowedForStatus(OrderStatus.PAID, "createPaymentLink");
    },
    (err: unknown) => {
      const msg = (err as Error).message;
      return msg.includes("Action 'createPaymentLink' is not allowed for order status 'PAID'");
    },
    "Must throw on disallowed action for PAID status",
  );

  assert.throws(
    () => {
      assertActionAllowedForStatus(OrderStatus.FULFILLED, "createPaymentLink");
    },
    (err: unknown) => {
      const msg = (err as Error).message;
      return msg.includes("Action 'createPaymentLink' is not allowed for order status 'FULFILLED'");
    },
    "Must throw on disallowed action for FULFILLED status",
  );
  console.log("✅ TEST 5 PASSED: State machine strictly blocks illegal actions on finalized orders.\n");

  // -------------------------------------------------------------
  // TEST 6: Duplicate tool call (Idempotency Guard)
  // -------------------------------------------------------------
  console.log("▶ TEST 6: Duplicate tool call (Idempotency Guard)");

  // First valid execution of createPaymentLink
  const firstLinkRes = await agentTools.createPaymentLink({
    orderId: trustedOrder.id,
    amount: 22200,
    description: "Valid 30% advance",
  });

  assert.equal(firstLinkRes.success, true, "First payment link creation must succeed");
  assert.ok(firstLinkRes.paymentLinkId, "Payment link ID must be returned");

  // Attempt duplicate execution for the same order in PAYMENT_REQUESTED state
  const duplicateLinkRes = await agentTools.createPaymentLink({
    orderId: trustedOrder.id,
    amount: 22200,
    description: "Duplicate advance request",
  });

  console.log("Duplicate Link Result:", JSON.stringify(duplicateLinkRes, null, 2));
  assert.equal(duplicateLinkRes.success, false, "Duplicate payment link creation must be rejected");
  assert.ok(
    duplicateLinkRes.error?.includes("Active payment link already exists"),
    "Must report active payment link already exists",
  );
  console.log("✅ TEST 6 PASSED: Duplicate tool call prevented without creating redundant payment links.\n");

  // -------------------------------------------------------------
  // TEST 7: Razorpay API failure handling
  // -------------------------------------------------------------
  console.log("▶ TEST 7: Razorpay API failure handling");

  // Attempt payment link creation with non-existent order ID
  const apiFailRes = await agentTools.createPaymentLink({
    orderId: "non_existent_order_id_999",
    amount: 5000,
    description: "Test failure",
  });

  assert.equal(apiFailRes.success, false, "Should handle missing order/API failure gracefully");
  assert.ok(apiFailRes.error?.includes("Order not found"), "Should report error clearly");

  const failAudit = await prisma.agentActionLog.findFirst({
    where: { action: "createPaymentLink", success: false },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(failAudit, "Failure must be recorded in agentActionLog");
  console.log("✅ TEST 7 PASSED: Razorpay/backend failures handled safely with audit logging.\n");

  // -------------------------------------------------------------
  // TEST 8: Agent exceeding maximum tool calls (Loop Limit Cutoff)
  // -------------------------------------------------------------
  console.log("▶ TEST 8: Agent exceeding maximum tool calls (Loop Limit Cutoff)");

  const loopResult = await runBoundedAgent("conv_trusted", {
    overrideToolLimit: 3,
  });

  assert.ok(loopResult.toolCallsExecuted <= 3, "toolCallsExecuted must never exceed 3");
  console.log(`Verified: Tool calls executed = ${loopResult.toolCallsExecuted} (within strict limit <= 3)`);
  console.log("✅ TEST 8 PASSED: Maximum 3 tool call limit strictly enforced.\n");

  // -------------------------------------------------------------
  // TEST 9: Successful payment causing correct state transition (PAID -> FULFILLED)
  // -------------------------------------------------------------
  console.log("▶ TEST 9: Successful payment causing correct state transition (PAID -> FULFILLED)");

  // Capture full remaining balance on trusted order
  const fullPayRes = await processPaymentCapture({
    orderId: trustedOrder.id,
    paymentId: `pay_test_full_${Date.now()}`,
    amount: 74000,
    event: "payment.captured",
  });

  assert.equal(fullPayRes.newStatus, "PAID", "Order must transition to PAID");
  assert.equal(fullPayRes.remaining, 0, "Remaining balance must be 0");

  // Re-run bounded agent on PAID order
  const postPayResult = await runBoundedAgent("conv_trusted");
  console.log("Post Full Payment Decision:", JSON.stringify(postPayResult.decision, null, 2));

  assert.equal(postPayResult.decision.action, "updateOrderStatus", "Agent must choose updateOrderStatus (fulfillment)");
  assert.ok(postPayResult.decision.decision.includes("fully paid") || postPayResult.decision.decision.includes("dispatch"), "Reason should indicate order is fully paid");
  console.log("✅ TEST 9 PASSED: Full payment transitioned order to PAID, and agent recommended fulfillment.\n");

  // -------------------------------------------------------------
  // TEST 10: Partial payment causing correct state transition (PARTIALLY_PAID -> sendPaymentRequest)
  // -------------------------------------------------------------
  console.log("▶ TEST 10: Partial payment causing correct state transition (PARTIALLY_PAID -> sendPaymentRequest)");

  const partialConversation = await prisma.conversation.findUnique({
    where: { id: "conv_partial" },
    include: { order: true },
  });

  assert.ok(partialConversation, "conv_partial must exist");
  assert.ok(partialConversation.order, "conv_partial order must exist");

  const partialAgentRes = await runBoundedAgent("conv_partial");
  console.log("Partial Paid Decision:", JSON.stringify(partialAgentRes.decision, null, 2));

  assert.equal(partialAgentRes.decision.action, "sendPaymentRequest", "Agent must choose sendPaymentRequest for remaining balance");
  assert.ok(
    partialAgentRes.decision.decision.includes("balance") || partialAgentRes.decision.decision.includes("35,000") || partialAgentRes.decision.decision.includes("remaining"),
    "Decision must reference collecting remaining balance",
  );
  console.log("✅ TEST 10 PASSED: Partial payment state correctly triggers request for remaining balance.\n");

  // Step 11: Restore clean database state
  console.log("▶ CLEANUP: Restoring clean seed state");
  await seedDatabase();
  console.log("✅ Database reset cleanly.");

  console.log("\n=======================================================");
  console.log("🎉 ALL 10 BOUNDED AI AGENT TESTS PASSED PERFECTLY!");
  console.log("=======================================================\n");
}

runBoundedAgentTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Bounded agent tests failed:", err);
    process.exit(1);
  });
