import { getDashboardData } from "@/lib/db/queries";
import { MerchantDashboard } from "@/components/dashboard/MerchantDashboard";
import { EmptySetup } from "@/components/dashboard/EmptySetup";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await getDashboardData();
  if (!data) {
    return <EmptySetup />;
  }
  return <MerchantDashboard data={data} />;
}
