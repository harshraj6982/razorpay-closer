"use client";

import type { DashboardConversation } from "@/lib/db/queries";
import { cn, formatINR, formatTime, initials } from "@/lib/utils";

const CASE_LABEL: Record<string, string> = {
  trusted_repeat: "Trusted",
  new_customer: "New",
  excessive_discount: "Discount risk",
  credit_request: "Credit",
  partially_paid: "Partial pay",
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
  return (
    <section className="flex min-h-0 flex-col border-r border-line bg-card">
      <div className="border-b border-line px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Inbox
        </p>
        <h2 className="mt-1 text-sm font-semibold">Customer conversations</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversations.map((conversation) => {
          const active = conversation.id === selectedId;
          return (
            <button
              key={conversation.id}
              type="button"
              onClick={() => onSelect(conversation.id)}
              className={cn(
                "flex w-full gap-3 border-b border-line px-4 py-3.5 text-left transition-colors",
                active ? "bg-accent-soft" : "hover:bg-slate-50",
              )}
            >
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  active ? "bg-accent text-white" : "bg-slate-100 text-slate-700",
                )}
              >
                {initials(conversation.customer.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">
                    {conversation.customer.name}
                  </p>
                  <span suppressHydrationWarning className="shrink-0 text-[11px] text-muted">
                    {formatTime(conversation.lastMessageAt)}
                  </span>
                </div>
                <p className="truncate text-[12px] text-muted">
                  {conversation.customer.company}
                </p>
                <p className="mt-1 line-clamp-2 text-[12px] leading-4 text-slate-600">
                  {conversation.preview}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    {CASE_LABEL[conversation.caseType] ?? conversation.caseType}
                  </span>
                  {conversation.order ? (
                    <span className="tabular text-[11px] font-medium text-slate-500">
                      {formatINR(conversation.order.totalAmount)}
                    </span>
                  ) : null}
                  {conversation.unread ? (
                    <span className="ml-auto h-2 w-2 rounded-full bg-accent" />
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
