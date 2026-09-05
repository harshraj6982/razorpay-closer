import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { formatINR } from "@/lib/utils";
import { PaymentCheckoutClient } from "./PaymentCheckoutClient";

export const dynamic = "force-dynamic";

export default async function PayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const payment = await prisma.payment.findFirst({
    where: {
      OR: [
        { razorpayPaymentLinkId: id },
        { id: id },
        { razorpayPaymentLinkUrl: { contains: id } },
        ...(id === "demo-partial" || id === "demo" || id === "plink_demo_partial_1"
          ? [
              { razorpayPaymentLinkId: "plink_demo_partial_1" },
              { razorpayPaymentLinkUrl: "https://rzp.io/i/demo-partial" },
              { razorpayPaymentLinkUrl: "/pay/plink_demo_partial_1" },
            ]
          : []),
      ],
    },
    include: {
      order: {
        include: {
          conversation: {
            include: { customer: true, merchant: true },
          },
        },
      },
    },
  });

  if (!payment) {
    return notFound();
  }

  const customer = payment.order.conversation.customer;
  const merchant = payment.order.conversation.merchant;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        {/* Razorpay-style Header */}
        <div className="bg-slate-900 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-blue-600 font-bold text-white text-xs">
                RZP
              </div>
              <span className="font-semibold text-sm tracking-tight">{merchant.name}</span>
            </div>
            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
              Test Mode
            </span>
          </div>

          <div className="mt-4 flex items-baseline justify-between border-t border-slate-800 pt-3">
            <span className="text-xs text-slate-400">Amount Due</span>
            <span className="text-2xl font-bold tabular tracking-tight text-white">
              {formatINR(payment.amount)}
            </span>
          </div>
        </div>

        {/* Payment Details & Simulation */}
        <div className="p-6">
          <div className="mb-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <div className="flex justify-between py-1 border-b border-slate-200/60">
              <span className="text-slate-500">Customer</span>
              <span className="font-medium text-slate-900">{customer.name}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200/60">
              <span className="text-slate-500">Order ID</span>
              <span className="font-mono text-slate-700">{payment.order.id.slice(0, 16)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Link Reference</span>
              <span className="font-mono text-slate-700">{payment.razorpayPaymentLinkId ?? id}</span>
            </div>
          </div>

          <PaymentCheckoutClient
            paymentId={payment.id}
            linkId={payment.razorpayPaymentLinkId ?? payment.id}
            amount={payment.amount}
            isPaid={payment.status === "PAID"}
          />

          <div className="mt-6 text-center">
            <Link
              href="/dashboard"
              className="text-xs text-slate-500 hover:text-slate-800 underline transition-colors"
            >
              ← Return to Merchant Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
