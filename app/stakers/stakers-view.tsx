"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { formatCompactNumber, formatDecimal, formatInteger, formatPercent, formatUpokt } from "@/lib/format";
import type { SerializedStakerProviderStats } from "@/lib/stakers";

type SortKey = "score" | "apr" | "yield" | "reward" | "stability" | "diversification" | "stake" | "suppliers";

type StakersViewProps = {
  providers: SerializedStakerProviderStats[];
  hasData: boolean;
};

function compareNumber(a: number, b: number): number {
  return b - a;
}

function getSortValue(provider: SerializedStakerProviderStats, sort: SortKey): number | bigint {
  switch (sort) {
    case "score":
      return provider.score;
    case "apr":
      return provider.grossAprPercent;
    case "yield":
      return provider.grossYield30dPercent;
    case "reward":
      return BigInt(provider.rewardPerSupplierUpokt);
    case "stability":
      return provider.stabilityScore;
    case "diversification":
      return provider.diversificationScore;
    case "stake":
      return BigInt(provider.totalStakeUpokt);
    case "suppliers":
      return provider.supplierCount;
  }
}

function compareSortValue(a: number | bigint, b: number | bigint): number {
  if (typeof a === "bigint" || typeof b === "bigint") {
    const left = typeof a === "bigint" ? a : BigInt(Math.trunc(a));
    const right = typeof b === "bigint" ? b : BigInt(Math.trunc(b));
    return right === left ? 0 : right > left ? 1 : -1;
  }

  return compareNumber(a, b);
}

