"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  ArrowRight,
  Loader2,
  ShieldAlert,
  AlertTriangle,
  ShieldCheck,
  UserCheck,
  Sparkles,
  Lock,
} from "lucide-react";
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
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

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
    ? order.nextAction ?? "createPaymentLink"
    : recommendation?.nextAction ?? order.nextAction ?? "createPaymentLink";

  // Determine if approval is needed for financial actions
  const isFinancialAction = nextAction === "createPaymentLink";
  const hasActivePaymentLink = order.payments.some(
    (p) => p.status === "CREATED" || p.status === "PAID",
  );
  const isHighRiskOrHighValue =
    risk?.level === "HIGH" || order.totalAmount >= policy.highValueOrderThreshold;
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
    ? order.reason ?? recommendation?.reasons?.[0] ?? "Processing post-payment lifecycle."
    : order.reason ?? recommendation?.reasons?.[0] ?? "Evaluate customer terms against merchant policy.";

  // 5. WHY DISPLAY
  const whyReasons =
    recommendation?.reasons && recommendation.reasons.length > 0
      ? recommendation.reasons
      : [
          customer.isNew
            ? "New customer requires minimum advance"
            : `${customer.name} payment history evaluated`,
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
        setFeedback({ type: "success", message: "Action executed successfully" });
        setTimeout(() => setFeedback(null), 4000);
      } catch (err) {
        setFeedback({ type: "error", message: err instanceof Error ? err.message : "Execution failed" });
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
    <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
      {/* Panel Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-50 text-[#0C83FD]">
            <Sparkles className="h-3 w-3" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0C83FD]">
            Why Did I Do This?
          </span>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 border border-slate-200">
          <Lock className="h-2.5 w-2.5 text-slate-500" />
          Bounded AI Policy
        </span>
      </div>

      <h3 className="mt-1 text-sm font-bold text-[#0C2340]">
        AI Decision & Policy Engine
      </h3>

      <div className="mt-3.5 space-y-3 divide-y divide-slate-100 text-xs">
        {/* 1. CUSTOMER & RISK */}
        <div className="pt-2 first:pt-0">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Customer Risk Profile
            </p>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${riskBadgeColor}`}
            >
              {risk?.level === "LOW" ? (
                <ShieldCheck className="h-3 w-3" />
              ) : risk?.level === "MEDIUM" ? (
                <UserCheck className="h-3 w-3" />
              ) : (
                <AlertTriangle className="h-3 w-3" />
              )}
              {risk?.level ?? "LOW"} RISK
            </span>
          </div>
          <p className="mt-1 text-xs font-bold text-slate-900">{customer.name}</p>
          <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-slate-600">
            <span>
              {metrics.totalOrders} order{metrics.totalOrders === 1 ? "" : "s"}
            </span>
            <span>·</span>
            <span>{ltvFormatted} LTV</span>
            <span>·</span>
            <span className={metrics.latePayments > 0 ? "font-bold text-rose-600" : ""}>
              {metrics.latePayments} late
            </span>
            <span>·</span>
            <span className={metrics.outstandingAmount > 0 ? "font-bold text-amber-700" : ""}>
              {outstandingFormatted} due
            </span>
          </div>
        </div>

        {/* 2. ORDER */}
        <div className="pt-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Order Request
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-800">{orderDetailsText}</p>
          {order.customerRequestSummary ? (
            <p className="mt-0.5 text-[11px] text-slate-500">{order.customerRequestSummary}</p>
          ) : null}
        </div>

        {/* 3. MERCHANT POLICY */}
        <div className="pt-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Merchant Policy Rules
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-200/60 font-mono text-[10px]">
            {policyDetailsText}
          </p>
        </div>

        {/* 4. AI DECISION */}
        <div className="pt-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            AI Agent Decision
          </p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-slate-900 bg-blue-50/50 p-2.5 rounded-lg border border-blue-200/60">
            {decisionText}
          </p>
        </div>

        {/* 5. POLICY REASONS / JUSTIFICATION */}
        <div className="pt-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Policy Justification
          </p>
          <ul className="mt-1.5 space-y-1 text-[11px] text-slate-700">
            {whyReasons.map((reason, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="text-[#0C83FD] font-bold">✓</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 6. NEXT ACTION */}
        <div className="pt-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Executable Action
            </p>
            {requiresApproval ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                <ShieldAlert className="h-3 w-3 text-amber-600" />
                Merchant Approval Required
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1 font-mono text-[11px] font-bold text-indigo-700 border border-indigo-200/70">
              {nextAction}
            </span>
            <span className="text-xs font-bold text-slate-800 truncate">
              {isFinancialAction
                ? formatINR(recommendation?.recommendedAdvanceAmount ?? order.recommendedAdvanceAmount ?? order.totalAmount)
                : ""}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">{resultText}</p>
        </div>
      </div>

      {!isPostPaymentState && recommendation && recommendation.violations.length > 0 ? (
        <div className="mt-3 space-y-1">
          {recommendation.violations.map((violation) => (
            <div
              key={violation}
              className="rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] leading-tight text-amber-900 border border-amber-200 font-medium"
            >
              ⚠️ {violation}
            </div>
          ))}
        </div>
      ) : null}

      {feedback ? (
        <div
          className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium border shadow-2xs ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border-rose-200"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
          )}
          <span>{feedback.message}</span>
        </div>
      ) : null}

      {/* Action Approval / Execution Button */}
      <button
        type="button"
        disabled={isPending || order.status === "FULFILLED"}
        onClick={handleApprove}
        className={`mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-bold tracking-wide transition-all shadow-xs cursor-pointer ${
          order.status === "FULFILLED"
            ? "bg-slate-100 text-slate-400 border border-slate-200"
            : requiresApproval
              ? "bg-amber-600 text-white hover:bg-amber-500 active:scale-[0.99]"
              : "bg-[#0C83FD] text-white hover:bg-[#0066ee] active:scale-[0.99]"
        } disabled:opacity-50`}
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Executing Action…
          </>
        ) : order.status === "FULFILLED" ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Order Completed & Fulfilled
          </>
        ) : requiresApproval ? (
          <>
            <ShieldAlert className="h-4 w-4" />
            APPROVE FINANCIAL ACTION · {nextAction}
            <ArrowRight className="h-4 w-4" />
          </>
        ) : (
          <>
            EXECUTE ACTION · {nextAction}
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>

      <p className="mt-2 text-center text-[10px] text-slate-400 font-medium">
        Deterministic execution via Razorpay Test Mode APIs.
      </p>
    </section>
  );
}
