"use client";

import { useState, useTransition } from "react";
import { Send, Sparkles, Loader2 } from "lucide-react";
import type { DashboardConversation } from "@/lib/db/queries";
import { statusLabel } from "@/lib/orders/state";
import { cn, formatTime, initials } from "@/lib/utils";
import { addCustomerMessage, runAiAnalysis } from "@/lib/actions/demo";

export function ConversationThread({
  conversation,
}: {
  conversation: DashboardConversation;
}) {
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isAnalyzing, startAnalysisTransition] = useTransition();

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isPending) return;

    const messageText = input;
    setInput("");
    startTransition(async () => {
      try {
        await addCustomerMessage(conversation.id, messageText);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to add message");
      }
    });
  }

  function handleRunAnalysis() {
    startAnalysisTransition(async () => {
      try {
        await runAiAnalysis(conversation.id);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Analysis failed");
      }
    });
  }

  return (
    <section className="flex min-h-0 flex-col bg-card">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{conversation.customer.name}</h2>
            {conversation.customer.isNew ? (
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                New Lead
              </span>
            ) : (
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                Repeat Customer
              </span>
            )}
          </div>
          <p className="text-[12px] text-muted">
            {conversation.customer.company}
            {conversation.customer.phone ? ` · ${conversation.customer.phone}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isAnalyzing}
            onClick={handleRunAnalysis}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-all cursor-pointer"
            title="Re-run AI extraction and policy rules"
          >
            {isAnalyzing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-accent" />
            )}
            {isAnalyzing ? "Analyzing…" : "Run AI Analysis"}
          </button>

          {conversation.order ? (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              {statusLabel(conversation.order.status)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {conversation.messages.map((message) => {
          const fromCustomer = message.role === "CUSTOMER";
          return (
            <div
              key={message.id}
              className={cn("flex gap-3", fromCustomer ? "" : "flex-row-reverse")}
            >
              <div
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  fromCustomer ? "bg-slate-900 text-white" : "bg-accent-soft text-accent",
                )}
              >
                {fromCustomer ? initials(conversation.customer.name) : "AI"}
              </div>
              <div
                className={cn(
                  "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 shadow-xs",
                  fromCustomer
                    ? "rounded-tl-md bg-slate-100 text-slate-900"
                    : "rounded-tr-md bg-accent-soft text-slate-800 border border-blue-100",
                )}
              >
                <p className="whitespace-pre-wrap">{message.body}</p>
                <p suppressHydrationWarning className="mt-1 text-[11px] text-muted">{formatTime(message.sentAt)}</p>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSend} className="border-t border-line p-3 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Simulate customer message (e.g. 'Can pay 40% advance now')..."
            className="h-10 flex-1 rounded-xl border border-line bg-white px-3.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={!input.trim() || isPending}
            className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800 active:scale-[0.98] disabled:opacity-40 transition-all cursor-pointer"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            <span>Send</span>
          </button>
        </div>
      </form>
    </section>
  );
}
