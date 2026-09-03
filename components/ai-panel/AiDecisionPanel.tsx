"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ArrowRight, Loader2, ShieldAlert, AlertTriangle, ShieldCheck, UserCheck } from "lucide-react";
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

  const customer = conversation.customer;
  const metrics = customer.metrics;
  const risk = customer.risk;

  const recommendation = order.liveRecommendation;
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
  const isHighRiskOrHighValue = (risk?.level === "HIGH") || (order.totalAmount >= policy.highValueOrderThreshold);
  const requiresApproval =
    isFinancialAction &&
    (policy.requireApprovalForFinancialActions || isHighRiskOrHighValue) &&
    !hasActivePaymentLink;

  // 1. CUSTOMER DISPLAY
  const ltvFormatted = formatINR(metrics.totalOrderValue);
  const outstandingFormatted = formatINR(metrics.outstandingAmount);

  // 2. ORDER DISPLAY
  const orderDetailsText = `${formatINR(order.totalAmount)} · ${order.quantity} units ${order.requestedAdvancePercentage ? `· ${order.requestedAdvancePercentage}% requested advance` : order.requestedCredit ? "· credit requested" : ""}`;

  // 3. POLICY DISPLAY
  const policyDetailsText = `Min advance: ${policy.minimumAdvancePercentage}% · Max discount: ${policy.maximumDiscountPercentage}% · Credit: ${policy.allowCredit ? `Max ₹${policy.maximumCreditAmount.toLocaleString("en-IN")}, ${policy.maximumCreditDays}d` : "disabled"}`;

  // 4. DECISION DISPLAY
  const decisionText = isPostPaymentState
    ? (order.reason ?? recommendation?.reasons?.[0] ?? "Processing post-payment lifecycle.")
    : (order.reason ?? recommendation?.reasons?.[0] ?? "Evaluate customer terms against merchant policy.");

  // 5. WHY DISPLAY
  const whyReasons = recommendation?.reasons && recommendation.reasons.length > 0
    ? recommendation.reasons
    : [
        customer.isNew ? "New customer requires minimum advance" : `${customer.name} payment history evaluated`,
        `Policy requires ${policy.minimumAdvancePercentage}% minimum advance`,
      ];

  // 6. ACTION RESULT
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

  const riskBadgeColor =
    risk?.level === "LOW"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : risk?.level === "MEDIUM"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-rose-50 text-rose-700 border-rose-200";

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
      <h3 className="mt-1 text-sm font-semibold">AI Decision & Policy Engine</h3>

      <div className="mt-4 space-y-3.5 divide-y divide-slate-100 text-xs">
        {/* 1. CUSTOMER */}
        <div className="pt-2 first:pt-0">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Customer</p>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${riskBadgeColor}`}>
              {risk?.level === "LOW" ? <ShieldCheck className="h-3 w-3" /> : risk?.level === "MEDIUM" ? <UserCheck className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {risk?.level ?? "LOW"} RISK
            </span>
          </div>
          <p className="mt-1 text-[13px] font-semibold text-slate-900">{customer.name}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
            <span>{metrics.totalOrders} previous order{metrics.totalOrders === 1 ? "" : "s"}</span>
            <span>·</span>
            <span>{ltvFormatted} lifetime value</span>
            <span>·</span>
            <span className={metrics.latePayments > 0 ? "font-semibold text-rose-600" : ""}>{metrics.latePayments} late payment{metrics.latePayments === 1 ? "" : "s"}</span>
            <span>·</span>
            <span className={metrics.outstandingAmount > 0 ? "font-semibold text-amber-700" : ""}>{outstandingFormatted} outstanding</span>
          </div>
        </div>

        {/* 2. ORDER */}
        <div className="pt-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Order</p>
          <p className="mt-1 text-[12px] font-medium text-slate-800">{orderDetailsText}</p>
          {order.customerRequestSummary ? (
            <p className="mt-0.5 text-[11px] text-slate-500">{order.customerRequestSummary}</p>
          ) : null}
        </div>

        {/* 3. MERCHANT POLICY */}
        <div className="pt-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Merchant Policy</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-700">{policyDetailsText}</p>
        </div>

        {/* 4. AI DECISION */}
        <div className="pt-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">AI Decision</p>
          <p className="mt-1 text-[12px] font-medium leading-relaxed text-slate-900 bg-slate-50 p-2.5 rounded-lg border border-slate-200/70">
            {decisionText}
          </p>
        </div>

        {/* 5. WHY */}
        <div className="pt-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Why</p>
          <ul className="mt-1.5 space-y-1 text-[11px] text-slate-700">
            {whyReasons.map((reason, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="text-accent font-bold">✓</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 6. ACTION */}
        <div className="pt-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Action</p>
            {requiresApproval ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                Human Approval Required
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1 font-mono text-[11px] font-bold text-indigo-700 border border-indigo-200/60">
              {nextAction}
            </span>
            <span className="text-[11px] text-slate-500 truncate">
              {isFinancialAction ? `₹${(recommendation?.recommendedAdvanceAmount ?? order.recommendedAdvanceAmount ?? order.totalAmount).toLocaleString("en-IN")}` : ""}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-600">{resultText}</p>
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
