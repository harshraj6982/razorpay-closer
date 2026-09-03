import type {
  CustomerMetricsInput,
  MerchantPolicyInput,
  OrderExtraction,
  PaymentRecommendation,
  PolicyEvaluationResult,
} from "@/lib/ai/schemas";
import { policyEvaluationResultSchema, recommendationSchema } from "@/lib/ai/schemas";
import { calculateCustomerRisk } from "./risk";

export type CustomerPolicyContext = {
  id?: string;
  name?: string;
  isNew?: boolean;
  previousOrderCount?: number;
  onTimePaymentRate?: number;
};

export type PolicyEvaluationInput = {
  totalAmount: number | null;
  requestedAdvancePercentage?: number | null;
  requestedDiscountPercentage?: number | null;
  requestedCredit?: boolean;
  requestedCreditDays?: number | null;
  requestedCreditAmount?: number | null;
  customerIsNew?: boolean;
  previousOrderCount?: number;
  onTimePaymentRate?: number;
  isAmbiguous?: boolean;
  missingPrice?: boolean;
  product?: string;
  quantity?: number | null;
  unitPrice?: number | null;
};

export type PolicyContext = {
  order: OrderExtraction | PolicyEvaluationInput;
  customer?: CustomerPolicyContext;
  customerHistory?: CustomerMetricsInput | null;
  requestedTerms?: {
    advancePercentage?: number | null;
    discountPercentage?: number | null;
    creditRequested?: boolean;
    creditDays?: number | null;
    creditAmount?: number | null;
  };
  merchantPolicy: MerchantPolicyInput;
};

/**
 * Authoritative, deterministic policy evaluation function.
 * Evaluates merchant rules, customer history, risk score, and financial boundaries.
 */
