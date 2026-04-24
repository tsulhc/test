import ProviderDetailView from "@/app/providers/provider-detail-view";
import { serializeDashboardData } from "@/lib/dashboard-serialization";
import { getDashboardDataSafe, getDashboardSnapshot, getProviderDailyHistory, getProviderSupplierBreakdown, primeDashboardRefresh } from "@/lib/pocket";
import type { SerializedDashboardData, SerializedProviderDailyHistoryPoint, SerializedSupplierMember, TimeWindow } from "@/lib/types";

const WINDOWS: TimeWindow[] = ["24h", "7d", "30d"];

type PageProps = {
  params: Promise<{
    providerKey: string;
  }>;
  searchParams?: Promise<{
    window?: string;
  }>;
};

function isWindow(value: string | undefined): value is TimeWindow {
  return value === "24h" || value === "7d" || value === "30d";
}

export default async function ProviderPage({ params, searchParams }: PageProps) {
  const { providerKey } = await params;
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

  const history = (await getProviderDailyHistory(providerKey)).map((point) => ({
    ...point,
    revenueUpokt: point.revenueUpokt.toString()
  })) satisfies SerializedProviderDailyHistoryPoint[];

  const supplierBreakdowns = await Promise.all(
    WINDOWS.map(async (window) => {
      const suppliers = await getProviderSupplierBreakdown(providerKey, window);
      return [
        window,
        suppliers.map((supplier) => ({
          ...supplier,
          revenueUpokt: supplier.revenueUpokt?.toString()
        })) satisfies SerializedSupplierMember[]
      ] as const;
    })
  );
  const supplierBreakdownByWindow = Object.fromEntries(supplierBreakdowns) as Record<TimeWindow, SerializedSupplierMember[]>;

  return (
    <ProviderDetailView
      providerKey={providerKey}
      initialWindow={initialWindow}
      dataByWindow={dataByWindow}
      history={history}
      supplierBreakdownByWindow={supplierBreakdownByWindow}
    />
  );
}
