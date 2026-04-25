import type { SerializedDashboardData, SerializedProviderStats, TimeWindow } from "@/lib/types";

const WINDOW_DAYS: Record<TimeWindow, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30
};

export type SerializedStakerProviderStats = {
  providerKey: string;
  providerLabel: string;
  providerDomain: string;
  supplierCount: number;
  chainCount: number;
  revenue30dUpokt: string;
  totalStakeUpokt: string;
  rewardPerSupplierUpokt: string;
  rewardPerStakedPokt30d: number;
  grossYield30dPercent: number;
  grossAprPercent: number;
  runRate24hPokt: number;
  runRate7dPokt: number;
  runRate30dPokt: number;
  stabilityScore: number;
  diversificationScore: number;
  topChainSharePercent: number;
  averageOtherRevSharePercent: number;
  score: number;
};

function toBigInt(value: string | undefined): bigint {
  return value ? BigInt(value) : 0n;
}

function toPoktNumber(value: bigint | string | undefined): number {
  if (!value) return 0;
  return Number(typeof value === "string" ? BigInt(value) : value) / 1_000_000;
}

function getProviderMap(data: SerializedDashboardData | null | undefined): Map<string, SerializedProviderStats> {
  return new Map((data?.providers ?? []).map((provider) => [provider.providerKey, provider]));
}

function getProviderRunRatePokt(data: SerializedDashboardData | null | undefined, providerKey: string, window: TimeWindow): number {
  const provider = getProviderMap(data).get(providerKey);
  if (!provider) return 0;
  return toPoktNumber(provider.revenueUpokt) / WINDOW_DAYS[window];
}

function getDiversificationScore(provider: SerializedProviderStats): { diversificationScore: number; topChainSharePercent: number } {
  const totalRevenue = toBigInt(provider.revenueUpokt);
  if (totalRevenue <= 0n || provider.chains.length === 0) {
    return { diversificationScore: 0, topChainSharePercent: 0 };
  }

  let hhi = 0;
  let topChainSharePercent = 0;

  for (const chain of provider.chains) {
    const share = Number((toBigInt(chain.revenueUpokt) * 10_000n) / totalRevenue) / 100;
    const normalizedShare = share / 100;
    hhi += normalizedShare * normalizedShare;
    topChainSharePercent = Math.max(topChainSharePercent, share);
  }

  return {
    diversificationScore: Math.max(0, (1 - hhi) * 100),
    topChainSharePercent
  };
}

function getStabilityScore(runRate24hPokt: number, runRate7dPokt: number, runRate30dPokt: number): number {
  if (runRate30dPokt <= 0) return 0;
  const dayDeviation = Math.abs(runRate24hPokt - runRate30dPokt) / runRate30dPokt;
  const weekDeviation = Math.abs(runRate7dPokt - runRate30dPokt) / runRate30dPokt;
  return Math.max(0, 100 - (dayDeviation * 55 + weekDeviation * 45));
}

export function buildStakerProviderStats(dataByWindow: Record<TimeWindow, SerializedDashboardData | null>): SerializedStakerProviderStats[] {
  const data30d = dataByWindow["30d"];

  return (data30d?.providers ?? [])
    .map((provider) => {
      const totalStakeUpokt = provider.suppliers.reduce((sum, supplier) => sum + toBigInt(supplier.stakeUpokt), 0n);
      const revenue30dUpokt = toBigInt(provider.revenueUpokt);
      const rewardPerSupplierUpokt = provider.supplierCount > 0 ? revenue30dUpokt / BigInt(provider.supplierCount) : 0n;
      const grossYield30dPercent = totalStakeUpokt > 0n ? (toPoktNumber(revenue30dUpokt) / toPoktNumber(totalStakeUpokt)) * 100 : 0;
      const grossAprPercent = grossYield30dPercent * (365 / WINDOW_DAYS["30d"]);
      const runRate24hPokt = getProviderRunRatePokt(dataByWindow["24h"], provider.providerKey, "24h");
      const runRate7dPokt = getProviderRunRatePokt(dataByWindow["7d"], provider.providerKey, "7d");
      const runRate30dPokt = getProviderRunRatePokt(dataByWindow["30d"], provider.providerKey, "30d");
      const { diversificationScore, topChainSharePercent } = getDiversificationScore(provider);
      const stabilityScore = getStabilityScore(runRate24hPokt, runRate7dPokt, runRate30dPokt);
      const suppliersWithOtherRevShare = provider.suppliers.filter((supplier) => (supplier.otherRevSharePercent ?? 0) > 0);
      const averageOtherRevSharePercent = suppliersWithOtherRevShare.length > 0
        ? suppliersWithOtherRevShare.reduce((sum, supplier) => sum + (supplier.otherRevSharePercent ?? 0), 0) / suppliersWithOtherRevShare.length
        : 0;
      const score = Math.min(grossAprPercent, 100) * 0.55 + stabilityScore * 0.25 + diversificationScore * 0.2;

      return {
        providerKey: provider.providerKey,
        providerLabel: provider.providerLabel,
        providerDomain: provider.providerDomain,
        supplierCount: provider.supplierCount,
        chainCount: provider.chainCount,
        revenue30dUpokt: revenue30dUpokt.toString(),
        totalStakeUpokt: totalStakeUpokt.toString(),
        rewardPerSupplierUpokt: rewardPerSupplierUpokt.toString(),
        rewardPerStakedPokt30d: totalStakeUpokt > 0n ? toPoktNumber(revenue30dUpokt) / toPoktNumber(totalStakeUpokt) : 0,
        grossYield30dPercent,
        grossAprPercent,
        runRate24hPokt,
        runRate7dPokt,
        runRate30dPokt,
        stabilityScore,
        diversificationScore,
        topChainSharePercent,
        averageOtherRevSharePercent,
        score
      };
    })
    .filter((provider) => provider.totalStakeUpokt !== "0")
    .sort((a, b) => b.score - a.score || b.grossAprPercent - a.grossAprPercent || a.providerLabel.localeCompare(b.providerLabel));
}
