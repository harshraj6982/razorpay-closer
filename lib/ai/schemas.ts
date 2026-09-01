import { z } from "zod";

export const merchantPolicySchema = z.object({
  minimumAdvancePercentage: z.number().int().min(0).max(100),
  maximumDiscountPercentage: z.number().int().min(0).max(100),
  allowPartialPayment: z.boolean(),
  allowCredit: z.boolean(),
  newCustomerRequiresAdvance: z.boolean(),
});

export type MerchantPolicyInput = z.infer<typeof merchantPolicySchema>;

export const extractionSchema = z.object({
  intent: z.string(),
  products: z.array(
    z.object({
      name: z.string(),
      quantity: z.number().int().positive(),
      unitPrice: z.number().int().nonnegative(),
    }),
  ),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  totalAmount: z.number().int().nonnegative(),
  requestedAdvancePercentage: z.number().int().min(0).max(100).nullable(),
  requestedDiscountPercentage: z.number().int().min(0).max(100).nullable(),
  requestedCredit: z.boolean(),
  deliveryDate: z.string().nullable(),
  customerRequestSummary: z.string(),
});

export type OrderExtraction = z.infer<typeof extractionSchema>;

export const recommendationSchema = z.object({
  recommendedAdvancePercentage: z.number().int().min(0).max(100),
  recommendedAdvanceAmount: z.number().int().nonnegative(),
  remainingAmount: z.number().int().nonnegative(),
  approvedDiscountPercentage: z.number().int().min(0).max(100),
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
