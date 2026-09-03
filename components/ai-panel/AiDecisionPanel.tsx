"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ArrowRight, Loader2, ShieldAlert } from "lucide-react";
import type { DashboardConversation, DashboardData } from "@/lib/db/queries";
import { approveNextAction } from "@/lib/actions/demo";
import { formatINR } from "@/lib/utils";

export function AiDecisionPanel({
  conversation,
  policy,
}: {
  conversation: DashboardConversation;
  policy: DashboardData["policy"];
}) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  const order = conversation.order;
  if (!order) {
    return null;
  }

  const recommendation = order.liveRecommendation;
  const history =
    conversation.customer.previousOrderCount > 0
      ? `${conversation.customer.previousOrderCount} prior orders · ${conversation.customer.onTimePaymentRate}% on-time`
      : "New customer · 0 prior orders";

  const isPostPaymentState =
    order.status === "PARTIALLY_PAID" ||
    order.status === "PAID" ||
    order.status === "FULFILLED";

  const nextAction = isPostPaymentState
    ? (order.nextAction ?? "createPaymentLink")
    : (recommendation?.nextAction ?? order.nextAction ?? "createPaymentLink");

  // Determine if approval is needed for financial actions
  const isFinancialAction = nextAction === "createPaymentLink";
  const hasActivePaymentLink = order.payments.some((p) => p.status === "CREATED" || p.status === "PAID");
  const requiresApproval = isFinancialAction && policy.requireApprovalForFinancialActions && !hasActivePaymentLink;

  // 1. CUSTOMER REQUEST
  const customerRequestText = order.customerRequestSummary ?? `${order.quantity}x items (${formatINR(order.totalAmount)})`;

  // 2. CONTEXT
  const contextText = `${order.quantity} units @ ${formatINR(order.unitPrice)}/unit = ${formatINR(order.totalAmount)} · ${conversation.customer.name} (${history})`;

  // 3. POLICY
  const policyText = `Min advance: ${policy.minimumAdvancePercentage}% · Max discount: ${policy.maximumDiscountPercentage}% · Credit: ${policy.allowCredit ? "Allowed" : "Disabled"}${policy.requireApprovalForFinancialActions ? " · Financial approval: Required" : ""}`;

  // 4. DECISION
  const decisionText = isPostPaymentState
    ? (order.reason ?? recommendation?.reason ?? "Processing post-payment lifecycle.")
    : (recommendation?.reason ?? order.reason ?? "Evaluate customer terms against policy.");

  // 5. ACTION
  const actionText = nextAction;

  // 6. RESULT
  let resultText = "Ready for execution";
  if (order.status === "FULFILLED") {
    resultText = "Order fulfilled and completed.";
  } else if (order.status === "PAID") {
    resultText = "Full payment received. Order ready to dispatch.";
  } else if (order.status === "PARTIALLY_PAID") {
    resultText = `Advance received (${formatINR(order.recommendedAdvanceAmount ?? 0)}). Balance remaining: ${formatINR(order.remainingAmount ?? 0)}.`;
  } else if (hasActivePaymentLink) {
    const activeLink = order.payments[0];
    resultText = `Payment link created: ${activeLink?.razorpayPaymentLinkUrl ?? "Active link"}`;
  } else if (requiresApproval) {
    resultText = `Staged for merchant approval: createPaymentLink for ${formatINR(recommendation?.recommendedAdvanceAmount ?? order.recommendedAdvanceAmount ?? 0)}`;
  }

  function handleApprove() {
    setFeedback(null);
    startTransition(async () => {
      try {
        await approveNextAction(conversation.id);
        setFeedback("Action executed successfully");
        setTimeout(() => setFeedback(null), 4000);
      } catch (err) {
        setFeedback(err instanceof Error ? err.message : "Execution failed");
      }
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
          Why did I do this?
        </p>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent border border-blue-100">
          Bounded AI Agent
        </span>
      </div>
      <h3 className="mt-1 text-sm font-semibold">AI Decision & Policy Analysis</h3>

      <div className="mt-4 space-y-3 divide-y divide-slate-100 text-xs">
        {/* BLOCK 1: CUSTOMER REQUEST */}
        <div className="pt-2 first:pt-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Customer Request</p>
          <p className="mt-1 text-[13px] font-medium leading-snug text-slate-900">{customerRequestText}</p>
        </div>

        {/* BLOCK 2: CONTEXT */}
        <div className="pt-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Context</p>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-700">{contextText}</p>
        </div>

        {/* BLOCK 3: POLICY */}
        <div className="pt-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Policy</p>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-700">{policyText}</p>
        </div>

        {/* BLOCK 4: DECISION */}
        <div className="pt-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Decision</p>
          <p className="mt-1 text-[12px] font-medium leading-relaxed text-slate-800 bg-slate-50 p-2 rounded-lg border border-slate-200/60">
            {decisionText}
          </p>
        </div>

        {/* BLOCK 5: ACTION */}
        <div className="pt-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Action</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-1 font-mono text-[11px] font-semibold text-indigo-700 border border-indigo-200/60">
              {actionText}
            </span>
            {requiresApproval ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
                <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                Approval Required
              </span>
            ) : null}
          </div>
        </div>

        {/* BLOCK 6: RESULT */}
        <div className="pt-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Result</p>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-700">{resultText}</p>
        </div>
      </div>

      {!isPostPaymentState && recommendation && recommendation.violations.length > 0 ? (
        <div className="mt-3 space-y-1">
          {recommendation.violations.map((violation) => (
            <div
              key={violation}
              className="rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] leading-tight text-amber-900 border border-amber-200/60 font-medium"
            >
              ⚠️ {violation}
            </div>
          ))}
        </div>
      ) : null}

      {feedback ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 font-medium border border-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{feedback}</span>
        </div>
      ) : null}

      <button
        type="button"
        disabled={isPending || order.status === "FULFILLED"}
        onClick={handleApprove}
        className={`mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
          requiresApproval
            ? "bg-amber-600 text-white hover:bg-amber-500 shadow-sm"
            : "bg-slate-900 text-white hover:bg-slate-800"
        } disabled:opacity-50`}
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Executing action…
          </>
        ) : order.status === "FULFILLED" ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Order Completed & Fulfilled
          </>
        ) : requiresApproval ? (
          <>
            APPROVE ACTION · {nextAction}
            <ArrowRight className="h-4 w-4" />
          </>
        ) : (
          <>
            Execute action · {nextAction}
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
      <p className="mt-2 text-center text-[11px] text-muted">
        Authoritative backend execution with Razorpay Test Mode guardrails.
      </p>
    </section>
  );
}

