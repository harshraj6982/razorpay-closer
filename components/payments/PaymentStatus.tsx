"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, Copy, Check, Zap, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import type { DashboardConversation } from "@/lib/db/queries";
import { statusLabel } from "@/lib/orders/state";
import {
  formatINR,
  formatTime,
  getPaymentCheckoutUrl,
  getPaymentDisplayUrl,
  getPaymentAbsoluteUrl,
} from "@/lib/utils";
import { simulatePaymentWebhook } from "@/lib/actions/demo";
import { RazorpayIcon } from "@/components/brand/RazorpayLogo";

const PAYMENT_TONE: Record<string, { bg: string; text: string; border: string }> = {
  PAID: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  PENDING: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  CREATED: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  FAILED: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  CANCELLED: { bg: "bg-slate-100", text: "text-slate-500", border: "border-slate-200" },
};

export function PaymentStatus({ conversation }: { conversation: DashboardConversation }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const order = conversation.order;
  if (!order) {
    return null;
  }

  const collected = order.payments
    .filter((payment) => payment.status === "PAID")
    .reduce((sum, payment) => sum + payment.amount, 0);

  const percentage = Math.min(100, Math.round((collected / order.totalAmount) * 100));

  function copyLink(url: string, id: string, linkId?: string | null) {
    const fullUrl = getPaymentAbsoluteUrl(url, linkId, id);
    navigator.clipboard.writeText(fullUrl);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  function handleSimulate(linkId: string, amount: number) {
    setSimError(null);
    startTransition(async () => {
      try {
        await simulatePaymentWebhook(linkId, amount);
      } catch (err) {
        setSimError(err instanceof Error ? err.message : "Simulation failed");
      }
    });
  }

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RazorpayIcon size={18} />
          <h3 className="text-sm font-bold text-[#0C2340]">Razorpay Payment Hub</h3>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
          {statusLabel(order.status)}
        </span>
      </div>

      {simError ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 p-2.5 text-xs font-medium text-rose-800 border border-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{simError}</span>
        </div>
      ) : null}

      {/* Payment Progress Bar */}
      <div className="mt-4 space-y-1.5">
        <div className="flex justify-between text-xs text-slate-500">
          <span>Collected: {formatINR(collected)}</span>
          <span className="font-semibold text-slate-700">{percentage}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {order.payments.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-4 text-center">
          <p className="text-xs font-semibold text-slate-600">No payment links active</p>
          <p className="mt-1 text-[11px] text-slate-400">
            Approve the AI action above to issue an authoritative Razorpay link.
          </p>
        </div>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {order.payments.map((payment) => {
            const isUnpaid = payment.status !== "PAID";
            const checkoutUrl = getPaymentCheckoutUrl(
              payment.razorpayPaymentLinkUrl,
              payment.razorpayPaymentLinkId,
              payment.id,
            );
            const displayUrl = getPaymentDisplayUrl(
              payment.razorpayPaymentLinkUrl,
              payment.razorpayPaymentLinkId,
              payment.id,
            );
            const tone = PAYMENT_TONE[payment.status] ?? {
              bg: "bg-slate-100",
              text: "text-slate-600",
              border: "border-slate-200",
            };

            return (
              <li
                key={payment.id}
                className="rounded-xl border border-slate-200/80 p-3 bg-white space-y-2.5 shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="tabular text-base font-extrabold text-[#0C2340]">
                      {formatINR(payment.amount)}
                    </p>
                    <p
                      suppressHydrationWarning
                      className="flex items-center gap-1 text-[11px] font-medium text-slate-400"
                    >
                      {payment.paidAt ? (
                        <>
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          Received {formatTime(payment.paidAt)}
                        </>
                      ) : (
                        <>
                          <Clock className="h-3 w-3 text-amber-500" />
                          Awaiting Customer Payment
                        </>
                      )}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${tone.bg} ${tone.text} ${tone.border}`}
                  >
                    {payment.status}
                  </span>
                </div>

                {checkoutUrl && checkoutUrl !== "#" ? (
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] gap-2">
                    <span
                      className="truncate font-mono text-slate-500 max-w-[170px] bg-slate-50 px-2 py-0.5 rounded border border-slate-200/50 text-[10px]"
                      title={displayUrl}
                    >
                      {displayUrl}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          copyLink(
                            payment.razorpayPaymentLinkUrl ?? checkoutUrl,
                            payment.id,
                            payment.razorpayPaymentLinkId,
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-2xs cursor-pointer text-xs"
                        title="Copy link"
                      >
                        {copied === payment.id ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        <span>Copy</span>
                      </button>

                      <Link
                        href={checkoutUrl}
                        target="_blank"
                        className="inline-flex items-center gap-1 rounded-md bg-[#0C83FD] px-2.5 py-1 text-white font-bold hover:bg-[#0066ee] shadow-2xs text-xs"
                        title="Open checkout"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>Checkout</span>
                      </Link>
                    </div>
                  </div>
                ) : null}

                {isUnpaid ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleSimulate(payment.id, payment.amount)}
                    className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50 transition-all shadow-xs cursor-pointer"
                  >
                    <Zap className="h-3.5 w-3.5 fill-white" />
                    <span>
                      {isPending ? "Simulating Webhook…" : "Simulate Payment (Webhook)"}
                    </span>
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
