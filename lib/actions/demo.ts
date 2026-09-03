"use server";

import { revalidatePath, updateTag } from "next/cache";
import { prisma } from "@/lib/db/client";
import { agentTools } from "@/lib/ai/execute";
import { analyzeConversationWithAgent } from "@/lib/ai/agent";
import { processPaymentCapture } from "@/lib/razorpay/webhook";
import { seedDatabase } from "@/prisma/seed";

export async function approveNextAction(conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { order: true, customer: true, merchant: { include: { policy: true } } },
  });

  if (!conversation || !conversation.order) {
    throw new Error("No active order found for this conversation.");
  }

  const order = conversation.order;
  const action = order.nextAction || "createPaymentLink";

  let toolResult: unknown;

  if (action === "createPaymentLink") {
    const amount = order.recommendedAdvanceAmount || order.totalAmount;
    const res = await agentTools.createPaymentLink({
      orderId: order.id,
      amount,
      customerName: conversation.customer.name,
      description: `${order.quantity}x items - Advance Payment`,
    });
    if (!res.success) {
      throw new Error(res.error || "Failed to create payment link");
    }
    toolResult = res;
  } else if (action === "createFollowUp") {
    toolResult = await agentTools.createFollowUp({
      conversationId: conversation.id,
      note: order.reason || "Counter-offer within merchant policy",
      dueAt: order.deliveryDate || "Next business day",
    });
  } else if (action === "sendPaymentRequest") {
    const amount = order.recommendedAdvanceAmount || order.remainingAmount || order.totalAmount;
    toolResult = await agentTools.sendPaymentRequest({
      orderId: order.id,
      channel: "whatsapp",
      message: `Payment request: Please confirm advance of ₹${amount.toLocaleString("en-IN")}. Policy requires advance and does not permit credit.`,
    });
  } else if (action === "updateOrderStatus") {
    toolResult = await agentTools.updateOrderStatus({
      orderId: order.id,
      toStatus: "FULFILLED",
      reason: "Order fully paid and dispatched for fulfillment",
    });
  } else {
    throw new Error(`Unsupported action: ${action}`);
  }

  updateTag("dashboard-data");
  revalidatePath("/");
  revalidatePath("/dashboard");
  return { success: true, action, result: toolResult };
}

export async function simulatePaymentWebhook(paymentLinkId: string, amount?: number) {
  const payment = await prisma.payment.findFirst({
    where: {
      OR: [
        { razorpayPaymentLinkId: paymentLinkId },
        { id: paymentLinkId },
      ],
    },
  });

  if (!payment) {
    throw new Error(`Payment link not found: ${paymentLinkId}`);
  }

  const payAmount = amount ?? payment.amount;
  const simPaymentId = `pay_sim_${Math.random().toString(36).substring(2, 9)}`;

  const result = await processPaymentCapture({
    paymentLinkId: payment.razorpayPaymentLinkId || payment.id,
    orderId: payment.orderId,
    paymentId: simPaymentId,
    amount: payAmount,
    event: "payment.captured",
  });

  updateTag("dashboard-data");
  revalidatePath("/");
  revalidatePath("/dashboard");
  return { success: true, ...result };
}

export async function addCustomerMessage(conversationId: string, body: string) {
  if (!body.trim()) return;

  await prisma.message.create({
    data: {
      conversationId,
      role: "CUSTOMER",
      body: body.trim(),
      sentAt: new Date(),
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      lastMessageAt: new Date(),
      unread: false,
      preview: body.trim(),
    },
  });

  // Automatically trigger AI analysis to update order and policy recommendation
  await analyzeConversationWithAgent(conversationId);

  updateTag("dashboard-data");
  revalidatePath("/");
  revalidatePath("/dashboard");
}

export async function runAiAnalysis(conversationId: string) {
  const result = await analyzeConversationWithAgent(conversationId);
  updateTag("dashboard-data");
  revalidatePath("/");
  revalidatePath("/dashboard");
  return result;
}

export async function resetDemoData() {
  await seedDatabase();
  updateTag("dashboard-data");
  revalidatePath("/");
  revalidatePath("/dashboard");
  return { success: true };
}
