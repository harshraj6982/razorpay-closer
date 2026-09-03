import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { assertTransition, canTransition } from "@/lib/orders/state";
import { calculatePaymentStrategy } from "@/lib/policies/engine";
import { createRazorpayPaymentLink } from "@/lib/razorpay/client";
import {
  createFollowUpInput,
  createPaymentLinkInput,
  getPaymentStatusInput,
  recordAgentActionInput,
  sendPaymentRequestInput,
  updateOrderStatusInput,
  type AgentTools,
  type CreateFollowUpInput,
  type CreateFollowUpResult,
  type CreatePaymentLinkInput,
  type CreatePaymentLinkResult,
  type GetPaymentStatusInput,
  type GetPaymentStatusResult,
  type RecordAgentActionInput,
  type RecordAgentActionResult,
  type SendPaymentRequestInput,
  type SendPaymentRequestResult,
  type UpdateOrderStatusInput,
  type UpdateOrderStatusResult,
} from "./tools";

export const ALLOWED_ACTIONS_BY_STATUS: Record<OrderStatus, string[]> = {
  NEW: ["updateOrderStatus", "createPaymentLink", "createFollowUp", "recordAgentAction"],
  QUALIFIED: ["updateOrderStatus", "createPaymentLink", "createFollowUp", "sendPaymentRequest", "recordAgentAction"],
  QUOTE_CREATED: ["createPaymentLink", "sendPaymentRequest", "createFollowUp", "updateOrderStatus", "recordAgentAction"],
  PAYMENT_REQUESTED: ["getPaymentStatus", "createFollowUp", "sendPaymentRequest", "recordAgentAction"],
  PARTIALLY_PAID: ["getPaymentStatus", "createFollowUp", "sendPaymentRequest", "updateOrderStatus", "recordAgentAction"],
  PAID: ["updateOrderStatus", "createFollowUp", "getPaymentStatus", "recordAgentAction"],
  FULFILLED: ["getPaymentStatus", "recordAgentAction"],
};

export function assertActionAllowedForStatus(status: OrderStatus, action: string) {
  const allowed = ALLOWED_ACTIONS_BY_STATUS[status] || [];
  if (!allowed.includes(action)) {
    throw new Error(
      `Action '${action}' is not allowed for order status '${status}'. Allowed actions: ${allowed.join(", ")}`,
    );
  }
}

export async function recordAgentAction(raw: unknown): Promise<RecordAgentActionResult> {
  try {
    const input: RecordAgentActionInput = recordAgentActionInput.parse(raw);
    const row = await prisma.agentActionLog.create({
      data: {
        action: input.action,
        payload: JSON.stringify(input.payload),
        result: input.result === undefined ? null : JSON.stringify(input.result),
        reason: input.reason,
        orderId: input.orderId,
        conversationId: input.conversationId,
        decisionId: input.decisionId,
        success: input.success ?? true,
      },
    });
    return { success: true, id: row.id };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMsg };
  }
}

