import { prisma } from "@/lib/db/client";
import { calculateCustomerRisk } from "./risk";
import type { CustomerMetricsInput, CustomerRiskResult } from "@/lib/ai/schemas";

export type CustomerFullContext = {
  customer: {
    id: string;
    name: string;
    company: string | null;
    phone: string | null;
    email: string | null;
    isNew: boolean;
  };
  metrics: CustomerMetricsInput;
  risk: CustomerRiskResult;
  summaryText: string;
};

/**
 * Recalculates metrics for a customer based on orders and payments in database
 * and persists to CustomerMetrics model.
 */
export async function syncCustomerMetrics(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      conversations: {
        include: {
          order: {
            include: {
              payments: true,
            },
          },
        },
      },
    },
  });

  if (!customer) return null;

  const orders = customer.conversations
    .map((c) => c.order)
    .filter((o): o is NonNullable<typeof o> => Boolean(o));

  const totalOrders = Math.max(customer.previousOrderCount, orders.length);
  const totalOrderValue = orders.reduce((sum, o) => sum + o.totalAmount, 0);

  const allPayments = orders.flatMap((o) => o.payments);
  const successfulPayments = allPayments.filter((p) => p.status === "PAID").length;
  const failedPayments = allPayments.filter((p) => p.status === "FAILED").length;
  const totalPaid = allPayments
    .filter((p) => p.status === "PAID")
    .reduce((sum, p) => sum + p.amount, 0);

  const latePayments = customer.onTimePaymentRate < 100
    ? Math.max(1, Math.round((totalOrders * (100 - customer.onTimePaymentRate)) / 100))
    : 0;

  const outstandingAmount = Math.max(0, totalOrderValue - totalPaid);

  const lastOrder = orders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const paidPayments = allPayments
    .filter((p) => p.status === "PAID" && p.paidAt)
    .sort((a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0));
  const lastPayment = paidPayments[0];

  const metricsData = {
    totalOrders,
    totalOrderValue,
    totalPaid,
    successfulPayments: Math.max(successfulPayments, totalOrders - latePayments),
    failedPayments,
    latePayments,
    averagePaymentDelayDays: latePayments > 0 ? 5 : 0,
    lastOrderDate: lastOrder?.createdAt ?? null,
    lastPaymentDate: lastPayment?.paidAt ?? null,
    outstandingAmount,
  };

  const updatedMetrics = await prisma.customerMetrics.upsert({
    where: { customerId },
    create: {
      customerId,
      ...metricsData,
    },
    update: metricsData,
  });

  return updatedMetrics;
}

/**
 * Loads customer record, metrics, and calculates deterministic risk score.
 * Returns concise text summary and structured context object.
 */
export async function getCustomerContext(customerId: string): Promise<CustomerFullContext | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      metrics: true,
    },
  });

  if (!customer) return null;

  let metrics: CustomerMetricsInput;
  if (customer.metrics) {
    metrics = {
      customerId: customer.id,
      totalOrders: customer.metrics.totalOrders,
      totalOrderValue: customer.metrics.totalOrderValue,
      totalPaid: customer.metrics.totalPaid,
      successfulPayments: customer.metrics.successfulPayments,
      failedPayments: customer.metrics.failedPayments,
      latePayments: customer.metrics.latePayments,
      averagePaymentDelayDays: customer.metrics.averagePaymentDelayDays,
      lastOrderDate: customer.metrics.lastOrderDate,
      lastPaymentDate: customer.metrics.lastPaymentDate,
      outstandingAmount: customer.metrics.outstandingAmount,
    };
  } else {
    // Fallback based on customer row
    const totalOrders = customer.previousOrderCount;
    const latePayments = customer.onTimePaymentRate < 100
      ? Math.max(1, Math.round((totalOrders * (100 - customer.onTimePaymentRate)) / 100))
      : 0;
    metrics = {
      customerId: customer.id,
      totalOrders,
      totalOrderValue: totalOrders * (customer.lastUnitPrice ?? 1000) * 30,
      totalPaid: totalOrders * (customer.lastUnitPrice ?? 1000) * 30,
      successfulPayments: Math.max(0, totalOrders - latePayments),
      failedPayments: 0,
      latePayments,
      averagePaymentDelayDays: latePayments > 0 ? 5 : 0,
      lastOrderDate: null,
      lastPaymentDate: null,
      outstandingAmount: 0,
    };
  }

  const risk = calculateCustomerRisk(metrics, {
    isNew: customer.isNew,
    previousOrderCount: customer.previousOrderCount,
    onTimePaymentRate: customer.onTimePaymentRate,
  });

  const summaryText = formatCustomerSummary(customer.name, metrics, risk);

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      company: customer.company,
      phone: customer.phone,
      email: customer.email,
      isNew: customer.isNew || metrics.totalOrders === 0,
    },
    metrics,
    risk,
    summaryText,
  };
}

export function formatCustomerSummary(
  name: string,
  metrics: CustomerMetricsInput,
  risk: CustomerRiskResult,
): string {
  const formattedLTV = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(metrics.totalOrderValue);

  const formattedOutstanding = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(metrics.outstandingAmount);

  const lastOrderStr = metrics.lastOrderDate
    ? `${Math.max(1, Math.round((Date.now() - metrics.lastOrderDate.getTime()) / (1000 * 60 * 60 * 24)))} days ago`
    : "None";

  return `Customer:
${name}

Orders:
${metrics.totalOrders}

Total order value:
${formattedLTV}

Successful payments:
${metrics.successfulPayments}

Late payments:
${metrics.latePayments}

Outstanding:
${formattedOutstanding}

Average payment delay:
${metrics.averagePaymentDelayDays} days

Last order:
${lastOrderStr}

Risk:
${risk.level}

Reason:
${risk.reasons.join(". ")}.`;
}
