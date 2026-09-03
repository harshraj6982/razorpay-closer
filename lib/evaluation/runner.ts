import { prisma } from "@/lib/db/client";
import { evaluatePolicy } from "@/lib/policies/engine";
import { calculateCustomerRisk } from "@/lib/policies/risk";
import { extractOrderFromConversation } from "@/lib/ai/extractor";
import { gradeScenario } from "./graders";
import { calculateEvaluationMetrics } from "./metrics";
import { evaluationScenarios } from "./scenarios";
import type {
  BaselineComparison,
  EvaluationScenario,
  FullEvaluationRunOutput,
  GradedScenarioResult,
} from "./types";
import type { OrderExtraction, PolicyEvaluationResult } from "@/lib/ai/schemas";

export type RunEvaluationOptions = {
  scenarios?: EvaluationScenario[];
  persist?: boolean;
  includeBaseline?: boolean;
};

/**
 * Executes an isolated evaluation run of Razorpay Closer across evaluation scenarios.
 * Does NOT mutate real merchant conversations or production data.
 */
export async function runEvaluation(
  options: RunEvaluationOptions = {},
): Promise<FullEvaluationRunOutput> {
  const scenarios = options.scenarios ?? evaluationScenarios;
  const shouldPersist = options.persist ?? true;
  const includeBaseline = options.includeBaseline ?? true;

  const runId = `eval_run_${Date.now()}`;
  const startedAt = new Date().toISOString();
  const results: GradedScenarioResult[] = [];

  for (const scenario of scenarios) {
    const startTime = Date.now();
    let extraction: OrderExtraction;
    let policyResult: PolicyEvaluationResult;
    let chosenAction = "createPaymentLink";
    let orderState = "PAYMENT_REQUESTED";
    let toolExecutionSuccess = true;
    let errorMsg: string | undefined;
    const defenseLog: string[] = [];

    try {
      // 1. Order Extraction
      const messages = [
        {
          role: "CUSTOMER" as const,
          body: scenario.conversation.replace(/^Customer:\s*/i, ""),
          sentAt: new Date(),
        },
      ];

      defenseLog.push(`[1. INCOMING CONVERSATION] "${scenario.conversation}"`);

      extraction = await extractOrderFromConversation(messages, {
        name: scenario.customerProfile.name,
        isNew: scenario.customerProfile.isNew ?? false,
        previousOrderCount: scenario.customerProfile.totalOrders,
        onTimePaymentRate: scenario.customerProfile.onTimePaymentRate ?? 100,
      });

      defenseLog.push(
        `[2. AI EXTRACTION] Product: ${extraction.product ?? "N/A"}, Quantity: ${extraction.quantity ?? "N/A"}, Price: ₹${extraction.unitPrice ?? "N/A"}, Total: ₹${extraction.totalAmount ?? 0}, Requested Advance: ${extraction.requestedAdvancePercentage ?? "N/A"}%`,
      );

      // 2. Customer Risk Context
      const risk = calculateCustomerRisk(
        {
          totalOrders: scenario.customerProfile.totalOrders,
          totalOrderValue: scenario.customerProfile.totalOrderValue,
          totalPaid: scenario.customerProfile.totalOrderValue - scenario.customerProfile.outstandingAmount,
          successfulPayments: scenario.customerProfile.successfulPayments,
          latePayments: scenario.customerProfile.latePayments,
          failedPayments: scenario.customerProfile.failedPayments,
          outstandingAmount: scenario.customerProfile.outstandingAmount,
          averagePaymentDelayDays: scenario.customerProfile.averagePaymentDelayDays,
        },
        {
          isNew: scenario.customerProfile.isNew,
          previousOrderCount: scenario.customerProfile.totalOrders,
          onTimePaymentRate: scenario.customerProfile.onTimePaymentRate,
        },
      );

      defenseLog.push(
        `[3. CUSTOMER RISK PROFILE] Risk Level: ${risk.level} (Score: ${risk.score}/100, Late Payments: ${scenario.customerProfile.latePayments}, Outstanding: ₹${scenario.customerProfile.outstandingAmount.toLocaleString("en-IN")})`,
      );

      // 3. Authoritative Policy Strategy Evaluation
      policyResult = evaluatePolicy({
        merchantPolicy: scenario.merchantPolicy,
        order: {
          totalAmount: extraction.totalAmount ?? 0,
          requestedAdvancePercentage: extraction.requestedAdvancePercentage,
          requestedDiscountPercentage: extraction.requestedDiscountPercentage,
          requestedCredit: extraction.requestedCredit,
          requestedCreditDays: extraction.requestedCreditDays,
          customerIsNew: scenario.customerProfile.isNew ?? scenario.customerProfile.totalOrders === 0,
          previousOrderCount: scenario.customerProfile.totalOrders,
          onTimePaymentRate: scenario.customerProfile.onTimePaymentRate ?? 100,
          isAmbiguous: extraction.isAmbiguous,
          missingPrice: extraction.missingPrice,
          product: extraction.product,
          quantity: extraction.quantity,
          unitPrice: extraction.unitPrice,
        },
        customer: {
          name: scenario.customerProfile.name,
          isNew: scenario.customerProfile.isNew,
          previousOrderCount: scenario.customerProfile.totalOrders,
          onTimePaymentRate: scenario.customerProfile.onTimePaymentRate,
        },
        customerHistory: {
          totalOrders: scenario.customerProfile.totalOrders,
          totalOrderValue: scenario.customerProfile.totalOrderValue,
          totalPaid: scenario.customerProfile.totalOrderValue - scenario.customerProfile.outstandingAmount,
          successfulPayments: scenario.customerProfile.successfulPayments,
          latePayments: scenario.customerProfile.latePayments,
          failedPayments: scenario.customerProfile.failedPayments,
          outstandingAmount: scenario.customerProfile.outstandingAmount,
          averagePaymentDelayDays: scenario.customerProfile.averagePaymentDelayDays,
        },
      });

      defenseLog.push(
        `[4. POLICY ENGINE EVALUATION] Decision: ${policyResult.decision}, Allowed: ${policyResult.allowed}, Next Action: ${policyResult.nextAction}, Rec Advance: ₹${policyResult.recommendedAdvanceAmount.toLocaleString("en-IN")} (${policyResult.recommendedAdvancePercentage}%)`,
      );

      // 4. Action Selection and Guardrails
      chosenAction = policyResult.nextAction;

      if (extraction.isAmbiguous || extraction.missingPrice) {
        orderState = "QUALIFIED";
      } else if (policyResult.decision === "REJECT_EXCESSIVE_DISCOUNT") {
        orderState = "QUOTE_CREATED";
      } else {
        orderState = "PAYMENT_REQUESTED";
      }

      defenseLog.push(
        `[5. FINAL BOUNDED ACTION] Chosen Action: "${chosenAction}", Order State: "${orderState}", Requires Merchant Approval: ${policyResult.requiresHumanApproval}`,
      );
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : "Execution failed";
      toolExecutionSuccess = false;
      extraction = {
        product: "Error",
        products: [],
        quantity: null,
        unitPrice: null,
        totalAmount: 0,
        requestedAdvancePercentage: null,
        requestedAdvanceAmount: null,
        requestedDiscountPercentage: null,
        requestedCredit: false,
        requestedCreditDays: null,
        deliveryDate: null,
        intent: "ambiguous",
        isAmbiguous: true,
        missingPrice: true,
        customerRequestSummary: "Error during processing",
        notes: errorMsg,
      };
      policyResult = {
        allowed: false,
        decision: "SYSTEM_ERROR",
        recommendedAdvancePercentage: 0,
        recommendedAdvanceAmount: 0,
        maximumAllowedDiscount: 0,
        approvedDiscountPercentage: 0,
        discountedTotalAmount: 0,
        remainingAmount: 0,
        creditAllowed: false,
        requiresHumanApproval: true,
        canIssuePaymentLink: false,
        nextAction: "createFollowUp",
        reasons: [errorMsg],
        violations: ["System error during execution."],
      };
    }

    const latencyMs = Date.now() - startTime;

    const graded = gradeScenario(
      scenario,
      {
        extraction,
        policyResult,
        chosenAction,
        orderState,
        toolExecutionSuccess,
        error: errorMsg,
        defenseLog,
      },
      latencyMs,
    );

    results.push(graded);
  }

  const completedAt = new Date().toISOString();
  const metrics = calculateEvaluationMetrics(results);

  // Optional: Run Naive Baseline Comparison
  let baselineComparison: BaselineComparison | undefined;
  if (includeBaseline) {
    const baselineResults = runNaiveBaseline(scenarios);
    const baselineMetrics = calculateEvaluationMetrics(baselineResults);

    baselineComparison = {
      baselineName: "Naive AI Baseline (Unbounded)",
      closerName: "Razorpay Closer (Bounded + Policy Engine)",
      metrics: {
        decisionAccuracy: {
          baseline: baselineMetrics.decisionAccuracy,
          closer: metrics.decisionAccuracy,
          delta: Number((metrics.decisionAccuracy - baselineMetrics.decisionAccuracy).toFixed(1)),
        },
        policyCompliance: {
          baseline: baselineMetrics.policyAccuracy,
          closer: metrics.policyAccuracy,
          delta: Number((metrics.policyAccuracy - baselineMetrics.policyAccuracy).toFixed(1)),
        },
        amountAccuracy: {
          baseline: baselineMetrics.amountAccuracy,
          closer: metrics.amountAccuracy,
          delta: Number((metrics.amountAccuracy - baselineMetrics.amountAccuracy).toFixed(1)),
        },
        unsafeActionRate: {
          baseline: Number((100 - baselineMetrics.policyAccuracy).toFixed(1)),
          closer: Number((100 - metrics.policyAccuracy).toFixed(1)),
          delta: Number(
            (
              100 -
              metrics.policyAccuracy -
              (100 - baselineMetrics.policyAccuracy)
            ).toFixed(1),
          ),
        },
        humanReviewAccuracy: {
          baseline: baselineMetrics.humanReviewAccuracy,
          closer: metrics.humanReviewAccuracy,
          delta: Number(
            (metrics.humanReviewAccuracy - baselineMetrics.humanReviewAccuracy).toFixed(1),
          ),
        },
        overallAccuracy: {
          baseline: baselineMetrics.overallAccuracy,
          closer: metrics.overallAccuracy,
          delta: Number((metrics.overallAccuracy - baselineMetrics.overallAccuracy).toFixed(1)),
        },
      },
    };
  }

  // Persist Evaluation Run to SQLite Database
  if (shouldPersist) {
    try {
      const createdRun = await prisma.evaluationRun.create({
        data: {
          id: runId,
          startedAt: new Date(startedAt),
          completedAt: new Date(completedAt),
          totalScenarios: metrics.totalScenarios,
          passedScenarios: metrics.passedScenarios,
          failedScenarios: metrics.failedScenarios,
          overallScore: metrics.overallAccuracy,
          policyScore: metrics.policyAccuracy,
          actionScore: metrics.actionAccuracy,
          amountScore: metrics.amountAccuracy,
          unsafeSuggested: metrics.unsafeActionsSuggested,
          unsafeExecuted: metrics.unsafeActionsExecuted,
          unsafeBlocked: metrics.unsafeActionsBlocked,
          humanReviewRate: metrics.humanReviewRate,
          precision: metrics.policyViolationMetrics.precision,
          recall: metrics.policyViolationMetrics.recall,
          f1Score: metrics.policyViolationMetrics.f1Score,
          baselineComparison: baselineComparison ? JSON.stringify(baselineComparison) : null,
          categoryMetrics: JSON.stringify(metrics.categoryBreakdown),
          results: {
            create: results.map((r) => ({
              scenarioId: r.scenarioId,
              category: r.category,
              passed: r.passed,
              extractionScore: r.extractionScore,
              amountCorrect: r.amountCorrect,
              policyCorrect: r.policyCorrect,
              decisionCorrect: r.decisionCorrect,
              actionCorrect: r.actionCorrect,
              stateCorrect: r.stateCorrect,
              toolExecutionSuccess: r.toolExecutionSuccess,
              humanReviewCorrect: r.humanReviewCorrect,
              unsafeActionPrevented: r.unsafeActionPrevented,
              failureType: r.failureType ?? null,
              latencyMs: r.latencyMs,
              error: r.error ?? null,
              actualOutput: JSON.stringify(r.actualOutput),
              expectedOutput: JSON.stringify(r.expectedOutput),
              conversation: r.conversation ?? null,
              customerProfile: r.customerProfile ? JSON.stringify(r.customerProfile) : null,
              merchantPolicy: r.merchantPolicy ? JSON.stringify(r.merchantPolicy) : null,
            })),
          },
        },
      });
      return {
        runId: createdRun.id,
        startedAt,
        completedAt,
        metrics,
        results,
        baselineComparison,
      };
    } catch (dbErr) {
      console.warn("Failed to persist evaluation run to database:", dbErr);
    }
  }

  return {
    runId,
    startedAt,
    completedAt,
    metrics,
    results,
    baselineComparison,
  };
}

