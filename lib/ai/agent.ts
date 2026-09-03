import { OrderStatus, type Prisma } from "@prisma/client";
import OpenAI from "openai";
import { prisma } from "@/lib/db/client";
import { evaluatePolicy } from "@/lib/policies/engine";
import { getCustomerContext } from "@/lib/policies/customer";
import { recordPolicyAudit } from "@/lib/policies/audit";
import { extractOrderFromConversation } from "./extractor";
import { agentTools } from "./execute";
import { agentToolDefinitions } from "./tools";
import type {
  AgentDecision,
  MerchantPolicyInput,
  OrderExtraction,
  PolicyEvaluationResult,
} from "./schemas";

type ConversationWithDetails = Prisma.ConversationGetPayload<{
  include: {
    customer: { include: { metrics: true } };
    messages: true;
    merchant: { include: { policy: true } };
    order: { include: { payments: true } };
  };
}>;

type OrderWithPayments = Prisma.OrderGetPayload<{
  include: { payments: true };
}>;

export type AgentRunResult = {
  orderId: string;
  conversationId: string;
  decision: AgentDecision;
  extraction: OrderExtraction;
  recommendation: PolicyEvaluationResult;
  toolCallsExecuted: number;
  completed: boolean;
};

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (apiKey && apiKey.startsWith("sk-")) {
    return new OpenAI({ apiKey, timeout: 2000, maxRetries: 0 });
  }
  return null;
}

const MAX_TOOL_CALLS = 3;

/**
 * Runs the bounded AI agent runner loop for a conversation.
 *
 * Workflow:
 * 1. Read customer conversation.
 * 2. Load customer history metrics and calculate deterministic risk score.
 * 3. Read merchant policy.
 * 4. Run authoritative Policy Evaluation.
 * 5. Determine next appropriate action via OpenAI Function Calling (or deterministic engine).
 * 6. Record policy audit log.
 * 7. If financial action requires merchant approval and is not pre-approved, stage for approval.
 * 8. Otherwise, invoke approved backend tool with server-side guardrails.
 * 9. Return structured business decision and update order state.
 */
