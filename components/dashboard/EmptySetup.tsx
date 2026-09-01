export function EmptySetup() {
  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <div className="max-w-md rounded-2xl border border-line bg-card p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          Razorpay Closer
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Database is empty</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Seed the demo merchant, policies, and five customer conversations, then reload.
        </p>
        <pre className="mt-5 overflow-x-auto rounded-xl bg-slate-950 px-4 py-3 text-[13px] text-slate-100">
          npm run db:reset
        </pre>
      </div>
    </div>
  );
}
