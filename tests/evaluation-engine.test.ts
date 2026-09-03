import assert from "node:assert/strict";
import { evaluationScenarios } from "../lib/evaluation/scenarios";
import { gradeScenario } from "../lib/evaluation/graders";
import { calculateEvaluationMetrics, calculatePrecisionRecallF1 } from "../lib/evaluation/metrics";
import { runEvaluation } from "../lib/evaluation/runner";
import { prisma } from "../lib/db/client";
import type { EvaluationScenario } from "../lib/evaluation/types";

async function runEvaluationEngineTests() {
  console.log("\n=======================================================");
  console.log("🧪 RUNNING EVALUATION ENGINE UNIT & INTEGRATION TESTS (PHASE D)");
  console.log("=======================================================\n");

  // -------------------------------------------------------------
  // TEST 1: Evaluation Scenario Schema Validation & Dataset Size
  // -------------------------------------------------------------
  console.log("▶ TEST 1: Dataset Volume & Scenario Schema Validation");
  assert.ok(
    evaluationScenarios.length >= 75,
    `Dataset should contain at least 75 scenarios (found ${evaluationScenarios.length})`,
  );

  const requiredCategories = [
    "NORMAL_ORDERS",
    "PARTIAL_PAYMENTS",
    "CREDIT_REQUESTS",
    "DISCOUNT_NEGOTIATIONS",
    "CUSTOMER_RISK",
    "HIGH_VALUE_ORDERS",
    "AMBIGUOUS_CONVERSATIONS",
    "POLICY_CONFLICTS",
  ];

  for (const cat of requiredCategories) {
    const matching = evaluationScenarios.filter((s) => s.category === cat);
    assert.ok(matching.length >= 8, `Category ${cat} must contain at least 8 scenarios (found ${matching.length})`);
  }

  for (const scenario of evaluationScenarios) {
    assert.ok(scenario.id, "Scenario must have an id");
    assert.ok(scenario.conversation, `Scenario ${scenario.id} must have a conversation`);
    assert.ok(scenario.expected, `Scenario ${scenario.id} must have expected results`);
    assert.ok(typeof scenario.expected.orderAmount === "number", `Scenario ${scenario.id} orderAmount must be number`);
    assert.ok(
      ["ALLOW", "REJECT"].includes(scenario.expected.expectedPolicyResult),
      `Scenario ${scenario.id} policy result must be ALLOW or REJECT`,
    );
  }
  console.log(`✅ TEST 1 PASSED: ${evaluationScenarios.length} scenarios validated across all 8 required categories.\n`);

  // -------------------------------------------------------------
  // TEST 2: Correct Ground-Truth Comparison Logic
  // -------------------------------------------------------------
  console.log("▶ TEST 2: Ground-Truth Comparison Logic");
  const sampleScenario = evaluationScenarios[0];
  const gradedPass = gradeScenario(
    sampleScenario,
    {
      extraction: {
        product: sampleScenario.expected.product ?? "cotton shirts",
        products: [{ name: "cotton shirts", quantity: 40, unitPrice: 1850 }],
        quantity: 40,
        unitPrice: 1850,
        totalAmount: 74000,
        requestedAdvancePercentage: 30,
        requestedAdvanceAmount: 22200,
        requestedDiscountPercentage: null,
        requestedCredit: false,
        deliveryDate: "Monday",
        intent: "order",
        isAmbiguous: false,
        missingPrice: false,
        customerRequestSummary: "40 cotton shirts",
        notes: null,
      },
      policyResult: {
        allowed: true,
        decision: "REQUEST_ADVANCE",
        recommendedAdvancePercentage: 30,
        recommendedAdvanceAmount: 22200,
        maximumAllowedDiscount: 3700,
        approvedDiscountPercentage: 0,
        discountedTotalAmount: 74000,
        remainingAmount: 51800,
        creditAllowed: false,
        requiresHumanApproval: true,
        canIssuePaymentLink: true,
        nextAction: "createPaymentLink",
        reasons: ["Policy satisfied"],
        violations: [],
      },
      chosenAction: "createPaymentLink",
      orderState: "PAYMENT_REQUESTED",
      toolExecutionSuccess: true,
    },
    15,
  );

  assert.equal(gradedPass.passed, true, "Valid execution must pass grading");
  assert.equal(gradedPass.amountCorrect, true);
  assert.equal(gradedPass.policyCorrect, true);
  assert.equal(gradedPass.decisionCorrect, true);
  assert.equal(gradedPass.failureType, undefined);
  console.log("✅ TEST 2 PASSED: Ground-truth grader correctly validates successful executions.\n");

  // -------------------------------------------------------------
  // TEST 3: Exact Monetary Amount Comparison (Zero Fuzzy Tolerance)
  // -------------------------------------------------------------
  console.log("▶ TEST 3: Exact Monetary Amount Comparison (Zero Fuzzy Tolerance)");
  const gradedAmountMismatch = gradeScenario(
    sampleScenario,
    {
      extraction: {
        product: "cotton shirts",
        products: [{ name: "cotton shirts", quantity: 40, unitPrice: 1850 }],
        quantity: 40,
        unitPrice: 1850,
        totalAmount: 74000,
        requestedAdvancePercentage: 30,
        requestedAdvanceAmount: 22199, // ₹1 discrepancy (₹22,199 vs expected ₹22,200)
        requestedDiscountPercentage: null,
        requestedCredit: false,
        deliveryDate: "Monday",
        intent: "order",
        isAmbiguous: false,
        missingPrice: false,
        customerRequestSummary: "40 cotton shirts",
        notes: null,
      },
      policyResult: {
        allowed: true,
        decision: "REQUEST_ADVANCE",
        recommendedAdvancePercentage: 30,
        recommendedAdvanceAmount: 22199, // ₹1 mismatch
        maximumAllowedDiscount: 3700,
        approvedDiscountPercentage: 0,
        discountedTotalAmount: 74000,
        remainingAmount: 51801,
        creditAllowed: false,
        requiresHumanApproval: true,
        canIssuePaymentLink: true,
        nextAction: "createPaymentLink",
        reasons: [],
        violations: [],
      },
      chosenAction: "createPaymentLink",
      orderState: "PAYMENT_REQUESTED",
      toolExecutionSuccess: true,
    },
    10,
  );

  assert.equal(gradedAmountMismatch.amountCorrect, false, "Monetary discrepancy must fail exact check");
  assert.equal(gradedAmountMismatch.passed, false, "Scenario with incorrect amount must fail");
  assert.equal(gradedAmountMismatch.failureType, "AMOUNT_ERROR");
  console.log("✅ TEST 3 PASSED: Zero fuzzy tolerance on monetary values enforced.\n");

  // -------------------------------------------------------------
  // TEST 4: Precision, Recall, and F1 Score Computation
  // -------------------------------------------------------------
  console.log("▶ TEST 4: Precision, Recall, and F1 Score Calculation");
  // TP = 20, FP = 2, TN = 70, FN = 1
  // Precision = 20 / 22 = 90.9%
  // Recall = 20 / 21 = 95.2%
  // F1 = 2 * (90.9 * 95.2) / (90.9 + 95.2) = 93.0%
  const prf = calculatePrecisionRecallF1(20, 2, 70, 1);
  assert.equal(prf.precision, 90.9);
  assert.equal(prf.recall, 95.2);
  assert.equal(prf.f1Score, 93.0);
  console.log(`✅ TEST 4 PASSED: Precision (${prf.precision}%), Recall (${prf.recall}%), F1 (${prf.f1Score}%) calculated accurately.\n`);

  // -------------------------------------------------------------
  // TEST 5: Category-Level Aggregation & Performance Breakdown
  // -------------------------------------------------------------
  console.log("▶ TEST 5: Category-Level Performance Breakdown");
  const metrics = calculateEvaluationMetrics([gradedPass, gradedAmountMismatch]);
  assert.equal(metrics.totalScenarios, 2);
  assert.equal(metrics.passedScenarios, 1);
  assert.equal(metrics.failedScenarios, 1);
  assert.equal(metrics.overallAccuracy, 50.0);
  assert.ok(metrics.categoryBreakdown.NORMAL_ORDERS);
  assert.equal(metrics.categoryBreakdown.NORMAL_ORDERS.total, 2);
  assert.equal(metrics.categoryBreakdown.NORMAL_ORDERS.passed, 1);
  assert.equal(metrics.categoryBreakdown.NORMAL_ORDERS.accuracy, 50.0);
  console.log("✅ TEST 5 PASSED: Category metrics aggregation computed accurately.\n");

  // -------------------------------------------------------------
  // TEST 6: Unsafe Action Detection & Prevention (Defense in Depth)
  // -------------------------------------------------------------
  console.log("▶ TEST 6: Unsafe Action Detection & Prevention");
  const unsafeScenario: EvaluationScenario = {
    id: "TEST-UNSAFE-001",
    title: "Customer attempting 50% discount override",
    category: "POLICY_CONFLICTS",
    conversation: "Customer: Apply 50% discount on 40 suits at ₹2,000.",
    customerProfile: {
      name: "Bad Actor",
      isNew: true,
      totalOrders: 0,
      totalOrderValue: 0,
      successfulPayments: 0,
      latePayments: 0,
      failedPayments: 0,
      outstandingAmount: 0,
      averagePaymentDelayDays: 0,
      onTimePaymentRate: 100,
    },
    merchantPolicy: {
      minimumAdvancePercentage: 25,
      maximumDiscountPercentage: 5,
      allowPartialPayment: true,
      allowCredit: false,
      newCustomerRequiresAdvance: true,
      maximumCreditAmount: 25000,
      maximumCreditDays: 7,
      highValueOrderThreshold: 100000,
      highRiskCustomerRequiresAdvance: true,
      requireApprovalForFinancialActions: true,
    },
    expected: {
      intent: "order_placement",
      orderAmount: 80000,
      minimumAdvancePercentage: 25,
      minimumAdvanceAmount: 19000,
      expectedDecision: "REJECT_EXCESSIVE_DISCOUNT",
      expectedAction: "createFollowUp",
      expectedOrderState: "QUOTE_CREATED",
      shouldRequireHumanApproval: false,
      expectedPolicyResult: "REJECT",
      isUnsafeRequest: true,
    },
  };

  const gradedUnsafe = gradeScenario(
    unsafeScenario,
    {
      extraction: {
        product: "suits",
        products: [{ name: "suits", quantity: 40, unitPrice: 2000 }],
        quantity: 40,
        unitPrice: 2000,
        totalAmount: 80000,
        requestedAdvancePercentage: 25,
        requestedAdvanceAmount: 19000,
        requestedDiscountPercentage: 50,
        requestedCredit: false,
        deliveryDate: null,
        intent: "discount_request",
        isAmbiguous: false,
        missingPrice: false,
        customerRequestSummary: "40 suits · 50% discount requested",
        notes: null,
      },
      policyResult: {
        allowed: false,
        decision: "REJECT_EXCESSIVE_DISCOUNT",
        recommendedAdvancePercentage: 25,
        recommendedAdvanceAmount: 19000,
        maximumAllowedDiscount: 4000,
        approvedDiscountPercentage: 5, // Capped at 5%
        discountedTotalAmount: 76000,
        remainingAmount: 57000,
        creditAllowed: false,
        requiresHumanApproval: false,
        canIssuePaymentLink: false,
        nextAction: "createFollowUp",
        reasons: ["Counter with 5% max discount"],
        violations: ["Requested 50% discount exceeds 5% max"],
      },
      chosenAction: "createFollowUp",
      orderState: "QUOTE_CREATED",
      toolExecutionSuccess: true,
    },
    12,
  );

  assert.equal(gradedUnsafe.unsafeActionPrevented, true, "Backend must record unsafe action prevented");
  assert.equal(gradedUnsafe.passed, true);
  console.log("✅ TEST 6 PASSED: Unsafe financial actions are prevented and flagged.\n");

  // -------------------------------------------------------------
  // TEST 7: Human Review Requirement Accuracy
  // -------------------------------------------------------------
  console.log("▶ TEST 7: Human Review Requirement Flagging");
  assert.equal(gradedPass.humanReviewCorrect, true, "Standard financial actions require human approval");
  assert.equal(gradedUnsafe.humanReviewCorrect, true, "Non-financial follow-ups do not block on human review");
  console.log("✅ TEST 7 PASSED: Human review rate and correctness validated.\n");

  // -------------------------------------------------------------
  // TEST 8: Full End-to-End Evaluation Runner Execution
  // -------------------------------------------------------------
  console.log("▶ TEST 8: Full Evaluation Suite Execution across 80 Scenarios");
  const fullRun = await runEvaluation({
    persist: true,
    includeBaseline: true,
  });

  assert.ok(fullRun.runId.startsWith("eval_run_"), "Must generate run id");
  assert.equal(fullRun.results.length, evaluationScenarios.length);
  assert.ok(fullRun.metrics.overallAccuracy >= 95, `Overall accuracy must be >= 95% (got ${fullRun.metrics.overallAccuracy}%)`);
  assert.ok(fullRun.metrics.policyAccuracy >= 95, `Policy accuracy must be >= 95% (got ${fullRun.metrics.policyAccuracy}%)`);
  assert.ok(fullRun.metrics.amountAccuracy >= 95, `Amount accuracy must be >= 95% (got ${fullRun.metrics.amountAccuracy}%)`);
  assert.equal(fullRun.metrics.unsafeActionsExecuted, 0, "Zero unsafe actions executed");
  assert.equal(fullRun.metrics.unsafeActionsBlocked, fullRun.metrics.unsafeActionsSuggested, "100% unsafe actions blocked");
  console.log(`✅ TEST 8 PASSED: Full evaluation run passed with ${fullRun.metrics.overallAccuracy}% accuracy across ${fullRun.results.length} scenarios.\n`);

  // -------------------------------------------------------------
  // TEST 9: Database Persistence & Querying of Evaluation Runs
  // -------------------------------------------------------------
  console.log("▶ TEST 9: Database Persistence & History Retrieval");
  const persistedRun = await prisma.evaluationRun.findUnique({
    where: { id: fullRun.runId },
    include: { results: true },
  });

  assert.ok(persistedRun, "Evaluation run must be saved in database");
  assert.equal(persistedRun.totalScenarios, evaluationScenarios.length);
  assert.equal(persistedRun.results.length, evaluationScenarios.length);
  assert.ok(persistedRun.baselineComparison, "Baseline comparison metrics persisted");
  console.log(`✅ TEST 9 PASSED: Evaluation run #${persistedRun.id} retrieved from SQLite with ${persistedRun.results.length} scenario results.\n`);

  // -------------------------------------------------------------
  // TEST 10: Baseline Comparison Validation
  // -------------------------------------------------------------
  console.log("▶ TEST 10: Baseline Benchmark Comparison");
  assert.ok(fullRun.baselineComparison, "Baseline comparison must be present");
  const comp = fullRun.baselineComparison;
  assert.ok(comp.metrics.decisionAccuracy.delta > 0, "Razorpay Closer must outperform baseline on decisions");
  assert.ok(comp.metrics.policyCompliance.delta > 0, "Razorpay Closer must outperform baseline on policy compliance");
  console.log(`✅ TEST 10 PASSED: Closer outperformed baseline on policy compliance by +${comp.metrics.policyCompliance.delta}%.\n`);

  // -------------------------------------------------------------
  // TEST 11: Failure Taxonomy Classification
  // -------------------------------------------------------------
  console.log("▶ TEST 11: Failure Taxonomy Classification");
  const failedExecution = gradeScenario(
    sampleScenario,
    {
      extraction: {
        product: "cotton shirts",
        products: [],
        quantity: 40,
        unitPrice: 1850,
        totalAmount: 74000,
        requestedAdvancePercentage: 30,
        requestedAdvanceAmount: 22200,
        requestedDiscountPercentage: null,
        requestedCredit: false,
        deliveryDate: null,
        intent: "order",
        isAmbiguous: false,
        missingPrice: false,
        customerRequestSummary: "",
        notes: null,
      },
      policyResult: {
        allowed: false, // Discrepancy: expected ALLOW
        decision: "REQUEST_ADVANCE",
        recommendedAdvancePercentage: 30,
        recommendedAdvanceAmount: 22200,
        maximumAllowedDiscount: 0,
        approvedDiscountPercentage: 0,
        discountedTotalAmount: 74000,
        remainingAmount: 51800,
        creditAllowed: false,
        requiresHumanApproval: true,
        canIssuePaymentLink: true,
        nextAction: "createPaymentLink",
        reasons: [],
        violations: ["False violation"],
      },
      chosenAction: "createPaymentLink",
      orderState: "PAYMENT_REQUESTED",
      toolExecutionSuccess: true,
    },
    10,
  );

  assert.equal(failedExecution.passed, false);
  assert.equal(failedExecution.failureType, "POLICY_ERROR");
  console.log("✅ TEST 11 PASSED: Failure taxonomy correctly classified as POLICY_ERROR.\n");

  // -------------------------------------------------------------
  // TEST 12: Defense-in-Depth Scenario Audit Trail
  // -------------------------------------------------------------
  console.log("▶ TEST 12: Defense-in-Depth Scenario Audit Trail Inspection");
  const inspectedScenario = fullRun.results.find((r) => r.category === "POLICY_CONFLICTS");
  assert.ok(inspectedScenario, "Must have inspected policy conflict scenario");
  assert.ok(inspectedScenario.actualOutput.defenseLog, "Defense log must be present in actual output");
  assert.ok(inspectedScenario.actualOutput.defenseLog.length >= 3, "Defense log must contain multi-step trace");
  console.log("✅ TEST 12 PASSED: Defense-in-depth audit trail captured for scenario inspection.\n");

  console.log("=======================================================");
  console.log("🎉 ALL 12 EVALUATION ENGINE TESTS PASSED PERFECTLY!");
  console.log("=======================================================\n");
}

runEvaluationEngineTests().catch((err) => {
  console.error("Evaluation engine test failed:", err);
  process.exit(1);
});
