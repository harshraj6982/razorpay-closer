import {
  History,
  FileSearch,
  Calculator,
  ShieldCheck,
  ArrowRightCircle,
  Zap,
  CheckCircle2,
} from "lucide-react";
import type { DashboardConversation } from "@/lib/db/queries";
import { formatTime } from "@/lib/utils";

function getEventIcon(type: string, title: string) {
  const t = (type || "").toLowerCase();
  const lowerTitle = (title || "").toLowerCase();

  if (t === "parse" || lowerTitle.includes("parse")) {
    return FileSearch;
  }
  if (t === "calc" || lowerTitle.includes("calc") || lowerTitle.includes("value")) {
    return Calculator;
  }
  if (t === "policy" || lowerTitle.includes("policy")) {
    return ShieldCheck;
  }
  if (lowerTitle.includes("payment received") || lowerTitle.includes("captured")) {
    return CheckCircle2;
  }
  if (t === "payment" || lowerTitle.includes("payment") || lowerTitle.includes("link")) {
    return Zap;
  }
  return ArrowRightCircle;
}

export function ActivityTimeline({
  conversation,
}: {
  conversation: DashboardConversation;
}) {
  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 text-slate-700">
            <History className="h-3 w-3" />
          </div>
          <h3 className="text-sm font-bold text-[#0C2340]">Agent Activity Log</h3>
        </div>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          {conversation.activities.length} events
        </span>
      </div>

      <ol className="mt-4 space-y-0">
        {conversation.activities.map((event, index) => {
          const Icon = getEventIcon(event.type, event.title);
          const isLast = index === conversation.activities.length - 1;

          return (
            <li key={event.id} className="flex gap-3 text-xs">
              <div className="flex flex-col items-center">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#0C83FD] border border-blue-200/60 shadow-2xs">
                  <Icon className="h-3 w-3" />
                </div>
                {!isLast ? <span className="w-0.5 flex-1 bg-slate-200 my-1" /> : null}
              </div>

              <div className="pb-3.5 pt-0.5">
                <p
                  suppressHydrationWarning
                  className="text-[10px] font-bold text-slate-400 tabular"
                >
                  {formatTime(event.occurredAt)}
                </p>
                <p className="text-xs font-semibold text-slate-800 leading-tight">
                  {event.title}
                </p>
                {event.detail ? (
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                    {event.detail}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
