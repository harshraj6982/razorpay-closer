import type { CustomerMetricsInput, CustomerRiskResult } from "@/lib/ai/schemas";

/**
 * Deterministic, transparent customer risk scoring.
 * Evaluates payment history, order count, late payments, and outstanding balances.
 */
export function calculateCustomerRisk(
  metrics?: CustomerMetricsInput | null,
  context?: { isNew?: boolean; previousOrderCount?: number; onTimePaymentRate?: number },
): CustomerRiskResult {
  const reasons: string[] = [];
  let score = 100; // 100 is lowest risk (best), 0 is highest risk

  if (!metrics && !context) {
    return {
      score: 50,
      level: "MEDIUM",
      reasons: ["No customer transaction history available"],
    };
  }

  const totalOrders = metrics?.totalOrders ?? context?.previousOrderCount ?? 0;
  const isNew = metrics ? totalOrders === 0 : (context?.isNew ?? totalOrders === 0);
  const latePayments = metrics?.latePayments ?? 0;
  const failedPayments = metrics?.failedPayments ?? 0;
  const outstandingAmount = metrics?.outstandingAmount ?? 0;

  // 1. New Customer Assessment
  if (isNew || totalOrders === 0) {
    score = 50;
    reasons.push("New customer with no prior order history");
    return {
      score,
      level: "MEDIUM",
      reasons,
    };
  }

  // 2. Late and Failed Payments Penalties
  if (latePayments > 0) {
    const penalty = Math.min(60, latePayments * 20);
    score -= penalty;
    reasons.push(`${latePayments} late payment${latePayments > 1 ? "s" : ""} on record`);
  }

  if (failedPayments > 0) {
    const penalty = Math.min(30, failedPayments * 15);
    score -= penalty;
    reasons.push(`${failedPayments} failed payment attempt${failedPayments > 1 ? "s" : ""}`);
  }

  // 3. Outstanding Overdue Balance Penalties
  if (outstandingAmount > 50000) {
    score -= 30;
    reasons.push(`High outstanding balance of ₹${outstandingAmount.toLocaleString("en-IN")}`);
  } else if (outstandingAmount > 15000) {
    score -= 15;
    reasons.push(`Outstanding balance of ₹${outstandingAmount.toLocaleString("en-IN")}`);
  } else if (outstandingAmount === 0) {
    reasons.push("Zero outstanding balance");
  }

  // 4. Track Record Rewards / Penalties
  if (totalOrders >= 5 && latePayments === 0 && failedPayments === 0) {
    reasons.unshift(`${totalOrders} successful orders with 0 payment delays`);
  } else if (totalOrders >= 1 && latePayments === 0) {
    reasons.unshift(`${totalOrders} order${totalOrders > 1 ? "s" : ""} with 100% on-time payment`);
  }

  // 5. Categorize into LOW, MEDIUM, HIGH
  score = Math.max(0, Math.min(100, score));

  let level: "LOW" | "MEDIUM" | "HIGH" = "LOW";
  if (latePayments >= 2 || failedPayments >= 2 || score < 50 || outstandingAmount >= 18000) {
    level = "HIGH";
  } else if (score < 80 || totalOrders < 3 || outstandingAmount > 0) {
    level = "MEDIUM";
  } else {
    level = "LOW";
  }

  return {
    score,
    level,
    reasons,
  };
}
