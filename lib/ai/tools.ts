import { z } from "zod";

export const createPaymentLinkInput = z.object({
  orderId: z.string(),
  amount: z.number().int().positive(),
  customerName: z.string(),
  description: z.string(),
});

export const getPaymentStatusInput = z.object({
  paymentId: z.string(),
});

export const updateOrderStatusInput = z.object({
  orderId: z.string(),
  toStatus: z.enum([
    "NEW",
    "QUALIFIED",
    "QUOTE_CREATED",
    "PAYMENT_REQUESTED",
    "PARTIALLY_PAID",
    "PAID",
    "FULFILLED",
  ]),
  reason: z.string(),
});

export const sendPaymentRequestInput = z.object({
  orderId: z.string(),
  channel: z.enum(["whatsapp", "sms", "email"]),
  message: z.string(),
});

export const createFollowUpInput = z.object({
  conversationId: z.string(),
  note: z.string(),
  dueAt: z.string(),
});

export const recordAgentActionInput = z.object({
  action: z.string(),
  payload: z.record(z.string(), z.unknown()),
  result: z.unknown().optional(),
  success: z.boolean().default(true),
});

export type AgentTools = {
  createPaymentLink: (input: z.infer<typeof createPaymentLinkInput>) => Promise<{
    paymentLinkId: string;
    shortUrl: string;
  }>;
  getPaymentStatus: (input: z.infer<typeof getPaymentStatusInput>) => Promise<{
    status: string;
  }>;
  updateOrderStatus: (
    input: z.infer<typeof updateOrderStatusInput>,
  ) => Promise<{ status: string }>;
  sendPaymentRequest: (
    input: z.infer<typeof sendPaymentRequestInput>,
  ) => Promise<{ sent: true }>;
  createFollowUp: (input: z.infer<typeof createFollowUpInput>) => Promise<{
    followUpId: string;
  }>;
  recordAgentAction: (
    input: z.infer<typeof recordAgentActionInput>,
  ) => Promise<{ id: string }>;
};