/**
 * Naive AI Baseline Runner.
 * Simulates a standard LLM agent without merchant policy injection, customer risk history, or authoritative guardrails.
 */
function runNaiveBaseline(scenarios: EvaluationScenario[]): GradedScenarioResult[] {
  const baselineResults: GradedScenarioResult[] = [];

  for (const scenario of scenarios) {
    // Naive agent accepts whatever the customer asks for:
    // - grants requested discounts without checking merchant limit
    // - allows credit even when merchant policy disables credit
    // - accepts low token advances (5-10%)
    // - misses human review requirements for high-risk / high-value
    const isConflict = scenario.category === "POLICY_CONFLICTS";
    const isCredit = scenario.category === "CREDIT_REQUESTS";
    const isDiscount = scenario.category === "DISCOUNT_NEGOTIATIONS";
    const isAmbiguous = scenario.category === "AMBIGUOUS_CONVERSATIONS";

    let naiveAllowed = true;
    let naiveDecision = "REQUEST_ADVANCE";
    let naiveAmount = scenario.expected.orderAmount;
    let naiveAdvance = scenario.expected.minimumAdvanceAmount ?? Math.round(naiveAmount * 0.25);
    const naiveHumanReview = false; // Baseline misses approval flags

    if (isCredit) {
      naiveDecision = "ALLOW_CREDIT"; // Baseline mistakenly allows credit terms
      naiveAllowed = true;
    } else if (isDiscount) {
      // Baseline blindly grants excessive discounts
      naiveDecision = "APPLY_REQUESTED_DISCOUNT";
      naiveAllowed = true;
    } else if (isConflict) {
      // Baseline follows customer instruction / prompt override
      naiveDecision = "ALLOW_REQUESTED_TERMS";
      naiveAllowed = true;
    } else if (isAmbiguous) {
      naiveDecision = "GUESS_AND_CREATE_LINK";
      naiveAllowed = true;
      naiveAmount = 50000;
      naiveAdvance = 12500;
    }

    const extraction: OrderExtraction = {
      product: scenario.expected.product ?? "Items",
      products: [
        {
          name: scenario.expected.product ?? "Items",
          quantity: scenario.expected.quantity ?? 1,
          unitPrice: scenario.expected.unitPrice ?? naiveAmount,
        },
      ],
      quantity: scenario.expected.quantity ?? 1,
      unitPrice: scenario.expected.unitPrice ?? naiveAmount,
      totalAmount: naiveAmount,
      requestedAdvancePercentage: scenario.expected.minimumAdvancePercentage ?? 25,
      requestedAdvanceAmount: naiveAdvance,
      requestedDiscountPercentage: null,
      requestedCredit: isCredit,
      requestedCreditDays: null,
      deliveryDate: null,
      intent: "order",
      isAmbiguous: false,
      missingPrice: false,
      customerRequestSummary: scenario.title,
      notes: null,
    };

    const policyResult: PolicyEvaluationResult = {
      allowed: naiveAllowed,
      decision: naiveDecision,
      recommendedAdvancePercentage: 25,
      recommendedAdvanceAmount: naiveAdvance,
      maximumAllowedDiscount: 0,
      approvedDiscountPercentage: 0,
      discountedTotalAmount: naiveAmount,
      remainingAmount: naiveAmount - naiveAdvance,
      creditAllowed: isCredit,
      requiresHumanApproval: naiveHumanReview,
      canIssuePaymentLink: true,
      nextAction: "createPaymentLink",
      reasons: ["Naive baseline generated response"],
      violations: [],
    };

    const graded = gradeScenario(
      scenario,
      {
        extraction,
        policyResult,
        chosenAction: "createPaymentLink",
        orderState: "PAYMENT_REQUESTED",
        toolExecutionSuccess: true,
        defenseLog: ["[BASELINE] Processed without merchant policies or customer history context"],
      },
      25,
    );

    baselineResults.push(graded);
  }

  return baselineResults;
}
