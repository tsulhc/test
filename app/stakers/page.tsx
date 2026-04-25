import StakersView from "@/app/stakers/stakers-view";
import { serializeDashboardData } from "@/lib/dashboard-serialization";
import { getDashboardDataSafe } from "@/lib/pocket";
import { buildStakerProviderStats } from "@/lib/stakers";
import type { SerializedDashboardData, TimeWindow } from "@/lib/types";

export const metadata = {
  title: "Stakers | Pocket Provider Dashboard",
  description: "Rank Pocket providers for stakers using historical gross yield, supplier rewards, and provider stability signals."
};

const WINDOWS: TimeWindow[] = ["24h", "7d", "30d"];

export default function StakersPage() {
  const dataByWindow = Object.fromEntries(
    WINDOWS.map((window) => {
      const result = getDashboardDataSafe(window);
      return [window, result.data ? serializeDashboardData(result.data) : null] as const;
    })
  ) as Record<TimeWindow, SerializedDashboardData | null>;

  return <StakersView providers={buildStakerProviderStats(dataByWindow)} hasData={Boolean(dataByWindow["30d"])} />;
}
