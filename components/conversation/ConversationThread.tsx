"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Send,
  Sparkles,
  Loader2,
  Phone,
  Building2,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";
import type { DashboardConversation } from "@/lib/db/queries";
import { statusLabel } from "@/lib/orders/state";
import { cn, formatINR, formatTime, initials } from "@/lib/utils";
import { addCustomerMessage, runAiAnalysis } from "@/lib/actions/demo";
import { RazorpayIcon } from "@/components/brand/RazorpayLogo";

const QUICK_PROMPTS = [
  "Can pay 40% advance now and rest on delivery",
  "Give me 15% discount for this bulk order",
  "Can I get 30 days credit for ₹90,000?",
  "Paid the 30% advance! When does it ship?",
];

export function ConversationThread({
  conversation,
}: {
  conversation: DashboardConversation;
}) {
  const [input, setInput] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isAnalyzing, startAnalysisTransition] = useTransition();

  const customer = conversation.customer;
  const order = conversation.order;
  const activePayment = order?.payments?.[0];

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

  function copyPaymentLink(url: string) {
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  return (
    <section className="flex min-h-0 flex-col bg-white">
      {/* Top Customer Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-3 bg-white shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 to-[#0C2340] text-xs font-bold text-white shadow-xs">
            {initials(customer.name)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">{customer.name}</h2>
              {customer.isNew ? (
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                  New Lead
                </span>
              ) : (
                <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-[#0C83FD] border border-blue-200">
                  Repeat Customer
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="flex items-center gap-1 font-medium">
                <Building2 className="h-3 w-3 text-slate-400" />
                {customer.company}
              </span>
              {customer.phone ? (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1 font-mono text-slate-600">
                    <Phone className="h-3 w-3 text-emerald-500" />
                    {customer.phone}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={isAnalyzing}
            onClick={handleRunAnalysis}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-1.5 text-xs font-semibold text-[#0C83FD] hover:bg-blue-100/70 active:scale-[0.98] disabled:opacity-50 transition-all shadow-2xs cursor-pointer"
            title="Re-run AI extraction and policy rules"
          >
            {isAnalyzing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0C83FD]" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-[#0C83FD]" />
            )}
            <span>{isAnalyzing ? "Analyzing…" : "Run AI Analysis"}</span>
          </button>

          {order ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-700 border border-slate-200">
              {statusLabel(order.status)}
            </span>
          ) : null}
        </div>
      </div>

      {/* Message Flow Area */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5 bg-slate-50/40">
        {/* Date separator pill */}
        <div className="flex justify-center">
          <span className="rounded-full bg-slate-200/70 px-3 py-0.5 text-[10px] font-semibold text-slate-600 uppercase tracking-wider">
            WhatsApp Business Channel · Encrypted
          </span>
        </div>

        {conversation.messages.map((message) => {
          const fromCustomer = message.role === "CUSTOMER";
          const hasPaymentLinkMention =
            !fromCustomer &&
            (message.body.toLowerCase().includes("payment link") ||
              message.body.toLowerCase().includes("razorpay"));

          return (
            <div
              key={message.id}
              className={cn("flex gap-3", fromCustomer ? "items-start" : "flex-row-reverse items-start")}
            >
              {/* Avatar */}
              <div
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold shadow-2xs",
                  fromCustomer
                    ? "bg-slate-800 text-white"
                    : "bg-[#0C2340] text-white",
                )}
              >
                {fromCustomer ? (
                  initials(customer.name)
                ) : (
                  <RazorpayIcon size={16} />
                )}
              </div>

              {/* Message Bubble Container */}
              <div
                className={cn(
                  "max-w-[78%] space-y-2",
                  fromCustomer ? "items-start" : "items-end",
                )}
              >
                <div
                  className={cn(
                    "rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-xs",
                    fromCustomer
                      ? "rounded-tl-xs bg-white text-slate-900 border border-slate-200/80"
                      : "rounded-tr-xs bg-gradient-to-br from-blue-50/80 via-white to-indigo-50/30 text-slate-900 border border-blue-200/80",
                  )}
                >
                  {!fromCustomer && (
                    <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-blue-100/80 pb-1">
                      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#0C83FD]">
                        <Sparkles className="h-3 w-3" />
                        Razorpay Closer AI
                      </div>
                      <span className="text-[9px] font-semibold text-slate-400">
                        Autonomous Closer
                      </span>
                    </div>
                  )}

                  <p className="whitespace-pre-wrap">{message.body}</p>

                  <p
                    suppressHydrationWarning
                    className={cn(
                      "mt-1.5 text-[10px] font-medium text-slate-400 tabular text-right",
                    )}
                  >
                    {formatTime(message.sentAt)}
                  </p>
                </div>

                {/* Embedded Interactive Razorpay Checkout Card in Chat */}
                {hasPaymentLinkMention && activePayment && (
                  <div className="overflow-hidden rounded-xl border border-blue-200 bg-white p-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <RazorpayIcon size={16} />
                        <span className="text-xs font-bold text-[#0C2340]">
                          Razorpay Payment Link
                        </span>
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          activePayment.status === "PAID"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200",
                        )}
                      >
                        {activePayment.status}
                      </span>
                    </div>

                    <div className="mt-2 flex items-baseline justify-between border-t border-slate-100 pt-2">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">Amount</span>
                        <p className="text-base font-extrabold text-[#0C2340]">
                          {formatINR(activePayment.amount)}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {activePayment.razorpayPaymentLinkUrl ? (
                          <>
                            <button
                              type="button"
                              onClick={() => copyPaymentLink(activePayment.razorpayPaymentLinkUrl!)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs cursor-pointer"
                            >
                              {copiedLink ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                              Copy
                            </button>

                            <Link
                              href={
                                activePayment.razorpayPaymentLinkUrl.startsWith("http")
                                  ? activePayment.razorpayPaymentLinkUrl
                                  : `/pay/${activePayment.razorpayPaymentLinkUrl.replace(/^\/pay\//, "")}`
                              }
                              target="_blank"
                              className="inline-flex items-center gap-1 rounded-md bg-[#0C83FD] px-2.5 py-1 text-xs font-bold text-white hover:bg-[#0066ee] shadow-2xs"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Checkout
                            </Link>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Simulation Chips & Input Dock */}
      <div className="border-t border-slate-200/80 bg-slate-50/80 p-3 space-y-2.5">
        {/* Scenario Prompt Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Simulate:
          </span>
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setInput(prompt)}
              className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-700 hover:border-[#0C83FD] hover:text-[#0C83FD] transition-colors shadow-2xs cursor-pointer"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Input Form */}
        <form onSubmit={handleSend}>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type customer message or click a suggestion above…"
              className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-xs placeholder:text-slate-400 outline-none focus:border-[#0C83FD] focus:ring-1 focus:ring-[#0C83FD] transition-all shadow-2xs"
            />
            <button
              type="submit"
              disabled={!input.trim() || isPending}
              className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#0C83FD] px-4 text-xs font-bold text-white hover:bg-[#0066ee] active:scale-[0.98] disabled:opacity-40 transition-all shadow-xs cursor-pointer"
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              <span>Send</span>
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
