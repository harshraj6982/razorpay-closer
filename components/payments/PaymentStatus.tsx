"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, Copy, Check, Zap } from "lucide-react";
import type { DashboardConversation } from "@/lib/db/queries";
import { statusLabel } from "@/lib/orders/state";
import { formatINR, formatTime } from "@/lib/utils";
import { simulatePaymentWebhook } from "@/lib/actions/demo";

const PAYMENT_TONE: Record<string, string> = {
  PAID: "bg-emerald-50 text-emerald-700",
  PENDING: "bg-amber-50 text-amber-700",
  CREATED: "bg-slate-100 text-slate-600",
  FAILED: "bg-red-50 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

export function PaymentStatus({ conversation }: { conversation: DashboardConversation }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const order = conversation.order;
  if (!order) {
    return null;
  }

  const collected = order.payments
    .filter((payment) => payment.status === "PAID")
    .reduce((sum, payment) => sum + payment.amount, 0);

  function copyLink(url: string, id: string) {
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  function handleSimulate(linkId: string, amount: number) {
    startTransition(async () => {
      try {
        await simulatePaymentWebhook(linkId, amount);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Simulation failed");
      }
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Payment status</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          {statusLabel(order.status)}
        </span>
      </div>
      <p className="mt-2 text-[13px] text-muted">
        Collected {formatINR(collected)} of {formatINR(order.totalAmount)}
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-success transition-all duration-500"
          style={{ width: `${Math.min(100, (collected / order.totalAmount) * 100)}%` }}
        />
      </div>

      {order.payments.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-line px-3 py-3 text-[12px] text-muted text-center">
          No Razorpay payment link created yet. Approve the action above to generate a test link.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {order.payments.map((payment) => {
            const isUnpaid = payment.status !== "PAID";
            const linkUrl = payment.razorpayPaymentLinkUrl;

            return (
              <li
                key={payment.id}
                className="rounded-xl border border-line p-3 text-xs bg-slate-50/50 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="tabular text-sm font-semibold text-slate-900">
                      {formatINR(payment.amount)}
                    </p>
                    <p suppressHydrationWarning className="text-[11px] text-muted">
                      {payment.paidAt ? `Received ${formatTime(payment.paidAt)}` : "Awaiting payment"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${PAYMENT_TONE[payment.status]}`}
                  >
                    {payment.status}
                  </span>
                </div>

                {linkUrl ? (
                  <div className="flex items-center justify-between border-t border-line/60 pt-2 text-[11px] gap-2">
                    <span className="truncate font-mono text-slate-500 max-w-[170px]">
                      {linkUrl}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => copyLink(linkUrl, payment.id)}
                        className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-1 text-slate-600 border border-line hover:bg-slate-50"
                        title="Copy link"
                      >
                        {copied === payment.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        Copy
                      </button>

                      <Link
                        href={linkUrl.startsWith("http") ? linkUrl : `/pay/${linkUrl.replace(/^\/pay\//, "")}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-1 text-blue-600 border border-blue-200 hover:bg-blue-50"
                        title="Open checkout"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Checkout
                      </Link>
                    </div>
                  </div>
                ) : null}

                {isUnpaid ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleSimulate(payment.id, payment.amount)}
                    className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50 transition-all cursor-pointer"
                  >
                    <Zap className="h-3.5 w-3.5 fill-white" />
                    {isPending ? "Simulating Webhook…" : "Simulate Payment (Webhook)"}
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
