import { prisma } from "@/lib/db/client";
import type { PolicyEvaluationResult } from "@/lib/ai/schemas";

export type RecordPolicyAuditInput = {
  orderId?: string | null;
  customerId?: string | null;
  conversationId?: string | null;
  actionRequested: string;
  evaluation: PolicyEvaluationResult;
  customerName?: string;
};

export async function recordPolicyAudit({
  orderId,
  customerId,
  conversationId,
  actionRequested,
  evaluation,
  customerName,
}: RecordPolicyAuditInput) {
  try {
    const row = await prisma.policyAuditLog.create({
      data: {
        orderId: orderId ?? null,
        customerId: customerId ?? null,
        actionRequested,
        policyDecision: evaluation.decision,
        policyVersion: 1,
        reasons: JSON.stringify(evaluation.reasons),
        violations: JSON.stringify(evaluation.violations),
        allowed: evaluation.allowed,
        createdAt: new Date(),
      },
    });

    // Optionally create timeline activity event if conversationId is known
    if (conversationId) {
      const title = evaluation.allowed
        ? `Policy Check: Allowed (${evaluation.decision})`
        : `Policy Check: Violation (${evaluation.violations[0] ?? evaluation.decision})`;
      const detail = `${customerName ? `${customerName} · ` : ""}${evaluation.reasons.join(". ")}`;

      await prisma.activityEvent.create({
        data: {
          conversationId,
          type: "policy",
          title,
          detail,
          occurredAt: new Date(),
        },
      });
    }

    return { success: true, id: row.id };
  } catch (err) {
    console.error("Failed to record policy audit log:", err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
