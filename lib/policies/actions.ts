"use server";

import { revalidatePath } from "next/cache";
import { merchantPolicySchema } from "@/lib/ai/schemas";
import { prisma } from "@/lib/db/client";

const MERCHANT_ID = "merchant_stitchline";

export async function updateMerchantPolicy(raw: unknown) {
  const policy = merchantPolicySchema.parse(raw);
  await prisma.merchantPolicy.update({
    where: { merchantId: MERCHANT_ID },
    data: policy,
  });
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings/policies");
}
