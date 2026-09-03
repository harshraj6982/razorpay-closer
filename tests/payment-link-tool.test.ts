import assert from "node:assert/strict";
import { prisma } from "../lib/db/client";
import { agentTools } from "../lib/ai/execute";
import { createPaymentLinkInput } from "../lib/ai/tools";
import { seedDatabase } from "../prisma/seed";

async function runPaymentLinkToolTests() {
  console.log("\n=======================================================");
  console.log("💳 RUNNING RAZORPAY PAYMENT LINK TOOL TESTS");
  console.log("=======================================================\n");

  // Step 1: Reset DB to known seed state
  console.log("▶ STEP 1: Seeding database for clean test environment");
  await seedDatabase();

  const conversation = await prisma.conversation.findUnique({
    where: { id: "conv_trusted" },
    include: { order: true, customer: true },
  });

  assert.ok(conversation, "conv_trusted conversation must exist");
  assert.ok(conversation.order, "conv_trusted must have an order");
  const orderId = conversation.order.id;

  // -------------------------------------------------------------
  // TEST 1: Validation - Reject Non-Positive or Invalid Amounts
  // -------------------------------------------------------------
  console.log("▶ TEST 1: Validation of Payment Link Input (Reject Invalid Amounts)");

  // 1a. Negative amount
  assert.throws(
    () => {
      createPaymentLinkInput.parse({
        orderId,
        amount: -1000,
      });
    },
    (err: unknown) => (err as Error).name === "ZodError",
    "Should reject negative amount with ZodError"
  );

  // 1b. Zero amount
  assert.throws(
    () => {
      createPaymentLinkInput.parse({
        orderId,
        amount: 0,
      });
    },
    (err: unknown) => (err as Error).name === "ZodError",
    "Should reject zero amount with ZodError"
  );

  // 1c. Missing orderId
  assert.throws(
    () => {
      createPaymentLinkInput.parse({
        orderId: "",
        amount: 5000,
      });
    },
    (err: unknown) => (err as Error).name === "ZodError",
    "Should reject empty orderId"
  );

  console.log("✅ TEST 1 PASSED: Zod input schema strictly validates amounts and required fields.\n");

  // -------------------------------------------------------------
  // TEST 2: Create Test Mode Payment Link & Associate with Order
  // -------------------------------------------------------------
  console.log("▶ TEST 2: Create Test Mode Payment Link & Verify Order Association");

  const validatedAmount = 22200; // 30% advance on ₹74,000

  const result = await agentTools.createPaymentLink({
    orderId,
    amount: validatedAmount,
    customerName: conversation.customer.name,
    description: "30% Advance for 40 shirts order",
  });

  console.log("Payment Link Created:", JSON.stringify(result, null, 2));

  // 2a. Validate returned attributes
  assert.equal(result.success, true, "Creation must succeed");
  assert.ok(result.paymentLinkId && result.paymentLinkId.startsWith("plink_"), `Payment link ID must start with plink_, got ${result.paymentLinkId}`);
  assert.ok(result.shortUrl && (result.shortUrl.includes(result.paymentLinkId!) || result.shortUrl.startsWith("http")), "shortUrl must be valid URL");
  assert.equal(result.amount, validatedAmount, `Amount must equal ${validatedAmount}`);
  assert.equal(result.orderId, orderId, `orderId must equal ${orderId}`);
  assert.equal(result.status, "CREATED", "Initial payment status must be CREATED");

  // 2b. Database verification: Payment record stored and linked to internal order
  const storedPayment = await prisma.payment.findFirst({
    where: { razorpayPaymentLinkId: result.paymentLinkId! },
  });

  assert.ok(storedPayment, "Payment record must exist in database");
  assert.equal(storedPayment.orderId, orderId, "Payment must be associated with the internal orderId");
  assert.equal(storedPayment.amount, validatedAmount, "Stored amount must match");
  assert.equal(storedPayment.razorpayPaymentLinkId, result.paymentLinkId, "Stored link ID must match");
  assert.equal(storedPayment.razorpayPaymentLinkUrl, result.shortUrl, "Stored shortUrl must match");

  // 2c. Order state transition: Order status transitioned to PAYMENT_REQUESTED
  const updatedOrder = await prisma.order.findUnique({
    where: { id: orderId },
  });
  assert.equal(updatedOrder?.status, "PAYMENT_REQUESTED", "Order status must transition to PAYMENT_REQUESTED");

  // 2d. Audit trail: Verify OrderStatusEvent and ActivityEvent
  const statusEvent = await prisma.orderStatusEvent.findFirst({
    where: { orderId, toStatus: "PAYMENT_REQUESTED" },
  });
  assert.ok(statusEvent, "OrderStatusEvent for PAYMENT_REQUESTED must be recorded");

  const activityEvent = await prisma.activityEvent.findFirst({
    where: { conversationId: conversation.id, type: "payment_link" },
  });
  assert.ok(activityEvent, "ActivityEvent for payment_link creation must be recorded");

  // 2e. Chat integration: Agent posted payment link in conversation
  const message = await prisma.message.findFirst({
    where: { conversationId: conversation.id, role: "AGENT" },
    orderBy: { sentAt: "desc" },
  });
  assert.ok(message && result.shortUrl && message.body.includes(result.shortUrl), "Conversation must contain agent message with payment link URL");

  console.log("✅ TEST 2 PASSED: Payment link created, stored in DB, and associated with internal order.\n");

  // -------------------------------------------------------------
  // TEST 3: Security - Credentials Kept Server-Side
  // -------------------------------------------------------------
  console.log("▶ TEST 3: Credential Security Verification");
  const resultKeys = Object.keys(result);
  assert.ok(!resultKeys.includes("key_secret"), "Result must never expose key_secret");
  assert.ok(!resultKeys.includes("key_id"), "Result must never expose key_id");
  assert.ok(!resultKeys.includes("secret"), "Result must never expose secret");
  console.log("Verified: Credentials remain strictly server-side.\n");

  // -------------------------------------------------------------
  // TEST 4: Cleanup & Demo State Reset
  // -------------------------------------------------------------
  console.log("▶ TEST 4: Restoring pristine seed state for dashboard presentation");
  await seedDatabase();
  console.log("✅ Database reset cleanly.");

  console.log("\n=======================================================");
  console.log("🎉 ALL RAZORPAY PAYMENT LINK TOOL TESTS PASSED PERFECTLY!");
  console.log("=======================================================\n");
}

runPaymentLinkToolTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Payment Link Tool tests failed:", err);
    process.exit(1);
  });
