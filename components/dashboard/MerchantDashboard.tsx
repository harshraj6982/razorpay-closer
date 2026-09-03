"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Shield,
  RotateCcw,
  Loader2,
  BarChart3,
  Store,
  Sparkles,
  Layers,
  FileText,
  ChevronDown,
} from "lucide-react";
import type { DashboardConversation, DashboardData } from "@/lib/db/queries";
import { resetDemoData } from "@/lib/actions/demo";
import { RazorpayLogo } from "@/components/brand/RazorpayLogo";
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
  const [rightRailTab, setRightRailTab] = useState<"ai_copilot" | "order_details" | "all">("ai_copilot");
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
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100/60">
      {/* Official Razorpay Product Top Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-5 shadow-xs z-10">
        <div className="flex items-center gap-4">
          {/* Authentic Razorpay Closer Brand Lockup */}
          <Link href="/dashboard" className="flex items-center group">
            <RazorpayLogo
              productName="Closer"
              badge="AI AUTOPILOT"
              size="md"
            />
          </Link>

          {/* Vertical Divider */}
          <div className="h-6 w-px bg-slate-200" />

          {/* Merchant Profile Switcher Widget */}
          <div className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/70 px-2.5 py-1 text-xs hover:bg-slate-100/70 transition-colors">
            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-white border border-slate-200 text-slate-700 shadow-xs">
              <Store className="h-3 w-3 text-[#0C83FD]" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-semibold text-slate-800">{data.merchant.name}</span>
              <span className="text-[10px] text-slate-500 font-mono">MID-STITCH</span>
            </div>
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </div>

          {/* Authentic Razorpay Test Mode Indicator */}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 border border-amber-300/80 shadow-2xs">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            TEST MODE
          </span>
        </div>

        {/* Top Right Action Controls */}
        <div className="flex items-center gap-2.5">
          {/* AI Evaluation Engine Link */}
          <Link
            href="/dashboard/evaluation"
            prefetch={true}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-indigo-200/90 bg-gradient-to-r from-indigo-50/80 to-blue-50/80 px-2.5 text-xs font-semibold text-indigo-700 hover:from-indigo-100/80 hover:to-blue-100/80 transition-all shadow-2xs"
          >
            <BarChart3 className="h-3.5 w-3.5 text-indigo-600" />
            <span>Evaluation Engine</span>
            <span className="rounded-full bg-indigo-600 px-1.5 py-0.2 text-[9px] font-bold text-white tracking-wide shadow-2xs">
              100%
            </span>
          </Link>

          {/* Reset Demo Data Button */}
          <button
            type="button"
            disabled={isResetting}
            onClick={handleReset}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
            title="Reset database to initial 5 seed cases"
          >
            {isResetting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
            )}
            <span>{isResetting ? "Resetting…" : "Reset Demo"}</span>
          </button>

          {/* Merchant Payment Policy Drawer Trigger */}
          <button
            type="button"
            onClick={() => setShowPolicy((open) => !open)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all shadow-2xs cursor-pointer ${
              showPolicy
                ? "border-[#0C83FD] bg-blue-50/70 text-[#0C83FD]"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Shield className={`h-3.5 w-3.5 ${showPolicy ? "text-[#0C83FD]" : "text-[#0C83FD]"}`} />
            <span>Payment policy</span>
          </button>
        </div>
      </header>

      {/* Main 3-Column Dashboard Workspace */}
      <div className="grid min-h-0 flex-1 grid-cols-[310px_minmax(0,1fr)_400px]">
        {/* Left Column: Customer Conversations Inbox */}
        <InboxList
          conversations={data.conversations}
          selectedId={selected.id}
          onSelect={setSelectedId}
        />

        {/* Center Column: WhatsApp / Conversational Commerce Thread */}
        <ConversationThread conversation={selected} />

        {/* Right Column: AI Engine, Order Summary, Payments & Timeline */}
        <aside className="min-h-0 flex flex-col border-l border-slate-200/80 bg-slate-50/70 overflow-hidden">
          {showPolicy ? (
            <div className="flex-1 overflow-y-auto p-4">
              <PolicySettings
                policy={data.policy}
                onClose={() => setShowPolicy(false)}
              />
            </div>
          ) : (
            <>
              {/* Ergonomic Right Rail Segmented Tab Switcher */}
              <div className="shrink-0 border-b border-slate-200/80 bg-white px-3 py-2">
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setRightRailTab("ai_copilot")}
                    className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-semibold transition-all cursor-pointer ${
                      rightRailTab === "ai_copilot"
                        ? "bg-white text-[#0C2340] shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Sparkles className="h-3 w-3 text-[#0C83FD]" />
                    <span>AI Copilot</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRightRailTab("order_details")}
                    className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-semibold transition-all cursor-pointer ${
                      rightRailTab === "order_details"
                        ? "bg-white text-[#0C2340] shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <FileText className="h-3 w-3 text-slate-500" />
                    <span>Order Details</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRightRailTab("all")}
                    className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-semibold transition-all cursor-pointer ${
                      rightRailTab === "all"
                        ? "bg-white text-[#0C2340] shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Layers className="h-3 w-3 text-slate-500" />
                    <span>All Cards</span>
                  </button>
                </div>
              </div>

              {/* Scrollable Content Area */}
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <RightRail
                  conversation={selected}
                  policy={data.policy}
                  tab={rightRailTab}
                />
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function RightRail({
  conversation,
  policy,
  tab,
}: {
  conversation: DashboardConversation;
  policy: DashboardData["policy"];
  tab: "ai_copilot" | "order_details" | "all";
}) {
  if (tab === "ai_copilot") {
    return (
      <div className="flex flex-col gap-4 pb-8">
        <AiDecisionPanel conversation={conversation} policy={policy} />
        <PaymentStatus conversation={conversation} />
      </div>
    );
  }

  if (tab === "order_details") {
    return (
      <div className="flex flex-col gap-4 pb-8">
        <OrderSummary conversation={conversation} />
        <ActivityTimeline conversation={conversation} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <AiDecisionPanel conversation={conversation} policy={policy} />
      <PaymentStatus conversation={conversation} />
      <OrderSummary conversation={conversation} />
      <ActivityTimeline conversation={conversation} />
    </div>
  );
}
