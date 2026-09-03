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
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(policy);

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await updateMerchantPolicy(form);
        onClose();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save policy");
      }
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
            Merchant
          </p>
          <h3 className="mt-1 text-sm font-semibold">Payment policy</h3>
        </div>
        <button type="button" onClick={onClose} className="text-sm text-muted hover:text-foreground">
          Back
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <NumberField
          label="Minimum advance %"
          value={form.minimumAdvancePercentage}
          onChange={(minimumAdvancePercentage) =>
            setForm((current) => ({ ...current, minimumAdvancePercentage }))
          }
        />
        <NumberField
          label="Maximum discount %"
          value={form.maximumDiscountPercentage}
          onChange={(maximumDiscountPercentage) =>
            setForm((current) => ({ ...current, maximumDiscountPercentage }))
          }
        />
        <Toggle
          label="Allow partial payment"
          checked={form.allowPartialPayment}
          onChange={(allowPartialPayment) =>
            setForm((current) => ({ ...current, allowPartialPayment }))
          }
        />
        <Toggle
          label="Allow credit"
          checked={form.allowCredit}
          onChange={(allowCredit) => setForm((current) => ({ ...current, allowCredit }))}
        />
        <Toggle
          label="New customer requires advance"
          checked={form.newCustomerRequiresAdvance}
          onChange={(newCustomerRequiresAdvance) =>
            setForm((current) => ({ ...current, newCustomerRequiresAdvance }))
          }
        />
        <Toggle
          label="Require human approval for financial actions"
          checked={form.requireApprovalForFinancialActions}
          onChange={(requireApprovalForFinancialActions) =>
            setForm((current) => ({ ...current, requireApprovalForFinancialActions }))
          }
        />
      </div>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <Button className="mt-5 w-full" onClick={save} disabled={pending}>
        {pending ? "Saving…" : "Save policy"}
      </Button>
      <p className="mt-2 text-[11px] leading-4 text-muted">
        AI decisions and guardrails recompute authoritatively from this policy.
      </p>
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium text-slate-600">{label}</span>
      <input
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 h-9 w-full rounded-lg border border-line px-3 text-sm outline-none focus:border-accent"
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-10 rounded-full transition-colors ${checked ? "bg-accent" : "bg-slate-200"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : ""}`}
        />
      </button>
    </label>
  );
}
