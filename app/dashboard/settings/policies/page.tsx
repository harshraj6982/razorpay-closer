import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import { getDashboardData } from "@/lib/db/queries";
import { PolicySettings } from "@/components/settings/PolicySettings";

export default async function PolicySettingsPage() {
  const data = await getDashboardData();

  if (!data) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        Merchant policy data not found. Please run seed.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-line bg-card px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Dashboard
            </Link>
            <div className="h-4 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-accent" />
              <h1 className="text-sm font-semibold text-slate-900">Merchant Settings</h1>
            </div>
          </div>
          <span className="text-xs text-muted">{data.merchant.name}</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        <div className="mb-6">
          <h2 className="text-lg font-bold text-slate-900">Merchant Policy Configuration</h2>
          <p className="mt-1 text-xs text-slate-500">
            Configure authoritative financial rules, credit boundaries, discount caps, and advance thresholds enforced on all AI agent decisions.
          </p>
        </div>

        <PolicySettings policy={data.policy} />
      </main>
    </div>
  );
}
