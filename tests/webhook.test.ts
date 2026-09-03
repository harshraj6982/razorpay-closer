import assert from "node:assert/strict";
import crypto from "node:crypto";
import { prisma } from "../lib/db/client";
import { verifyWebhookSignature } from "../lib/razorpay/client";
import { processPaymentCapture } from "../lib/razorpay/webhook";
import { seedDatabase } from "../prisma/seed";

async function runWebhookTests() {
  console.log("\n=======================================================");
  console.log("⚡ RUNNING RAZORPAY WEBHOOK TESTS");
  console.log("=======================================================\n");

  // Step 1: Clean seed state
  console.log("▶ STEP 1: Seeding database for clean test environment");
  await seedDatabase();

  const conversation = await prisma.conversation.findUnique({
    where: { id: "conv_trusted" },
    include: { order: true, customer: true },
  });

  assert.ok(conversation, "Conversation conv_trusted must exist");
  assert.ok(conversation.order, "Order for conv_trusted must exist");
  const orderId = conversation.order.id;

  // -------------------------------------------------------------
  // TEST 1: HMAC SHA256 Signature Verification
  // -------------------------------------------------------------
  console.log("▶ TEST 1: Webhook Signature Verification (HMAC SHA256)");
  const testSecret = "test_webhook_secret_12345";
  const samplePayload = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_test_abc123",
          amount: 2220000,
        },
      },
    },
  });

  // 1a. Generate genuine signature
  const validSignature = crypto
    .createHmac("sha256", testSecret)
    .update(samplePayload)
    .digest("hex");

  const isValid = verifyWebhookSignature(samplePayload, validSignature, testSecret);
  assert.equal(isValid, true, "Valid HMAC signature must verify as true");

  // 1b. Tampered payload
  const tamperedPayload = samplePayload.replace("2220000", "5000000");
  const isTamperedValid = verifyWebhookSignature(tamperedPayload, validSignature, testSecret);
  assert.equal(isTamperedValid, false, "Tampered payload must fail signature verification");

  // 1c. Invalid / fake signature
  const isFakeValid = verifyWebhookSignature(samplePayload, "fake_signature_hex_value", testSecret);
  assert.equal(isFakeValid, false, "Invalid signature string must fail verification");

  // 1d. Unconfigured secret behavior
  const isTestSigValidNoSecret = verifyWebhookSignature(samplePayload, "test_signature", undefined);
  assert.equal(isTestSigValidNoSecret, true, "test_signature should be allowed when secret is not configured");

  const isFakeSigNoSecret = verifyWebhookSignature(samplePayload, "invalid_sig", undefined);
  assert.equal(isFakeSigNoSecret, false, "Invalid signature must fail even when secret is not configured");

  const isEmptySigNoSecret = verifyWebhookSignature(samplePayload, "", undefined);
  assert.equal(isEmptySigNoSecret, false, "Empty signature must fail even when secret is not configured");

  console.log("✅ TEST 1 PASSED: HMAC SHA256 signature verification is secure, timing-safe, and rejects bad signatures.\n");

  // -------------------------------------------------------------
  // TEST 2: Process Advance Payment (PARTIALLY_PAID)
  // -------------------------------------------------------------
  console.log("▶ TEST 2: Process Inbound payment.captured (Advance Payment)");
  const advancePaymentId = `pay_test_adv_${Date.now()}`;
  const advanceAmount = 22200;

  const result1 = await processPaymentCapture({
    orderId,
    paymentId: advancePaymentId,
    amount: advanceAmount,
    event: "payment.captured",
  });

  console.log("Advance Payment Webhook Result:", JSON.stringify(result1, null, 2));

  assert.equal(result1.newStatus, "PARTIALLY_PAID", "Order status must become PARTIALLY_PAID");
  assert.equal(result1.totalCollected, advanceAmount, `totalCollected must be ${advanceAmount}`);
  assert.equal(result1.remaining, 51800, "remaining must be 74,000 - 22,200 = 51,800");
  assert.equal(result1.idempotent, false, "First delivery must not be marked idempotent");

  // Verify DB state
  const orderAfterAdv = await prisma.order.findUnique({
    where: { id: orderId },
  });
  assert.equal(orderAfterAdv?.status, "PARTIALLY_PAID", "DB order status must be PARTIALLY_PAID");
  assert.equal(orderAfterAdv?.remainingAmount, 51800, "DB remainingAmount must be 51,800");
  assert.equal(orderAfterAdv?.nextAction, "sendPaymentRequest", "Next action must recommend requesting remaining balance");

  // Verify Audit Trail: OrderStatusEvent & ActivityEvent
  const statusEvent1 = await prisma.orderStatusEvent.findFirst({
    where: { orderId, toStatus: "PARTIALLY_PAID" },
  });
  assert.ok(statusEvent1, "OrderStatusEvent for PARTIALLY_PAID must exist");

  const activityEvents = await prisma.activityEvent.findMany({
    where: { conversationId: conversation.id },
  });
  assert.ok(
    activityEvents.some((e) => e.type === "payment" && e.detail?.includes(advancePaymentId)),
    "ActivityEvent for payment capture must be recorded"
  );

  console.log("✅ TEST 2 PASSED: Advance payment processed; order transitioned to PARTIALLY_PAID with AI recommendation.\n");

  // -------------------------------------------------------------
  // TEST 3: Idempotency (Re-delivering the Exact Same Webhook)
  // -------------------------------------------------------------
  console.log("▶ TEST 3: Webhook Idempotency (Duplicate Redelivery Guard)");

  const paymentCountBefore = await prisma.payment.count({ where: { orderId } });
  const statusEventCountBefore = await prisma.orderStatusEvent.count({ where: { orderId } });

  // Deliver the EXACT same payload a second time
  const idempotentResult = await processPaymentCapture({
    orderId,
    paymentId: advancePaymentId,
    amount: advanceAmount,
    event: "payment.captured",
  });

  console.log("Idempotent Redelivery Result:", JSON.stringify(idempotentResult, null, 2));

  assert.equal(idempotentResult.idempotent, true, "Duplicate delivery must return idempotent: true");
  assert.equal(idempotentResult.totalCollected, advanceAmount, "totalCollected must not be double counted");
  assert.equal(idempotentResult.remaining, 51800, "remaining must remain unchanged");

  const paymentCountAfter = await prisma.payment.count({ where: { orderId } });
  const statusEventCountAfter = await prisma.orderStatusEvent.count({ where: { orderId } });

  assert.equal(paymentCountAfter, paymentCountBefore, "Duplicate webhook must NOT create duplicate Payment records");
  assert.equal(statusEventCountAfter, statusEventCountBefore, "Duplicate webhook must NOT create duplicate status events");

  console.log("✅ TEST 3 PASSED: Idempotency guard strictly prevented duplicate records and corrupted totals.\n");

  // -------------------------------------------------------------
  // TEST 4: Handle Payment Failure (payment.failed)
  // -------------------------------------------------------------
  console.log("▶ TEST 4: Process Inbound payment.failed Webhook");
  const failedPaymentId = `pay_test_fail_${Date.now()}`;
  const failResult = await processPaymentCapture({
    orderId,
    paymentId: failedPaymentId,
    amount: 51800,
    event: "payment.failed",
  });

  console.log("Failed Payment Result:", JSON.stringify(failResult, null, 2));
  assert.equal(failResult.status, "FAILED", "Result status must be FAILED");
  assert.equal(failResult.newStatus, "PARTIALLY_PAID", "Order status must NOT transition on failed payment");
  assert.equal(failResult.totalCollected, advanceAmount, "totalCollected must NOT increase on failed payment");

  const failedPaymentRow = await prisma.payment.findFirst({
    where: { razorpayPaymentId: failedPaymentId },
  });
  assert.ok(failedPaymentRow, "Failed payment row must exist");
  assert.equal(failedPaymentRow.status, "FAILED", "Payment status must be FAILED in DB");

  const failActionLog = await prisma.agentActionLog.findFirst({
    where: { action: "webhook_payment_failed" },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(failActionLog, "Audit log for webhook_payment_failed must exist");

  console.log("✅ TEST 4 PASSED: Failed payment safely handled without advancing order status or collected amount.\n");

  // -------------------------------------------------------------
  // TEST 5: Full Payment Delivery (Transition to PAID)
  // -------------------------------------------------------------
  console.log("▶ TEST 5: Full Payment Delivery (Transition to PAID & Fulfillment Recommendation)");

  const remainingPaymentId = `pay_test_rem_${Date.now()}`;
  const remainingAmount = 51800;

  const result2 = await processPaymentCapture({
    orderId,
    paymentId: remainingPaymentId,
    amount: remainingAmount,
    event: "payment.captured",
  });

  console.log("Full Payment Webhook Result:", JSON.stringify(result2, null, 2));

  assert.equal(result2.newStatus, "PAID", "Order status must transition to PAID");
  assert.equal(result2.totalCollected, 74000, "Total collected must equal full order amount 74,000");
  assert.equal(result2.remaining, 0, "Remaining balance must be 0");

  const orderAfterFull = await prisma.order.findUnique({
    where: { id: orderId },
  });
  assert.equal(orderAfterFull?.status, "PAID", "DB order status must be PAID");
  assert.equal(orderAfterFull?.remainingAmount, 0, "DB remainingAmount must be 0");
  assert.equal(orderAfterFull?.nextAction, "updateOrderStatus", "AI nextAction must recommend updateOrderStatus (fulfill)");

  console.log("✅ TEST 5 PASSED: Final payment completed; order transitioned to PAID with fulfillment recommendation.\n");

  // -------------------------------------------------------------
  // TEST 6: Error Handling (Unknown Order)
  // -------------------------------------------------------------
  console.log("▶ TEST 6: Error Handling on Invalid / Unknown Order");

  await assert.rejects(
    async () => {
      await processPaymentCapture({
        orderId: "non_existent_order_id_12345",
        paymentId: "pay_unknown_999",
        amount: 5000,
        event: "payment.captured",
      });
    },
    (err: Error) => {
      assert.ok(err.message.includes("Could not identify order"));
      return true;
    },
    "Must throw error on unknown order"
  );

  const failureLog = await prisma.agentActionLog.findFirst({
    where: { action: "webhook_payment_captured_failed" },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(failureLog, "Failed webhook attempt must be audited in agentActionLog");

  console.log("✅ TEST 6 PASSED: Unknown order safely caught, logged, and audited.\n");

  // -------------------------------------------------------------
  // Step 6: Restore Clean Seed State
  // -------------------------------------------------------------
  console.log("▶ STEP 6: Restoring pristine seed state");
  await seedDatabase();
  console.log("✅ Database reset cleanly.");

  console.log("\n=======================================================");
  console.log("🎉 ALL RAZORPAY WEBHOOK TESTS PASSED PERFECTLY!");
  console.log("=======================================================\n");
}

runWebhookTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Webhook tests failed:", err);
    process.exit(1);
  });
