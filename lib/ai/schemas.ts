import { z } from "zod";

export const merchantPolicySchema = z.object({
  minimumAdvancePercentage: z.number().int().min(0).max(100),
  maximumDiscountPercentage: z.number().int().min(0).max(100),
  allowPartialPayment: z.boolean(),
  allowCredit: z.boolean(),
  newCustomerRequiresAdvance: z.boolean(),
  requireApprovalForFinancialActions: z.boolean().default(true),
});

export type MerchantPolicyInput = z.infer<typeof merchantPolicySchema>;

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
