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
  console.log(
    `[Razorpay Webhook] Inbound payment notification: event=${event}, paymentId=${paymentId}, linkId=${paymentLinkId ?? "none"}, amount=₹${amount}`,
  );

  try {
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

    if (!payment && paymentId) {
      payment = await prisma.payment.findFirst({
        where: { razorpayPaymentId: paymentId },
        include: {
          order: {
            include: {
              conversation: true,
              payments: true,
            },
          },
        },
      });
    }

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
      const errMsg = `Could not identify order for payment ${paymentId} / link ${paymentLinkId}`;
      console.error(`[Razorpay Webhook] ${errMsg}`);
      throw new Error(errMsg);
    }

    // 2. HANDLE FAILED PAYMENTS
    if (event === "payment.failed") {
      console.log(`[Razorpay Webhook] Handling failed payment ${paymentId} for order ${order.id}`);

      if (payment && payment.status !== "PAID") {
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: "FAILED",
            razorpayPaymentId: paymentId,
          },
        });
      } else {
        await prisma.payment.create({
          data: {
            orderId: order.id,
            amount: amount || 0,
            status: "FAILED",
            razorpayPaymentLinkId: paymentLinkId,
            razorpayPaymentId: paymentId,
          },
        });
      }

      await prisma.activityEvent.create({
        data: {
          conversationId: order.conversationId,
          type: "payment",
          title: "Payment attempt failed",
          detail: `Razorpay payment.failed (${paymentId}) · ₹${amount.toLocaleString("en-IN")}`,
          occurredAt: new Date(),
        },
      });

      await prisma.agentActionLog.create({
        data: {
          action: "webhook_payment_failed",
          payload: JSON.stringify(payload),
          result: JSON.stringify({
            orderId: order.id,
            status: "FAILED",
            paymentId,
          }),
          success: true,
          createdAt: new Date(),
        },
      });

      const currentPayments = await prisma.payment.findMany({
        where: { orderId: order.id },
      });
      const currentCollected = currentPayments
        .filter((p) => p.status === "PAID")
        .reduce((sum, p) => sum + p.amount, 0);
      const currentRemaining = Math.max(0, order.totalAmount - currentCollected);

      return {
        orderId: order.id,
        conversationId: order.conversationId,
        previousStatus: order.status,
        newStatus: order.status,
        totalCollected: currentCollected,
        remaining: currentRemaining,
        idempotent: false,
        status: "FAILED",
        message: `Payment ${paymentId} failed.`,
      };
    }

    // 3. HANDLE CANCELLED OR EXPIRED PAYMENT LINKS
    if (event === "payment_link.cancelled" || event === "payment_link.expired") {
      console.log(`[Razorpay Webhook] Handling link cancellation/expiry for link ${paymentLinkId}`);
      if (payment && payment.status !== "PAID") {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "CANCELLED" },
        });
      }

      await prisma.activityEvent.create({
        data: {
          conversationId: order.conversationId,
          type: "payment_link",
          title: `Payment link ${event === "payment_link.cancelled" ? "cancelled" : "expired"}`,
          detail: `Razorpay ${event} (${paymentLinkId})`,
          occurredAt: new Date(),
        },
      });

      await prisma.agentActionLog.create({
        data: {
          action: `webhook_${event.replace(".", "_")}`,
          payload: JSON.stringify(payload),
          result: JSON.stringify({ orderId: order.id, status: "CANCELLED" }),
          success: true,
          createdAt: new Date(),
        },
      });

      return {
        orderId: order.id,
        conversationId: order.conversationId,
        previousStatus: order.status,
        newStatus: order.status,
        totalCollected: 0,
        remaining: order.totalAmount,
        idempotent: false,
        status: "CANCELLED",
      };
    }

    // 4. IDEMPOTENCY CHECK
    // If this exact paymentId has already been recorded as PAID for this order, skip processing
    const existingCapturedPayment = await prisma.payment.findFirst({
      where: {
        orderId: order.id,
        status: "PAID",
        OR: [
          { razorpayPaymentId: paymentId },
          ...(paymentLinkId ? [{ razorpayPaymentLinkId: paymentLinkId }] : []),
          ...(paymentLinkId ? [{ id: paymentLinkId }] : []),
        ],
      },
    });

    if (existingCapturedPayment) {
      console.log(
        `[Razorpay Webhook] Idempotent duplicate: payment ${paymentId} / link ${paymentLinkId} has already been processed for order ${order.id}. Skipping.`,
      );

      const currentPayments = await prisma.payment.findMany({
        where: { orderId: order.id },
      });
      const currentCollected = currentPayments
        .filter((p) => p.status === "PAID")
        .reduce((sum, p) => sum + p.amount, 0);
      const currentRemaining = Math.max(0, order.totalAmount - currentCollected);

      return {
        orderId: order.id,
        conversationId: order.conversationId,
        previousStatus: order.status,
        newStatus: order.status,
        totalCollected: currentCollected,
        remaining: currentRemaining,
        idempotent: true,
        message: `Payment ${paymentId} was already processed. Idempotent skip.`,
      };
    }

    // 5. Update existing unpaid payment or create new payment record
    const isTargetingUnpaid = payment && payment.status !== "PAID";

    if (isTargetingUnpaid && payment) {
      console.log(`[Razorpay Webhook] Updating existing pending payment record ${payment.id} to PAID`);
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
      console.log(`[Razorpay Webhook] Creating new payment record for order ${order.id}`);
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

    // 6. Re-query all payments to calculate cumulative collected amount
    const allPayments = await prisma.payment.findMany({
      where: { orderId: order.id },
    });

    const totalCollected = allPayments
      .filter((p) => p.status === "PAID")
      .reduce((sum, p) => sum + p.amount, 0);

    const remaining = Math.max(0, order.totalAmount - totalCollected);

    // 7. Update order state based on collected amount
    let newStatus: OrderStatus = order.status;
    if (totalCollected >= order.totalAmount) {
      newStatus = OrderStatus.PAID;
    } else if (totalCollected > 0) {
      newStatus = OrderStatus.PARTIALLY_PAID;
    }

    const fromStatus = order.status;
    if (newStatus !== fromStatus && canTransition(fromStatus, newStatus)) {
      console.log(
        `[Razorpay Webhook] Order ${order.id} status transition: ${fromStatus} -> ${newStatus} (collected: ₹${totalCollected}, remaining: ₹${remaining})`,
      );
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

    // 8. Record activity timeline events
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

    // 9. Update AI next action recommendation
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

    // 10. Record audit log
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
      idempotent: false,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Razorpay Webhook] Error processing payment capture:`, error);

    try {
      await prisma.agentActionLog.create({
        data: {
          action: "webhook_payment_captured_failed",
          payload: JSON.stringify(payload),
          result: JSON.stringify({ error: errorMsg }),
          success: false,
          createdAt: new Date(),
        },
      });
    } catch (logErr) {
      console.error("[Razorpay Webhook] Failed to write error log:", logErr);
    }

    throw error;
  }
}
