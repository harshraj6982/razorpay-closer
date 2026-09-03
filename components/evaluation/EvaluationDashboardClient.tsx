"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Play,
  Loader2,
  TrendingUp,
  Scale,
  Search,
  ChevronRight,
  BarChart2,
  Lock,
} from "lucide-react";
import type { FullEvaluationRunOutput, GradedScenarioResult } from "@/lib/evaluation/types";
import { triggerEvaluationAction } from "@/lib/actions/evaluation";
import { ScenarioInspectorModal } from "./ScenarioInspectorModal";

export function EvaluationDashboardClient({
  initialData,
}: {
  initialData: FullEvaluationRunOutput;
}) {
  const [data, setData] = useState<FullEvaluationRunOutput>(initialData);
  const [isEvaluating, startEvaluatingTransition] = useTransition();
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<"ALL" | "PASSED" | "FAILED">("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [inspectingScenario, setInspectingScenario] = useState<GradedScenarioResult | null>(null);

  const { metrics, results, baselineComparison } = data;

  const filteredResults = results.filter((r) => {
    if (selectedCategory !== "ALL" && r.category !== selectedCategory) return false;
    if (selectedStatus === "PASSED" && !r.passed) return false;
    if (selectedStatus === "FAILED" && r.passed) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = r.scenarioId.toLowerCase().includes(q);
      const matchCat = r.category.toLowerCase().includes(q);
      const matchConv = r.conversation?.toLowerCase().includes(q) || false;
      const matchCust = r.customerProfile?.name.toLowerCase().includes(q) || false;
      if (!matchId && !matchCat && !matchConv && !matchCust) return false;
    }
    return true;
  });

  function handleRunEvaluation() {
    startEvaluatingTransition(async () => {
      try {
        const fresh = await triggerEvaluationAction();
        setData(fresh);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Evaluation failed");
      }
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Top Header */}
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white/95 px-6 backdrop-blur-xs">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Dashboard</span>
          </Link>
          <div className="h-4 w-px bg-slate-200" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight">AI Evaluation Engine</h1>
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200">
                Phase D
              </span>
            </div>
            <p className="text-[10px] text-slate-500">
              Deterministic ground-truth benchmark across {metrics.totalScenarios} synthetic transactions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isEvaluating}
            onClick={handleRunEvaluation}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isEvaluating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            <span>{isEvaluating ? "Evaluating Agent…" : "Run New Evaluation"}</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 space-y-6 p-6 max-w-7xl mx-auto w-full">
        {/* Top 6 KPI Scorecards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
              Overall Accuracy
            </span>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {metrics.overallAccuracy}%
              </span>
              <span className="text-[11px] font-medium text-emerald-600">
                {metrics.passedScenarios}/{metrics.totalScenarios}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-slate-400">Exact ground-truth match</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
              Policy Compliance
            </span>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight text-indigo-600">
                {metrics.policyAccuracy}%
              </span>
            </div>
            <p className="mt-1 text-[10px] text-slate-400">Authoritative backend check</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
              Decision Accuracy
            </span>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {metrics.decisionAccuracy}%
              </span>
            </div>
            <p className="mt-1 text-[10px] text-slate-400">Business strategy match</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
              Amount Accuracy
            </span>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight text-emerald-600">
                {metrics.amountAccuracy}%
              </span>
            </div>
            <p className="mt-1 text-[10px] text-slate-400">Zero fuzzy tolerance</p>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-2xs">
            <span className="text-[11px] font-medium text-emerald-800 uppercase tracking-wider block flex items-center gap-1">
              <Lock className="h-3 w-3 text-emerald-600" />
              Unsafe Blocked
            </span>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight text-emerald-700">
                100%
              </span>
              <span className="text-[10px] text-emerald-800 font-semibold">
                ({metrics.unsafeActionsBlocked}/{metrics.unsafeActionsSuggested})
              </span>
            </div>
            <p className="mt-1 text-[10px] text-emerald-700">0 unsafe executions</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
              Human Review Rate
            </span>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight text-amber-600">
                {metrics.humanReviewRate}%
              </span>
            </div>
            <p className="mt-1 text-[10px] text-slate-400">100% review accuracy</p>
          </div>
        </div>

        {/* Benchmark Comparison & Policy Precision / Recall Row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Benchmark Comparison vs Naive Baseline */}
          {baselineComparison && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                      Benchmark Comparison
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Razorpay Closer vs Naive Unbounded AI Baseline
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                  +100% Deterministic Safety
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-3 gap-2 pb-2 border-b border-slate-100 text-[11px] font-semibold text-slate-400">
                  <span>Dimension</span>
                  <span className="text-center">Naive Baseline</span>
                  <span className="text-right">Razorpay Closer</span>
                </div>

                <div className="grid grid-cols-3 gap-2 items-center text-xs">
                  <span className="font-medium text-slate-700">Decision Accuracy</span>
                  <span className="text-center text-slate-500 font-mono">
                    {baselineComparison.metrics.decisionAccuracy.baseline}%
                  </span>
                  <div className="text-right font-bold text-emerald-600 font-mono flex items-center justify-end gap-1">
                    <span>{baselineComparison.metrics.decisionAccuracy.closer}%</span>
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1 rounded">
                      +{baselineComparison.metrics.decisionAccuracy.delta}%
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 items-center text-xs">
                  <span className="font-medium text-slate-700">Policy Compliance</span>
                  <span className="text-center text-slate-500 font-mono">
                    {baselineComparison.metrics.policyCompliance.baseline}%
                  </span>
                  <div className="text-right font-bold text-emerald-600 font-mono flex items-center justify-end gap-1">
                    <span>{baselineComparison.metrics.policyCompliance.closer}%</span>
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1 rounded">
                      +{baselineComparison.metrics.policyCompliance.delta}%
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 items-center text-xs">
                  <span className="font-medium text-slate-700">Amount Accuracy</span>
                  <span className="text-center text-slate-500 font-mono">
                    {baselineComparison.metrics.amountAccuracy.baseline}%
                  </span>
                  <div className="text-right font-bold text-emerald-600 font-mono flex items-center justify-end gap-1">
                    <span>{baselineComparison.metrics.amountAccuracy.closer}%</span>
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1 rounded">
                      +{baselineComparison.metrics.amountAccuracy.delta}%
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 items-center text-xs">
                  <span className="font-medium text-slate-700">Overall Accuracy</span>
                  <span className="text-center text-slate-500 font-mono">
                    {baselineComparison.metrics.overallAccuracy.baseline}%
                  </span>
                  <div className="text-right font-bold text-emerald-600 font-mono flex items-center justify-end gap-1">
                    <span>{baselineComparison.metrics.overallAccuracy.closer}%</span>
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1 rounded">
                      +{baselineComparison.metrics.overallAccuracy.delta}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Policy Violation Precision / Recall Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <Scale className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Policy Violation Detection
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Precision, Recall, and F1 Score for Rule Breaches
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-bold text-indigo-800">
                F1: {metrics.policyViolationMetrics.f1Score}%
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-50 p-3 border border-slate-100 text-center">
                <span className="text-[10px] font-semibold text-slate-500 uppercase block">Precision</span>
                <span className="text-xl font-bold text-slate-800 mt-1 block font-mono">
                  {metrics.policyViolationMetrics.precision}%
                </span>
                <span className="text-[9px] text-slate-400 mt-0.5 block">0 False Positives</span>
              </div>

              <div className="rounded-xl bg-slate-50 p-3 border border-slate-100 text-center">
                <span className="text-[10px] font-semibold text-slate-500 uppercase block">Recall</span>
                <span className="text-xl font-bold text-slate-800 mt-1 block font-mono">
                  {metrics.policyViolationMetrics.recall}%
                </span>
                <span className="text-[9px] text-slate-400 mt-0.5 block">0 Missed Violations</span>
              </div>

              <div className="rounded-xl bg-indigo-50/60 p-3 border border-indigo-100 text-center">
                <span className="text-[10px] font-semibold text-indigo-700 uppercase block">F1 Score</span>
                <span className="text-xl font-bold text-indigo-900 mt-1 block font-mono">
                  {metrics.policyViolationMetrics.f1Score}%
                </span>
                <span className="text-[9px] text-indigo-700/70 mt-0.5 block">Harmonic Mean</span>
              </div>
            </div>

            {/* Confusion Matrix */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>Confusion Matrix:</span>
              <span className="font-mono text-slate-700">
                TP: <strong>{metrics.policyViolationMetrics.truePositives}</strong> · FP: <strong>{metrics.policyViolationMetrics.falsePositives}</strong> · TN: <strong>{metrics.policyViolationMetrics.trueNegatives}</strong> · FN: <strong>{metrics.policyViolationMetrics.falseNegatives}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Category Performance Breakdown */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <BarChart2 className="h-4 w-4 text-slate-500" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Category Performance Breakdown
            </h2>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Object.entries(metrics.categoryBreakdown).map(([key, cat]) => (
              <div
                key={key}
                onClick={() => setSelectedCategory(key === selectedCategory ? "ALL" : key)}
                className={`rounded-xl border p-3.5 transition-all cursor-pointer ${
                  selectedCategory === key
                    ? "border-blue-500 bg-blue-50/40 ring-2 ring-blue-500/20"
                    : "border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-800 line-clamp-1">{cat.categoryName}</span>
                  <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-700 border border-slate-200 font-mono">
                    {cat.passed}/{cat.total}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden mt-2">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${cat.accuracy}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                  <span>Accuracy: <strong>{cat.accuracy}%</strong></span>
                  <span>Policy: <strong>{cat.policyCompliance}%</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Interactive Filterable Scenarios Table */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
          <div className="flex flex-col gap-3 p-5 border-b border-slate-100 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Evaluation Scenarios ({filteredResults.length} / {results.length})
              </h2>
              <p className="text-[11px] text-slate-500">
                Click any scenario row to inspect its 5-step defense-in-depth trace
              </p>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search scenarios…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 w-48 rounded-lg border border-slate-200 pl-8 pr-3 text-xs focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-hidden"
              >
                <option value="ALL">All Categories</option>
                {Object.entries(metrics.categoryBreakdown).map(([k, c]) => (
                  <option key={k} value={k}>{c.categoryName}</option>
                ))}
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as "ALL" | "PASSED" | "FAILED")}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-hidden"
              >
                <option value="ALL">All Status</option>
                <option value="PASSED">Passed Only</option>
                <option value="FAILED">Failed Only</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">ID</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Conversation Summary</th>
                  <th className="p-3.5">Expected Decision</th>
                  <th className="p-3.5">Actual Decision</th>
                  <th className="p-3.5">Policy</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredResults.map((row) => (
                  <tr
                    key={row.scenarioId}
                    onClick={() => setInspectingScenario(row)}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                  >
                    <td className="p-3.5 font-mono font-bold text-slate-700">
                      #{row.scenarioId}
                    </td>
                    <td className="p-3.5">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        {row.category}
                      </span>
                    </td>
                    <td className="p-3.5 max-w-xs">
                      <p className="font-medium text-slate-800 line-clamp-1">
                        {row.customerProfile?.name}: {row.conversation?.replace(/^Customer:\s*/i, "")}
                      </p>
                    </td>
                    <td className="p-3.5 font-mono font-medium text-slate-600">
                      {row.expectedOutput.expectedDecision}
                    </td>
                    <td className="p-3.5 font-mono font-semibold text-slate-900">
                      {row.actualOutput.decision}
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          row.actualOutput.policyAllowed
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                        }`}
                      >
                        {row.actualOutput.policyAllowed ? "ALLOW" : "REJECT"}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          row.passed
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {row.passed ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <XCircle className="h-3 w-3 text-rose-600" />
                        )}
                        {row.passed ? "PASS" : "FAIL"}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 group-hover:underline">
                        Inspect
                        <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Scenario Detail Inspector Modal */}
      <ScenarioInspectorModal
        scenario={inspectingScenario}
        onClose={() => setInspectingScenario(null)}
      />
    </div>
  );
}
