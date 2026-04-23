"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { formatCompactNumber, formatDecimal, formatInteger, formatUsd, formatUpokt } from "@/lib/format";
import type { SerializedDashboardData, SerializedProviderStats } from "@/lib/types";

type SortKey = "revenue" | "relays" | "suppliers" | "services" | "efficiency";

type ProvidersExplorerViewProps = {
  data: SerializedDashboardData | null;
};

function toPoktNumber(value: string): number {
  return Number(BigInt(value)) / 1_000_000;
}

function revenuePerThousandRelays(provider: SerializedProviderStats): number {
  if (provider.relays === 0) return 0;
  return (toPoktNumber(provider.revenueUpokt) / provider.relays) * 1000;
}

function getSortValue(provider: SerializedProviderStats, sort: SortKey): number | bigint {
  switch (sort) {
    case "revenue":
      return BigInt(provider.revenueUpokt);
    case "relays":
      return provider.relays;
    case "suppliers":
      return provider.supplierCount;
    case "services":
      return provider.chainCount;
    case "efficiency":
      return revenuePerThousandRelays(provider);
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

export default function ProvidersExplorerView({ data }: ProvidersExplorerViewProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("revenue");

  const providers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (data?.providers ?? [])
      .filter((provider) => {
        if (!normalizedQuery) return true;
        return [provider.providerLabel, provider.providerDomain, provider.providerKey]
          .some((value) => value.toLowerCase().includes(normalizedQuery));
      })
      .sort((a, b) => compareSortValue(getSortValue(a, sort), getSortValue(b, sort)) || a.providerLabel.localeCompare(b.providerLabel));
  }, [data?.providers, query, sort]);

  if (!data) {
    return (
      <main className="page">
        <section className="panel section explorer-empty">
          <span className="eyebrow">Providers</span>
          <h1 className="section-title">Provider explorer is warming up.</h1>
          <p className="section-subtitle">The 30d dashboard snapshot is still being prepared. Refresh shortly to inspect providers.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page explorer-page">
      <section className="panel section explorer-hero">
        <div>
          <span className="eyebrow">Providers</span>
          <h1>Explore Pocket provider performance.</h1>
          <p className="section-subtitle">
            Search and rank provider domains by revenue, relay volume, supplier footprint, service coverage, and monetization efficiency across the 30d market window.
          </p>
        </div>
        <div className="explorer-summary-grid">
          <article className="explorer-summary-card">
            <span className="hero-highlight-label">Active Providers</span>
            <strong>{formatInteger(data.activeProviders)}</strong>
          </article>
          <article className="explorer-summary-card">
            <span className="hero-highlight-label">Provider Revenue</span>
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
            <span className="hero-highlight-label">Search provider</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Domain, label, or provider key" />
          </label>
          <label className="explorer-select">
            <span className="hero-highlight-label">Sort by</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="revenue">Revenue</option>
              <option value="relays">Relays</option>
              <option value="suppliers">Suppliers</option>
              <option value="services">Services</option>
              <option value="efficiency">Revenue / 1k relays</option>
            </select>
          </label>
        </div>

        <div className="explorer-table-wrap">
          <table className="mini-table explorer-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th className="right">Revenue</th>
                <th className="right">Relays</th>
                <th className="right">Suppliers</th>
                <th className="right">Services</th>
                <th className="right">Rev / 1k Relays</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((provider) => (
                <tr key={provider.providerKey}>
                  <td>
                    <Link href={`/providers/${encodeURIComponent(provider.providerKey)}?window=30d`} className="explorer-primary-link">
                      {provider.providerLabel}
                    </Link>
                    <div className="muted mono">{provider.providerDomain}</div>
                  </td>
                  <td className="right">
                    <strong>{formatUpokt(BigInt(provider.revenueUpokt), 1)}</strong>
                    <div className="muted">{formatUsd(toPoktNumber(provider.revenueUpokt) * data.poktPriceUsd, 0)}</div>
                  </td>
                  <td className="right">{formatInteger(provider.relays)}</td>
                  <td className="right">{formatInteger(provider.supplierCount)}</td>
                  <td className="right">{formatInteger(provider.chainCount)}</td>
                  <td className="right">{formatDecimal(revenuePerThousandRelays(provider), 2)} POKT</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
