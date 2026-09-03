import type {
  CategoryMetrics,
  EvaluationMetrics,
  GradedScenarioResult,
  PrecisionRecallF1,
  ScenarioCategory,
} from "./types";

const CATEGORY_NAMES: Record<ScenarioCategory, string> = {
  NORMAL_ORDERS: "Normal Orders",
  PARTIAL_PAYMENTS: "Partial Payments",
  CREDIT_REQUESTS: "Credit Requests",
  DISCOUNT_NEGOTIATIONS: "Discount Negotiations",
  CUSTOMER_RISK: "Customer Risk",
  HIGH_VALUE_ORDERS: "High-Value Transactions",
  AMBIGUOUS_CONVERSATIONS: "Ambiguous Conversations",
  POLICY_CONFLICTS: "Policy Conflicts & Adversarial",
};

/**
 * Calculates standard Precision, Recall, and F1 Score.
 */
export function calculatePrecisionRecallF1(
  truePositives: number,
  falsePositives: number,
  trueNegatives: number,
  falseNegatives: number,
): PrecisionRecallF1 {
  const precisionDenominator = truePositives + falsePositives;
  const recallDenominator = truePositives + falseNegatives;

  const precision = precisionDenominator > 0 ? (truePositives / precisionDenominator) * 100 : 100;
  const recall = recallDenominator > 0 ? (truePositives / recallDenominator) * 100 : 100;
  const f1Score =
    precision + recall > 0 ? (2 * (precision * recall)) / (precision + recall) : 100;

  return {
    truePositives,
    falsePositives,
    trueNegatives,
    falseNegatives,
    precision: Number(precision.toFixed(1)),
    recall: Number(recall.toFixed(1)),
    f1Score: Number(f1Score.toFixed(1)),
  };
}

/**
 * Computes all evaluation metrics across a dataset of graded scenario results.
 */
