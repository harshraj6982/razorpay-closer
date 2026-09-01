import { NextResponse } from "next/server";
import { z } from "zod";
import { processPaymentCapture } from "@/lib/razorpay/webhook";
import { prisma } from "@/lib/db/client";

const simulateSchema = z.object({
  paymentLinkId: z.string().optional(),
  orderId: z.string().optional(),
  amount: z.number().positive().optional(),
});

export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const data = simulateSchema.parse(raw);

    let amount = data.amount;
    const paymentLinkId = data.paymentLinkId;
    const orderId = data.orderId;

    if (!paymentLinkId && !orderId) {
      return NextResponse.json(
        { error: "Either paymentLinkId or orderId must be provided." },
        { status: 400 },
      );
    }

    // If amount is not passed, find the payment or order amount
    if (!amount) {
      if (paymentLinkId) {
        const payment = await prisma.payment.findFirst({
          where: {
            OR: [
              { razorpayPaymentLinkId: paymentLinkId },
              { id: paymentLinkId },
            ],
          },
        });
        if (payment) {
          amount = payment.amount;
        }
      }
      if (!amount && orderId) {
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (order) {
          amount = order.recommendedAdvanceAmount || order.totalAmount;
        }
      }
    }

    const simPaymentId = `pay_sim_${Math.random().toString(36).substring(2, 9)}`;

    const result = await processPaymentCapture({
      paymentLinkId,
      orderId,
      paymentId: simPaymentId,
      amount: amount || 1000,
      event: "payment.captured",
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Simulation error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
