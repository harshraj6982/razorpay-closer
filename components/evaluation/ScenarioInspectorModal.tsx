"use client";

import { X, ShieldCheck, CheckCircle2, XCircle, UserCheck, Scale, Cpu, FileText } from "lucide-react";
import type { GradedScenarioResult } from "@/lib/evaluation/types";

export function ScenarioInspectorModal({
  scenario,
  onClose,
}: {
  scenario: GradedScenarioResult | null;
  onClose: () => void;
}) {
  if (!scenario) return null;

  const actual = scenario.actualOutput;
  const expected = scenario.expectedOutput;
  const isUnsafe = scenario.unsafeActionPrevented || expected.isUnsafeRequest;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl font-bold text-sm shadow-xs ${
                scenario.passed
                  ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                  : "bg-rose-100 text-rose-700 border border-rose-200"
              }`}
            >
              {scenario.passed ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-slate-500 uppercase tracking-wider">
                  #{scenario.scenarioId}
                </span>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                  {scenario.category}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    scenario.passed
                      ? "bg-emerald-500/10 text-emerald-700 border border-emerald-200"
                      : "bg-rose-500/10 text-rose-700 border border-rose-200"
                  }`}
                >
                  {scenario.passed ? "PASSED" : `FAILED: ${scenario.failureType ?? "ERROR"}`}
                </span>
              </div>
              <h2 className="text-sm font-semibold text-slate-900 mt-0.5">
                {expected.intent} · ₹{expected.orderAmount.toLocaleString("en-IN")}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          {/* Unsafe Action Prevented Banner */}
          {isUnsafe && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-amber-900 shadow-xs">
              <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-xs text-amber-950 flex items-center gap-1.5">
                  Defense-in-Depth: Unsafe Action Prevented
                </h4>
                <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                  Customer / LLM requested terms conflicting with policy. The deterministic backend policy engine safely
                  blocked unauthorized financial terms and enforced valid merchant constraints. Zero financial mutation occurred.
                </p>
              </div>
            </div>
          )}

          {/* 5-Step Defense in Depth Trace */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <Cpu className="h-4 w-4 text-indigo-500" />
              Defense-in-Depth Execution Trace
            </h3>

            <div className="space-y-2.5">
              {/* Step 1: Conversation */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
                <div className="flex items-center justify-between font-semibold text-slate-700 mb-1">
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-slate-400" />
                    1. Conversation Input
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Incoming WhatsApp Message</span>
                </div>
                <p className="text-slate-800 font-medium bg-white p-2.5 rounded-lg border border-slate-200/80 font-mono text-[11px]">
                  {scenario.conversation}
                </p>
              </div>

              {/* Step 2: Customer Profile */}
              {scenario.customerProfile && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
                  <div className="flex items-center justify-between font-semibold text-slate-700 mb-1">
                    <span className="flex items-center gap-1.5">
                      <UserCheck className="h-3.5 w-3.5 text-slate-400" />
                      2. Customer History & Risk Profile
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500">
                      {scenario.customerProfile.name}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    <div className="rounded-lg bg-white p-2 border border-slate-200/80 text-center">
                      <span className="text-[10px] text-slate-500 block">Total Orders</span>
                      <span className="font-bold text-slate-800">{scenario.customerProfile.totalOrders}</span>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-slate-200/80 text-center">
                      <span className="text-[10px] text-slate-500 block">Late Payments</span>
                      <span className={`font-bold ${scenario.customerProfile.latePayments > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                        {scenario.customerProfile.latePayments}
                      </span>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-slate-200/80 text-center">
                      <span className="text-[10px] text-slate-500 block">Outstanding</span>
                      <span className="font-bold text-slate-800">
                        ₹{scenario.customerProfile.outstandingAmount.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-slate-200/80 text-center">
                      <span className="text-[10px] text-slate-500 block">On-Time Rate</span>
                      <span className="font-bold text-slate-800">
                        {scenario.customerProfile.onTimePaymentRate ?? 100}%
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Merchant Policy Constraints */}
              {scenario.merchantPolicy && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
                  <div className="flex items-center justify-between font-semibold text-slate-700 mb-1">
                    <span className="flex items-center gap-1.5">
                      <Scale className="h-3.5 w-3.5 text-slate-400" />
                      3. Merchant Policy Guardrails
                    </span>
                    <span className="text-[10px] text-slate-400">Policy Engine Constraints</span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
                    <span className="rounded-md bg-white px-2 py-1 border border-slate-200 font-medium">
                      Min Advance: <strong>{scenario.merchantPolicy.minimumAdvancePercentage}%</strong>
                    </span>
                    <span className="rounded-md bg-white px-2 py-1 border border-slate-200 font-medium">
                      Max Discount: <strong>{scenario.merchantPolicy.maximumDiscountPercentage}%</strong>
                    </span>
                    <span className="rounded-md bg-white px-2 py-1 border border-slate-200 font-medium">
                      Credit Allowed: <strong>{scenario.merchantPolicy.allowCredit ? "Yes" : "No"}</strong>
                    </span>
                    <span className="rounded-md bg-white px-2 py-1 border border-slate-200 font-medium">
                      High-Value Cap: <strong>₹{scenario.merchantPolicy.highValueOrderThreshold.toLocaleString("en-IN")}</strong>
                    </span>
                  </div>
                </div>
              )}

              {/* Step 4: Defense Log Steps */}
              {actual.defenseLog && actual.defenseLog.length > 0 && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-3.5 space-y-1.5">
                  <span className="font-semibold text-indigo-900 block text-[11px]">
                    Authoritative Policy Engine Steps:
                  </span>
                  {actual.defenseLog.map((log, idx) => (
                    <div key={idx} className="font-mono text-[10px] text-slate-700 bg-white/80 p-1.5 rounded border border-indigo-100/60">
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Expected vs Actual Comparison Table */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">
              Ground Truth vs Actual Verification
            </h3>
            <div className="rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/80 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Dimension</th>
                    <th className="p-3">Expected Ground Truth</th>
                    <th className="p-3">Closer Agent Output</th>
                    <th className="p-3 text-right">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="p-3 font-medium text-slate-600">Decision</td>
                    <td className="p-3 font-mono font-bold text-slate-800">{expected.expectedDecision}</td>
                    <td className="p-3 font-mono font-bold text-slate-800">{actual.decision}</td>
                    <td className="p-3 text-right font-bold">
                      {scenario.decisionCorrect ? (
                        <span className="text-emerald-600">PASS</span>
                      ) : (
                        <span className="text-rose-600">FAIL</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium text-slate-600">Policy Compliance</td>
                    <td className="p-3 font-mono font-bold text-slate-800">{expected.expectedPolicyResult}</td>
                    <td className="p-3 font-mono font-bold text-slate-800">
                      {actual.policyAllowed ? "ALLOW" : "REJECT"}
                    </td>
                    <td className="p-3 text-right font-bold">
                      {scenario.policyCorrect ? (
                        <span className="text-emerald-600">PASS</span>
                      ) : (
                        <span className="text-rose-600">FAIL</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium text-slate-600">Order Amount</td>
                    <td className="p-3 font-mono font-bold text-slate-800">
                      ₹{expected.orderAmount.toLocaleString("en-IN")}
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-800">
                      ₹{(actual.totalAmount ?? 0).toLocaleString("en-IN")}
                    </td>
                    <td className="p-3 text-right font-bold">
                      {scenario.amountCorrect ? (
                        <span className="text-emerald-600">PASS</span>
                      ) : (
                        <span className="text-rose-600">FAIL</span>
                      )}
                    </td>
                  </tr>
                  {expected.minimumAdvanceAmount != null && (
                    <tr>
                      <td className="p-3 font-medium text-slate-600">Advance Amount</td>
                      <td className="p-3 font-mono font-bold text-slate-800">
                        ₹{expected.minimumAdvanceAmount.toLocaleString("en-IN")}
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-800">
                        ₹{(actual.calculatedAdvanceAmount ?? 0).toLocaleString("en-IN")}
                      </td>
                      <td className="p-3 text-right font-bold">
                        {scenario.amountCorrect ? (
                          <span className="text-emerald-600">PASS</span>
                        ) : (
                          <span className="text-rose-600">FAIL</span>
                        )}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className="p-3 font-medium text-slate-600">Selected Action</td>
                    <td className="p-3 font-mono font-bold text-slate-800">{expected.expectedAction ?? "createPaymentLink"}</td>
                    <td className="p-3 font-mono font-bold text-slate-800">{actual.action}</td>
                    <td className="p-3 text-right font-bold">
                      {scenario.actionCorrect ? (
                        <span className="text-emerald-600">PASS</span>
                      ) : (
                        <span className="text-rose-600">FAIL</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium text-slate-600">Requires Human Review</td>
                    <td className="p-3 font-mono font-bold text-slate-800">
                      {expected.shouldRequireHumanApproval ? "Yes" : "No"}
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-800">
                      {actual.requiresHumanApproval ? "Yes" : "No"}
                    </td>
                    <td className="p-3 text-right font-bold">
                      {scenario.humanReviewCorrect ? (
                        <span className="text-emerald-600">PASS</span>
                      ) : (
                        <span className="text-rose-600">FAIL</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3">
          <span className="text-[11px] text-slate-500">
            Latency: <strong>{scenario.latencyMs}ms</strong> · Ground-truth verified
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}