export async function createPaymentLink(raw: unknown): Promise<CreatePaymentLinkResult> {
  try {
    const input: CreatePaymentLinkInput = createPaymentLinkInput.parse(raw);

    const order = await prisma.order.findUnique({
      where: { id: input.orderId },
      include: {
        conversation: {
          include: {
            customer: true,
            merchant: { include: { policy: true } },
          },
        },
        payments: true,
      },
    });

    if (!order) {
      const error = `Order not found: ${input.orderId}`;
      await recordAgentAction({
        action: "createPaymentLink",
        payload: { input },
        success: false,
        reason: error,
      });
      return { success: false, error };
    }

    // 1. Duplicate Tool Call Guard (Idempotency)
    const existingPendingPayment = order.payments.find(
      (p) => p.status === "CREATED" || p.status === "PENDING",
    );
    if (existingPendingPayment) {
      const error = `Active payment link already exists for order ${order.id} (${existingPendingPayment.razorpayPaymentLinkId})`;
      await recordAgentAction({
        action: "createPaymentLink",
        orderId: order.id,
        conversationId: order.conversationId,
        payload: { input },
        success: false,
        reason: error,
      });
      return {
        success: false,
        paymentLinkId: existingPendingPayment.razorpayPaymentLinkId ?? undefined,
        paymentLinkUrl: existingPendingPayment.razorpayPaymentLinkUrl ?? undefined,
        shortUrl: existingPendingPayment.razorpayPaymentLinkUrl ?? undefined,
        orderId: order.id,
        amount: existingPendingPayment.amount,
        error,
      };
    }

    // 2. Order State Machine Guard
    assertActionAllowedForStatus(order.status, "createPaymentLink");

    // 3. Authoritative Policy & Amount Recalculation Guard
    const policy = order.conversation.merchant.policy ?? {
      minimumAdvancePercentage: 25,
      maximumDiscountPercentage: 5,
      allowPartialPayment: true,
      allowCredit: false,
      newCustomerRequiresAdvance: true,
      requireApprovalForFinancialActions: true,
    };

    const strategy = calculatePaymentStrategy(
      policy,
      {
        totalAmount: order.totalAmount,
        requestedAdvancePercentage: order.requestedAdvancePercentage,
        requestedDiscountPercentage: order.requestedDiscountPercentage,
        requestedCredit: order.requestedCredit,
        customerIsNew: order.conversation.customer.isNew,
        previousOrderCount: order.conversation.customer.previousOrderCount,
        onTimePaymentRate: order.conversation.customer.onTimePaymentRate,
      },
      order.conversation.customer,
    );

    if (!strategy.canIssuePaymentLink) {
      const error = `Policy guardrail prevented payment link: ${strategy.reason}`;
      await recordAgentAction({
        action: "createPaymentLink",
        orderId: order.id,
        conversationId: order.conversationId,
        payload: { input, violations: strategy.violations },
        success: false,
        reason: error,
      });
      return { success: false, error };
    }

    // Authoritative financial amount verification
    const authoritativeAmount = strategy.recommendedAdvanceAmount;
    if (input.amount !== authoritativeAmount) {
      const error = `Financial validation failed: requested amount ₹${input.amount} does not match authoritative policy advance amount ₹${authoritativeAmount}`;
      await recordAgentAction({
        action: "createPaymentLink",
        orderId: order.id,
        conversationId: order.conversationId,
        payload: { input, authoritativeAmount },
        success: false,
        reason: error,
      });
      return { success: false, error };
    }

    // 4. Create Razorpay Test Mode Payment Link
    let link;
    try {
      link = await createRazorpayPaymentLink({
        orderId: order.id,
        amount: authoritativeAmount,
        customerName: input.customerName || order.conversation.customer.name || "Customer",
        customerPhone: order.conversation.customer.phone,
        description: input.description || `Payment for order ${order.id}`,
      });
    } catch (apiErr) {
      const errorMsg = apiErr instanceof Error ? apiErr.message : "Razorpay API error";
      await recordAgentAction({
        action: "createPaymentLink",
        orderId: order.id,
        conversationId: order.conversationId,
        payload: { input },
        success: false,
        reason: `Razorpay API failure: ${errorMsg}`,
      });
      return { success: false, error: `Razorpay API failure: ${errorMsg}` };
    }

    // 5. Create Payment record in DB
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        amount: authoritativeAmount,
        status: "CREATED",
        razorpayPaymentLinkId: link.paymentLinkId,
        razorpayPaymentLinkUrl: link.shortUrl,
      },
    });

    // 6. Transition order status if applicable
    const fromStatus = order.status;
    let toStatus = order.status;
    if (order.status !== OrderStatus.PAYMENT_REQUESTED && canTransition(order.status, OrderStatus.PAYMENT_REQUESTED)) {
      toStatus = OrderStatus.PAYMENT_REQUESTED;
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: toStatus,
        recommendedAdvanceAmount: authoritativeAmount,
        remainingAmount: strategy.remainingAmount,
        nextAction: "getPaymentStatus",
        reason: `Payment link created for ₹${authoritativeAmount.toLocaleString("en-IN")}`,
      },
    });

    if (toStatus !== fromStatus) {
      await prisma.orderStatusEvent.create({
        data: {
          orderId: order.id,
          fromStatus,
          toStatus,
          reason: `Payment Link created for ₹${authoritativeAmount.toLocaleString("en-IN")}`,
          recordedAt: new Date(),
        },
      });
    }

    // 7. Record activity timeline events
    await prisma.activityEvent.create({
      data: {
        conversationId: order.conversationId,
        type: "payment_link",
        title: "Payment Link created",
        detail: `₹${authoritativeAmount.toLocaleString("en-IN")} test-mode link (${link.paymentLinkId})`,
        occurredAt: new Date(),
      },
    });

    await prisma.message.create({
      data: {
        conversationId: order.conversationId,
        role: "AGENT",
        body: `Payment link created for ₹${authoritativeAmount.toLocaleString("en-IN")}: ${link.shortUrl}`,
        sentAt: new Date(),
      },
    });

    await recordAgentAction({
      action: "createPaymentLink",
      orderId: order.id,
      conversationId: order.conversationId,
      payload: { input, authoritativeAmount },
      result: { paymentId: payment.id, paymentLinkId: link.paymentLinkId, shortUrl: link.shortUrl },
      success: true,
      reason: `Created payment link for ₹${authoritativeAmount}`,
    });

    return {
      success: true,
      paymentLinkId: link.paymentLinkId,
      paymentLinkUrl: link.shortUrl,
      shortUrl: link.shortUrl,
      paymentId: payment.id,
      amount: payment.amount,
      orderId: order.id,
      status: payment.status,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMsg };
  }
}

