import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { assertTransition, canTransition } from "@/lib/orders/state";
import { createRazorpayPaymentLink } from "@/lib/razorpay/client";
import {
  createFollowUpInput,
  createPaymentLinkInput,
  getPaymentStatusInput,
  recordAgentActionInput,
  sendPaymentRequestInput,
  updateOrderStatusInput,
  type AgentTools,
} from "./tools";

async function recordAgentAction(input: {
  action: string;
  payload: Record<string, unknown>;
  result?: unknown;
  success?: boolean;
}) {
  const validated = recordAgentActionInput.parse(input);
  const row = await prisma.agentActionLog.create({
    data: {
      action: validated.action,
      payload: JSON.stringify(validated.payload),
      result: validated.result === undefined ? null : JSON.stringify(validated.result),
      success: validated.success ?? true,
    },
  });
  return { id: row.id };
}

async function createPaymentLink(raw: unknown) {
  const input = createPaymentLinkInput.parse(raw);

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: {
      conversation: {
        include: { customer: true },
      },
    },
  });

  if (!order) {
    throw new Error(`Order not found: ${input.orderId}`);
  }

  const link = await createRazorpayPaymentLink({
    orderId: order.id,
    amount: input.amount,
    customerName: input.customerName || order.conversation.customer.name,
    customerPhone: order.conversation.customer.phone,
    description: input.description,
  });

  // Create payment record
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      amount: input.amount,
      status: "CREATED",
      razorpayPaymentLinkId: link.paymentLinkId,
      razorpayPaymentLinkUrl: link.shortUrl,
    },
  });

  // If order is in a prior status, transition to PAYMENT_REQUESTED
  const fromStatus = order.status;
  let toStatus = order.status;
  if (order.status !== "PAYMENT_REQUESTED" && canTransition(order.status, "PAYMENT_REQUESTED")) {
    toStatus = OrderStatus.PAYMENT_REQUESTED;
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: toStatus,
      recommendedAdvanceAmount: input.amount,
    },
  });

  if (toStatus !== fromStatus) {
    await prisma.orderStatusEvent.create({
      data: {
        orderId: order.id,
        fromStatus,
        toStatus,
        reason: `Payment Link created for ₹${input.amount.toLocaleString("en-IN")}`,
        recordedAt: new Date(),
      },
    });
  }

  // Record activity event
  await prisma.activityEvent.create({
    data: {
      conversationId: order.conversationId,
      type: "payment_link",
      title: "Payment Link created",
      detail: `₹${input.amount.toLocaleString("en-IN")} test-mode link (${link.paymentLinkId})`,
      occurredAt: new Date(),
    },
  });

  // Post agent message into conversation
  await prisma.message.create({
    data: {
      conversationId: order.conversationId,
      role: "AGENT",
      body: `Payment link created for ₹${input.amount.toLocaleString("en-IN")}: ${link.shortUrl}`,
      sentAt: new Date(),
    },
  });

  await recordAgentAction({
    action: "createPaymentLink",
    payload: { input },
    result: { paymentId: payment.id, paymentLinkId: link.paymentLinkId, shortUrl: link.shortUrl },
    success: true,
  });

  return {
    paymentLinkId: link.paymentLinkId,
    shortUrl: link.shortUrl,
    paymentId: payment.id,
    amount: payment.amount,
    orderId: order.id,
    status: payment.status,
  };
}

async function getPaymentStatus(raw: unknown) {
  const input = getPaymentStatusInput.parse(raw);

  const payment = await prisma.payment.findFirst({
    where: {
      OR: [
        { id: input.paymentId },
        { razorpayPaymentLinkId: input.paymentId },
        { razorpayPaymentId: input.paymentId },
      ],
    },
  });

  if (!payment) {
    throw new Error(`Payment not found: ${input.paymentId}`);
  }

  await recordAgentAction({
    action: "getPaymentStatus",
    payload: { input },
    result: { status: payment.status },
    success: true,
  });

  return { status: payment.status };
}

async function updateOrderStatus(raw: unknown) {
  const input = updateOrderStatusInput.parse(raw);

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
  });

  if (!order) {
    throw new Error(`Order not found: ${input.orderId}`);
  }

  const toStatus = input.toStatus as OrderStatus;
  assertTransition(order.status, toStatus);

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: toStatus,
      nextAction: toStatus === OrderStatus.FULFILLED ? "getPaymentStatus" : order.nextAction,
      reason: toStatus === OrderStatus.FULFILLED ? "Order fulfilled and completed." : order.reason,
    },
  });

  await prisma.orderStatusEvent.create({
    data: {
      orderId: order.id,
      fromStatus: order.status,
      toStatus,
      reason: input.reason,
      recordedAt: new Date(),
    },
  });

  await prisma.activityEvent.create({
    data: {
      conversationId: order.conversationId,
      type: "status",
      title: `Order moved to ${toStatus}`,
      detail: input.reason,
      occurredAt: new Date(),
    },
  });

  await recordAgentAction({
    action: "updateOrderStatus",
    payload: { input },
    result: { previousStatus: order.status, newStatus: toStatus },
    success: true,
  });

  return { status: toStatus };
}

async function sendPaymentRequest(raw: unknown) {
  const input = sendPaymentRequestInput.parse(raw);

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { conversation: true },
  });

  if (!order) {
    throw new Error(`Order not found: ${input.orderId}`);
  }

  await prisma.message.create({
    data: {
      conversationId: order.conversationId,
      role: "AGENT",
      body: input.message,
      sentAt: new Date(),
    },
  });

  await prisma.activityEvent.create({
    data: {
      conversationId: order.conversationId,
      type: "recommend",
      title: `Payment request sent via ${input.channel}`,
      detail: input.message,
      occurredAt: new Date(),
    },
  });

  await recordAgentAction({
    action: "sendPaymentRequest",
    payload: { input },
    result: { sent: true },
    success: true,
  });

  return { sent: true as const };
}

async function createFollowUp(raw: unknown) {
  const input = createFollowUpInput.parse(raw);

  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
  });

  if (!conversation) {
    throw new Error(`Conversation not found: ${input.conversationId}`);
  }

  await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      role: "AGENT",
      body: input.note,
      sentAt: new Date(),
    },
  });

  await prisma.activityEvent.create({
    data: {
      conversationId: input.conversationId,
      type: "recommend",
      title: "Follow-up scheduled",
      detail: `${input.note} · Due: ${input.dueAt}`,
      occurredAt: new Date(),
    },
  });

  const followUpId = `flw_${Date.now()}`;
  await recordAgentAction({
    action: "createFollowUp",
    payload: { input },
    result: { followUpId },
    success: true,
  });

  return { followUpId };
}

export const agentTools: AgentTools = {
  createPaymentLink,
  getPaymentStatus,
  updateOrderStatus,
  sendPaymentRequest,
  createFollowUp,
  recordAgentAction,
};
