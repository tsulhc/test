import ProviderDetailView from "@/app/providers/provider-detail-view";
import { serializeDashboardData } from "@/lib/dashboard-serialization";
import { getDashboardDataSafe, getDashboardSnapshot, getProviderDailyHistoryLocal, getProviderSupplierBreakdownLocal, primeDashboardRefresh } from "@/lib/pocket";
import type { SerializedDashboardData, SerializedProviderDailyHistoryPoint, SerializedSupplierMember, TimeWindow } from "@/lib/types";

const WINDOWS: TimeWindow[] = ["24h", "7d", "30d"];

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function safelyDecodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function ProviderPage({ params, searchParams }: PageProps) {
  const { providerKey: rawProviderKey } = await params;
  const providerKey = safelyDecodePathSegment(rawProviderKey);
  const resolvedSearchParams = (await searchParams) ?? {};
  const initialWindow = isWindow(resolvedSearchParams.window) ? resolvedSearchParams.window : "24h";

  const initialResult = getDashboardDataSafe(initialWindow);
  const initialData = initialResult.data ? serializeDashboardData(initialResult.data) : null;
  const otherEntries = WINDOWS.filter((window) => window !== initialWindow).map((window) => {
    const snapshot = getDashboardSnapshot(window);
    if (snapshot) {
      primeDashboardRefresh(window);
    }
    return [window, snapshot ? serializeDashboardData(snapshot) : null] as const;
  });
  const dataByWindow = Object.fromEntries([
    [initialWindow, initialData] as const,
    ...otherEntries
  ]) as Record<TimeWindow, SerializedDashboardData | null>;
  const providerDomain = Object.values(dataByWindow)
    .flatMap((data) => data?.providers ?? [])
    .find((provider) => provider.providerKey === providerKey)?.providerDomain ?? providerKey;

  const history = getProviderDailyHistoryLocal(providerDomain).map((point) => ({
    ...point,
    revenueUpokt: point.revenueUpokt.toString()
  })) satisfies SerializedProviderDailyHistoryPoint[];

  const initialSupplierBreakdown = getProviderSupplierBreakdownLocal(providerKey, initialWindow).map((supplier) => ({
    ...supplier,
    revenueUpokt: supplier.revenueUpokt?.toString(),
    stakeUpokt: supplier.stakeUpokt?.toString()
  })) satisfies SerializedSupplierMember[];
  const supplierBreakdownByWindow = Object.fromEntries(
    WINDOWS.map((window) => [window, window === initialWindow ? initialSupplierBreakdown : []] as const)
  ) as Record<TimeWindow, SerializedSupplierMember[]>;

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
