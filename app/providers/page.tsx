import ProvidersExplorerView from "@/app/providers/providers-explorer-view";
import { serializeDashboardData } from "@/lib/dashboard-serialization";
import { getDashboardDataSafe } from "@/lib/pocket";

export const metadata = {
  title: "Providers | Pocket Provider Dashboard",
  description: "Search and rank Pocket provider domains by revenue, relays, suppliers, and active services."
};

export default function ProvidersPage() {
  const result = getDashboardDataSafe("30d");
  const data = result.data ? serializeDashboardData(result.data) : null;

  return <ProvidersExplorerView data={data} />;
}
