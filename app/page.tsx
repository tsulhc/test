import DashboardView from "@/app/dashboard-view";
import { serializeDashboardData } from "@/lib/dashboard-serialization";
import { getDashboardDataSafe, getDashboardSnapshot, getNetworkDailyHistory, primeDashboardRefresh } from "@/lib/pocket";
import type { SerializedDashboardData, SerializedNetworkDailyHistoryPoint, TimeWindow } from "@/lib/types";

const WINDOWS: TimeWindow[] = ["24h", "7d", "30d"];

type PageProps = {
  searchParams?: Promise<{
    window?: string;
  }>;
};

function isWindow(value: string | undefined): value is TimeWindow {
  return value === "24h" || value === "7d" || value === "30d";
}

export default async function Home({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const initialWindow = isWindow(resolvedSearchParams.window) ? resolvedSearchParams.window : "24h";

  const initialResult = getDashboardDataSafe(initialWindow);
  const initialData = initialResult.data ? serializeDashboardData(initialResult.data) : null;
  const otherEntries = WINDOWS.filter((window) => window !== initialWindow).map((window) => {
    const snapshot = getDashboardSnapshot(window);
    primeDashboardRefresh(window);
    return [window, snapshot ? serializeDashboardData(snapshot) : null] as const;
  });
  const dataByWindow = Object.fromEntries([
    [initialWindow, initialData] as const,
    ...otherEntries
  ]) as Record<TimeWindow, SerializedDashboardData | null>;
  const networkHistory = (await getNetworkDailyHistory()).map((point) => ({
    ...point,
    revenueUpokt: point.revenueUpokt.toString()
  })) satisfies SerializedNetworkDailyHistoryPoint[];

  return <DashboardView initialWindow={initialWindow} dataByWindow={dataByWindow} networkHistory={networkHistory} />;
}
