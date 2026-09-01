import { prisma } from "../lib/db/client";
import { seedDatabase } from "../prisma/seed";
import { agentTools } from "../lib/ai/execute";
import { analyzeConversationWithAgent } from "../lib/ai/agent";
import { processPaymentCapture } from "../lib/razorpay/webhook";
import { canTransition } from "../lib/orders/state";

async function runTests() {
  console.log("=== STEP 1: RESET SEED DATA ===");
  await seedDatabase();
  const convCount = await prisma.conversation.count();
  console.log(`Seeded conversations: ${convCount} (expected 5)`);
  if (convCount !== 5) throw new Error("Seed failed");

  console.log("\n=== STEP 2: TEST CASE 1 - TRUSTED REPEAT CUSTOMER ===");
  const conv1 = await prisma.conversation.findUnique({
    where: { id: "conv_trusted" },
    include: { order: true, customer: true },
  });
  console.log(`Order status: ${conv1?.order?.status} (expected QUOTE_CREATED)`);
  console.log(`Next action: ${conv1?.order?.nextAction} (expected createPaymentLink)`);
  console.log(`Total amount: ₹${conv1?.order?.totalAmount} (expected 74000)`);

  // Execute payment link creation
  console.log("\nExecuting createPaymentLink for conv_trusted...");
  const linkRes = await agentTools.createPaymentLink({
    orderId: conv1!.order!.id,
    amount: 22200, // 30% advance
    customerName: conv1!.customer.name,
    description: "40x Shirts - 30% Advance",
  });
  console.log(`Payment link created: ${linkRes.paymentLinkId}, URL: ${linkRes.shortUrl}`);

  const orderAfterLink = await prisma.order.findUnique({ where: { id: conv1!.order!.id } });
  console.log(`Order status after link: ${orderAfterLink?.status} (expected PAYMENT_REQUESTED)`);
  if (orderAfterLink?.status !== "PAYMENT_REQUESTED") throw new Error("Status transition to PAYMENT_REQUESTED failed");

  // Simulate payment webhook: ₹22,200 (30% advance)
  console.log("\nSimulating Webhook: payment.captured ₹22,200...");
  const webhookRes = await processPaymentCapture({
    paymentLinkId: linkRes.paymentLinkId,
    paymentId: "pay_test_trusted_1",
    amount: 22200,
    event: "payment.captured",
  });
  console.log(`Webhook processed. New order status: ${webhookRes.newStatus} (expected PARTIALLY_PAID)`);
  console.log(`Total collected: ₹${webhookRes.totalCollected}, Remaining: ₹${webhookRes.remaining}`);
  if (webhookRes.newStatus !== "PARTIALLY_PAID") throw new Error("Status transition to PARTIALLY_PAID failed");

  const orderAfterAdvance = await prisma.order.findUnique({ where: { id: conv1!.order!.id } });
  console.log(`AI recommended next action after advance: ${orderAfterAdvance?.nextAction} (expected sendPaymentRequest)`);

  // Simulate second payment: remaining ₹51,800
  console.log("\nSimulating second Webhook for remaining balance: ₹51,800...");
  const fullPayRes = await processPaymentCapture({
    orderId: conv1!.order!.id,
    paymentId: "pay_test_trusted_2",
    amount: 51800,
    event: "payment.captured",
  });
  console.log(`Full payment processed. New order status: ${fullPayRes.newStatus} (expected PAID)`);
  console.log(`Remaining balance: ₹${fullPayRes.remaining} (expected 0)`);
  if (fullPayRes.newStatus !== "PAID") throw new Error("Status transition to PAID failed");

  const orderAfterFull = await prisma.order.findUnique({ where: { id: conv1!.order!.id } });
  console.log(`AI recommended next action after full pay: ${orderAfterFull?.nextAction} (expected updateOrderStatus)`);

  console.log("\n=== STEP 3: TEST CASE 3 - EXCESSIVE DISCOUNT ===");
  const conv3 = await prisma.conversation.findUnique({
    where: { id: "conv_discount" },
    include: { order: true },
  });
  console.log(`Order next action: ${conv3?.order?.nextAction} (expected createFollowUp)`);
  console.log(`Reason: ${conv3?.order?.reason}`);
  const followUpRes = await agentTools.createFollowUp({
    conversationId: "conv_discount",
    note: "Counter-offer with 5% max policy discount",
    dueAt: "This week",
  });
  console.log(`Follow-up created: ${followUpRes.followUpId}`);

  console.log("\n=== STEP 4: TEST AI RE-ANALYSIS ON NEW MESSAGE ===");
  await prisma.message.create({
    data: {
      conversationId: "conv_new",
      role: "CUSTOMER",
      body: "Okay, I understand no COD. I can pay 25% advance of ₹2,670 right away.",
      sentAt: new Date(),
    },
  });
  const analysisRes = await analyzeConversationWithAgent("conv_new");
  console.log(`Re-analysis completed. Intent: ${analysisRes.extraction.intent}`);
  console.log(`Next action: ${analysisRes.recommendation.nextAction}`);
  console.log(`Recommended advance: ${analysisRes.recommendation.recommendedAdvancePercentage}% (₹${analysisRes.recommendation.recommendedAdvanceAmount})`);

  console.log("\n=== STEP 5: STATE MACHINE VALIDATION ===");
  console.log("canTransition('NEW', 'QUALIFIED'):", canTransition("NEW", "QUALIFIED"));
  console.log("canTransition('NEW', 'PAID'):", canTransition("NEW", "PAID"));
  if (canTransition("NEW", "PAID")) throw new Error("Invalid transition allowed");

  console.log("\n=== STEP 6: VERIFY ACTIVITY EVENTS & ACTION LOGS ===");
  const eventsCount = await prisma.activityEvent.count();
  const logsCount = await prisma.agentActionLog.count();
  console.log(`Total activity events: ${eventsCount}`);
  console.log(`Total agent action logs: ${logsCount}`);
  if (eventsCount === 0 || logsCount === 0) throw new Error("Audit logging missing");

  // Reset demo back to clean state for final presentation
  console.log("\n=== STEP 7: CLEAN RESET FOR DEMO ===");
  await seedDatabase();
  console.log("Database reset to pristine demo state.");

  console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY!");
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
