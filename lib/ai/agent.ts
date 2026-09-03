import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { evaluatePaymentStrategy } from "@/lib/policies/engine";
import { extractOrderFromConversation } from "./extractor";
import type { OrderExtraction, PaymentRecommendation } from "./schemas";

export type AgentAnalysisResult = {
  orderId: string;
  extraction: OrderExtraction;
  recommendation: PaymentRecommendation;
};

export async function analyzeConversationWithAgent(
  conversationId: string,
): Promise<AgentAnalysisResult> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      customer: true,
      messages: { orderBy: { sentAt: "asc" } },
      merchant: { include: { policy: true } },
      order: true,
    },
  });

  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  const merchantPolicy = conversation.merchant.policy ?? {
    minimumAdvancePercentage: 25,
    maximumDiscountPercentage: 5,
    allowPartialPayment: true,
    allowCredit: false,
    newCustomerRequiresAdvance: true,
  };

  // 1. Extract order structure
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
      previousOrderCount: conversation.customer.previousOrderCount,
      onTimePaymentRate: conversation.customer.onTimePaymentRate,
      lastUnitPrice: conversation.customer.lastUnitPrice,
    },
  );

  // 2. Evaluate merchant policy
  const recommendation = evaluatePaymentStrategy(
    {
      minimumAdvancePercentage: merchantPolicy.minimumAdvancePercentage,
      maximumDiscountPercentage: merchantPolicy.maximumDiscountPercentage,
      allowPartialPayment: merchantPolicy.allowPartialPayment,
      allowCredit: merchantPolicy.allowCredit,
      newCustomerRequiresAdvance: merchantPolicy.newCustomerRequiresAdvance,
    },
    {
      totalAmount: extraction.totalAmount ?? 0,
      requestedAdvancePercentage: extraction.requestedAdvancePercentage,
      requestedDiscountPercentage: extraction.requestedDiscountPercentage,
      requestedCredit: extraction.requestedCredit,
      customerIsNew: conversation.customer.isNew,
      previousOrderCount: conversation.customer.previousOrderCount,
      onTimePaymentRate: conversation.customer.onTimePaymentRate,
    },
  );

  // If ambiguous or missing price, override nextAction to createFollowUp
  let nextAction = recommendation.nextAction;
  let reason = recommendation.reason;
  let orderStatus: OrderStatus = OrderStatus.QUOTE_CREATED;

  if (extraction.isAmbiguous) {
    nextAction = "createFollowUp";
    reason = "Customer request is ambiguous. Follow-up required to clarify products and quantities.";
    orderStatus = OrderStatus.QUALIFIED;
  } else if (extraction.missingPrice) {
    nextAction = "createFollowUp";
    reason = "Unit price was not specified by customer. Send catalog pricing quote.";
    orderStatus = OrderStatus.QUALIFIED;
  }

  // 3. Upsert order in database
  let order = conversation.order;

  if (order) {
    if (order.status === OrderStatus.PAID) {
      nextAction = "updateOrderStatus";
      reason = order.reason || `Full payment of ₹${order.totalAmount.toLocaleString("en-IN")} received. Order ready for fulfillment.`;
    } else if (order.status === OrderStatus.PARTIALLY_PAID) {
      const remaining = order.remainingAmount ?? 0;
      nextAction = "sendPaymentRequest";
      reason = order.reason || `Advance payment received. Next action is to request the remaining ₹${remaining.toLocaleString("en-IN")} against delivery.`;
    } else if (order.status === OrderStatus.FULFILLED) {
      nextAction = "getPaymentStatus";
      reason = "Order has been fulfilled and completed.";
    }

    order = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: order.status === OrderStatus.NEW ? orderStatus : order.status,
        intent: extraction.intent,
        products: JSON.stringify(extraction.products),
        quantity: extraction.quantity ?? 0,
        unitPrice: extraction.unitPrice ?? 0,
        totalAmount: extraction.totalAmount ?? 0,
        requestedAdvancePercentage: extraction.requestedAdvancePercentage,
        recommendedAdvancePercentage: recommendation.recommendedAdvancePercentage,
        recommendedAdvanceAmount: recommendation.recommendedAdvanceAmount,
        remainingAmount: order.status === OrderStatus.PARTIALLY_PAID || order.status === OrderStatus.PAID ? order.remainingAmount : recommendation.remainingAmount,
        requestedDiscountPercentage: extraction.requestedDiscountPercentage,
        requestedCredit: extraction.requestedCredit,
        deliveryDate: extraction.deliveryDate,
        customerRequestSummary: extraction.customerRequestSummary,
        reason,
        nextAction,
      },
    });
  } else {
    order = await prisma.order.create({
      data: {
        conversationId: conversation.id,
        status: orderStatus,
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
        reason,
        nextAction,
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
              toStatus: OrderStatus.QUALIFIED,
              reason: "Order requirements extracted by AI agent",
              recordedAt: new Date(),
            },
            {
              fromStatus: OrderStatus.QUALIFIED,
              toStatus: OrderStatus.QUOTE_CREATED,
              reason: "Quote calculated and policy evaluated",
              recordedAt: new Date(),
            },
          ],
        },
      },
    });
  }

  // 4. Record agent activity events for extraction & policy evaluation
  await prisma.activityEvent.createMany({
    data: [
      {
        conversationId: conversation.id,
        type: "parse",
        title: "AI parsed customer request",
        detail: extraction.customerRequestSummary,
        occurredAt: new Date(),
      },
      {
        conversationId: conversation.id,
        type: "calc",
        title: `Order value calculated: ₹${(extraction.totalAmount ?? 0).toLocaleString("en-IN")}`,
        detail: `${extraction.quantity ?? 0} × ₹${(extraction.unitPrice ?? 0).toLocaleString("en-IN")}`,
        occurredAt: new Date(),
      },
      {
        conversationId: conversation.id,
        type: "policy",
        title: "Merchant policy evaluated",
        detail: `Minimum advance ${merchantPolicy.minimumAdvancePercentage}% · credit ${merchantPolicy.allowCredit ? "allowed" : "disabled"}`,
        occurredAt: new Date(),
      },
      {
        conversationId: conversation.id,
        type: "recommend",
        title: `${recommendation.recommendedAdvancePercentage}% advance recommended`,
        detail: `₹${recommendation.recommendedAdvanceAmount.toLocaleString("en-IN")} now · ₹${recommendation.remainingAmount.toLocaleString("en-IN")} balance`,
        occurredAt: new Date(),
      },
    ],
  });

  return {
    orderId: order.id,
    extraction,
    recommendation,
  };
}
