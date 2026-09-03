"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
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
      ? `${conversation.customer.previousOrderCount} previous orders · ${conversation.customer.onTimePaymentRate}% paid on time`
      : "No prior orders · new customer";

  const isPostPaymentState =
    order.status === "PARTIALLY_PAID" ||
    order.status === "PAID" ||
    order.status === "FULFILLED";

  const nextAction = isPostPaymentState
    ? (order.nextAction ?? "createPaymentLink")
    : (recommendation?.nextAction ?? order.nextAction ?? "createPaymentLink");

  const actionLabel = actionCopy(
    nextAction,
    recommendation?.recommendedAdvancePercentage ?? order.recommendedAdvancePercentage ?? 25,
    order.status,
  );

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
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
          AI Agent
        </span>
      </div>
      <h3 className="mt-1 text-sm font-semibold">AI decision</h3>

      <dl className="mt-4 space-y-3 text-sm">
        <Row label="Customer requested" value={order.customerRequestSummary ?? formatINR(order.totalAmount)} />
        <Row
          label="Merchant policy"
          value={`Minimum advance = ${policy.minimumAdvancePercentage}%`}
        />
        <Row label="Customer history" value={history} />
        <Row
          label="Decision"
          value={actionLabel}
        />
      </dl>

      <div className="mt-4 rounded-xl bg-slate-50 px-3 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Reason</p>
        <p className="mt-1 text-[13px] leading-5 text-slate-700">
          {isPostPaymentState ? (order.reason ?? recommendation?.reason) : (recommendation?.reason ?? order.reason)}
        </p>
      </div>

      {!isPostPaymentState && recommendation && recommendation.violations.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {recommendation.violations.map((violation) => (
            <li
              key={violation}
              className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-800"
            >
              {violation}
            </li>
          ))}
        </ul>
      ) : null}

      {feedback ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 font-medium">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{feedback}</span>
        </div>
      ) : null}

      <button
        type="button"
        disabled={isPending || order.status === "FULFILLED"}
        onClick={handleApprove}
        className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 text-sm font-medium text-white hover:bg-slate-800 active:scale-[0.99] disabled:opacity-50 transition-all cursor-pointer"
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
        ) : (
          <>
            Approve next action · {nextAction}
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
      <p className="mt-2 text-center text-[11px] text-muted">
        Executes typed backend function with Razorpay Test Mode.
      </p>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-[13px] leading-5 text-slate-800">{value}</dd>
    </div>
  );
}

function actionCopy(action: string, advance: number, orderStatus?: string) {
  if (orderStatus === "FULFILLED" || action === "getPaymentStatus") return "Order fulfilled & settled";
  if (action === "createFollowUp") return "Counter-offer within discount policy";
  if (action === "sendPaymentRequest") return orderStatus === "PARTIALLY_PAID" ? "Request remaining balance" : `Request ${advance}% advance (no credit)`;
  if (action === "updateOrderStatus") return "Fulfill & complete order";
  return `Request ${advance}% advance`;
}
