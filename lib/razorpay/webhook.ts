import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { canTransition } from "@/lib/orders/state";

export type PaymentWebhookPayload = {
  paymentLinkId?: string | null;
  paymentId: string;
  amount: number; // in INR
  event?: string;
  orderId?: string | null;
};

export async function processPaymentCapture(payload: PaymentWebhookPayload) {
  const { paymentLinkId, paymentId, amount, event = "payment.captured" } = payload;

  // 1. Locate the payment and order
  let payment = paymentLinkId
    ? await prisma.payment.findFirst({
        where: {
          OR: [
            { razorpayPaymentLinkId: paymentLinkId },
            { id: paymentLinkId },
          ],
        },
        include: {
          order: {
            include: {
              conversation: true,
              payments: true,
            },
          },
        },
      })
    : null;

  let order = payment?.order ?? null;

  if (!order && payload.orderId) {
    order = await prisma.order.findUnique({
      where: { id: payload.orderId },
      include: {
        conversation: true,
        payments: true,
      },
    });

    if (order && !payment) {
      payment = await prisma.payment.findFirst({
        where: { orderId: order.id },
        include: {
          order: {
            include: {
              conversation: true,
              payments: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    }
  }

  if (!order) {
    throw new Error(`Could not identify order for payment ${paymentId} / link ${paymentLinkId}`);
  }

  // 2. Update existing unpaid payment or create new payment record
  const isTargetingUnpaid = payment && payment.status !== "PAID";

  if (isTargetingUnpaid && payment) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        razorpayPaymentId: paymentId,
        amount: amount || payment.amount,
      },
    });
  } else {
    await prisma.payment.create({
      data: {
        orderId: order.id,
        amount,
        status: "PAID",
        paidAt: new Date(),
        razorpayPaymentLinkId: paymentLinkId,
        razorpayPaymentId: paymentId,
      },
    });
  }

  // 3. Re-query all payments to calculate total collected
  const allPayments = await prisma.payment.findMany({
    where: { orderId: order.id },
  });

  const totalCollected = allPayments
    .filter((p) => p.status === "PAID")
    .reduce((sum, p) => sum + p.amount, 0);

  const remaining = Math.max(0, order.totalAmount - totalCollected);

  // 4. Update order state based on collected amount
  let newStatus: OrderStatus = order.status;
  if (totalCollected >= order.totalAmount) {
    newStatus = OrderStatus.PAID;
  } else if (totalCollected > 0) {
    newStatus = OrderStatus.PARTIALLY_PAID;
  }

  const fromStatus = order.status;
  if (newStatus !== fromStatus && canTransition(fromStatus, newStatus)) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: newStatus,
        remainingAmount: remaining,
      },
    });

    await prisma.orderStatusEvent.create({
      data: {
        orderId: order.id,
        fromStatus,
        toStatus: newStatus,
        reason: `Webhook: ${event} ₹${amount.toLocaleString("en-IN")}`,
        recordedAt: new Date(),
      },
    });
  } else {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        remainingAmount: remaining,
      },
    });
  }

  // 5. Record activity events
  await prisma.activityEvent.create({
    data: {
      conversationId: order.conversationId,
      type: "payment",
      title: `₹${amount.toLocaleString("en-IN")} payment received`,
      detail: `Razorpay ${event} (${paymentId})`,
      occurredAt: new Date(),
    },
  });

  if (newStatus !== fromStatus) {
    await prisma.activityEvent.create({
      data: {
        conversationId: order.conversationId,
        type: "status",
        title: `Order moved to ${newStatus}`,
        detail: remaining > 0 ? `₹${remaining.toLocaleString("en-IN")} remaining` : "Full amount collected",
        occurredAt: new Date(),
      },
    });
  }

  // 6. Trigger next AI recommendation
  let nextAction = order.nextAction;
  let nextReason = order.reason;

  if (newStatus === OrderStatus.PARTIALLY_PAID) {
    nextAction = "sendPaymentRequest";
    nextReason = `Advance payment of ₹${amount.toLocaleString("en-IN")} received. Next action is to request the remaining ₹${remaining.toLocaleString("en-IN")} against delivery.`;

    await prisma.activityEvent.create({
      data: {
        conversationId: order.conversationId,
        type: "recommend",
        title: "Request remaining balance",
        detail: `Send payment request for ₹${remaining.toLocaleString("en-IN")} balance on delivery`,
        occurredAt: new Date(),
      },
    });
  } else if (newStatus === OrderStatus.PAID) {
    nextAction = "updateOrderStatus";
    nextReason = `Full payment of ₹${order.totalAmount.toLocaleString("en-IN")} received. Order ready for fulfillment.`;

    await prisma.activityEvent.create({
      data: {
        conversationId: order.conversationId,
        type: "recommend",
        title: "Order fully paid",
        detail: "Production complete · proceed to fulfill and dispatch",
        occurredAt: new Date(),
      },
    });
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      nextAction,
      reason: nextReason,
    },
  });

  // 7. Log agent action log
  await prisma.agentActionLog.create({
    data: {
      action: "webhook_payment_captured",
      payload: JSON.stringify(payload),
      result: JSON.stringify({
        orderId: order.id,
        fromStatus,
        toStatus: newStatus,
        totalCollected,
        remaining,
      }),
      success: true,
      createdAt: new Date(),
    },
  });

  return {
    orderId: order.id,
    conversationId: order.conversationId,
    previousStatus: fromStatus,
    newStatus,
    totalCollected,
    remaining,
  };
}
