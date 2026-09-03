import { z } from "zod";

export const merchantPolicySchema = z.object({
  minimumAdvancePercentage: z.number().int().min(0).max(100).default(25),
  maximumDiscountPercentage: z.number().int().min(0).max(100).default(5),
  allowPartialPayment: z.boolean().default(true),
  allowCredit: z.boolean().default(false),
  newCustomerRequiresAdvance: z.boolean().default(true),
  maximumCreditAmount: z.number().int().nonnegative().default(25000),
  maximumCreditDays: z.number().int().positive().default(7),
  highValueOrderThreshold: z.number().int().positive().default(100000),
  highRiskCustomerRequiresAdvance: z.boolean().default(true),
  requireApprovalForFinancialActions: z.boolean().default(true),
});

export type MerchantPolicyInput = z.infer<typeof merchantPolicySchema>;

export const customerMetricsSchema = z.object({
  customerId: z.string().optional(),
  totalOrders: z.number().int().nonnegative().default(0),
  totalOrderValue: z.number().int().nonnegative().default(0),
  totalPaid: z.number().int().nonnegative().default(0),
  successfulPayments: z.number().int().nonnegative().default(0),
  failedPayments: z.number().int().nonnegative().default(0),
  latePayments: z.number().int().nonnegative().default(0),
  averagePaymentDelayDays: z.number().int().nonnegative().default(0),
  lastOrderDate: z.date().nullable().optional(),
  lastPaymentDate: z.date().nullable().optional(),
  outstandingAmount: z.number().int().nonnegative().default(0),
});

export type CustomerMetricsInput = z.infer<typeof customerMetricsSchema>;

export const customerRiskLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export type CustomerRiskLevel = z.infer<typeof customerRiskLevelSchema>;

export const customerRiskSchema = z.object({
  score: z.number().int().min(0).max(100),
  level: customerRiskLevelSchema,
  reasons: z.array(z.string()),
});

export type CustomerRiskResult = z.infer<typeof customerRiskSchema>;

export const policyEvaluationResultSchema = z.object({
  allowed: z.boolean(),
  decision: z.string(),
  recommendedAdvancePercentage: z.number().int().min(0).max(100),
  recommendedAdvanceAmount: z.number().int().nonnegative(),
  maximumAllowedDiscount: z.number().int().nonnegative(),
  approvedDiscountPercentage: z.number().int().min(0).max(100).default(0),
  discountedTotalAmount: z.number().int().nonnegative().default(0),
  remainingAmount: z.number().int().nonnegative().default(0),
  creditAllowed: z.boolean(),
  requiresHumanApproval: z.boolean(),
  canIssuePaymentLink: z.boolean().default(true),
  nextAction: z.enum([
    "createPaymentLink",
    "sendPaymentRequest",
    "createFollowUp",
    "updateOrderStatus",
    "getPaymentStatus",
  ]).default("createPaymentLink"),
  reasons: z.array(z.string()),
  violations: z.array(z.string()),
});

export type PolicyEvaluationResult = z.infer<typeof policyEvaluationResultSchema>;

export const productItemSchema = z.object({
  name: z.string(),
  quantity: z.number().int().positive().nullable(),
  unitPrice: z.number().int().nonnegative().nullable(),
});

export const extractionSchema = z.object({
  product: z.string(),
  products: z.array(productItemSchema),
  quantity: z.number().int().positive().nullable(),
  unitPrice: z.number().int().nonnegative().nullable(),
  totalAmount: z.number().int().nonnegative().nullable(),
  requestedAdvancePercentage: z.number().int().min(0).max(100).nullable(),
  requestedAdvanceAmount: z.number().int().nonnegative().nullable(),
  requestedDiscountPercentage: z.number().int().min(0).max(100).nullable(),
  requestedCredit: z.boolean(),
  requestedCreditDays: z.number().int().positive().nullable().optional(),
  deliveryDate: z.string().nullable(),
  intent: z.enum([
    "order",
    "bulk_order",
    "repeat_order",
    "quote_request",
    "discount_request",
    "partial_payment_order",
    "credit_request",
    "inquiry",
    "ambiguous",
  ]),
  isAmbiguous: z.boolean(),
  missingPrice: z.boolean(),
  customerRequestSummary: z.string(),
  notes: z.string().nullable(),
});

export type OrderExtraction = z.infer<typeof extractionSchema>;

export const recommendationSchema = z.object({
  recommendedAdvancePercentage: z.number().int().min(0).max(100),
  recommendedAdvanceAmount: z.number().int().nonnegative(),
  remainingAmount: z.number().int().nonnegative(),
  approvedDiscountPercentage: z.number().int().min(0).max(100),
  discountedTotalAmount: z.number().int().nonnegative(),
  canIssuePaymentLink: z.boolean(),
  nextAction: z.enum([
    "createPaymentLink",
    "sendPaymentRequest",
    "createFollowUp",
    "updateOrderStatus",
    "getPaymentStatus",
  ]),
  reason: z.string(),
  violations: z.array(z.string()),
});

export type PaymentRecommendation = z.infer<typeof recommendationSchema>;

export const agentDecisionSchema = z.object({
  customerRequest: z.string(),
  context: z.string(),
  policy: z.string(),
  decision: z.string(),
  action: z.string(),
  result: z.string(),
  requiresApproval: z.boolean().default(false),
  approved: z.boolean().default(false),
  toolCallsCount: z.number().int().default(0),
});

export type AgentDecision = z.infer<typeof agentDecisionSchema>;
