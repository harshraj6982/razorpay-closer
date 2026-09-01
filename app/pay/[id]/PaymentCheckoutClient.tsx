"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, CreditCard, ShieldCheck } from "lucide-react";
import { simulatePaymentWebhook } from "@/lib/actions/demo";
import { formatINR } from "@/lib/utils";

export function PaymentCheckoutClient({
  linkId,
  amount,
  isPaid: initialPaid,
}: {
  paymentId: string;
  linkId: string;
  amount: number;
  isPaid: boolean;
}) {
  const [isPaid, setIsPaid] = useState(initialPaid);
  const [isPending, startTransition] = useTransition();
  const [method, setMethod] = useState<"upi" | "card">("upi");

  function handlePay() {
    startTransition(async () => {
      try {
        await simulatePaymentWebhook(linkId, amount);
        setIsPaid(true);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Payment simulation failed");
      }
    });
  }

  if (isPaid) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <h4 className="mt-2 text-base font-semibold text-emerald-900">Payment Captured</h4>
        <p className="mt-1 text-xs text-emerald-700">
          ₹{amount.toLocaleString("en-IN")} was successfully processed. Webhook verified and order state updated.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-700">Select Test Payment Method</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMethod("upi")}
            className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-medium transition-all ${
              method === "upi"
                ? "border-blue-600 bg-blue-50 text-blue-700"
                : "border-slate-200 hover:bg-slate-50 text-slate-700"
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            UPI / QR
          </button>
          <button
            type="button"
            onClick={() => setMethod("card")}
            className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-medium transition-all ${
              method === "card"
                ? "border-blue-600 bg-blue-50 text-blue-700"
                : "border-slate-200 hover:bg-slate-50 text-slate-700"
            }`}
          >
            <CreditCard className="h-4 w-4" />
            Card / NetBanking
          </button>
        </div>
      </div>

      <button
        type="button"
        disabled={isPending}
        onClick={handlePay}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50 transition-all cursor-pointer"
      >
        {isPending ? "Processing Test Payment…" : `Pay ${formatINR(amount)} (Simulate Webhook)`}
      </button>

      <p className="text-center text-[11px] text-slate-400">
        Simulates Razorpay <code className="font-mono">payment.captured</code> webhook to the application.
      </p>
    </div>
  );
}
