"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Shield, RotateCcw, Loader2, BarChart3 } from "lucide-react";
import type { DashboardConversation, DashboardData } from "@/lib/db/queries";
import { resetDemoData } from "@/lib/actions/demo";
import { InboxList } from "@/components/inbox/InboxList";
import { ConversationThread } from "@/components/conversation/ConversationThread";
import { AiDecisionPanel } from "@/components/ai-panel/AiDecisionPanel";
import { OrderSummary } from "@/components/payments/OrderSummary";
import { PaymentStatus } from "@/components/payments/PaymentStatus";
import { ActivityTimeline } from "@/components/activity/ActivityTimeline";
import { PolicySettings } from "@/components/settings/PolicySettings";

export function MerchantDashboard({ data }: { data: DashboardData }) {
  const [selectedId, setSelectedId] = useState(data.conversations[0]?.id ?? "");
  const [showPolicy, setShowPolicy] = useState(false);
  const [isResetting, startResetTransition] = useTransition();

  const selected = useMemo(
    () =>
      data.conversations.find((conversation) => conversation.id === selectedId) ??
      data.conversations[0],
    [data.conversations, selectedId],
  );

  function handleReset() {
    if (!confirm("Reset all demo conversations, orders, and payments back to the initial state?")) {
      return;
    }
    startResetTransition(async () => {
      try {
        await resetDemoData();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Reset failed");
      }
    });
  }

  if (!selected) {
    return null;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-card px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-[11px] font-bold text-white shadow-sm">
            RC
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight">Razorpay Closer</h1>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 border border-amber-200/60">
                Test mode
              </span>
            </div>
            <p className="text-[11px] text-muted">{data.merchant.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/evaluation"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 px-2.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100/80 transition-colors shadow-xs"
          >
            <BarChart3 className="h-3.5 w-3.5 text-indigo-600" />
            <span>Evaluation Engine</span>
            <span className="rounded-full bg-indigo-600 px-1.5 py-0.2 text-[9px] text-white font-bold">
              100%
            </span>
          </Link>

          <button
            type="button"
            disabled={isResetting}
            onClick={handleReset}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
            title="Reset database to initial 5 seed cases"
          >
            {isResetting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
            )}
            <span>{isResetting ? "Resetting…" : "Reset Demo"}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPolicy((open) => !open)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Shield className="h-3.5 w-3.5 text-accent" />
            Payment policy
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_380px]">
        <InboxList
          conversations={data.conversations}
          selectedId={selected.id}
          onSelect={setSelectedId}
        />
        <ConversationThread conversation={selected} />
        <aside className="min-h-0 overflow-y-auto border-l border-line bg-slate-50/70 p-4">
          {showPolicy ? (
            <PolicySettings
              policy={data.policy}
              onClose={() => setShowPolicy(false)}
            />
          ) : (
            <RightRail conversation={selected} policy={data.policy} />
          )}
        </aside>
      </div>
    </div>
  );
}

function RightRail({
  conversation,
  policy,
}: {
  conversation: DashboardConversation;
  policy: DashboardData["policy"];
}) {
  return (
    <div className="flex flex-col gap-4 pb-8">
      <AiDecisionPanel conversation={conversation} policy={policy} />
      <OrderSummary conversation={conversation} />
      <PaymentStatus conversation={conversation} />
      <ActivityTimeline conversation={conversation} />
    </div>
  );
}