export async function runBoundedAgent(
  conversationId: string,
  options?: {
    approvedAction?: string;
    overrideToolLimit?: number;
  },
): Promise<AgentRunResult> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      customer: { include: { metrics: true } },
      messages: { orderBy: { sentAt: "asc" } },
      merchant: { include: { policy: true } },
      order: {
        include: {
          payments: true,
        },
      },
    },
  });

  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  const merchantPolicy: MerchantPolicyInput = {
    minimumAdvancePercentage: conversation.merchant.policy?.minimumAdvancePercentage ?? 25,
    maximumDiscountPercentage: conversation.merchant.policy?.maximumDiscountPercentage ?? 5,
    allowPartialPayment: conversation.merchant.policy?.allowPartialPayment ?? true,
    allowCredit: conversation.merchant.policy?.allowCredit ?? false,
    newCustomerRequiresAdvance: conversation.merchant.policy?.newCustomerRequiresAdvance ?? true,
    maximumCreditAmount: conversation.merchant.policy?.maximumCreditAmount ?? 25000,
    maximumCreditDays: conversation.merchant.policy?.maximumCreditDays ?? 7,
    highValueOrderThreshold: conversation.merchant.policy?.highValueOrderThreshold ?? 100000,
    highRiskCustomerRequiresAdvance: conversation.merchant.policy?.highRiskCustomerRequiresAdvance ?? true,
    requireApprovalForFinancialActions: conversation.merchant.policy?.requireApprovalForFinancialActions ?? true,
  };

  // 1. Load Customer History Context & Risk
  const customerFullContext = await getCustomerContext(conversation.customer.id);
  const customerHistory = customerFullContext?.metrics ?? null;
  const customerRisk = customerFullContext?.risk ?? {
    score: 100,
    level: "LOW" as const,
    reasons: ["Trusted customer"],
  };

  // 2. Extract or load order structure
  const extraction = await extractOrderFromConversation(
    conversation.messages.map((m) => ({
      role: m.role,
      body: m.body,
      sentAt: m.sentAt,
    })),
    {
      name: conversation.customer.name,
      company: conversation.customer.company,
      phone: conversation.customer.phone,
      isNew: conversation.customer.isNew,
      previousOrderCount: customerHistory?.totalOrders ?? conversation.customer.previousOrderCount,
      onTimePaymentRate: conversation.customer.onTimePaymentRate,
      lastUnitPrice: conversation.customer.lastUnitPrice,
    },
  );

  // 3. Authoritative Policy Strategy Calculation
  const recommendation = evaluatePolicy({
    merchantPolicy,
    order: {
      totalAmount: extraction.totalAmount ?? 0,
      requestedAdvancePercentage: extraction.requestedAdvancePercentage,
      requestedDiscountPercentage: extraction.requestedDiscountPercentage,
      requestedCredit: extraction.requestedCredit,
      requestedCreditDays: extraction.requestedCreditDays,
      customerIsNew: conversation.customer.isNew || (customerHistory?.totalOrders ?? 0) === 0,
      previousOrderCount: customerHistory?.totalOrders ?? conversation.customer.previousOrderCount,
      onTimePaymentRate: conversation.customer.onTimePaymentRate,
      isAmbiguous: extraction.isAmbiguous,
      missingPrice: extraction.missingPrice,
      product: extraction.product,
      quantity: extraction.quantity,
      unitPrice: extraction.unitPrice,
    },
    customer: {
      id: conversation.customer.id,
      name: conversation.customer.name,
      isNew: conversation.customer.isNew,
      previousOrderCount: conversation.customer.previousOrderCount,
      onTimePaymentRate: conversation.customer.onTimePaymentRate,
    },
    customerHistory,
  });

  // Record Policy Audit Trail
  await recordPolicyAudit({
    customerId: conversation.customer.id,
    conversationId: conversation.id,
    actionRequested: recommendation.nextAction,
    evaluation: recommendation,
    customerName: conversation.customer.name,
  });

  // 4. Upsert order in database
  let order = conversation.order;
  let initialStatus: OrderStatus = OrderStatus.QUOTE_CREATED;
  if (extraction.isAmbiguous || extraction.missingPrice) {
    initialStatus = OrderStatus.QUALIFIED;
  }

  const plainReason = generateContextAwareReason({
    customer: conversation.customer,
    customerRisk,
    customerHistory,
    order: {
      totalAmount: extraction.totalAmount ?? 0,
      requestedAdvancePercentage: extraction.requestedAdvancePercentage,
      requestedDiscountPercentage: extraction.requestedDiscountPercentage,
      requestedCredit: extraction.requestedCredit,
    },
    merchantPolicy,
    recommendation,
  });

  if (order) {
    order = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: order.status === OrderStatus.NEW ? initialStatus : order.status,
        intent: extraction.intent,
        products: JSON.stringify(extraction.products),
        quantity: extraction.quantity ?? order.quantity,
        unitPrice: extraction.unitPrice ?? order.unitPrice,
        totalAmount: extraction.totalAmount ?? order.totalAmount,
        requestedAdvancePercentage: extraction.requestedAdvancePercentage,
        recommendedAdvancePercentage: recommendation.recommendedAdvancePercentage,
        recommendedAdvanceAmount: recommendation.recommendedAdvanceAmount,
        remainingAmount:
          order.status === OrderStatus.PARTIALLY_PAID || order.status === OrderStatus.PAID
            ? order.remainingAmount
            : recommendation.remainingAmount,
        requestedDiscountPercentage: extraction.requestedDiscountPercentage,
        requestedCredit: extraction.requestedCredit,
        deliveryDate: extraction.deliveryDate ?? order.deliveryDate,
        customerRequestSummary: extraction.customerRequestSummary,
      },
      include: { payments: true },
    });
  } else {
    order = await prisma.order.create({
      data: {
        conversationId: conversation.id,
        status: initialStatus,
        intent: extraction.intent,
        products: JSON.stringify(extraction.products),
        quantity: extraction.quantity ?? 0,
        unitPrice: extraction.unitPrice ?? 0,
        totalAmount: extraction.totalAmount ?? 0,
        requestedAdvancePercentage: extraction.requestedAdvancePercentage,
        recommendedAdvancePercentage: recommendation.recommendedAdvancePercentage,
        recommendedAdvanceAmount: recommendation.recommendedAdvanceAmount,
        remainingAmount: recommendation.remainingAmount,
        requestedDiscountPercentage: extraction.requestedDiscountPercentage,
        requestedCredit: extraction.requestedCredit,
        deliveryDate: extraction.deliveryDate,
        customerRequestSummary: extraction.customerRequestSummary,
        reason: plainReason,
        nextAction: recommendation.nextAction,
        statusHistory: {
          create: [
            {
              fromStatus: null,
              toStatus: OrderStatus.NEW,
              reason: "Conversation initiated",
              recordedAt: new Date(),
            },
            {
              fromStatus: OrderStatus.NEW,
              toStatus: initialStatus,
              reason: "Order requirements extracted by AI agent",
              recordedAt: new Date(),
            },
          ],
        },
      },
      include: { payments: true },
    });
  }

  // 5. Bounded Agent Execution Loop (max 3 tool calls)
  const maxCalls = options?.overrideToolLimit ?? MAX_TOOL_CALLS;
  let toolCallsExecuted = 0;
  let decision: AgentDecision;

  const openai = getOpenAIClient();

  if (openai) {
    try {
      decision = await runOpenAILoop({
        openai,
        conversation,
        order,
        merchantPolicy,
        extraction,
        recommendation,
        customerContextText: customerFullContext?.summaryText ?? "",
        customerRisk,
        businessReason: plainReason,
        options,
        maxCalls,
      });
      toolCallsExecuted = decision.toolCallsCount;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`OpenAI agent loop failed (${errorMsg}), falling back to deterministic agent runner.`);
      decision = await runDeterministicAgent({
        conversation,
        order,
        merchantPolicy,
        extraction,
        recommendation,
        customerRisk,
        businessReason: plainReason,
        options,
      });
      toolCallsExecuted = decision.toolCallsCount;
    }
  } else {
    decision = await runDeterministicAgent({
      conversation,
      order,
      merchantPolicy,
      extraction,
      recommendation,
      customerRisk,
      businessReason: plainReason,
      options,
    });
    toolCallsExecuted = decision.toolCallsCount;
  }

  // 6. Update Order nextAction and reason with authoritative decision
  await prisma.order.update({
    where: { id: order.id },
    data: {
      nextAction: decision.action,
      reason: decision.decision,
    },
  });

  return {
    orderId: order.id,
    conversationId: conversation.id,
    decision,
    extraction,
    recommendation,
    toolCallsExecuted,
    completed: !decision.requiresApproval,
  };
}