export function evaluatePolicy(context: PolicyContext): PolicyEvaluationResult {
  const { merchantPolicy, order, customer, customerHistory, requestedTerms } = context;
  const violations: string[] = [];
  const reasons: string[] = [];

  const rawTotal = order.totalAmount ?? 0;
  const maxDiscountAmount = Math.round(
    rawTotal * (merchantPolicy.maximumDiscountPercentage / 100),
  );

  // 1. Ambiguous Order Handling
  if (order.isAmbiguous) {
    return policyEvaluationResultSchema.parse({
      allowed: false,
      decision: "CLARIFY_ORDER_DETAILS",
      recommendedAdvancePercentage: merchantPolicy.minimumAdvancePercentage,
      recommendedAdvanceAmount: 0,
      maximumAllowedDiscount: maxDiscountAmount,
      approvedDiscountPercentage: 0,
      discountedTotalAmount: 0,
      remainingAmount: 0,
      creditAllowed: false,
      requiresHumanApproval: false,
      canIssuePaymentLink: false,
      nextAction: "createFollowUp",
      reasons: ["The order request is ambiguous. Confirm product specifications and quantities."],
      violations: ["Order details are ambiguous (unclear quantity or product)."],
    });
  }

  // 2. Missing Price / Quote Request Handling
  if (order.missingPrice || order.totalAmount == null || order.totalAmount <= 0) {
    return policyEvaluationResultSchema.parse({
      allowed: false,
      decision: "COUNTER_WITH_CATALOG_RATES",
      recommendedAdvancePercentage: merchantPolicy.minimumAdvancePercentage,
      recommendedAdvanceAmount: 0,
      maximumAllowedDiscount: 0,
      approvedDiscountPercentage: 0,
      discountedTotalAmount: 0,
      remainingAmount: 0,
      creditAllowed: false,
      requiresHumanApproval: false,
      canIssuePaymentLink: false,
      nextAction: "createFollowUp",
      reasons: ["Unit price is missing or not established in conversation. Counter with catalog rates."],
      violations: ["Unit price is missing or not established."],
    });
  }

  // 3. Customer Risk & History Analysis
  const risk = calculateCustomerRisk(customerHistory, {
    isNew: "customerIsNew" in order ? order.customerIsNew : customer?.isNew,
    previousOrderCount: "previousOrderCount" in order ? order.previousOrderCount : customer?.previousOrderCount,
    onTimePaymentRate: "onTimePaymentRate" in order ? order.onTimePaymentRate : customer?.onTimePaymentRate,
  });

  const totalOrders = customerHistory?.totalOrders ?? ("previousOrderCount" in order ? order.previousOrderCount : customer?.previousOrderCount) ?? 0;
  const isNewCustomer = ("customerIsNew" in order ? order.customerIsNew : customer?.isNew) ?? (totalOrders === 0);

  if (isNewCustomer) {
    reasons.push("Customer has no previous order history");
  } else if (risk.level === "LOW") {
    reasons.push(`Customer is trusted based on payment history (${totalOrders} past orders, 0 late payments)`);
  } else if (risk.level === "HIGH") {
    reasons.push(`Customer classified as HIGH risk (${risk.reasons.join(", ")})`);
  } else {
    reasons.push(`Customer has moderate risk profile (${totalOrders} prior orders)`);
  }

  // 4. Discount Evaluation
  let approvedDiscountPercentage = 0;
  const requestedDiscount = requestedTerms?.discountPercentage ?? order.requestedDiscountPercentage ?? null;

  if (requestedDiscount != null && requestedDiscount > merchantPolicy.maximumDiscountPercentage) {
    violations.push(
      `Requested ${requestedDiscount}% discount exceeds the ${merchantPolicy.maximumDiscountPercentage}% maximum.`,
    );
    reasons.push(`Counter with maximum allowed discount of ${merchantPolicy.maximumDiscountPercentage}%`);
    approvedDiscountPercentage = merchantPolicy.maximumDiscountPercentage;
  } else if (requestedDiscount != null && requestedDiscount > 0) {
    approvedDiscountPercentage = requestedDiscount;
    reasons.push(`Requested ${requestedDiscount}% discount satisfies merchant discount policy`);
  }

  const discountedTotalAmount = Math.round(rawTotal * (1 - approvedDiscountPercentage / 100));

  // 5. Credit Terms Evaluation
  const requestedCredit = requestedTerms?.creditRequested ?? order.requestedCredit ?? false;
  const requestedCreditDays = requestedTerms?.creditDays ?? ("requestedCreditDays" in order ? order.requestedCreditDays : null) ?? 7;
  let creditAllowed = false;

  if (requestedCredit) {
    if (!merchantPolicy.allowCredit) {
      violations.push("Credit terms are not allowed under current merchant policy.");
      reasons.push("Credit was requested but merchant policy does not allow credit.");
    } else {
      let creditBreach = false;
      if (discountedTotalAmount > merchantPolicy.maximumCreditAmount) {
        violations.push(
          `Requested credit amount ₹${discountedTotalAmount.toLocaleString("en-IN")} exceeds maximum credit limit ₹${merchantPolicy.maximumCreditAmount.toLocaleString("en-IN")}.`,
        );
        creditBreach = true;
      }
      if (requestedCreditDays > merchantPolicy.maximumCreditDays) {
        violations.push(
          `Requested credit duration of ${requestedCreditDays} days exceeds maximum policy limit of ${merchantPolicy.maximumCreditDays} days.`,
        );
        creditBreach = true;
      }
      if (!creditBreach && risk.level !== "HIGH") {
        creditAllowed = true;
        reasons.push(`Credit terms approved: ₹${discountedTotalAmount.toLocaleString("en-IN")} for ${requestedCreditDays} days.`);
      }
    }
  }

  // 6. Advance Percentage & Safeguards
  let recommendedAdvancePercentage = requestedTerms?.advancePercentage ?? order.requestedAdvancePercentage ?? merchantPolicy.minimumAdvancePercentage;

  // Credit fallback
  if (requestedCredit && !creditAllowed) {
    recommendedAdvancePercentage = Math.max(
      recommendedAdvancePercentage,
      merchantPolicy.minimumAdvancePercentage,
    );
  }

  // New customer advance rule
  if (isNewCustomer && merchantPolicy.newCustomerRequiresAdvance) {
    if (order.requestedAdvancePercentage != null && order.requestedAdvancePercentage < merchantPolicy.minimumAdvancePercentage) {
      violations.push(
        `New customers must pay at least ${merchantPolicy.minimumAdvancePercentage}% advance.`,
      );
    }
    recommendedAdvancePercentage = Math.max(
      recommendedAdvancePercentage,
      merchantPolicy.minimumAdvancePercentage,
    );
    reasons.push(`Merchant policy requires new customers to provide at least ${merchantPolicy.minimumAdvancePercentage}% advance`);
  }

  // High-risk customer advance rule
  if (risk.level === "HIGH" && merchantPolicy.highRiskCustomerRequiresAdvance) {
    if ((order.requestedAdvancePercentage != null && order.requestedAdvancePercentage < merchantPolicy.minimumAdvancePercentage) || requestedCredit) {
      violations.push(
        `High-risk customers must pay at least ${merchantPolicy.minimumAdvancePercentage}% advance.`,
      );
    }
    recommendedAdvancePercentage = Math.max(
      recommendedAdvancePercentage,
      merchantPolicy.minimumAdvancePercentage,
    );
    creditAllowed = false;
    reasons.push("High-risk customer requires advance payment and human approval before dispatch");
  }

  // High-value order threshold
  const isHighValue = rawTotal >= merchantPolicy.highValueOrderThreshold;
  if (isHighValue) {
    recommendedAdvancePercentage = Math.max(
      recommendedAdvancePercentage,
      merchantPolicy.minimumAdvancePercentage,
    );
    reasons.push(`Order value ₹${rawTotal.toLocaleString("en-IN")} meets high-value threshold (≥ ₹${merchantPolicy.highValueOrderThreshold.toLocaleString("en-IN")})`);
  } else {
    reasons.push("Order value is below high-value threshold");
  }

  // Minimum advance floor check
  if (order.requestedAdvancePercentage != null && order.requestedAdvancePercentage < merchantPolicy.minimumAdvancePercentage) {
    if (!violations.some((v) => v.includes("below the"))) {
      violations.push(
        `Requested advance is below the ${merchantPolicy.minimumAdvancePercentage}% minimum.`,
      );
    }
    recommendedAdvancePercentage = merchantPolicy.minimumAdvancePercentage;
  } else if (!isNewCustomer && risk.level === "LOW") {
    reasons.push(`${recommendedAdvancePercentage}% advance satisfies merchant minimum`);
  }

  // Partial payment disabled check
  if (
    recommendedAdvancePercentage > 0 &&
    recommendedAdvancePercentage < 100 &&
    !merchantPolicy.allowPartialPayment
  ) {
    violations.push("Partial payment is disabled; full payment is required.");
    recommendedAdvancePercentage = 100;
    reasons.push("Partial payments disabled by merchant policy; 100% full payment required");
  }

  // 7. Calculate Financial Amounts
  const recommendedAdvanceAmount = Math.round(
    (discountedTotalAmount * recommendedAdvancePercentage) / 100,
  );
  const remainingAmount = discountedTotalAmount - recommendedAdvanceAmount;

  // 8. Determine Human Approval Flag
  let requiresHumanApproval = false;
  let canIssuePaymentLink = true;

  if (requestedDiscount != null && requestedDiscount > merchantPolicy.maximumDiscountPercentage) {
    canIssuePaymentLink = false;
    requiresHumanApproval = false;
  } else {
    requiresHumanApproval = merchantPolicy.requireApprovalForFinancialActions;
    if (isHighValue || risk.level === "HIGH") {
      requiresHumanApproval = true;
    }
  }

  // 9. Determine Decision and Next Action
  let decision = "REQUEST_ADVANCE";
  let nextAction: PolicyEvaluationResult["nextAction"] = "createPaymentLink";
  let allowed = violations.length === 0;

  if (requestedDiscount != null && requestedDiscount > merchantPolicy.maximumDiscountPercentage) {
    decision = "REJECT_EXCESSIVE_DISCOUNT";
    nextAction = "createFollowUp";
    canIssuePaymentLink = false;
    allowed = false;
  } else if (requestedCredit && !creditAllowed) {
    decision = "REJECT_REQUESTED_CREDIT_TERMS";
    nextAction = "createPaymentLink";
    canIssuePaymentLink = true;
    allowed = false;
  } else if (isNewCustomer && (order.requestedAdvancePercentage ?? 0) < merchantPolicy.minimumAdvancePercentage) {
    decision = "REQUIRE_MINIMUM_ADVANCE";
    nextAction = "createPaymentLink";
    canIssuePaymentLink = true;
    allowed = false;
  } else if (risk.level === "HIGH") {
    decision = "REQUIRE_ADVANCE_AND_APPROVAL";
    nextAction = "createPaymentLink";
    canIssuePaymentLink = true;
    allowed = violations.length === 0;
  } else if (recommendedAdvancePercentage >= 100) {
    decision = "REQUEST_FULL_PAYMENT";
    nextAction = "createPaymentLink";
    canIssuePaymentLink = true;
  } else {
    decision = "REQUEST_ADVANCE";
    nextAction = "createPaymentLink";
    canIssuePaymentLink = true;
  }

  return policyEvaluationResultSchema.parse({
    allowed,
    decision,
    recommendedAdvancePercentage,
    recommendedAdvanceAmount,
    maximumAllowedDiscount: maxDiscountAmount,
    approvedDiscountPercentage,
    discountedTotalAmount,
    remainingAmount,
    creditAllowed,
    requiresHumanApproval,
    canIssuePaymentLink,
    nextAction,
    reasons,
    violations,
  });
}

