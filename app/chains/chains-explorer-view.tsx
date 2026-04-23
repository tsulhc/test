"use client";

import { useMemo, useState } from "react";

import { formatCompactNumber, formatDecimal, formatInteger, formatUsd, formatUpokt } from "@/lib/format";
import type { SerializedDashboardData, SerializedServiceStats } from "@/lib/types";

type SortKey = "revenue" | "relays" | "providers" | "revenuePerProvider";

type ChainsExplorerViewProps = {
  data: SerializedDashboardData | null;
};

function toPoktNumber(value: string): number {
  return Number(BigInt(value)) / 1_000_000;
}

function revenuePerProvider(service: SerializedServiceStats): number {
  return toPoktNumber(service.revenueUpokt) / Math.max(service.providerCount, 1);
}

function getSortValue(service: SerializedServiceStats, sort: SortKey): number | bigint {
  switch (sort) {
    case "revenue":
      return BigInt(service.revenueUpokt);
    case "relays":
      return service.relays;
    case "providers":
      return service.providerCount;
    case "revenuePerProvider":
      return revenuePerProvider(service);
  }
}

function compareSortValue(a: number | bigint, b: number | bigint): number {
  if (typeof a === "bigint" || typeof b === "bigint") {
    const aBig = typeof a === "bigint" ? a : BigInt(Math.trunc(a));
    const bBig = typeof b === "bigint" ? b : BigInt(Math.trunc(b));
    return bBig === aBig ? 0 : bBig > aBig ? 1 : -1;
  }

  return b - a;
}

export default function ChainsExplorerView({ data }: ChainsExplorerViewProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("revenue");

  const services = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (data?.services ?? [])
      .filter((service) => {
        if (!normalizedQuery) return true;
        return [service.serviceName, service.serviceId].some((value) => value.toLowerCase().includes(normalizedQuery));
      })
      .sort((a, b) => compareSortValue(getSortValue(a, sort), getSortValue(b, sort)) || a.serviceName.localeCompare(b.serviceName));
  }, [data?.services, query, sort]);

  if (!data) {
    return (
      <main className="page">
        <section className="panel section explorer-empty">
          <span className="eyebrow">Chains</span>
          <h1 className="section-title">Chain explorer is warming up.</h1>
          <p className="section-subtitle">The 30d dashboard snapshot is still being prepared. Refresh shortly to inspect services.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page explorer-page">
      <section className="panel section explorer-hero">
        <div>
          <span className="eyebrow">Chains</span>
          <h1>Find where Pocket demand concentrates.</h1>
          <p className="section-subtitle">
            Rank active services by revenue, relay demand, provider density, and revenue per active provider to spot high-value expansion targets.
          </p>
        </div>
        <div className="explorer-summary-grid">
          <article className="explorer-summary-card">
            <span className="hero-highlight-label">Active Services</span>
            <strong>{formatInteger(data.activeChains)}</strong>
          </article>
          <article className="explorer-summary-card">
            <span className="hero-highlight-label">Revenue Pool</span>
            <strong>{formatUpokt(BigInt(data.totalRevenueUpokt), 1)}</strong>
          </article>
          <article className="explorer-summary-card">
            <span className="hero-highlight-label">Relays</span>
            <strong>{formatCompactNumber(data.totalRelays)}</strong>
          </article>
        </div>
      </section>

      <section className="panel section">
        <div className="explorer-toolbar">
          <label className="explorer-search">
            <span className="hero-highlight-label">Search chain</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Service name or ID" />
          </label>
          <label className="explorer-select">
            <span className="hero-highlight-label">Sort by</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="revenue">Revenue</option>
              <option value="relays">Relays</option>
              <option value="providers">Providers</option>
              <option value="revenuePerProvider">Revenue / provider</option>
            </select>
          </label>
        </div>

        <div className="explorer-table-wrap">
          <table className="mini-table explorer-table">
            <thead>
              <tr>
                <th>Chain</th>
                <th className="right">Revenue</th>
                <th className="right">Relays</th>
                <th className="right">Providers</th>
                <th className="right">Revenue / Provider</th>
                <th className="right">Relay Density</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.serviceId}>
                  <td>
                    <strong>{service.serviceName}</strong>
                    <div className="muted mono">{service.serviceId}</div>
                  </td>
                  <td className="right">
                    <strong>{formatUpokt(BigInt(service.revenueUpokt), 1)}</strong>
                    <div className="muted">{formatUsd(toPoktNumber(service.revenueUpokt) * data.poktPriceUsd, 0)}</div>
                  </td>
                  <td className="right">{formatInteger(service.relays)}</td>
                  <td className="right">{formatInteger(service.providerCount)}</td>
                  <td className="right">{formatDecimal(revenuePerProvider(service), 1)} POKT</td>
                  <td className="right">{formatCompactNumber(service.relays / Math.max(service.providerCount, 1))} relays/provider</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