/**
 * Builds concise, explainable business reasoning matching merchant policy and customer risk.
 */
function generateContextAwareReason({
  customer,
  customerRisk,
  customerHistory,
  order,
  merchantPolicy,
  recommendation,
}: {
  customer: { name: string; isNew: boolean; previousOrderCount: number; onTimePaymentRate: number };
  customerRisk: { level: string; reasons: string[] };
  customerHistory: { totalOrders?: number; latePayments?: number; outstandingAmount?: number } | null;
  order: {
    totalAmount: number;
    requestedAdvancePercentage?: number | null;
    requestedDiscountPercentage?: number | null;
    requestedCredit?: boolean;
  };
  merchantPolicy: MerchantPolicyInput;
  recommendation: PolicyEvaluationResult;
}): string {
  const isNew = customer.isNew || (customerHistory?.totalOrders ?? customer.previousOrderCount) === 0;

  if (order.requestedDiscountPercentage != null && order.requestedDiscountPercentage > merchantPolicy.maximumDiscountPercentage) {
    return `Customer requested ${order.requestedDiscountPercentage}% discount. Merchant policy allows maximum ${merchantPolicy.maximumDiscountPercentage}%. Recommended action: REJECT ${order.requestedDiscountPercentage}% DISCOUNT, ALLOW MAXIMUM ${merchantPolicy.maximumDiscountPercentage}%`;
  }

  if (isNew && merchantPolicy.newCustomerRequiresAdvance) {
    return `Customer has no previous order history. Merchant policy requires new customers to provide an advance. Recommended action: REQUEST ${recommendation.recommendedAdvancePercentage}% ADVANCE`;
  }

  if (customerRisk.level === "HIGH") {
    return `Customer has ${customerHistory?.latePayments ?? 3} late payments and ₹${(customerHistory?.outstandingAmount ?? 18000).toLocaleString("en-IN")} outstanding. Credit is rejected. Policy requires advance payment and human approval before fulfillment. Recommended action: REJECT CREDIT, REQUIRE ADVANCE, REQUIRE HUMAN APPROVAL`;
  }

  if (order.requestedCredit && !merchantPolicy.allowCredit) {
    return `Customer requested credit terms. Merchant policy disables credit. Recommended action: REJECT REQUESTED CREDIT TERMS, REQUIRE ${recommendation.recommendedAdvancePercentage}% ADVANCE`;
  }

  if (customerRisk.level === "LOW" && !isNew) {
    const ordersCount = customerHistory?.totalOrders ?? customer.previousOrderCount;
    return `Customer has completed ${ordersCount} previous orders without a late payment. The requested ${recommendation.recommendedAdvancePercentage}% advance satisfies the merchant's ${merchantPolicy.minimumAdvancePercentage}% minimum advance policy. Recommended action: REQUEST ${recommendation.recommendedAdvancePercentage}% ADVANCE`;
  }

  return `Collect a ${recommendation.recommendedAdvancePercentage}% advance (${formatINR(recommendation.recommendedAdvanceAmount)}) to satisfy merchant payment policy.`;
}

