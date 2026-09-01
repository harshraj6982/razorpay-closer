import OpenAI from "openai";
import { extractionSchema, type OrderExtraction } from "./schemas";

export type CustomerContext = {
  name: string;
  company?: string | null;
  phone?: string | null;
  isNew: boolean;
  previousOrderCount: number;
  onTimePaymentRate: number;
  lastUnitPrice?: number | null;
};

export type MessageContext = {
  role: string;
  body: string;
  sentAt?: string | Date;
};

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (apiKey && apiKey.startsWith("sk-")) {
    return new OpenAI({ apiKey });
  }
  return null;
}

export async function extractOrderFromConversation(
  messages: MessageContext[],
  customer: CustomerContext,
): Promise<OrderExtraction> {
  const openai = getOpenAIClient();

  if (openai) {
    try {
      const messagesPrompt = messages
        .map((m) => `${m.role}: ${m.body}`)
        .join("\n");

      const systemPrompt = `You are Razorpay Closer's AI order parser for Indian B2B merchants.
Extract structured order information from customer conversations.
Customer context:
- Name: ${customer.name}
- Company: ${customer.company ?? "Individual"}
- Is new customer: ${customer.isNew}
- Prior orders: ${customer.previousOrderCount}
- On-time payment rate: ${customer.onTimePaymentRate}%
- Last contracted unit price: ${customer.lastUnitPrice ? `₹${customer.lastUnitPrice}` : "None"}

You must return a JSON object with:
- intent: string (e.g. "bulk_order", "repeat_order", "event_order", "enquiry")
- products: array of { name: string, quantity: number, unitPrice: number }
- quantity: total count of items (integer > 0)
- unitPrice: unit price per item in INR (integer >= 0)
- totalAmount: quantity * unitPrice (integer >= 0)
- requestedAdvancePercentage: integer between 0-100 or null (e.g. if customer says "30% now", return 30; if COD/pay later, return 0)
- requestedDiscountPercentage: integer between 0-100 or null (e.g. "20% off", return 20)
- requestedCredit: boolean (true if asking for credit, pay after delivery/event, or COD)
- deliveryDate: string or null (e.g. "Monday", "This weekend", "Friday")
- customerRequestSummary: concise plain-text summary (e.g. "₹74,000 order · 30% now · delivery Monday")

If customer references "same rate as last time", use last contracted unit price (${customer.lastUnitPrice ?? 1000}).`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Conversation messages:\n${messagesPrompt}` },
        ],
        temperature: 0.1,
      });

      const text = response.choices[0]?.message?.content;
      if (text) {
        const parsed = JSON.parse(text);
        return extractionSchema.parse(parsed);
      }
    } catch (err) {
      console.warn("OpenAI extraction failed, falling back to deterministic extractor:", err);
    }
  }

  // Deterministic rule-based fallback extractor (ensures reliable hackathon demos offline or without API keys)
  return deterministicExtract(messages, customer);
}

export function deterministicExtract(
  messages: MessageContext[],
  customer: CustomerContext,
): OrderExtraction {
  const combined = messages
    .filter((m) => m.role === "CUSTOMER" || m.role === "customer")
    .map((m) => m.body)
    .join(" ");

  // 1. Quantity extraction
  let quantity = 1;
  const qtyMatch = combined.match(/(\d+)\s*(shirts|t-shirts|tees|hoodies|polos|uniforms|units|pcs|pieces)?/i);
  if (qtyMatch && Number(qtyMatch[1]) > 0) {
    quantity = Number(qtyMatch[1]);
  }

  // 2. Product name
  let productName = "Custom apparel";
  if (/shirt/i.test(combined)) productName = "Shirts";
  else if (/hoodie/i.test(combined)) productName = "Hoodies";
  else if (/polo/i.test(combined)) productName = "Polo tees";
  else if (/tee|t-shirt/i.test(combined)) productName = "T-shirts";
  else if (/uniform/i.test(combined)) productName = "Staff uniforms";

  // 3. Unit price extraction
  let unitPrice = customer.lastUnitPrice ?? 890;
  const priceMatch = combined.match(/(?:rate|price|cut|at|was)\s*(?:of|is|was)?\s*(?:₹|rs\.?)?\s*(\d{3,5})/i);
  if (priceMatch) {
    unitPrice = Number(priceMatch[1]);
  } else if (/same rate|last time/i.test(combined) && customer.lastUnitPrice) {
    unitPrice = customer.lastUnitPrice;
  } else if (/hoodie/i.test(combined)) {
    unitPrice = 890;
  } else if (/uniform/i.test(combined)) {
    unitPrice = 890;
  } else if (/polo/i.test(combined)) {
    unitPrice = 1000;
  } else if (/tee|t-shirt/i.test(combined)) {
    unitPrice = 400;
  } else if (/shirt/i.test(combined)) {
    unitPrice = 1850;
  }

  // 4. Total amount
  const totalAmount = quantity * unitPrice;

  // 5. Requested advance percentage
  let requestedAdvancePercentage: number | null = null;
  const advMatch = combined.match(/(?:pay|advance)\s*(\d+)%/i);
  if (advMatch) {
    requestedAdvancePercentage = Number(advMatch[1]);
  }

  // 6. Requested discount
  let requestedDiscountPercentage: number | null = null;
  const discMatch = combined.match(/(\d+)%\s*(?:off|discount)/i);
  if (discMatch) {
    requestedDiscountPercentage = Number(discMatch[1]);
  }

  // 7. Credit or COD requested
  const requestedCredit =
    /credit|pay after|after the event|after the fest|after wedding season|cod|cash on delivery/i.test(
      combined,
    );
  if (requestedCredit && requestedAdvancePercentage === null) {
    requestedAdvancePercentage = 0;
  }

  // 8. Delivery date
  let deliveryDate: string | null = null;
  if (/monday/i.test(combined)) deliveryDate = "Monday";
  else if (/this weekend|weekend/i.test(combined)) deliveryDate = "This weekend";
  else if (/friday/i.test(combined)) deliveryDate = "Friday";
  else if (/wedding season/i.test(combined)) deliveryDate = "Before wedding season";
  else if (/this week/i.test(combined)) deliveryDate = "This week";

  // 9. Intent
  let intent = "bulk_order";
  if (customer.previousOrderCount > 0) intent = "repeat_order";
  if (/fest|event/i.test(combined)) intent = "event_order";

  const customerRequestSummary = `₹${totalAmount.toLocaleString("en-IN")} ${productName.toLowerCase()}${
    requestedAdvancePercentage != null ? ` · ${requestedAdvancePercentage}% advance` : ""
  }${deliveryDate ? ` · delivery ${deliveryDate}` : ""}`;

  return {
    intent,
    products: [{ name: productName, quantity, unitPrice }],
    quantity,
    unitPrice,
    totalAmount,
    requestedAdvancePercentage,
    requestedDiscountPercentage,
    requestedCredit,
    deliveryDate,
    customerRequestSummary,
  };
}
