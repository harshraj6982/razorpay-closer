import type {
  MerchantPolicyInput,
  OrderExtraction,
  PaymentRecommendation,
} from "@/lib/ai/schemas";
import { recommendationSchema } from "@/lib/ai/schemas";

export type CustomerPolicyContext = {
  isNew?: boolean;
  previousOrderCount?: number;
  onTimePaymentRate?: number;
};

export type PolicyEvaluationInput = {
  totalAmount: number | null;
  requestedAdvancePercentage?: number | null;
  requestedDiscountPercentage?: number | null;
  requestedCredit?: boolean;
  customerIsNew?: boolean;
  previousOrderCount?: number;
  onTimePaymentRate?: number;
  isAmbiguous?: boolean;
  missingPrice?: boolean;
  product?: string;
  quantity?: number | null;
  unitPrice?: number | null;
};

/**
 * Deterministic calculation of allowed payment strategy given an extracted order
 * and the merchant's policies.
 *
 * Does not call Razorpay or modify database state.
 */
export function calculatePaymentStrategy(
  policy: MerchantPolicyInput,
  order: OrderExtraction | PolicyEvaluationInput,
  customer?: CustomerPolicyContext,
): PaymentRecommendation {
  const violations: string[] = [];

  // 1. Check for ambiguous order details
  if (order.isAmbiguous) {
    return recommendationSchema.parse({
      recommendedAdvancePercentage: policy.minimumAdvancePercentage,
      recommendedAdvanceAmount: 0,
      remainingAmount: 0,
      approvedDiscountPercentage: 0,
      discountedTotalAmount: 0,
      canIssuePaymentLink: false,
      nextAction: "createFollowUp",
      reason: "The order request is ambiguous. Follow up with the customer to confirm product specifications and quantities before proceeding.",
      violations: ["Order details are ambiguous (unclear quantity or product)."],
    });
  }

  // 2. Check for missing price / quote request
  if (order.missingPrice || order.totalAmount == null || order.totalAmount <= 0) {
    return recommendationSchema.parse({
      recommendedAdvancePercentage: policy.minimumAdvancePercentage,
      recommendedAdvanceAmount: 0,
      remainingAmount: 0,
      approvedDiscountPercentage: 0,
      discountedTotalAmount: 0,
      canIssuePaymentLink: false,
      nextAction: "createFollowUp",
      reason: "Unit price was not specified in the conversation. Counter with catalog rates before requesting payment.",
      violations: ["Unit price is missing or not established."],
    });
  }

  const rawTotal = order.totalAmount;
  let approvedDiscountPercentage = 0;
  const requestedDiscount = order.requestedDiscountPercentage ?? null;

  // 3. Discount Policy Evaluation
  if (
    requestedDiscount != null &&
    requestedDiscount > policy.maximumDiscountPercentage
  ) {
    violations.push(
      `Requested ${requestedDiscount}% discount exceeds the ${policy.maximumDiscountPercentage}% maximum.`,
    );
    approvedDiscountPercentage = policy.maximumDiscountPercentage;
  } else if (requestedDiscount != null) {
    approvedDiscountPercentage = requestedDiscount;
  }

  // 4. Calculate discounted order total
  const discountedTotalAmount = Math.round(
    rawTotal * (1 - approvedDiscountPercentage / 100),
  );

  // 5. Advance Percentage Evaluation
  let recommendedAdvancePercentage =
    order.requestedAdvancePercentage ?? policy.minimumAdvancePercentage;

  const requestedCredit = order.requestedCredit ?? false;
  const isNewCustomer =
    ("customerIsNew" in order ? order.customerIsNew : undefined) ??
    customer?.isNew ??
    false;

  // Credit Terms Policy
  if (requestedCredit && !policy.allowCredit) {
    violations.push("Credit terms are not allowed under current merchant policy.");
    recommendedAdvancePercentage = Math.max(
      recommendedAdvancePercentage,
      policy.minimumAdvancePercentage,
    );
  }

  // New Customer Advance Policy
  if (isNewCustomer && policy.newCustomerRequiresAdvance) {
    if ((order.requestedAdvancePercentage ?? 0) < policy.minimumAdvancePercentage) {
      violations.push(
        `New customers must pay at least ${policy.minimumAdvancePercentage}% advance.`,
      );
    }
    recommendedAdvancePercentage = Math.max(
      recommendedAdvancePercentage,
      policy.minimumAdvancePercentage,
    );
  }

  // Minimum Advance Percentage Policy
  if (recommendedAdvancePercentage < policy.minimumAdvancePercentage) {
    violations.push(
      `Requested advance is below the ${policy.minimumAdvancePercentage}% minimum.`,
    );
    recommendedAdvancePercentage = policy.minimumAdvancePercentage;
  }

  // Partial Payment Allowance Policy
  if (
    recommendedAdvancePercentage > 0 &&
    recommendedAdvancePercentage < 100 &&
    !policy.allowPartialPayment
  ) {
    violations.push("Partial payment is disabled; full payment is required.");
    recommendedAdvancePercentage = 100;
  }

  // 6. Calculate Financial Amounts
  const recommendedAdvanceAmount = Math.round(
    (discountedTotalAmount * recommendedAdvancePercentage) / 100,
  );
  const remainingAmount = discountedTotalAmount - recommendedAdvanceAmount;

  // 7. Determine Next Action and Plain-Language Reason
  let nextAction: PaymentRecommendation["nextAction"] = "createPaymentLink";
  let reason = "";
  let canIssuePaymentLink = true;

  const previousOrderCount =
    ("previousOrderCount" in order ? order.previousOrderCount : undefined) ??
    customer?.previousOrderCount ??
    0;
  const onTimePaymentRate =
    ("onTimePaymentRate" in order ? order.onTimePaymentRate : undefined) ??
    customer?.onTimePaymentRate ??
    100;

  if (
    requestedDiscount != null &&
    requestedDiscount > policy.maximumDiscountPercentage
  ) {
    nextAction = "createFollowUp";
    canIssuePaymentLink = false;
    reason = `Counter with a ${policy.maximumDiscountPercentage}% discount. The requested ${requestedDiscount}% discount would breach merchant policy.`;
  } else if (requestedCredit && !policy.allowCredit) {
    nextAction = "sendPaymentRequest";
    reason =
      "Credit was requested but is disabled. Collect at least the minimum advance via a payment link instead of opening a receivable.";
  } else if (isNewCustomer && policy.newCustomerRequiresAdvance) {
    nextAction = "createPaymentLink";
    reason = `This is a new customer. Policy requires a ${policy.minimumAdvancePercentage}% advance before production starts.`;
  } else if (previousOrderCount >= 5 && onTimePaymentRate === 100) {
    nextAction = "createPaymentLink";
    reason = "The order is large, the customer is trusted, and the requested " +
      recommendedAdvancePercentage +
      "% advance satisfies the merchant's minimum-payment policy.";
  } else {
    nextAction = "createPaymentLink";
    reason = `Collect a ${recommendedAdvancePercentage}% advance (${formatPlain(recommendedAdvanceAmount)}) to satisfy merchant payment policy.`;
  }

  return recommendationSchema.parse({
    recommendedAdvancePercentage,
    recommendedAdvanceAmount,
    remainingAmount,
    approvedDiscountPercentage,
    discountedTotalAmount,
    canIssuePaymentLink,
    nextAction,
    reason,
    violations,
  });
}

/**
 * Backward-compatible wrapper for evaluatePaymentStrategy
 */
export function evaluatePaymentStrategy(
  policy: MerchantPolicyInput,
  input: PolicyEvaluationInput,
): PaymentRecommendation {
  return calculatePaymentStrategy(policy, input);
}

function formatPlain(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}