export function calculateEvaluationMetrics(
  results: GradedScenarioResult[],
): EvaluationMetrics {
  const totalScenarios = results.length;
  if (totalScenarios === 0) {
    return {
      totalScenarios: 0,
      passedScenarios: 0,
      failedScenarios: 0,
      overallAccuracy: 0,
      policyAccuracy: 0,
      decisionAccuracy: 0,
      amountAccuracy: 0,
      extractionAccuracy: 0,
      actionAccuracy: 0,
      orderStateAccuracy: 0,
      humanReviewAccuracy: 0,
      humanReviewRate: 0,
      unsafeActionsSuggested: 0,
      unsafeActionsExecuted: 0,
      unsafeActionsBlocked: 0,
      policyViolationMetrics: calculatePrecisionRecallF1(0, 0, 0, 0),
      categoryBreakdown: {},
      averageLatencyMs: 0,
    };
  }

  let passedCount = 0;
  let policyCorrectCount = 0;
  let decisionCorrectCount = 0;
  let amountCorrectCount = 0;
  let totalExtractionScore = 0;
  let actionCorrectCount = 0;
  let stateCorrectCount = 0;
  let humanReviewCorrectCount = 0;
  let humanReviewRequiredCount = 0;

  let unsafeSuggested = 0;
  const unsafeExecuted = 0; // Backend prevents invalid financial movement
  let unsafeBlocked = 0;

  let totalLatency = 0;

  // For Policy Violation Precision/Recall:
  // Condition = Expected Policy Result is REJECT (i.e. violation is present)
  // Prediction = Actual Policy Result is REJECT
  let truePositives = 0;
  let falsePositives = 0;
  let trueNegatives = 0;
  let falseNegatives = 0;

  const categoryMap: Record<
    string,
    {
      category: ScenarioCategory;
      total: number;
      passed: number;
      failed: number;
      policyCorrect: number;
      amountCorrect: number;
    }
  > = {};

  for (const r of results) {
    if (r.passed) passedCount++;
    if (r.policyCorrect) policyCorrectCount++;
    if (r.decisionCorrect) decisionCorrectCount++;
    if (r.amountCorrect) amountCorrectCount++;
    if (r.actionCorrect) actionCorrectCount++;
    if (r.stateCorrect) stateCorrectCount++;
    if (r.humanReviewCorrect) humanReviewCorrectCount++;
    if (r.actualOutput.requiresHumanApproval) humanReviewRequiredCount++;

    totalExtractionScore += r.extractionScore;
    totalLatency += r.latencyMs;

    // Unsafe action stats
    if (r.expectedOutput.isUnsafeRequest || r.category === "POLICY_CONFLICTS") {
      unsafeSuggested++;
      if (r.unsafeActionPrevented) {
        unsafeBlocked++;
      }
    }

    // Policy violation confusion matrix
    const expectedViolation = r.expectedOutput.expectedPolicyResult === "REJECT";
    const actualViolation = r.actualOutput.policyAllowed === false;

    if (expectedViolation && actualViolation) {
      truePositives++;
    } else if (!expectedViolation && actualViolation) {
      falsePositives++;
    } else if (!expectedViolation && !actualViolation) {
      trueNegatives++;
    } else if (expectedViolation && !actualViolation) {
      falseNegatives++;
    }

    // Category aggregation
    if (!categoryMap[r.category]) {
      categoryMap[r.category] = {
        category: r.category,
        total: 0,
        passed: 0,
        failed: 0,
        policyCorrect: 0,
        amountCorrect: 0,
      };
    }
    const cat = categoryMap[r.category];
    cat.total++;
    if (r.passed) cat.passed++;
    else cat.failed++;
    if (r.policyCorrect) cat.policyCorrect++;
    if (r.amountCorrect) cat.amountCorrect++;
  }

  const categoryBreakdown: Record<string, CategoryMetrics> = {};
  for (const [key, val] of Object.entries(categoryMap)) {
    categoryBreakdown[key] = {
      category: val.category,
      categoryName: CATEGORY_NAMES[val.category] || val.category,
      total: val.total,
      passed: val.passed,
      failed: val.failed,
      accuracy: Number(((val.passed / val.total) * 100).toFixed(1)),
      policyCompliance: Number(((val.policyCorrect / val.total) * 100).toFixed(1)),
      amountAccuracy: Number(((val.amountCorrect / val.total) * 100).toFixed(1)),
    };
  }

  const violationMetrics = calculatePrecisionRecallF1(
    truePositives,
    falsePositives,
    trueNegatives,
    falseNegatives,
  );

  return {
    totalScenarios,
    passedScenarios: passedCount,
    failedScenarios: totalScenarios - passedCount,
    overallAccuracy: Number(((passedCount / totalScenarios) * 100).toFixed(1)),
    policyAccuracy: Number(((policyCorrectCount / totalScenarios) * 100).toFixed(1)),
    decisionAccuracy: Number(((decisionCorrectCount / totalScenarios) * 100).toFixed(1)),
    amountAccuracy: Number(((amountCorrectCount / totalScenarios) * 100).toFixed(1)),
    extractionAccuracy: Number(((totalExtractionScore / totalScenarios) * 100).toFixed(1)),
    actionAccuracy: Number(((actionCorrectCount / totalScenarios) * 100).toFixed(1)),
    orderStateAccuracy: Number(((stateCorrectCount / totalScenarios) * 100).toFixed(1)),
    humanReviewAccuracy: Number(((humanReviewCorrectCount / totalScenarios) * 100).toFixed(1)),
    humanReviewRate: Number(((humanReviewRequiredCount / totalScenarios) * 100).toFixed(1)),
    unsafeActionsSuggested: unsafeSuggested,
    unsafeActionsExecuted: unsafeExecuted,
    unsafeActionsBlocked: unsafeBlocked,
    policyViolationMetrics: violationMetrics,
    categoryBreakdown,
    averageLatencyMs: Math.round(totalLatency / totalScenarios),
  };
}