export default function StakersView({ providers, hasData }: StakersViewProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("score");

  const filteredProviders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return providers
      .filter((provider) => {
        if (!normalizedQuery) return true;
        return [provider.providerLabel, provider.providerDomain, provider.providerKey].some((value) => value.toLowerCase().includes(normalizedQuery));
      })
      .sort((a, b) => compareSortValue(getSortValue(a, sort), getSortValue(b, sort)) || a.providerLabel.localeCompare(b.providerLabel));
  }, [providers, query, sort]);

  if (!hasData) {
    return (
      <main className="page">
        <section className="panel section explorer-empty">
          <span className="eyebrow">Stakers</span>
          <h1 className="section-title">Staker view is warming up.</h1>
          <p className="section-subtitle">The 30d supplier and stake snapshot is still being prepared. Refresh shortly to inspect provider yield rankings.</p>
        </section>
      </main>
    );
  }

  const topProvider = filteredProviders[0] ?? providers[0];

  return (
    <main className="page explorer-page">
      <section className="panel section explorer-hero" style={{ overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", inset: "auto -5% -25% auto", width: "34%", height: "140%", background: "radial-gradient(circle, rgba(0, 209, 160, 0.08) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div>
          <span className="eyebrow">Staker Intelligence</span>
          <h1>Where Yield Meets Reliability.</h1>
          <p className="section-subtitle" style={{ fontSize: "1.1rem", maxWidth: "760px" }}>
            Rank providers by historical gross yield on supplier stake, then balance that against stability and chain diversification. This view is designed for stakers comparing where provider-side rewards have been strongest, not as a guarantee of future net APR.
          </p>
        </div>

        <div className="explorer-summary-grid">
          <article className="explorer-summary-card panel-inset" style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
            <span className="hero-highlight-label">Ranked Providers</span>
            <strong style={{ color: "var(--text)" }}>{formatInteger(providers.length)}</strong>
          </article>
          <article className="explorer-summary-card panel-inset" style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
            <span className="hero-highlight-label">Top Gross APR</span>
            <strong style={{ color: "var(--green)" }}>{topProvider ? formatPercent(topProvider.grossAprPercent, 1) : "n/a"}</strong>
          </article>
          <article className="explorer-summary-card panel-inset" style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
            <span className="hero-highlight-label">Leader</span>
            <strong className="summary-card-wrap" style={{ color: "var(--accent)" }} title={topProvider?.providerLabel ?? "n/a"}>{topProvider?.providerLabel ?? "n/a"}</strong>
          </article>
        </div>
      </section>

      <section className="kpi-grid kpi-grid-strong rewards-kpi-grid">
        <article className="panel kpi kpi-primary">
          <span className="kpi-label">Top Composite Score</span>
          <span className="kpi-value">{topProvider ? formatDecimal(topProvider.score, 1) : "n/a"}</span>
          <span className="kpi-foot">Gross APR + stability + diversification</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Leader Reward / Supplier</span>
          <span className="kpi-value">{topProvider ? formatUpokt(BigInt(topProvider.rewardPerSupplierUpokt), 1) : "n/a"}</span>
          <span className="kpi-foot">Settled over the last 30 days</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Leader Stake Base</span>
          <span className="kpi-value">{topProvider ? formatUpokt(BigInt(topProvider.totalStakeUpokt), 0) : "n/a"}</span>
          <span className="kpi-foot">Aggregate supplier stake in ranking model</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Leader Top Chain Share</span>
          <span className="kpi-value" style={{ color: "var(--orange)" }}>{topProvider ? formatPercent(topProvider.topChainSharePercent, 1) : "n/a"}</span>
          <span className="kpi-foot">Lower concentration generally means smoother staker exposure</span>
        </article>
      </section>

      <section className="panel section">
        <div className="explorer-toolbar">
          <div className="explorer-search">
            <span className="hero-highlight-label">Filter Providers</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Domain, label, or address..." />
          </div>
          <div className="explorer-select">
            <span className="hero-highlight-label">Sort Metric</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="score">Composite Score</option>
              <option value="apr">Gross APR</option>
              <option value="yield">30d Gross Yield</option>
              <option value="reward">Reward per Supplier</option>
              <option value="stability">Stability Score</option>
              <option value="diversification">Diversification</option>
              <option value="stake">Stake Base</option>
              <option value="suppliers">Supplier Count</option>
            </select>
          </div>
        </div>

        <div className="explorer-table-wrap">
          <table className="mini-table explorer-table">
            <thead>
              <tr>
                <th style={{ width: '25%' }}>Provider Profile</th>
                <th className="right" style={{ width: '15%' }}>Gross APR</th>
                <th className="right" style={{ width: '18%' }}>Reward/Supplier</th>
                <th className="right" style={{ width: '15%' }}>Stake Base</th>
                <th className="right" style={{ width: '15%' }}>Stability</th>
                <th className="right" style={{ width: '12%' }}>Diversif.</th>
              </tr>
            </thead>
            <tbody>
              {filteredProviders.map((provider) => (
                <tr key={provider.providerKey}>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <Link href={`/providers/${encodeURIComponent(provider.providerKey)}?window=30d`} className="explorer-primary-link">
                        {provider.providerLabel}
                      </Link>
                      <div className="muted mono" style={{ fontSize: "0.7rem", opacity: 0.7 }}>{provider.providerDomain}</div>
                      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                        <span className="eyebrow" style={{ fontSize: '9px', padding: '2px 8px', background: 'var(--panel-strong)', border: '1px solid var(--border)' }}>
                          Score {formatDecimal(provider.score, 1)}
                        </span>
                        <span className="pill" style={{ fontSize: '9px', padding: '2px 8px' }}>
                          {formatInteger(provider.chainCount)} chains
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="right">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <strong className="accent-number" style={{ color: "var(--green)", fontSize: '1.2rem' }}>
                        {formatPercent(provider.grossAprPercent, 1)}
                      </strong>
                      <span className="muted" style={{ fontSize: "0.75rem" }}>{formatPercent(provider.grossYield30dPercent, 2)} / 30d</span>
                    </div>
                  </td>
                  <td className="right">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <strong className="accent-number">{formatUpokt(BigInt(provider.rewardPerSupplierUpokt), 1)}</strong>
                      <span className="muted" style={{ fontSize: "0.75rem" }}>{formatDecimal(provider.runRate30dPokt, 1)} POKT / day</span>
                    </div>
                  </td>
                  <td className="right">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <strong className="accent-number">{formatUpokt(BigInt(provider.totalStakeUpokt), 0)}</strong>
                      <span className="muted" style={{ fontSize: "0.75rem" }}>{formatDecimal(provider.rewardPerStakedPokt30d * 100, 2)} / 100 POKT</span>
                    </div>
                  </td>
                  <td className="right">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                      <div style={{ width: '60px', height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ 
                          width: `${Math.min(100, provider.stabilityScore * 10)}%`, 
                          height: '100%', 
                          background: provider.stabilityScore > 7 ? 'var(--green)' : provider.stabilityScore > 4 ? 'var(--accent)' : 'var(--orange)' 
                        }} />
                      </div>
                      <span className="muted" style={{ fontSize: "0.75rem" }}>{formatDecimal(provider.stabilityScore, 1)} index</span>
                    </div>
                  </td>
                  <td className="right">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                      <div style={{ width: '60px', height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ 
                          width: `${Math.min(100, provider.diversificationScore * 10)}%`, 
                          height: '100%', 
                          background: provider.diversificationScore > 7 ? 'var(--green)' : 'var(--accent)' 
                        }} />
                      </div>
                      <span className="muted" style={{ fontSize: "0.75rem" }}>{formatDecimal(provider.diversificationScore, 1)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section-grid rewards-grid">
        <article className="panel section">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Methodology</h2>
              <p className="section-subtitle">What this ranking measures today.</p>
            </div>
            <span className="pill">Gross Yield</span>
          </div>
          <div className="insight-list">
            <div className="insight-row"><span className="muted">Base Yield</span><strong>30d provider rewards / total supplier stake</strong></div>
            <div className="insight-row"><span className="muted">APR</span><strong>30d gross yield annualized</strong></div>
            <div className="insight-row"><span className="muted">Stability</span><strong>Compares 24h and 7d run rates versus 30d baseline</strong></div>
            <div className="insight-row"><span className="muted">Diversification</span><strong>Rewards spread across services, penalizing concentration</strong></div>
          </div>
        </article>

        <article className="panel section">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Important Caveats</h2>
              <p className="section-subtitle">What is not modeled yet.</p>
            </div>
            <span className="pill">Net Yield</span>
          </div>
          <div className="insight-list">
            <div className="insight-row"><span className="muted">Provider Fees</span><strong>Not deducted from APR</strong></div>
            <div className="insight-row"><span className="muted">PATH QoS</span><strong>Only inferred indirectly through realized rewards</strong></div>
            <div className="insight-row"><span className="muted">Rev Share Signals</span><strong>{topProvider ? formatPercent(topProvider.averageOtherRevSharePercent, 1) : "0%"} average external split on current leader</strong></div>
            <div className="insight-row"><span className="muted">Interpretation</span><strong>Use this as historical provider screening, not guaranteed forward APR</strong></div>
          </div>
        </article>
      </section>

      <section className="panel section">
        <div className="section-title-row">
          <div>
            <h2 className="section-title">Why This Matters For Stakers</h2>
            <p className="section-subtitle">PATH routes more traffic toward higher quality providers, so realized rewards often reflect execution quality as much as raw stake.</p>
          </div>
          <span className="pill">PATH-Aware</span>
        </div>
        <p className="section-subtitle" style={{ marginTop: 0 }}>
          A provider with lower errors, healthier latency, and stronger service coverage can capture more traffic over time. Until public PATH telemetry is integrated directly, this page uses settled supplier rewards as the best observable proxy for how that quality is translating into staker economics.
        </p>
      </section>
    </main>
  );
}
