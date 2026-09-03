import { z } from "zod";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

// -------------------------------------------------------------
// 1. Zod Input Schemas
// -------------------------------------------------------------

export const createPaymentLinkInput = z.object({
  orderId: z.string().min(1, "orderId is required"),
  amount: z.number().int("Amount must be an integer").positive("Amount must be positive"),
  customerName: z.string().optional().default("Customer"),
  description: z.string().optional().default("Payment link"),
  callbackUrl: z.string().optional(),
});

export const getPaymentStatusInput = z.object({
  paymentId: z.string().min(1, "paymentId is required"),
});

export const updateOrderStatusInput = z.object({
  orderId: z.string().min(1, "orderId is required"),
  toStatus: z.enum([
    "NEW",
    "QUALIFIED",
    "QUOTE_CREATED",
    "PAYMENT_REQUESTED",
    "PARTIALLY_PAID",
    "PAID",
    "FULFILLED",
  ]),
  reason: z.string().min(1, "reason is required"),
});

export const sendPaymentRequestInput = z.object({
  orderId: z.string().min(1, "orderId is required"),
  channel: z.enum(["whatsapp", "sms", "email"]).default("whatsapp"),
  message: z.string().min(1, "message is required"),
});

export const createFollowUpInput = z.object({
  conversationId: z.string().min(1, "conversationId is required"),
  note: z.string().min(1, "note is required"),
  dueAt: z.string().min(1, "dueAt is required"),
});

export const recordAgentActionInput = z.object({
  action: z.string().min(1, "action is required"),
  payload: z.record(z.string(), z.unknown()),
  result: z.unknown().optional(),
  success: z.boolean().default(true),
  reason: z.string().optional(),
  orderId: z.string().optional(),
  conversationId: z.string().optional(),
  decisionId: z.string().optional(),
});

// -------------------------------------------------------------
// 2. TypeScript Input / Output Types
// -------------------------------------------------------------

export type CreatePaymentLinkInput = z.input<typeof createPaymentLinkInput>;
export type GetPaymentStatusInput = z.input<typeof getPaymentStatusInput>;
export type UpdateOrderStatusInput = z.input<typeof updateOrderStatusInput>;
export type SendPaymentRequestInput = z.input<typeof sendPaymentRequestInput>;
export type CreateFollowUpInput = z.input<typeof createFollowUpInput>;
export type RecordAgentActionInput = z.input<typeof recordAgentActionInput>;

export type CreatePaymentLinkResult = {
  success: boolean;
  paymentLinkId?: string;
  paymentLinkUrl?: string;
  shortUrl?: string;
  paymentId?: string;
  amount?: number;
  orderId?: string;
  status?: string;
  error?: string;
};

export type GetPaymentStatusResult = {
  success: boolean;
  status?: string;
  amount?: number;
  paidAt?: string | null;
  error?: string;
};

export type UpdateOrderStatusResult = {
  success: boolean;
  status?: string;
  previousStatus?: string;
  orderId?: string;
  error?: string;
};

export type SendPaymentRequestResult = {
  success: boolean;
  sent?: boolean;
  channel?: string;
  error?: string;
};

export type CreateFollowUpResult = {
  success: boolean;
  followUpId?: string;
  dueAt?: string;
  note?: string;
  error?: string;
};

export type RecordAgentActionResult = {
  success: boolean;
  id?: string;
  error?: string;
};

export type AgentTools = {
  createPaymentLink: (input: CreatePaymentLinkInput) => Promise<CreatePaymentLinkResult>;
  getPaymentStatus: (input: GetPaymentStatusInput) => Promise<GetPaymentStatusResult>;
  updateOrderStatus: (input: UpdateOrderStatusInput) => Promise<UpdateOrderStatusResult>;
  sendPaymentRequest: (input: SendPaymentRequestInput) => Promise<SendPaymentRequestResult>;
  createFollowUp: (input: CreateFollowUpInput) => Promise<CreateFollowUpResult>;
  recordAgentAction: (input: RecordAgentActionInput) => Promise<RecordAgentActionResult>;
};

// -------------------------------------------------------------
// 3. OpenAI Chat Completions Tool Definitions
// -------------------------------------------------------------

export const agentToolDefinitions: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "createPaymentLink",
      description: "Creates a Razorpay payment link for an advance or full order amount. Backend authoritatively verifies and recalculates the allowed amount against merchant policy.",
      parameters: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description: "The unique ID of the order to create a payment link for.",
          },
          amount: {
            type: "integer",
            description: "The payment amount in INR (must match merchant advance policy).",
          },
          description: {
            type: "string",
            description: "A short plain-text description of the payment request.",
          },
        },
        required: ["orderId", "amount", "description"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getPaymentStatus",
      description: "Retrieves the current status of an existing payment or payment link.",
      parameters: {
        type: "object",
        properties: {
          paymentId: {
            type: "string",
            description: "The payment ID or Razorpay payment link ID.",
          },
        },
        required: ["paymentId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateOrderStatus",
      description: "Transitions the order to a valid subsequent status according to the state machine (e.g. FULFILLED when paid).",
      parameters: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description: "The order ID to transition.",
          },
          toStatus: {
            type: "string",
            enum: ["NEW", "QUALIFIED", "QUOTE_CREATED", "PAYMENT_REQUESTED", "PARTIALLY_PAID", "PAID", "FULFILLED"],
            description: "The destination order status.",
          },
          reason: {
            type: "string",
            description: "Business explanation for this status update.",
          },
        },
        required: ["orderId", "toStatus", "reason"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sendPaymentRequest",
      description: "Sends a structured payment or policy reminder to the customer via WhatsApp/SMS/email.",
      parameters: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description: "The order ID.",
          },
          channel: {
            type: "string",
            enum: ["whatsapp", "sms", "email"],
            description: "Messaging channel.",
          },
          message: {
            type: "string",
            description: "The message text to send to the customer.",
          },
        },
        required: ["orderId", "channel", "message"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createFollowUp",
      description: "Schedules a follow-up task or counter-offer when policy limits require negotiation or clarifying ambiguous requests.",
      parameters: {
        type: "object",
        properties: {
          conversationId: {
            type: "string",
            description: "The conversation ID.",
          },
          note: {
            type: "string",
            description: "The follow-up note or counter-offer description.",
          },
          dueAt: {
            type: "string",
            description: "Due timeline or date (e.g., 'Monday', 'Next business day').",
          },
        },
        required: ["conversationId", "note", "dueAt"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recordAgentAction",
      description: "Records an internal agent decision or audit record in the database log.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "Action name.",
          },
          payload: {
            type: "object",
            description: "Action payload object.",
          },
          reason: {
            type: "string",
            description: "Reason for action.",
          },
        },
        required: ["action", "payload"],
        additionalProperties: true,
      },
    },
  },
];
