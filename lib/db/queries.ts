import { unstable_cache } from "next/cache";
import { evaluatePolicy } from "@/lib/policies/engine";
import { calculateCustomerRisk } from "@/lib/policies/risk";
import { prisma } from "@/lib/db/client";

async function fetchDashboardData() {
  const merchant = await prisma.merchant.findUnique({
    where: { id: "merchant_stitchline" },
    include: {
      policy: true,
      conversations: {
        orderBy: { lastMessageAt: "desc" },
        include: {
          customer: {
            include: {
              metrics: true,
            },
          },
          messages: { orderBy: { sentAt: "asc" } },
          activities: { orderBy: { occurredAt: "asc" } },
          order: {
            include: {
              payments: { orderBy: { createdAt: "asc" } },
              statusHistory: { orderBy: { recordedAt: "asc" } },
            },
          },
        },
      },
    },
  });

  if (!merchant || !merchant.policy) {
    return null;
  }

  const conversations = merchant.conversations;

  const policy = {
    minimumAdvancePercentage: merchant.policy.minimumAdvancePercentage,
    maximumDiscountPercentage: merchant.policy.maximumDiscountPercentage,
    allowPartialPayment: merchant.policy.allowPartialPayment,
    allowCredit: merchant.policy.allowCredit,
    newCustomerRequiresAdvance: merchant.policy.newCustomerRequiresAdvance,
    maximumCreditAmount: merchant.policy.maximumCreditAmount,
    maximumCreditDays: merchant.policy.maximumCreditDays,
    highValueOrderThreshold: merchant.policy.highValueOrderThreshold,
    highRiskCustomerRequiresAdvance: merchant.policy.highRiskCustomerRequiresAdvance,
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
      const metrics = conversation.customer.metrics;

      const risk = calculateCustomerRisk(metrics, {
        isNew: conversation.customer.isNew,
        previousOrderCount: metrics?.totalOrders ?? conversation.customer.previousOrderCount,
        onTimePaymentRate: conversation.customer.onTimePaymentRate,
      });

      const liveRecommendation = order
        ? evaluatePolicy({
            merchantPolicy: policy,
            order: {
              totalAmount: order.totalAmount,
              requestedAdvancePercentage: order.requestedAdvancePercentage,
              requestedDiscountPercentage: order.requestedDiscountPercentage,
              requestedCredit: order.requestedCredit,
              customerIsNew: conversation.customer.isNew || (metrics?.totalOrders ?? 0) === 0,
              previousOrderCount: metrics?.totalOrders ?? conversation.customer.previousOrderCount,
              onTimePaymentRate: conversation.customer.onTimePaymentRate,
            },
            customer: {
              id: conversation.customer.id,
              name: conversation.customer.name,
              isNew: conversation.customer.isNew,
              previousOrderCount: conversation.customer.previousOrderCount,
              onTimePaymentRate: conversation.customer.onTimePaymentRate,
            },
            customerHistory: metrics,
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
          id: conversation.customer.id,
          name: conversation.customer.name,
          company: conversation.customer.company,
          phone: conversation.customer.phone,
          email: conversation.customer.email,
          isNew: conversation.customer.isNew || (metrics?.totalOrders ?? 0) === 0,
          previousOrderCount: metrics?.totalOrders ?? conversation.customer.previousOrderCount,
          onTimePaymentRate: conversation.customer.onTimePaymentRate,
          lastUnitPrice: conversation.customer.lastUnitPrice,
          metrics: metrics
            ? {
                totalOrders: metrics.totalOrders,
                totalOrderValue: metrics.totalOrderValue,
                totalPaid: metrics.totalPaid,
                successfulPayments: metrics.successfulPayments,
                failedPayments: metrics.failedPayments,
                latePayments: metrics.latePayments,
                averagePaymentDelayDays: metrics.averagePaymentDelayDays,
                lastOrderDate: metrics.lastOrderDate?.toISOString() ?? null,
                lastPaymentDate: metrics.lastPaymentDate?.toISOString() ?? null,
                outstandingAmount: metrics.outstandingAmount,
              }
            : {
                totalOrders: conversation.customer.previousOrderCount,
                totalOrderValue: conversation.customer.previousOrderCount * (conversation.customer.lastUnitPrice ?? 1000) * 30,
                totalPaid: conversation.customer.previousOrderCount * (conversation.customer.lastUnitPrice ?? 1000) * 30,
                successfulPayments: conversation.customer.previousOrderCount,
                failedPayments: 0,
                latePayments: 0,
                averagePaymentDelayDays: 0,
                lastOrderDate: null,
                lastPaymentDate: null,
                outstandingAmount: 0,
              },
          risk,
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

export const getDashboardData = unstable_cache(
  fetchDashboardData,
  ["dashboard-data-cache"],
  { tags: ["dashboard-data"], revalidate: 30 },
);

export type DashboardData = NonNullable<Awaited<ReturnType<typeof getDashboardData>>>;
export type DashboardConversation = DashboardData["conversations"][number];
