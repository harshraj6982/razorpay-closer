import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay/client";
import { processPaymentCapture } from "@/lib/razorpay/webhook";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature") || "";

    // Verify webhook signature
    const isValid = verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const event = (payload.event as string) || "payment.captured";
    const paymentEntity = (payload.payload as Record<string, unknown>)?.payment as Record<string, unknown>;
    const linkEntity = (payload.payload as Record<string, unknown>)?.payment_link as Record<string, unknown>;

    const paymentLinkObj = linkEntity?.entity as Record<string, unknown> | undefined;
    const paymentObj = paymentEntity?.entity as Record<string, unknown> | undefined;

    const paymentLinkId = (paymentLinkObj?.id || (paymentObj?.notes as Record<string, unknown>)?.payment_link_id) as string | undefined;
    const paymentId = (paymentObj?.id as string) || `pay_${Date.now()}`;
    const amountInPaise = (paymentObj?.amount || paymentLinkObj?.amount) as number | undefined;
    const amount = amountInPaise ? Math.round(amountInPaise / 100) : 0;
    const orderId = ((paymentObj?.notes as Record<string, unknown>)?.orderId || (paymentLinkObj?.notes as Record<string, unknown>)?.orderId) as string | undefined;

    const result = await processPaymentCapture({
      paymentLinkId,
      paymentId,
      amount,
      event,
      orderId,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Webhook processing error:", error);
    const message = error instanceof Error ? error.message : "Webhook error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
