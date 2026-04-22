export type TimeWindow = "24h" | "7d" | "30d";

export type ProviderChainStats = {
  serviceId: string;
  serviceName: string;
  relays: number;
  revenueUpokt: bigint;
};

export type SupplierMember = {
  operatorAddress: string;
  ownerAddress: string;
  domain: string;
  relays?: number;
  revenueUpokt?: bigint;
  chainCount?: number;
  detailAvailable?: boolean;
};

export type ProviderStats = {
  providerKey: string;
  providerLabel: string;
  providerDomain: string;
  relays: number;
  revenueUpokt: bigint;
  chainCount: number;
  supplierCount: number;
  suppliers: SupplierMember[];
  chains: ProviderChainStats[];
};

export type ServiceStats = {
  serviceId: string;
  serviceName: string;
  relays: number;
  revenueUpokt: bigint;
  providerCount: number;
};

export type DashboardData = {
  window: TimeWindow;
  generatedAt: string;
  dataSource: "poktscan" | "rpc";
  poktPriceUsd: number;
  latestHeight: number;
  indexerProcessedHeight?: number;
  indexerTargetHeight?: number;
  scannedHeights: number;
  scannedSettlementHeights: number;
  settlementEvents: number;
  earliestSettlementTime: string | null;
  latestSettlementTime: string | null;
  totalRelays: number;
  totalRevenueUpokt: bigint;
  activeProviders: number;
  activeChains: number;
  providers: ProviderStats[];
  services: ServiceStats[];
};

export type ProviderDailyHistoryPoint = {
  day: string;
  relays: number;
  revenueUpokt: bigint;
};

export type SerializedProviderChainStats = Omit<ProviderChainStats, "revenueUpokt"> & {
  revenueUpokt: string;
};

export type SerializedSupplierMember = Omit<SupplierMember, "revenueUpokt"> & {
  revenueUpokt?: string;
};

export type SerializedProviderStats = Omit<ProviderStats, "revenueUpokt" | "chains" | "suppliers"> & {
  revenueUpokt: string;
  suppliers: SerializedSupplierMember[];
  chains: SerializedProviderChainStats[];
};

export type SerializedServiceStats = Omit<ServiceStats, "revenueUpokt"> & {
  revenueUpokt: string;
};

export type SerializedProviderDailyHistoryPoint = Omit<ProviderDailyHistoryPoint, "revenueUpokt"> & {
  revenueUpokt: string;
};

export type SerializedDashboardData = Omit<DashboardData, "totalRevenueUpokt" | "providers" | "services"> & {
  totalRevenueUpokt: string;
  providers: SerializedProviderStats[];
  services: SerializedServiceStats[];
};

export type ServiceMap = Record<string, { name: string }>;

export type SupplierDirectoryEntry = {
  operatorAddress: string;
  ownerAddress: string;
  providerKey: string;
  providerLabel: string;
  providerDomain: string;
};

export type SupplierDirectory = Record<string, SupplierDirectoryEntry>;