export async function getPaymentStatus(raw: unknown): Promise<GetPaymentStatusResult> {
  try {
    const input: GetPaymentStatusInput = getPaymentStatusInput.parse(raw);

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
      const error = `Payment not found: ${input.paymentId}`;
      await recordAgentAction({
        action: "getPaymentStatus",
        payload: { input },
        success: false,
        reason: error,
      });
      return { success: false, error };
    }

    await recordAgentAction({
      action: "getPaymentStatus",
      orderId: payment.orderId,
      payload: { input },
      result: { status: payment.status, amount: payment.amount },
      success: true,
    });

    return {
      success: true,
      status: payment.status,
      amount: payment.amount,
      paidAt: payment.paidAt?.toISOString() ?? null,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMsg };
  }
}

export async function updateOrderStatus(raw: unknown): Promise<UpdateOrderStatusResult> {
  try {
    const input: UpdateOrderStatusInput = updateOrderStatusInput.parse(raw);

    const order = await prisma.order.findUnique({
      where: { id: input.orderId },
    });

    if (!order) {
      const error = `Order not found: ${input.orderId}`;
      await recordAgentAction({
        action: "updateOrderStatus",
        payload: { input },
        success: false,
        reason: error,
      });
      return { success: false, error };
    }

    const toStatus = input.toStatus as OrderStatus;
    assertActionAllowedForStatus(order.status, "updateOrderStatus");
    assertTransition(order.status, toStatus);

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: toStatus,
        nextAction: toStatus === OrderStatus.FULFILLED ? "getPaymentStatus" : order.nextAction,
        reason: toStatus === OrderStatus.FULFILLED ? "Order fulfilled and completed." : input.reason,
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
      orderId: order.id,
      conversationId: order.conversationId,
      payload: { input },
      result: { previousStatus: order.status, newStatus: toStatus },
      success: true,
      reason: input.reason,
    });

    return {
      success: true,
      status: toStatus,
      previousStatus: order.status,
      orderId: order.id,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMsg };
  }
}

export async function sendPaymentRequest(raw: unknown): Promise<SendPaymentRequestResult> {
  try {
    const input: SendPaymentRequestInput = sendPaymentRequestInput.parse(raw);

    const order = await prisma.order.findUnique({
      where: { id: input.orderId },
      include: { conversation: true },
    });

    if (!order) {
      const error = `Order not found: ${input.orderId}`;
      await recordAgentAction({
        action: "sendPaymentRequest",
        payload: { input },
        success: false,
        reason: error,
      });
      return { success: false, error };
    }

    assertActionAllowedForStatus(order.status, "sendPaymentRequest");

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
      orderId: order.id,
      conversationId: order.conversationId,
      payload: { input },
      result: { sent: true, channel: input.channel },
      success: true,
      reason: input.message,
    });

    return { success: true, sent: true, channel: input.channel };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMsg };
  }
}

export async function createFollowUp(raw: unknown): Promise<CreateFollowUpResult> {
  try {
    const input: CreateFollowUpInput = createFollowUpInput.parse(raw);

    const conversation = await prisma.conversation.findUnique({
      where: { id: input.conversationId },
    });

    if (!conversation) {
      const error = `Conversation not found: ${input.conversationId}`;
      await recordAgentAction({
        action: "createFollowUp",
        payload: { input },
        success: false,
        reason: error,
      });
      return { success: false, error };
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
      conversationId: input.conversationId,
      payload: { input },
      result: { followUpId, dueAt: input.dueAt },
      success: true,
      reason: input.note,
    });

    return { success: true, followUpId, dueAt: input.dueAt, note: input.note };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMsg };
  }
}

export const agentTools: AgentTools = {
  createPaymentLink,
  getPaymentStatus,
  updateOrderStatus,
  sendPaymentRequest,
  createFollowUp,
  recordAgentAction,
};

