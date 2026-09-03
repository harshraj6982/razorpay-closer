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
    const payloadContainer = payload.payload as Record<string, unknown> | undefined;
    const paymentEntity = payloadContainer?.payment as Record<string, unknown> | undefined;
    const linkEntity = payloadContainer?.payment_link as Record<string, unknown> | undefined;

    const paymentLinkObj = linkEntity?.entity as Record<string, unknown> | undefined;
    const paymentObj = paymentEntity?.entity as Record<string, unknown> | undefined;

    const paymentNotes = (paymentObj?.notes as Record<string, unknown> | undefined) ?? {};
    const linkNotes = (paymentLinkObj?.notes as Record<string, unknown> | undefined) ?? {};

    const paymentLinkId =
      (paymentLinkObj?.id as string | undefined) ||
      (paymentNotes.payment_link_id as string | undefined) ||
      (paymentNotes.paymentLinkId as string | undefined) ||
      (payload.paymentLinkId as string | undefined) ||
      (payload.payment_link_id as string | undefined);

    const paymentId =
      (paymentObj?.id as string | undefined) ||
      (payload.paymentId as string | undefined) ||
      (payload.payment_id as string | undefined) ||
      `pay_${Date.now()}`;

    const rawAmountInPaise =
      (paymentObj?.amount as number | undefined) ??
      (paymentLinkObj?.amount_paid as number | undefined) ??
      (paymentLinkObj?.amount as number | undefined);

    let amount = 0;
    if (typeof rawAmountInPaise === "number" && rawAmountInPaise > 0) {
      amount = Math.round(rawAmountInPaise / 100);
    } else if (typeof payload.amount === "number") {
      amount = payload.amount;
    }

    const orderId =
      (paymentNotes.orderId as string | undefined) ||
      (paymentNotes.order_id as string | undefined) ||
      (linkNotes.orderId as string | undefined) ||
      (linkNotes.order_id as string | undefined) ||
      (payload.orderId as string | undefined) ||
      (payload.order_id as string | undefined);

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
