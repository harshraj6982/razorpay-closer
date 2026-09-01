import type { DashboardConversation } from "@/lib/db/queries";
import { formatTime } from "@/lib/utils";

export function ActivityTimeline({
  conversation,
}: {
  conversation: DashboardConversation;
}) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Agent activity</h3>
      <ol className="mt-4 space-y-0">
        {conversation.activities.map((event, index) => (
          <li key={event.id} className="flex gap-3">
            <div className="flex w-4 flex-col items-center">
              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-accent" />
              {index < conversation.activities.length - 1 ? (
                <span className="w-px flex-1 bg-line" />
              ) : null}
            </div>
            <div className="pb-4">
              <p suppressHydrationWarning className="text-[11px] font-medium text-muted">{formatTime(event.occurredAt)}</p>
              <p className="text-[13px] font-medium leading-5">{event.title}</p>
              {event.detail ? (
                <p className="text-[12px] leading-5 text-muted">{event.detail}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
