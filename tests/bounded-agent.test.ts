import assert from "node:assert/strict";
import { OrderStatus } from "@prisma/client";
import { prisma } from "../lib/db/client";
import { runBoundedAgent } from "../lib/ai/agent";
import { agentTools, assertActionAllowedForStatus } from "../lib/ai/execute";
import { processPaymentCapture } from "../lib/razorpay/webhook";
import { seedDatabase } from "../prisma/seed";

async function runBoundedAgentTests() {
  console.log("\n=======================================================");
  console.log("🤖 RUNNING BOUNDED AI AGENT TESTS (PHASE C)");
  console.log("=======================================================\n");

  // Step 1: Clean seed state
  console.log("▶ STEP 1: Seeding database for clean test environment");
  await seedDatabase();

  // -------------------------------------------------------------
  // TEST 1: Trusted Repeat Customer (Rahul Textiles: 30% advance requested)
  // -------------------------------------------------------------
  console.log("▶ TEST 1: Trusted Repeat Customer (Rahul Textiles: ₹74k, 30% advance)");
  const result1 = await runBoundedAgent("conv_trusted");

  console.log("Decision 1:", JSON.stringify(result1.decision, null, 2));

  assert.equal(result1.decision.action, "createPaymentLink", "Action should be createPaymentLink");
  assert.equal(result1.recommendation.recommendedAdvancePercentage, 30, "Advance percentage should be 30%");
  assert.equal(result1.recommendation.recommendedAdvanceAmount, 22200, "Advance amount should be ₹22,200");
  assert.equal(result1.decision.requiresApproval, true, "Should require approval when requireApprovalForFinancialActions is true");
  assert.ok(result1.decision.decision.includes("Rahul Textiles") || result1.decision.decision.includes("7 previous orders") || result1.decision.decision.includes("REQUEST 30% ADVANCE"), "Reason should be context-aware");
  console.log("✅ TEST 1 PASSED: Agent correctly approved 30% advance for trusted repeat customer.\n");

  // -------------------------------------------------------------
  // TEST 2: New Customer (Priya Nair: 0 orders, requests post-delivery payment)
  // -------------------------------------------------------------
  console.log("▶ TEST 2: New Customer (Priya Nair: 0 orders, requires 25% minimum advance)");
  const result2 = await runBoundedAgent("conv_new");

  console.log("Decision 2:", JSON.stringify(result2.decision, null, 2));

  assert.equal(result2.recommendation.recommendedAdvancePercentage, 25, "New customer must pay 25% minimum advance");
  assert.equal(result2.recommendation.recommendedAdvanceAmount, 10000, "25% of ₹40,000 = ₹10,000");
  assert.ok(
    result2.decision.decision.includes("New") || result2.decision.decision.includes("no previous order history") || result2.decision.decision.includes("REQUEST 25% ADVANCE"),
    "Decision must reference new customer advance policy",
  );
  console.log("✅ TEST 2 PASSED: New customer COD request overridden to mandatory 25% advance.\n");

  // -------------------------------------------------------------
  // TEST 3: Risky Customer (Meera Kapoor: HIGH risk, requests 30-day credit)
  // -------------------------------------------------------------
  console.log("▶ TEST 3: Risky Customer (Meera Kapoor: HIGH risk, reject credit + require approval)");
  const result3 = await runBoundedAgent("conv_credit");

  console.log("Decision 3:", JSON.stringify(result3.decision, null, 2));

  assert.equal(result3.recommendation.violations.length > 0, true, "Should flag violations");
  assert.equal(result3.recommendation.recommendedAdvancePercentage, 25, "Must require 25% advance");
  assert.equal(result3.recommendation.recommendedAdvanceAmount, 22500, "Advance amount should be ₹22,500 (25% of 90,000)");
  assert.equal(result3.decision.requiresApproval, true, "High risk customer must require human approval");
  console.log("✅ TEST 3 PASSED: High risk customer credit denied, advance and human approval enforced.\n");

  // -------------------------------------------------------------
  // TEST 4: Excessive Discount Request (Arjun Mehta: asks 15% discount)
  // -------------------------------------------------------------
  console.log("▶ TEST 4: Excessive Discount Request (Arjun Mehta: asks 15% discount vs 5% max)");
  const result4 = await runBoundedAgent("conv_discount");

  console.log("Decision 4:", JSON.stringify(result4.decision, null, 2));

  assert.equal(result4.decision.action, "createFollowUp", "Action should be createFollowUp counter-offer");
  assert.equal(result4.recommendation.approvedDiscountPercentage, 5, "Discount capped at 5%");
  assert.equal(result4.recommendation.canIssuePaymentLink, false, "Payment link issuance prohibited for excessive discount");
  assert.ok(
    result4.recommendation.violations.some((v) => v.includes("exceeds the 5% maximum")),
    "Should flag discount exceeding policy limit",
  );
  console.log("✅ TEST 4 PASSED: 15% discount capped at 5% and routed to follow-up counter-offer.\n");

  // -------------------------------------------------------------
  // TEST 5: Backend Authoritative Guard Against LLM Policy Bypass
  // -------------------------------------------------------------
  console.log("▶ TEST 5: Backend Authoritative Guard Against Policy Bypass / Tampered Amount");
  const trustedOrder = await prisma.order.findFirst({
    where: { conversationId: "conv_trusted" },
  });
  assert.ok(trustedOrder, "Trusted order must exist");

  // LLM attempts to create payment link for unauthorized amount (e.g. ₹5,000 instead of ₹22,200)
  const invalidAmountRes = await agentTools.createPaymentLink({
    orderId: trustedOrder.id,
    amount: 5000,
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
  console.log("✅ TEST 5 PASSED: Authoritative backend rejected inconsistent amount from LLM.\n");

  // -------------------------------------------------------------
  // TEST 6: State Machine Guard
  // -------------------------------------------------------------
  console.log("▶ TEST 6: State Machine Guard (Disallowed Action on Finalized Order)");

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
  console.log("✅ TEST 6 PASSED: State machine strictly blocks illegal actions on finalized orders.\n");

  // -------------------------------------------------------------
  // TEST 7: Duplicate Tool Call (Idempotency Guard)
  // -------------------------------------------------------------
  console.log("▶ TEST 7: Duplicate Tool Call Guard (Idempotency)");

  const firstLinkRes = await agentTools.createPaymentLink({
    orderId: trustedOrder.id,
    amount: 22200,
    description: "Valid 30% advance",
  });

  assert.equal(firstLinkRes.success, true, "First payment link creation must succeed");

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
  console.log("✅ TEST 7 PASSED: Duplicate tool call prevented without creating redundant payment links.\n");

  // -------------------------------------------------------------
  // TEST 8: Successful Payment Transition (PAID -> FULFILLED)
  // -------------------------------------------------------------
  console.log("▶ TEST 8: Successful Payment Transition (PAID -> FULFILLED)");

  const fullPayRes = await processPaymentCapture({
    orderId: trustedOrder.id,
    paymentId: `pay_test_full_${Date.now()}`,
    amount: 74000,
    event: "payment.captured",
  });

  assert.equal(fullPayRes.newStatus, "PAID", "Order must transition to PAID");
  assert.equal(fullPayRes.remaining, 0, "Remaining balance must be 0");

  const postPayResult = await runBoundedAgent("conv_trusted");
  console.log("Post Full Payment Decision:", JSON.stringify(postPayResult.decision, null, 2));

  assert.equal(postPayResult.decision.action, "updateOrderStatus", "Agent must choose updateOrderStatus (fulfillment)");
  console.log("✅ TEST 8 PASSED: Full payment transitioned order to PAID, and agent recommended fulfillment.\n");

  // -------------------------------------------------------------
  // TEST 9: Partial Payment State Transition
  // -------------------------------------------------------------
  console.log("▶ TEST 9: Partial Payment State Transition (PARTIALLY_PAID -> sendPaymentRequest)");

  const partialAgentRes = await runBoundedAgent("conv_partial");
  console.log("Partial Paid Decision:", JSON.stringify(partialAgentRes.decision, null, 2));

  assert.equal(partialAgentRes.decision.action, "sendPaymentRequest", "Agent must choose sendPaymentRequest for remaining balance");
  console.log("✅ TEST 9 PASSED: Partial payment state correctly triggers request for remaining balance.\n");

  // -------------------------------------------------------------
  // TEST 10: Loop Limit Cutoff
  // -------------------------------------------------------------
  console.log("▶ TEST 10: Agent Exceeding Maximum Tool Calls (Loop Limit Cutoff)");

  const loopResult = await runBoundedAgent("conv_trusted", {
    overrideToolLimit: 3,
  });

  assert.ok(loopResult.toolCallsExecuted <= 3, "toolCallsExecuted must never exceed 3");
  console.log(`Verified: Tool calls executed = ${loopResult.toolCallsExecuted} (within strict limit <= 3)`);
  console.log("✅ TEST 10 PASSED: Maximum 3 tool call limit strictly enforced.\n");

  // Cleanup
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
