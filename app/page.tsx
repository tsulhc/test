import DashboardView from "@/app/dashboard-view";
import { warmDashboardData } from "@/lib/pocket";
import type { DashboardData, SerializedDashboardData, TimeWindow } from "@/lib/types";

const WINDOWS: TimeWindow[] = ["24h", "7d", "30d"];

type PageProps = {
  searchParams?: Promise<{
    window?: string;
  }>;
};

function isWindow(value: string | undefined): value is TimeWindow {
  return value === "24h" || value === "7d" || value === "30d";
}

function serializeDashboardData(data: DashboardData): SerializedDashboardData {
  return {
    ...data,
    totalRevenueUpokt: data.totalRevenueUpokt.toString(),
    providers: data.providers.map((provider) => ({
      ...provider,
      revenueUpokt: provider.revenueUpokt.toString(),
      chains: provider.chains.map((chain) => ({
        ...chain,
        revenueUpokt: chain.revenueUpokt.toString()
      }))
    })),
    services: data.services.map((service) => ({
      ...service,
      revenueUpokt: service.revenueUpokt.toString()
    }))
  };
}

export default async function Home({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const initialWindow = isWindow(resolvedSearchParams.window) ? resolvedSearchParams.window : "24h";

  const entries = await Promise.all(
    WINDOWS.map(async (window) => [window, serializeDashboardData(await warmDashboardData(window))] as const)
  );
  const dataByWindow = Object.fromEntries(entries) as Record<TimeWindow, SerializedDashboardData>;

  return <DashboardView initialWindow={initialWindow} dataByWindow={dataByWindow} />;
}
