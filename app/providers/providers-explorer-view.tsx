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
      <section className="panel section explorer-hero" style={{ overflow: 'hidden', position: 'relative' }}>
        <div style={{ 
          position: 'absolute', 
          top: '-10%', 
          right: '-5%', 
          width: '30%', 
          height: '120%', 
          background: 'radial-gradient(circle, rgba(0, 194, 255, 0.05) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />
        
        <div>
          <span className="eyebrow">Provider Registry</span>
          <h1>Ecosystem Intelligence.</h1>
          <p className="section-subtitle" style={{ fontSize: '1.1rem', maxWidth: '600px' }}>
            Benchmark infrastructure performance across the network. Rank by revenue, efficiency, and service coverage.
          </p>
        </div>
        
        <div className="explorer-summary-grid">
          <article className="explorer-summary-card panel-inset" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            <span className="hero-highlight-label">Registered Domains</span>
            <strong style={{ color: 'var(--text)' }}>{formatInteger(data.activeProviders)}</strong>
          </article>
          <article className="explorer-summary-card panel-inset" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            <span className="hero-highlight-label">Cumulative Revenue</span>
            <strong style={{ color: 'var(--accent)' }}>{formatUpokt(BigInt(data.totalRevenueUpokt), 1)}</strong>
          </article>
          <article className="explorer-summary-card panel-inset" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            <span className="hero-highlight-label">Relay Volume</span>
            <strong style={{ color: 'var(--green)' }}>{formatCompactNumber(data.totalRelays)}</strong>
          </article>
        </div>
      </section>

      <section className="panel section">
        <div className="explorer-toolbar">
          <div className="explorer-search">
            <span className="hero-highlight-label">Filter Providers</span>
            <div style={{ position: 'relative' }}>
              <input 
                value={query} 
                onChange={(event) => setQuery(event.target.value)} 
                placeholder="Domain, label, or address..." 
                style={{ paddingLeft: '40px' }}
              />
              <svg 
                style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', opacity: 0.5 }}
                width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
          </div>
          
          <div className="explorer-select">
            <span className="hero-highlight-label">Sort Metric</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="revenue">Total Revenue</option>
              <option value="relays">Relay Volume</option>
              <option value="suppliers">Supplier Footprint</option>
              <option value="services">Service Coverage</option>
              <option value="efficiency">Unit Efficiency (1k Relays)</option>
            </select>
          </div>
        </div>

        <div className="explorer-table-wrap">
          <table className="mini-table explorer-table">
            <thead>
              <tr>
                <th>Provider Domain</th>
                <th className="right">Revenue (30d)</th>
                <th className="right">Final Relays</th>
                <th className="right">Suppliers</th>
                <th className="right">Chains</th>
                <th className="right">Efficiency</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((provider) => (
                <tr key={provider.providerKey}>
                  <td>
                    <Link href={`/providers/${encodeURIComponent(provider.providerKey)}?window=30d`} className="explorer-primary-link">
                      {provider.providerLabel}
                    </Link>
                    <div className="muted mono" style={{ fontSize: '0.75rem', marginTop: '4px' }}>{provider.providerDomain}</div>
                  </td>
                  <td className="right">
                    <strong className="accent-number" style={{ fontSize: '1.05rem' }}>{formatUpokt(BigInt(provider.revenueUpokt), 1)}</strong>
                    <div className="muted" style={{ fontSize: '0.8rem' }}>{formatUsd(toPoktNumber(provider.revenueUpokt) * data.poktPriceUsd, 0)}</div>
                  </td>
                  <td className="right">{formatInteger(provider.relays)}</td>
                  <td className="right">{formatInteger(provider.supplierCount)}</td>
                  <td className="right">{formatInteger(provider.chainCount)}</td>
                  <td className="right" style={{ color: 'var(--green)', fontWeight: 600 }}>{formatDecimal(revenuePerThousandRelays(provider), 2)} POKT</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
