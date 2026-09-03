import type { MerchantPolicyInput } from "@/lib/ai/schemas";

export type ScenarioCategory =
  | "NORMAL_ORDERS"
  | "PARTIAL_PAYMENTS"
  | "CREDIT_REQUESTS"
  | "DISCOUNT_NEGOTIATIONS"
  | "CUSTOMER_RISK"
  | "HIGH_VALUE_ORDERS"
  | "AMBIGUOUS_CONVERSATIONS"
  | "POLICY_CONFLICTS";

export type FailureType =
  | "EXTRACTION_ERROR"
  | "AMOUNT_ERROR"
  | "POLICY_ERROR"
  | "DECISION_ERROR"
  | "TOOL_SELECTION_ERROR"
  | "STATE_ERROR"
  | "EXECUTION_ERROR"
  | "UNSAFE_ACTION"
  | "INSUFFICIENT_INFORMATION"
  | "SYSTEM_ERROR";

export type EvaluationCustomerProfile = {
  name: string;
  isNew?: boolean;
  totalOrders: number;
  totalOrderValue: number;
  successfulPayments: number;
  latePayments: number;
  failedPayments: number;
  outstandingAmount: number;
  averagePaymentDelayDays: number;
  onTimePaymentRate?: number;
};

export type EvaluationExpected = {
  intent: string;
  orderAmount: number;
  product?: string;
  quantity?: number;
  unitPrice?: number;
  minimumAdvanceAmount?: number;
  minimumAdvancePercentage?: number;
  expectedDecision: string;
  expectedAction?: string;
  expectedOrderState?: string;
  shouldRequireHumanApproval: boolean;
  expectedPolicyResult: "ALLOW" | "REJECT";
  violationsExpected?: string[];
  isUnsafeRequest?: boolean;
};

export type EvaluationScenario = {
  id: string;
  title: string;
  category: ScenarioCategory;
  conversation: string;
  customerProfile: EvaluationCustomerProfile;
  merchantPolicy: MerchantPolicyInput;
  expected: EvaluationExpected;
};

export type GradedScenarioResult = {
  scenarioId: string;
  category: ScenarioCategory;
  passed: boolean;
  extractionScore: number;
  amountCorrect: boolean;
  policyCorrect: boolean;
  decisionCorrect: boolean;
  actionCorrect: boolean;
  stateCorrect: boolean;
  toolExecutionSuccess: boolean;
  humanReviewCorrect: boolean;
  unsafeActionPrevented: boolean;
  failureType?: FailureType;
  latencyMs: number;
  error?: string;
  actualOutput: {
    intent?: string;
    product?: string;
    quantity?: number;
    unitPrice?: number;
    totalAmount?: number;
    calculatedAdvanceAmount?: number;
    calculatedAdvancePercentage?: number;
    decision?: string;
    action?: string;
    orderState?: string;
    requiresHumanApproval?: boolean;
    policyAllowed?: boolean;
    violations?: string[];
    reasons?: string[];
    defenseLog?: string[];
  };
  expectedOutput: EvaluationExpected;
  conversation?: string;
  customerProfile?: EvaluationCustomerProfile;
  merchantPolicy?: MerchantPolicyInput;
};

export type CategoryMetrics = {
  category: ScenarioCategory;
  categoryName: string;
  total: number;
  passed: number;
  failed: number;
  accuracy: number;
  policyCompliance: number;
  amountAccuracy: number;
};

export type PrecisionRecallF1 = {
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
};

export type EvaluationMetrics = {
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  overallAccuracy: number;
  policyAccuracy: number;
  decisionAccuracy: number;
  amountAccuracy: number;
  extractionAccuracy: number;
  actionAccuracy: number;
  orderStateAccuracy: number;
  humanReviewAccuracy: number;
  humanReviewRate: number;
  unsafeActionsSuggested: number;
  unsafeActionsExecuted: number;
  unsafeActionsBlocked: number;
  policyViolationMetrics: PrecisionRecallF1;
  categoryBreakdown: Record<string, CategoryMetrics>;
  averageLatencyMs: number;
};

export type BaselineComparison = {
  baselineName: string;
  closerName: string;
  metrics: {
    decisionAccuracy: { baseline: number; closer: number; delta: number };
    policyCompliance: { baseline: number; closer: number; delta: number };
    amountAccuracy: { baseline: number; closer: number; delta: number };
    unsafeActionRate: { baseline: number; closer: number; delta: number };
    humanReviewAccuracy: { baseline: number; closer: number; delta: number };
    overallAccuracy: { baseline: number; closer: number; delta: number };
  };
};

export type FullEvaluationRunOutput = {
  runId: string;
  startedAt: string;
  completedAt: string;
  metrics: EvaluationMetrics;
  results: GradedScenarioResult[];
  baselineComparison?: BaselineComparison;
};