/**
 * Backward-compatible payment strategy calculation helper
 */
export function calculatePaymentStrategy(
  policy: MerchantPolicyInput,
  order: OrderExtraction | PolicyEvaluationInput,
  customer?: CustomerPolicyContext,
): PaymentRecommendation {
  const result = evaluatePolicy({
    merchantPolicy: policy,
    order,
    customer,
  });

  let reason = result.reasons.join(". ") + ".";
  if (result.decision === "REJECT_EXCESSIVE_DISCOUNT") {
    reason = `Counter with a ${policy.maximumDiscountPercentage}% discount. The requested discount would breach merchant policy.`;
  } else if (result.decision === "REJECT_REQUESTED_CREDIT_TERMS") {
    reason = "Credit was requested but is disabled. Collect at least the minimum advance via a payment link instead of opening a receivable.";
  } else if (result.decision === "REQUIRE_MINIMUM_ADVANCE") {
    reason = `This is a new customer. Policy requires a ${policy.minimumAdvancePercentage}% advance before production starts.`;
  } else if (customer && customer.previousOrderCount && customer.previousOrderCount >= 5 && (customer.onTimePaymentRate ?? 100) === 100) {
    reason = `The order is large, the customer is trusted, and the requested ${result.recommendedAdvancePercentage}% advance satisfies the merchant's minimum-payment policy.`;
  }

  return recommendationSchema.parse({
    recommendedAdvancePercentage: result.recommendedAdvancePercentage,
    recommendedAdvanceAmount: result.recommendedAdvanceAmount,
    remainingAmount: result.remainingAmount,
    approvedDiscountPercentage: result.approvedDiscountPercentage,
    discountedTotalAmount: result.discountedTotalAmount,
    canIssuePaymentLink: result.canIssuePaymentLink,
    nextAction: result.nextAction,
    reason,
    violations: result.violations,
  });
}

/**
 * Backward-compatible wrapper
 */
export function evaluatePaymentStrategy(
  policy: MerchantPolicyInput,
  input: PolicyEvaluationInput,
): PaymentRecommendation {
  return calculatePaymentStrategy(policy, input);
}
