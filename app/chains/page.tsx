import ChainsExplorerView from "@/app/chains/chains-explorer-view";
import { serializeDashboardData } from "@/lib/dashboard-serialization";
import { getDashboardDataSafe } from "@/lib/pocket";

export const metadata = {
  title: "Chains | Pocket Provider Dashboard",
  description: "Rank Pocket services by revenue, relays, provider density, and expansion opportunity."
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ChainsPage() {
  const result = getDashboardDataSafe("30d");
  const data = result.data ? serializeDashboardData(result.data) : null;

  return <ChainsExplorerView data={data} />;
}
