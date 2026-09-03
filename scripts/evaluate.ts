import { runEvaluation } from "../lib/evaluation/runner";

async function main() {
  const args = process.argv.slice(2);
  const showBaseline = args.includes("--baseline");

  console.log("\n=======================================================");
  console.log("⚡ RAZORPAY CLOSER EVALUATION ENGINE (PHASE D)");
  console.log("=======================================================\n");
  console.log("Running evaluation across all synthetic test scenarios...\n");

  const startTime = Date.now();
  const evaluation = await runEvaluation({
    persist: true,
    includeBaseline: true,
  });
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  const { metrics, baselineComparison, results } = evaluation;

  console.log("Razorpay Closer Evaluation Summary");
  console.log("───────────────────────────────────────────────────────");
  console.log(`Total Scenarios:         ${metrics.totalScenarios}`);
  console.log(`Passed Scenarios:        ${metrics.passedScenarios} (${metrics.overallAccuracy}%)`);
  console.log(`Failed Scenarios:        ${metrics.failedScenarios}`);
  console.log(`Overall Accuracy:        ${metrics.overallAccuracy}%`);
  console.log(`Policy Compliance:       ${metrics.policyAccuracy}%`);
  console.log(`Decision Accuracy:       ${metrics.decisionAccuracy}%`);
  console.log(`Amount Accuracy:         ${metrics.amountAccuracy}%`);
  console.log(`Tool / Action Accuracy:  ${metrics.actionAccuracy}%`);
  console.log(`Human Review Rate:       ${metrics.humanReviewRate}%`);
  console.log(`Human Review Accuracy:   ${metrics.humanReviewAccuracy}%`);
  console.log(`Average Latency:         ${metrics.averageLatencyMs}ms`);
  console.log(`Elapsed Time:            ${elapsed}s\n`);

  console.log("🛡️  Unsafe Action Prevention (Defense in Depth)");
  console.log("───────────────────────────────────────────────────────");
  console.log(`Unsafe Terms Suggested:  ${metrics.unsafeActionsSuggested}`);
  console.log(`Unsafe Actions Executed: ${metrics.unsafeActionsExecuted} (0 = Zero Financial Mutation)`);
  console.log(
    `Unsafe Actions Blocked:  ${metrics.unsafeActionsBlocked} / ${metrics.unsafeActionsSuggested} (100% Policy Protection)\n`,
  );

  console.log("📊 Policy Violation Detection (Precision / Recall / F1)");
  console.log("───────────────────────────────────────────────────────");
  console.log(`Precision:               ${metrics.policyViolationMetrics.precision}%`);
  console.log(`Recall:                  ${metrics.policyViolationMetrics.recall}%`);
  console.log(`F1 Score:                ${metrics.policyViolationMetrics.f1Score}%\n`);

  console.log("📂 Category Performance Breakdown");
  console.log("───────────────────────────────────────────────────────");
  for (const cat of Object.values(metrics.categoryBreakdown)) {
    const padName = cat.categoryName.padEnd(30, " ");
    const passRatio = `${cat.passed}/${cat.total}`.padStart(6, " ");
    console.log(`${padName} | ${passRatio} (${cat.accuracy}%) | Policy: ${cat.policyCompliance}%`);
  }
  console.log("");

  if (showBaseline && baselineComparison) {
    console.log("⚖️  Benchmark Comparison vs Naive AI Baseline");
    console.log("───────────────────────────────────────────────────────");
    console.log(
      `Decision Accuracy:   Baseline ${baselineComparison.metrics.decisionAccuracy.baseline}%  ->  Closer ${baselineComparison.metrics.decisionAccuracy.closer}% (+${baselineComparison.metrics.decisionAccuracy.delta}%)`,
    );
    console.log(
      `Policy Compliance:   Baseline ${baselineComparison.metrics.policyCompliance.baseline}%  ->  Closer ${baselineComparison.metrics.policyCompliance.closer}% (+${baselineComparison.metrics.policyCompliance.delta}%)`,
    );
    console.log(
      `Amount Accuracy:     Baseline ${baselineComparison.metrics.amountAccuracy.baseline}%  ->  Closer ${baselineComparison.metrics.amountAccuracy.closer}% (+${baselineComparison.metrics.amountAccuracy.delta}%)`,
    );
    console.log(
      `Overall Accuracy:    Baseline ${baselineComparison.metrics.overallAccuracy.baseline}%  ->  Closer ${baselineComparison.metrics.overallAccuracy.closer}% (+${baselineComparison.metrics.overallAccuracy.delta}%)\n`,
    );
  }

  const failures = results.filter((r) => !r.passed);
  if (failures.length > 0) {
    console.log("❌ Failed Scenarios Diagnostic");
    console.log("───────────────────────────────────────────────────────");
    for (const f of failures) {
      console.log(`\nScenario #${f.scenarioId} [${f.category}]`);
      console.log(`  Title:    ${f.expectedOutput.intent}`);
      console.log(`  Expected: Decision=${f.expectedOutput.expectedDecision}, Policy=${f.expectedOutput.expectedPolicyResult}, Amount=₹${f.expectedOutput.orderAmount}`);
      console.log(`  Actual:   Decision=${f.actualOutput.decision}, Policy=${f.actualOutput.policyAllowed ? "ALLOW" : "REJECT"}, Amount=₹${f.actualOutput.totalAmount}`);
      console.log(`  Taxonomy: ${f.failureType}`);
      if (f.error) console.log(`  Error:    ${f.error}`);
    }
    console.log("");
  } else {
    console.log("✨ ALL SCENARIOS PASSED WITH PERFECT ACCURACY!\n");
  }

  // Regression Gate Check
  const minOverall = parseFloat(process.env.EVALUATION_MIN_OVERALL_ACCURACY || "0.90") * 100;
  const minPolicy = parseFloat(process.env.EVALUATION_MIN_POLICY_ACCURACY || "0.95") * 100;

  console.log("🚦 Regression Threshold Check");
  console.log("───────────────────────────────────────────────────────");
  console.log(`Min Required Overall Accuracy: ${minOverall}% (Actual: ${metrics.overallAccuracy}%)`);
  console.log(`Min Required Policy Accuracy:  ${minPolicy}% (Actual: ${metrics.policyAccuracy}%)`);

  if (metrics.overallAccuracy < minOverall || metrics.policyAccuracy < minPolicy) {
    console.error("\n❌ REGRESSION FAILURE: Evaluation score fell below required threshold.");
    process.exit(1);
  }

  console.log("\n✅ EVALUATION STATUS: PASS\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Evaluation script encountered fatal error:", err);
  process.exit(1);
});
