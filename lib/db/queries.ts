import { evaluatePaymentStrategy } from "@/lib/policies/engine";
import { prisma } from "@/lib/db/client";

export async function getDashboardData() {
  const merchant = await prisma.merchant.findFirst({
    where: { id: "merchant_stitchline" },
    include: { policy: true },
  });

  if (!merchant || !merchant.policy) {
    return null;
  }

  const conversations = await prisma.conversation.findMany({
    where: { merchantId: merchant.id },
    orderBy: { lastMessageAt: "desc" },
    include: {
      customer: true,
      messages: { orderBy: { sentAt: "asc" } },
      activities: { orderBy: { occurredAt: "asc" } },
      order: {
        include: {
          payments: { orderBy: { createdAt: "asc" } },
          statusHistory: { orderBy: { recordedAt: "asc" } },
        },
      },
    },
  });

  const policy = {
    minimumAdvancePercentage: merchant.policy.minimumAdvancePercentage,
    maximumDiscountPercentage: merchant.policy.maximumDiscountPercentage,
    allowPartialPayment: merchant.policy.allowPartialPayment,
    allowCredit: merchant.policy.allowCredit,
    newCustomerRequiresAdvance: merchant.policy.newCustomerRequiresAdvance,
    requireApprovalForFinancialActions: merchant.policy.requireApprovalForFinancialActions,
  };

  return {
    merchant: {
      id: merchant.id,
      name: merchant.name,
      tradeName: merchant.tradeName,
    },
    policy,
    conversations: conversations.map((conversation) => {
      const order = conversation.order;
      const liveRecommendation = order
        ? evaluatePaymentStrategy(policy, {
            totalAmount: order.totalAmount,
            requestedAdvancePercentage: order.requestedAdvancePercentage,
            requestedDiscountPercentage: order.requestedDiscountPercentage,
            requestedCredit: order.requestedCredit,
            customerIsNew: conversation.customer.isNew,
            previousOrderCount: conversation.customer.previousOrderCount,
            onTimePaymentRate: conversation.customer.onTimePaymentRate,
          })
        : null;

      return {
        id: conversation.id,
        title: conversation.title,
        caseType: conversation.caseType,
        preview: conversation.preview,
        lastMessageAt: conversation.lastMessageAt.toISOString(),
        unread: conversation.unread,
        customer: {
          name: conversation.customer.name,
          company: conversation.customer.company,
          phone: conversation.customer.phone,
          isNew: conversation.customer.isNew,
          previousOrderCount: conversation.customer.previousOrderCount,
          onTimePaymentRate: conversation.customer.onTimePaymentRate,
          lastUnitPrice: conversation.customer.lastUnitPrice,
        },
        messages: conversation.messages.map((message) => ({
          id: message.id,
          role: message.role,
          body: message.body,
          sentAt: message.sentAt.toISOString(),
        })),
        activities: conversation.activities.map((event) => ({
          id: event.id,
          occurredAt: event.occurredAt.toISOString(),
          type: event.type,
          title: event.title,
          detail: event.detail,
        })),
        order: order
          ? {
              id: order.id,
              status: order.status,
              intent: order.intent,
              products: JSON.parse(order.products) as Array<{
                name: string;
                quantity: number;
                unitPrice: number;
              }>,
              quantity: order.quantity,
              unitPrice: order.unitPrice,
              totalAmount: order.totalAmount,
              requestedAdvancePercentage: order.requestedAdvancePercentage,
              recommendedAdvancePercentage: order.recommendedAdvancePercentage,
              recommendedAdvanceAmount: order.recommendedAdvanceAmount,
              remainingAmount: order.remainingAmount,
              requestedDiscountPercentage: order.requestedDiscountPercentage,
              requestedCredit: order.requestedCredit,
              deliveryDate: order.deliveryDate,
              reason: order.reason,
              nextAction: order.nextAction,
              customerRequestSummary: order.customerRequestSummary,
              payments: order.payments.map((payment) => ({
                id: payment.id,
                amount: payment.amount,
                status: payment.status,
                razorpayPaymentLinkUrl: payment.razorpayPaymentLinkUrl,
                paidAt: payment.paidAt?.toISOString() ?? null,
              })),
              statusHistory: order.statusHistory.map((event) => ({
                id: event.id,
                fromStatus: event.fromStatus,
                toStatus: event.toStatus,
                reason: event.reason,
                recordedAt: event.recordedAt.toISOString(),
              })),
              liveRecommendation,
            }
          : null,
      };
    }),
  };
}

export type DashboardData = NonNullable<Awaited<ReturnType<typeof getDashboardData>>>;
export type DashboardConversation = DashboardData["conversations"][number];
