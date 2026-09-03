"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { runEvaluation } from "@/lib/evaluation/runner";
import type { FullEvaluationRunOutput } from "@/lib/evaluation/types";

export async function triggerEvaluationAction(): Promise<FullEvaluationRunOutput> {
  const runOutput = await runEvaluation({
    persist: true,
    includeBaseline: true,
  });

  revalidatePath("/dashboard/evaluation");
  return runOutput;
}

export async function getEvaluationRunsList() {
  const runs = await prisma.evaluationRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      startedAt: true,
      completedAt: true,
      totalScenarios: true,
      passedScenarios: true,
      failedScenarios: true,
      overallScore: true,
      policyScore: true,
      actionScore: true,
      amountScore: true,
      unsafeSuggested: true,
      unsafeExecuted: true,
      unsafeBlocked: true,
      humanReviewRate: true,
      precision: true,
      recall: true,
      f1Score: true,
      createdAt: true,
    },
  });

  return runs;
}

export async function getEvaluationRunById(runId: string) {
  const run = await prisma.evaluationRun.findUnique({
    where: { id: runId },
    include: {
      results: {
        orderBy: { scenarioId: "asc" },
      },
    },
  });

  return run;
}
