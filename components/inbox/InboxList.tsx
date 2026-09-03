"use client";

import { useMemo, useState } from "react";
import { Search, CheckCircle2, AlertTriangle, Clock, ShieldCheck, UserPlus, Sparkles, X } from "lucide-react";
import type { DashboardConversation } from "@/lib/db/queries";
import { cn, formatINR, formatTime, initials } from "@/lib/utils";

const CASE_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string; icon: React.ComponentType<{ className?: string }> }
> = {
  trusted_repeat: {
    label: "Trusted",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200/70",
    icon: ShieldCheck,
  },
  new_customer: {
    label: "New Lead",
    bg: "bg-sky-50",
    text: "text-sky-700",
    border: "border-sky-200/70",
    icon: UserPlus,
  },
  excessive_discount: {
    label: "Discount Risk",
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200/70",
    icon: AlertTriangle,
  },
  credit_request: {
    label: "Credit",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200/70",
    icon: Clock,
  },
  partially_paid: {
    label: "Partial Pay",
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    border: "border-indigo-200/70",
    icon: CheckCircle2,
  },
};

export function InboxList({
  conversations,
  selectedId,
  onSelect,
}: {
  conversations: DashboardConversation[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "action" | "paid">("all");

  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      // 1. Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = conv.customer.name.toLowerCase().includes(q);
        const matchCompany = conv.customer.company?.toLowerCase().includes(q) ?? false;
        const matchPreview = conv.preview.toLowerCase().includes(q);
        if (!matchName && !matchCompany && !matchPreview) return false;
      }

      // 2. Tab filter
      if (filterTab === "action") {
        return (
          conv.caseType === "excessive_discount" ||
          conv.caseType === "credit_request" ||
          conv.caseType === "new_customer"
        );
      }
      if (filterTab === "paid") {
        return conv.caseType === "partially_paid" || conv.caseType === "trusted_repeat";
      }

      return true;
    });
  }, [conversations, searchQuery, filterTab]);

  return (
    <section className="flex min-h-0 flex-col border-r border-slate-200/80 bg-white">
      {/* Inbox Header with Razorpay Styling */}
      <div className="border-b border-slate-200/80 px-4 py-3 bg-slate-50/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Conversations
            </p>
            <span className="rounded-full bg-slate-200/80 px-1.5 py-0.2 text-[10px] font-bold text-slate-700">
              {conversations.length}
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#0C83FD]">
            <Sparkles className="h-3 w-3" />
            Active Sync
          </span>
        </div>

        {/* Search Bar */}
        <div className="relative mt-2.5">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search buyers or orders…"
            className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-7 text-xs placeholder:text-slate-400 focus:border-[#0C83FD] focus:outline-none focus:ring-1 focus:ring-[#0C83FD] transition-all"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        {/* Quick Filter Tabs */}
        <div className="mt-2.5 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setFilterTab("all")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
              filterTab === "all"
                ? "bg-[#0C2340] text-white font-semibold shadow-2xs"
                : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            All ({conversations.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("action")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
              filterTab === "action"
                ? "bg-[#0C2340] text-white font-semibold shadow-2xs"
                : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            Action Needed (3)
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("paid")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
              filterTab === "paid"
                ? "bg-[#0C2340] text-white font-semibold shadow-2xs"
                : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            Paid (2)
          </button>
        </div>
      </div>

      {/* Conversation Items List */}
      <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-slate-100">
        {filteredConversations.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No conversations match your filter.
          </div>
        ) : (
          filteredConversations.map((conversation) => {
            const active = conversation.id === selectedId;
            const config = CASE_CONFIG[conversation.caseType] ?? {
              label: conversation.caseType,
              bg: "bg-slate-100",
              text: "text-slate-600",
              border: "border-slate-200",
              icon: Sparkles,
            };
            const Icon = config.icon;

            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelect(conversation.id)}
                className={cn(
                  "relative flex w-full gap-3 px-4 py-3.5 text-left transition-all cursor-pointer",
                  active
                    ? "bg-blue-50/60 border-l-4 border-l-[#0C83FD] pl-3"
                    : "hover:bg-slate-50 border-l-4 border-l-transparent",
                )}
              >
                {/* Avatar with Dual-Tone Gradient */}
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-2xs transition-transform",
                    active
                      ? "bg-gradient-to-br from-[#0C83FD] to-[#0052cc] text-white scale-105"
                      : "bg-gradient-to-br from-slate-700 to-[#0C2340] text-white",
                  )}
                >
                  {initials(conversation.customer.name)}
                </div>

                {/* Conversation Details */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <p
                      className={cn(
                        "truncate text-xs font-semibold tracking-tight",
                        active ? "text-[#0C2340]" : "text-slate-900",
                      )}
                    >
                      {conversation.customer.name}
                    </p>
                    <span
                      suppressHydrationWarning
                      className="shrink-0 text-[10px] text-slate-400 tabular"
                    >
                      {formatTime(conversation.lastMessageAt)}
                    </span>
                  </div>

                  <p className="truncate text-[11px] text-slate-500 font-medium">
                    {conversation.customer.company}
                  </p>

                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-600">
                    {conversation.preview}
                  </p>

                  {/* Badges & Value Row */}
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold border",
                        config.bg,
                        config.text,
                        config.border,
                      )}
                    >
                      <Icon className="h-2.5 w-2.5" />
                      {config.label}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {conversation.order ? (
                        <span className="tabular text-xs font-bold text-slate-800">
                          {formatINR(conversation.order.totalAmount)}
                        </span>
                      ) : null}

                      {conversation.unread ? (
                        <span className="h-2 w-2 rounded-full bg-[#0C83FD] shadow-xs animate-pulse" />
                      ) : null}
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
