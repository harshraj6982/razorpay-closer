"use client";

import { useState, useTransition } from "react";
import { updateMerchantPolicy } from "@/lib/policies/actions";
import type { DashboardData } from "@/lib/db/queries";
import { Button } from "@/components/ui/button";

export function PolicySettings({
  policy,
  onClose,
}: {
  policy: DashboardData["policy"];
  onClose?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [form, setForm] = useState(policy);

  function save() {
    setError(null);
    setSavedSuccess(false);
    startTransition(async () => {
      try {
        await updateMerchantPolicy(form);
        setSavedSuccess(true);
        if (onClose) {
          setTimeout(() => onClose(), 600);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save policy");
      }
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
            Merchant Policy Engine
          </p>
          <h3 className="mt-1 text-sm font-semibold">Payment & Financial Rules</h3>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} className="text-sm text-muted hover:text-foreground cursor-pointer">
            Back
          </button>
        ) : null}
      </div>

      <div className="mt-4 space-y-3.5">
        <NumberField
          label="Minimum Advance %"
          description="Baseline advance percentage required for orders"
          value={form.minimumAdvancePercentage}
          min={0}
          max={100}
          onChange={(minimumAdvancePercentage) =>
            setForm((current) => ({ ...current, minimumAdvancePercentage }))
          }
        />

        <NumberField
          label="Maximum Discount %"
          description="Cap on price discounts the AI or merchant can approve"
          value={form.maximumDiscountPercentage}
          min={0}
          max={100}
          onChange={(maximumDiscountPercentage) =>
            setForm((current) => ({ ...current, maximumDiscountPercentage }))
          }
        />

        <NumberField
          label="High-Value Order Threshold (₹)"
          description="Orders above this amount require advance and human approval"
          value={form.highValueOrderThreshold}
          min={1000}
          max={10000000}
          onChange={(highValueOrderThreshold) =>
            setForm((current) => ({ ...current, highValueOrderThreshold }))
          }
        />

        <Toggle
          label="Allow partial payment"
          description="Enable split advance + balance payments"
          checked={form.allowPartialPayment}
          onChange={(allowPartialPayment) =>
            setForm((current) => ({ ...current, allowPartialPayment }))
          }
        />

        <Toggle
          label="Allow credit terms"
          description="Enable delayed receivables for trusted buyers"
          checked={form.allowCredit}
          onChange={(allowCredit) => setForm((current) => ({ ...current, allowCredit }))}
        />

        {form.allowCredit ? (
          <div className="rounded-xl bg-slate-50 p-3 space-y-3 border border-slate-200/60">
            <NumberField
              label="Maximum Credit Amount (₹)"
              description="Upper limit on outstanding credit per order"
              value={form.maximumCreditAmount}
              min={1000}
              max={1000000}
              onChange={(maximumCreditAmount) =>
                setForm((current) => ({ ...current, maximumCreditAmount }))
              }
            />
            <NumberField
              label="Maximum Credit Duration (Days)"
              description="Maximum days permitted for post-delivery payment"
              value={form.maximumCreditDays}
              min={1}
              max={90}
              onChange={(maximumCreditDays) =>
                setForm((current) => ({ ...current, maximumCreditDays }))
              }
            />
          </div>
        ) : null}

        <Toggle
          label="New customer requires advance"
          description="Mandate minimum advance for first-time buyers"
          checked={form.newCustomerRequiresAdvance}
          onChange={(newCustomerRequiresAdvance) =>
            setForm((current) => ({ ...current, newCustomerRequiresAdvance }))
          }
        />

        <Toggle
          label="High-risk customer requires advance"
          description="Mandate advance payment for high risk buyers regardless of terms"
          checked={form.highRiskCustomerRequiresAdvance}
          onChange={(highRiskCustomerRequiresAdvance) =>
            setForm((current) => ({ ...current, highRiskCustomerRequiresAdvance }))
          }
        />

        <Toggle
          label="Require human approval for financial actions"
          description="Stage payment links for merchant review before issuing"
          checked={form.requireApprovalForFinancialActions}
          onChange={(requireApprovalForFinancialActions) =>
            setForm((current) => ({ ...current, requireApprovalForFinancialActions }))
          }
        />
      </div>

      {error ? <p className="mt-3 text-xs text-rose-600 font-medium">{error}</p> : null}
      {savedSuccess ? <p className="mt-3 text-xs text-emerald-600 font-medium">✓ Policy saved successfully</p> : null}

      <Button className="mt-5 w-full" onClick={save} disabled={pending}>
        {pending ? "Saving…" : "Save Policy"}
      </Button>
      <p className="mt-2 text-[11px] leading-4 text-muted text-center">
        AI decisions and guardrails recompute authoritatively from this policy.
      </p>
    </section>
  );
}

function NumberField({
  label,
  description,
  value,
  min = 0,
  max,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-slate-700">{label}</span>
      </div>
      {description ? <p className="text-[11px] text-slate-500 mb-1">{description}</p> : null}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-9 w-full rounded-lg border border-line px-3 text-sm outline-none focus:border-accent bg-white"
      />
    </label>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 pt-1">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-slate-700">{label}</p>
        {description ? <p className="text-[11px] text-slate-500">{description}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors cursor-pointer ${checked ? "bg-accent" : "bg-slate-200"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : ""}`}
        />
      </button>
    </div>
  );
}
