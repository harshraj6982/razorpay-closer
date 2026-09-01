import { NextResponse } from "next/server";
import { z } from "zod";
import { agentTools } from "@/lib/ai/execute";

const bodySchema = z.object({
  orderId: z.string(),
  amount: z.number().int().positive(),
  customerName: z.string().optional(),
  description: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const data = bodySchema.parse(raw);

    const result = await agentTools.createPaymentLink({
      orderId: data.orderId,
      amount: data.amount,
      customerName: data.customerName || "Customer",
      description: data.description || `Payment for order ${data.orderId}`,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