/**
 * Deterministic Bounded Agent Executor
 * Evaluates state machine rules, customer history, and executes or stages actions.
 */
async function runDeterministicAgent({
  conversation,
  order,
  merchantPolicy,
  extraction,
  recommendation,
  customerRisk,
  businessReason,
  options,
}: {
  conversation: ConversationWithDetails;
  order: OrderWithPayments;
  merchantPolicy: MerchantPolicyInput;
  extraction: OrderExtraction;
  recommendation: PolicyEvaluationResult;
  customerRisk: { level: string; reasons: string[] };
  businessReason: string;
  options?: { approvedAction?: string };
}): Promise<AgentDecision> {
  let chosenAction = recommendation.nextAction;
  let decisionReason = businessReason;

  if (order.status === OrderStatus.PAID) {
    chosenAction = "updateOrderStatus";
    decisionReason = `Order is fully paid (₹${order.totalAmount.toLocaleString("en-IN")}). Transition to FULFILLED and dispatch items.`;
  } else if (order.status === OrderStatus.PARTIALLY_PAID) {
    chosenAction = "sendPaymentRequest";
    const rem = order.remainingAmount ?? 0;
    decisionReason = `Advance received. Request balance payment of ₹${rem.toLocaleString("en-IN")} on delivery.`;
  } else if (order.status === OrderStatus.FULFILLED) {
    chosenAction = "getPaymentStatus";
    decisionReason = "Order is fulfilled and completed.";
  }

  const metrics = conversation.customer.metrics;
  const ltvFormatted = formatINR(metrics?.totalOrderValue ?? order.totalAmount);
  const contextStr = `${order.quantity}x ${extraction.product} · Total: ₹${order.totalAmount.toLocaleString("en-IN")} · Customer: ${conversation.customer.name} (${customerRisk.level} Risk · ${metrics?.totalOrders ?? conversation.customer.previousOrderCount} orders · ${ltvFormatted} LTV)`;
  const policyStr = `Min Advance: ${merchantPolicy.minimumAdvancePercentage}% · Max Discount: ${merchantPolicy.maximumDiscountPercentage}% · Credit: ${merchantPolicy.allowCredit ? "Allowed" : "Disabled"}`;
  const customerReqStr = extraction.customerRequestSummary || `${order.quantity}x ${extraction.product}`;

  // Check if financial action requires human approval
  const isFinancial = chosenAction === "createPaymentLink";
  const isHighRiskOrHighValue = customerRisk.level === "HIGH" || order.totalAmount >= merchantPolicy.highValueOrderThreshold;
  const requiresApproval =
    isFinancial &&
    (merchantPolicy.requireApprovalForFinancialActions || isHighRiskOrHighValue) &&
    options?.approvedAction !== "createPaymentLink";

  if (requiresApproval) {
    await prisma.activityEvent.create({
      data: {
        conversationId: conversation.id,
        type: "recommend",
        title: "AI recommended createPaymentLink",
        detail: `Waiting for merchant approval: ₹${recommendation.recommendedAdvanceAmount.toLocaleString("en-IN")} (${recommendation.recommendedAdvancePercentage}% advance · ${customerRisk.level} risk)`,
        occurredAt: new Date(),
      },
    });

    return {
      customerRequest: customerReqStr,
      context: contextStr,
      policy: policyStr,
      decision: decisionReason,
      action: chosenAction,
      result: `Staged for merchant approval (₹${recommendation.recommendedAdvanceAmount.toLocaleString("en-IN")} link)`,
      requiresApproval: true,
      approved: false,
      toolCallsCount: 0,
    };
  }

  // Execute approved action
  let resultStr = "Completed";
  let toolCallsCount = 0;

  if (chosenAction === "createPaymentLink") {
    const res = await agentTools.createPaymentLink({
      orderId: order.id,
      amount: recommendation.recommendedAdvanceAmount || order.totalAmount,
      customerName: conversation.customer.name,
      description: `${order.quantity}x ${extraction.product} - Advance Payment`,
    });
    toolCallsCount = 1;
    resultStr = res.success
      ? `Razorpay Payment Link created: ${res.shortUrl} (${res.paymentLinkId})`
      : `Payment Link creation failed: ${res.error}`;
  } else if (chosenAction === "createFollowUp") {
    const res = await agentTools.createFollowUp({
      conversationId: conversation.id,
      note: decisionReason,
      dueAt: order.deliveryDate || "Next business day",
    });
    toolCallsCount = 1;
    resultStr = res.success ? `Follow-up task scheduled (${res.followUpId})` : `Follow-up failed: ${res.error}`;
  } else if (chosenAction === "sendPaymentRequest") {
    const amount = recommendation.recommendedAdvanceAmount || order.remainingAmount || order.totalAmount;
    const msg =
      order.status === OrderStatus.PARTIALLY_PAID
        ? `Hi ${conversation.customer.name}, your order for ${order.quantity}x ${extraction.product} is ready. Please settle the remaining balance of ₹${(order.remainingAmount ?? 0).toLocaleString("en-IN")} on delivery.`
        : `Hi ${conversation.customer.name}, please confirm your order by paying the advance of ₹${amount.toLocaleString("en-IN")}. Policy does not permit credit.`;
    const res = await agentTools.sendPaymentRequest({
      orderId: order.id,
      channel: "whatsapp",
      message: msg,
    });
    toolCallsCount = 1;
    resultStr = res.success ? "Payment request message sent via WhatsApp" : `Message failed: ${res.error}`;
  } else if (chosenAction === "updateOrderStatus") {
    const res = await agentTools.updateOrderStatus({
      orderId: order.id,
      toStatus: OrderStatus.FULFILLED,
      reason: "Order fully paid and dispatched for fulfillment",
    });
    toolCallsCount = 1;
    resultStr = res.success ? "Order status transitioned to FULFILLED" : `Update failed: ${res.error}`;
  }

  return {
    customerRequest: customerReqStr,
    context: contextStr,
    policy: policyStr,
    decision: decisionReason,
    action: chosenAction,
    result: resultStr,
    requiresApproval: false,
    approved: true,
    toolCallsCount,
  };
}

