"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { formatCompactNumber, formatDecimal, formatInteger, formatUsd, formatUpokt } from "@/lib/format";
import { buildAllocatedServiceOpportunity, DEFAULT_NEW_PROVIDER_SUPPLIERS } from "@/lib/opportunities";
import type { SerializedDashboardData, SerializedServiceStats } from "@/lib/types";

type SortKey = "revenue" | "relays" | "computeUnits" | "providers" | "suppliers" | "revenuePerProvider" | "opportunity";

type ChainsExplorerViewProps = {
  data: SerializedDashboardData | null;
};

function toPoktNumber(value: string): number {
  return Number(BigInt(value)) / 1_000_000;
}

function revenuePerProvider(service: SerializedServiceStats): number {
  return toPoktNumber(service.revenueUpokt) / Math.max(service.providerCount, 1);
}

function onboardingOpportunityScore(service: SerializedServiceStats): number {
  return buildAllocatedServiceOpportunity(service, DEFAULT_NEW_PROVIDER_SUPPLIERS, DEFAULT_NEW_PROVIDER_SUPPLIERS).opportunityScore;
}

function getSortValue(service: SerializedServiceStats, sort: SortKey): number | bigint {
  switch (sort) {
    case "revenue":
      return BigInt(service.revenueUpokt);
    case "relays":
      return service.relays;
    case "computeUnits":
      return service.computeUnits ?? 0;
    case "providers":
      return service.providerCount;
    case "suppliers":
      return service.supplierCount ?? 0;
    case "revenuePerProvider":
      return revenuePerProvider(service);
    case "opportunity":
      return onboardingOpportunityScore(service);
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
  const [sort, setSort] = useState<SortKey>("opportunity");

  const services = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (data?.services ?? [])
      .filter((service) => {
        if (!normalizedQuery) return true;
        return [service.serviceName, service.serviceId].some((value) => value.toLowerCase().includes(normalizedQuery));
      })
      .sort((a, b) => compareSortValue(getSortValue(a, sort), getSortValue(b, sort)) || a.serviceName.localeCompare(b.serviceName));
  }, [data?.services, query, sort]);
  const totalComputeUnits = data?.services.reduce((sum, service) => sum + (service.computeUnits ?? 0), 0) ?? 0;

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
          <span className="eyebrow">Service Explorer</span>
          <h1>Chain Intelligence.</h1>
          <p className="section-subtitle" style={{ fontSize: '1.1rem', maxWidth: '600px' }}>
            Identify high-value targets across the decentralized web. Analyze relay demand, provider density, 
            and monetization yield per active service.
          </p>
        </div>
        
        <div className="explorer-summary-grid">
          <article className="explorer-summary-card panel-inset" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            <span className="hero-highlight-label">Active Services</span>
            <strong style={{ color: 'var(--text)' }}>{formatInteger(data.activeChains)}</strong>
          </article>
          <article className="explorer-summary-card panel-inset" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            <span className="hero-highlight-label">Aggregate Pool</span>
            <strong style={{ color: 'var(--accent)' }}>{formatUpokt(BigInt(data.totalRevenueUpokt), 1)}</strong>
          </article>
          <article className="explorer-summary-card panel-inset" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            <span className="hero-highlight-label">Total Traffic</span>
            <strong style={{ color: 'var(--green)' }}>{formatCompactNumber(data.totalRelays)}</strong>
          </article>
        </div>
      </section>

      <section className="panel section">
        <div className="explorer-toolbar">
          <div className="explorer-search">
            <span className="hero-highlight-label">Filter Chains</span>
            <div style={{ position: 'relative' }}>
              <input 
                value={query} 
                onChange={(event) => setQuery(event.target.value)} 
                placeholder="Service name or identity..." 
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
            <span className="hero-highlight-label">Sort Objective</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="opportunity">Entry Opportunity</option>
              <option value="revenue">Total Revenue</option>
              <option value="relays">Relay Volume</option>
              <option value="providers">Provider Density</option>
              <option value="revenuePerProvider">Yield / Provider</option>
              <option value="computeUnits">Compute Units</option>
              <option value="suppliers">Supplier Count</option>
            </select>
          </div>
        </div>

        <div className="explorer-table-wrap">
          <table className="mini-table explorer-table">
            <thead>
              <tr>
                <th>Service Identity</th>
                <th className="right">Revenue (30d)</th>
                <th className="right">Final Relays</th>
                <th className="right">Domains</th>
                <th className="right">Suppliers</th>
                <th className="right">Yield / Domain</th>
                <th className="right">Opportunity</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => {
                const opportunity = buildAllocatedServiceOpportunity(service, DEFAULT_NEW_PROVIDER_SUPPLIERS, DEFAULT_NEW_PROVIDER_SUPPLIERS);

                return (
                <tr key={service.serviceId}>
                  <td>
                    <Link href={`/chains/${encodeURIComponent(service.serviceId)}`} className="explorer-primary-link">
                      {service.serviceName}
                    </Link>
                    <div className="muted mono" style={{ fontSize: '0.75rem', marginTop: '4px' }}>{service.serviceId}</div>
                  </td>
                  <td className="right">
                    <strong className="accent-number" style={{ fontSize: '1.05rem' }}>{formatUpokt(BigInt(service.revenueUpokt), 1)}</strong>
                    <div className="muted" style={{ fontSize: '0.8rem' }}>{formatUsd(toPoktNumber(service.revenueUpokt) * data.poktPriceUsd, 0)}</div>
                  </td>
                  <td className="right">{formatInteger(service.relays)}</td>
                  <td className="right">{formatInteger(service.providerCount)}</td>
                  <td className="right">{formatInteger(service.supplierCount ?? 0)}</td>
                  <td className="right" style={{ color: 'var(--green)', fontWeight: 600 }}>{formatDecimal(revenuePerProvider(service), 1)} POKT</td>
                  <td className="right">
                    <span className={`pill ${opportunity.opportunityScore >= 7 ? 'density-low' : opportunity.opportunityScore >= 4 ? 'density-medium' : 'density-high'}`} style={{ fontSize: '0.7rem' }}>
                      {formatDecimal(opportunity.opportunityScore, 1)} score
                    </span>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
