import type { MerchantPolicyInput, PaymentRecommendation } from "@/lib/ai/schemas";

export type PolicyEvaluationInput = {
  totalAmount: number;
  requestedAdvancePercentage: number | null;
  requestedDiscountPercentage: number | null;
  requestedCredit: boolean;
  customerIsNew: boolean;
  previousOrderCount: number;
  onTimePaymentRate: number;
};

export function evaluatePaymentStrategy(
  policy: MerchantPolicyInput,
  input: PolicyEvaluationInput,
): PaymentRecommendation {
  const violations: string[] = [];
  let approvedDiscountPercentage = 0;

  if (
    input.requestedDiscountPercentage != null &&
    input.requestedDiscountPercentage > policy.maximumDiscountPercentage
  ) {
    violations.push(
      `Requested ${input.requestedDiscountPercentage}% discount exceeds the ${policy.maximumDiscountPercentage}% maximum.`,
    );
    approvedDiscountPercentage = policy.maximumDiscountPercentage;
  } else if (input.requestedDiscountPercentage != null) {
    approvedDiscountPercentage = input.requestedDiscountPercentage;
  }

  let recommendedAdvancePercentage =
    input.requestedAdvancePercentage ?? policy.minimumAdvancePercentage;

  if (input.requestedCredit && !policy.allowCredit) {
    violations.push("Credit terms are not allowed under current merchant policy.");
    recommendedAdvancePercentage = Math.max(
      recommendedAdvancePercentage,
      policy.minimumAdvancePercentage,
    );
  }

  if (input.customerIsNew && policy.newCustomerRequiresAdvance) {
    if ((input.requestedAdvancePercentage ?? 0) < policy.minimumAdvancePercentage) {
      violations.push(
        `New customers must pay at least ${policy.minimumAdvancePercentage}% advance.`,
      );
    }
    recommendedAdvancePercentage = Math.max(
      recommendedAdvancePercentage,
      policy.minimumAdvancePercentage,
    );
  }

  if (recommendedAdvancePercentage < policy.minimumAdvancePercentage) {
    violations.push(
      `Requested advance is below the ${policy.minimumAdvancePercentage}% minimum.`,
    );
    recommendedAdvancePercentage = policy.minimumAdvancePercentage;
  }

  if (
    recommendedAdvancePercentage > 0 &&
    recommendedAdvancePercentage < 100 &&
    !policy.allowPartialPayment
  ) {
    violations.push("Partial payment is disabled; full payment is required.");
    recommendedAdvancePercentage = 100;
  }

  const discountedTotal = Math.round(
    input.totalAmount * (1 - approvedDiscountPercentage / 100),
  );
  const recommendedAdvanceAmount = Math.round(
    (discountedTotal * recommendedAdvancePercentage) / 100,
  );
  const remainingAmount = discountedTotal - recommendedAdvanceAmount;

  let nextAction: PaymentRecommendation["nextAction"] = "createPaymentLink";
  let reason = "";

  if (
    input.requestedDiscountPercentage != null &&
    input.requestedDiscountPercentage > policy.maximumDiscountPercentage
  ) {
    nextAction = "createFollowUp";
    reason = `Counter with a ${policy.maximumDiscountPercentage}% discount. The requested discount would breach merchant policy.`;
  } else if (input.requestedCredit && !policy.allowCredit) {
    nextAction = "sendPaymentRequest";
    reason =
      "Credit was requested but is disabled. Collect at least the minimum advance via a payment link instead of opening a receivable.";
  } else if (input.customerIsNew && policy.newCustomerRequiresAdvance) {
    nextAction = "createPaymentLink";
    reason = `This is a new customer. Policy requires a ${policy.minimumAdvancePercentage}% advance before production starts.`;
  } else if (input.previousOrderCount >= 5 && input.onTimePaymentRate === 100) {
    nextAction = "createPaymentLink";
    reason = `Trusted repeat customer (${input.previousOrderCount} prior orders, ${input.onTimePaymentRate}% on-time). Requested ${recommendedAdvancePercentage}% advance meets the ${policy.minimumAdvancePercentage}% minimum.`;
  } else {
    nextAction = "createPaymentLink";
    reason = `Collect a ${recommendedAdvancePercentage}% advance (${formatPlain(recommendedAdvanceAmount)}) to satisfy merchant payment policy.`;
  }

  return {
    recommendedAdvancePercentage,
    recommendedAdvanceAmount,
    remainingAmount,
    approvedDiscountPercentage,
    nextAction,
    reason,
    violations,
  };
}

function formatPlain(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}