/**
 * OpenAI Multi-Step Tool Calling Loop (Strict max 3 tool calls)
 */
async function runOpenAILoop({
  openai,
  conversation,
  order,
  merchantPolicy,
  extraction,
  recommendation,
  customerContextText,
  customerRisk,
  businessReason,
  options,
  maxCalls,
}: {
  openai: OpenAI;
  conversation: ConversationWithDetails;
  order: OrderWithPayments;
  merchantPolicy: MerchantPolicyInput;
  extraction: OrderExtraction;
  recommendation: PolicyEvaluationResult;
  customerContextText: string;
  customerRisk: { level: string; reasons: string[] };
  businessReason: string;
  options?: { approvedAction?: string };
  maxCalls: number;
}): Promise<AgentDecision> {
  const customer = conversation.customer;
  const systemPrompt = `You are Razorpay Closer's Bounded AI Agent for Indian B2B merchants.
Your role is to inspect the customer conversation, order structure, customer risk history, and merchant policies, and select exactly the right backend action.

CRITICAL SAFETY & GOVERNANCE RULES:
1. You may ONLY call the approved typed tools provided to you: createPaymentLink, getPaymentStatus, updateOrderStatus, sendPaymentRequest, createFollowUp, recordAgentAction.
2. Never hallucinate tools or pass unauthorized fields.
3. Financial Authority: Payment amounts MUST strictly follow the merchant advance policy (${recommendation.recommendedAdvancePercentage}% advance = ₹${recommendation.recommendedAdvanceAmount}).
4. Policy Guardrails:
   - If customer asks for excessive discount (> ${merchantPolicy.maximumDiscountPercentage}%), call createFollowUp to counter-offer.
   - If customer asks for credit and allowCredit=false, call sendPaymentRequest or createPaymentLink to collect advance.
   - If customer is HIGH risk, enforce advance collection and human approval.
   - If order is ambiguous or price missing, call createFollowUp.

Customer History & Risk Profile:
${customerContextText}

Merchant Policy:
- Minimum Advance: ${merchantPolicy.minimumAdvancePercentage}%
- Maximum Discount: ${merchantPolicy.maximumDiscountPercentage}%
- Allow Partial Payment: ${merchantPolicy.allowPartialPayment}
- Allow Credit: ${merchantPolicy.allowCredit}
- Maximum Credit Amount: ₹${merchantPolicy.maximumCreditAmount}
- Maximum Credit Days: ${merchantPolicy.maximumCreditDays} days
- High Value Order Threshold: ₹${merchantPolicy.highValueOrderThreshold}
- New Customer Advance Required: ${merchantPolicy.newCustomerRequiresAdvance}
- High Risk Customer Advance Required: ${merchantPolicy.highRiskCustomerRequiresAdvance}
- Require Approval For Financial Actions: ${merchantPolicy.requireApprovalForFinancialActions}

Order Context:
- Order ID: ${order.id}
- Status: ${order.status}
- Product: ${extraction.product} (${order.quantity} pcs @ ₹${order.unitPrice}/pc)
- Total Amount: ₹${order.totalAmount}
- Recommended Advance Amount: ₹${recommendation.recommendedAdvanceAmount} (${recommendation.recommendedAdvancePercentage}%)
- Remaining Amount: ₹${order.remainingAmount ?? recommendation.remainingAmount}`;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Customer Conversation:\n${conversation.messages.map((m) => `${m.role}: ${m.body}`).join("\n")}\n\nDetermine the next action for Order ${order.id}.`,
    },
  ];

  let toolCallsCount = 0;
  let lastAction: string = recommendation.nextAction;
  let lastResult = "Evaluated";

  while (toolCallsCount < maxCalls) {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools: agentToolDefinitions,
      tool_choice: "auto",
      temperature: 0.1,
    });

    const choice = response.choices[0]?.message;
    if (!choice) break;

    // If no tool call was requested, LLM has finished its reasoning
    if (!choice.tool_calls || choice.tool_calls.length === 0) {
      break;
    }

    const toolCall = choice.tool_calls[0];
    if (toolCall.type !== "function") break;
    const functionName = toolCall.function.name;
    let parsedArgs: Record<string, string | number | undefined> = {};
    try {
      parsedArgs = JSON.parse(toolCall.function.arguments);
    } catch {
      parsedArgs = {};
    }

    lastAction = functionName;

    // Check if financial action requires human approval
    const isFinancial = functionName === "createPaymentLink";
    const isHighRiskOrHighValue = customerRisk.level === "HIGH" || order.totalAmount >= merchantPolicy.highValueOrderThreshold;
    const requiresApproval =
      isFinancial &&
      (merchantPolicy.requireApprovalForFinancialActions || isHighRiskOrHighValue) &&
      options?.approvedAction !== "createPaymentLink";

    if (requiresApproval) {
      await prisma.activityEvent.create({
        data: {
          conversationId: conversation.id,
          type: "recommend",
          title: "AI recommended createPaymentLink",
          detail: `Waiting for merchant approval: ₹${recommendation.recommendedAdvanceAmount.toLocaleString("en-IN")}`,
          occurredAt: new Date(),
        },
      });

      return {
        customerRequest: extraction.customerRequestSummary || `${order.quantity}x ${extraction.product}`,
        context: `${order.quantity}x ${extraction.product} · ₹${order.totalAmount.toLocaleString("en-IN")}`,
        policy: `Min Advance: ${merchantPolicy.minimumAdvancePercentage}%`,
        decision: businessReason,
        action: functionName,
        result: `Staged for merchant approval (₹${recommendation.recommendedAdvanceAmount.toLocaleString("en-IN")})`,
        requiresApproval: true,
        approved: false,
        toolCallsCount,
      };
    }

    // Authoritatively execute the tool
    let executionResult: { success: boolean; error?: string; [key: string]: unknown };
    if (functionName === "createPaymentLink") {
      executionResult = await agentTools.createPaymentLink({
        orderId: order.id,
        amount: recommendation.recommendedAdvanceAmount || order.totalAmount,
        customerName: customer.name,
        description: `${order.quantity}x ${extraction.product} - Advance Payment`,
      });
    } else if (functionName === "updateOrderStatus") {
      executionResult = await agentTools.updateOrderStatus({
        orderId: order.id,
        toStatus: (parsedArgs.toStatus as OrderStatus) || OrderStatus.FULFILLED,
        reason: (parsedArgs.reason as string) || "Order fulfilled",
      });
    } else if (functionName === "sendPaymentRequest") {
      executionResult = await agentTools.sendPaymentRequest({
        orderId: order.id,
        channel: (parsedArgs.channel as "whatsapp" | "sms" | "email") || "whatsapp",
        message: (parsedArgs.message as string) || `Payment request for Order ${order.id}`,
      });
    } else if (functionName === "createFollowUp") {
      executionResult = await agentTools.createFollowUp({
        conversationId: conversation.id,
        note: (parsedArgs.note as string) || businessReason,
        dueAt: (parsedArgs.dueAt as string) || order.deliveryDate || "Next business day",
      });
    } else if (functionName === "getPaymentStatus") {
      const payment = order.payments[0];
      executionResult = await agentTools.getPaymentStatus({
        paymentId: (parsedArgs.paymentId as string) || payment?.razorpayPaymentLinkId || payment?.id || "unknown",
      });
    } else {
      executionResult = { success: false, error: `Unsupported tool: ${functionName}` };
    }

    toolCallsCount++;
    lastResult = executionResult.success
      ? JSON.stringify(executionResult)
      : `Failed: ${executionResult.error}`;

    // Append assistant tool call and tool result to messages for re-evaluation
    messages.push({
      role: "assistant",
      content: null,
      tool_calls: [toolCall],
    });

    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify(executionResult),
    });
  }

  const contextStr = `${order.quantity}x ${extraction.product} · Total: ₹${order.totalAmount.toLocaleString("en-IN")} · Customer: ${customer.name}`;
  const policyStr = `Min Advance: ${merchantPolicy.minimumAdvancePercentage}% · Max Discount: ${merchantPolicy.maximumDiscountPercentage}%`;

  return {
    customerRequest: extraction.customerRequestSummary || `${order.quantity}x ${extraction.product}`,
    context: contextStr,
    policy: policyStr,
    decision: businessReason,
    action: lastAction,
    result: lastResult,
    requiresApproval: false,
    approved: true,
    toolCallsCount,
  };
}

/**
 * Backward compatible analysis helper
 */
export async function analyzeConversationWithAgent(conversationId: string) {
  const result = await runBoundedAgent(conversationId);
  return {
    orderId: result.orderId,
    extraction: result.extraction,
    recommendation: result.recommendation,
    decision: result.decision,
  };
}

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}
