import type { DashboardData, SerializedDashboardData } from "@/lib/types";

export function serializeDashboardData(data: DashboardData): SerializedDashboardData {
  return {
    ...data,
    totalRevenueUpokt: data.totalRevenueUpokt.toString(),
    providers: data.providers.map((provider) => ({
      ...provider,
      revenueUpokt: provider.revenueUpokt.toString(),
      suppliers: provider.suppliers.map((supplier) => ({
        ...supplier,
        revenueUpokt: supplier.revenueUpokt?.toString()
      })),
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
