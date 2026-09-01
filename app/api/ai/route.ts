import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeConversationWithAgent } from "@/lib/ai/agent";
import { agentTools } from "@/lib/ai/execute";
import { prisma } from "@/lib/db/client";

const requestSchema = z.object({
  conversationId: z.string(),
  action: z.enum(["analyze", "execute"]).default("analyze"),
});

export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const data = requestSchema.parse(raw);

    if (data.action === "analyze") {
      const result = await analyzeConversationWithAgent(data.conversationId);
      return NextResponse.json({ success: true, ...result });
    }

    if (data.action === "execute") {
      const conversation = await prisma.conversation.findUnique({
        where: { id: data.conversationId },
        include: { order: true, customer: true },
      });

      if (!conversation || !conversation.order) {
        return NextResponse.json(
          { error: "No active order found for this conversation" },
          { status: 400 },
        );
      }

      const order = conversation.order;
      const action = order.nextAction;

      let toolResult: unknown;

      if (action === "createPaymentLink") {
        const amount = order.recommendedAdvanceAmount || order.totalAmount;
        toolResult = await agentTools.createPaymentLink({
          orderId: order.id,
          amount,
          customerName: conversation.customer.name,
          description: `${order.quantity}x items - Advance Payment`,
        });
      } else if (action === "createFollowUp") {
        toolResult = await agentTools.createFollowUp({
          conversationId: conversation.id,
          note: order.reason || "Counter-offer within merchant policy",
          dueAt: order.deliveryDate || "Next business day",
        });
      } else if (action === "sendPaymentRequest") {
        const amount = order.recommendedAdvanceAmount || order.remainingAmount || order.totalAmount;
        toolResult = await agentTools.sendPaymentRequest({
          orderId: order.id,
          channel: "whatsapp",
          message: `Payment request: Please confirm advance of ₹${amount.toLocaleString("en-IN")}. Policy does not permit credit.`,
        });
      } else if (action === "updateOrderStatus") {
        toolResult = await agentTools.updateOrderStatus({
          orderId: order.id,
          toStatus: "FULFILLED",
          reason: "Order paid and ready for fulfillment",
        });
      } else {
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
      }

      return NextResponse.json({ success: true, action, result: toolResult });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("AI execution error:", error);
    const message = error instanceof Error ? error.message : "AI agent error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
