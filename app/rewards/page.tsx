import Link from "next/link";

import { formatCompactNumber, formatDecimal, formatInteger, formatPercent, formatUsd, formatUpokt } from "@/lib/format";
import { getDashboardDataSafe } from "@/lib/pocket";

export const metadata = {
  title: "Rewards | Pocket Provider Dashboard",
  description: "Provider-side Pocket rewards, methodology, and reward concentration across providers and services."
};

function toPoktNumber(value: bigint): number {
  return Number(value) / 1_000_000;
}

function getShare(part: bigint, total: bigint): number {
  if (total === 0n) return 0;
  return Number((part * 10_000n) / total) / 100;
}

export default function RewardsPage() {
  const result = getDashboardDataSafe("30d");
  const data = result.data;

  if (!data) {
    return (
      <main className="page">
        <section className="panel section explorer-empty">
          <span className="eyebrow">Rewards</span>
          <h1 className="section-title">Rewards view is warming up.</h1>
          <p className="section-subtitle">The 30d reward snapshot is still being prepared. Refresh shortly to inspect provider rewards.</p>
        </section>
      </main>
    );
  }

  const topProvider = data.providers[0];
  const topService = data.services[0];
  const averageReward = data.activeProviders === 0 ? 0 : toPoktNumber(data.totalRevenueUpokt) / data.activeProviders;
  const top5ProviderRewards = data.providers.slice(0, 5).reduce((sum, provider) => sum + provider.revenueUpokt, 0n);
  const top5ServiceRewards = data.services.slice(0, 5).reduce((sum, service) => sum + service.revenueUpokt, 0n);
  const rewardPerRelay = data.totalRelays === 0 ? 0 : (toPoktNumber(data.totalRevenueUpokt) / data.totalRelays) * 1000;

  return (
    <main className="page explorer-page">
      <section className="panel section explorer-hero">
        <div>
          <span className="eyebrow">Rewards</span>
          <h1>Understand provider-side Pocket rewards.</h1>
          <p className="section-subtitle">
            This view focuses on the reward amount that is actually attributable to suppliers, then rolls it up by provider domain and service for a 30d market view.
          </p>
        </div>
        <div className="explorer-summary-grid">
          <article className="explorer-summary-card">
            <span className="hero-highlight-label">Provider Rewards</span>
            <strong>{formatUpokt(data.totalRevenueUpokt, 1)}</strong>
          </article>
          <article className="explorer-summary-card">
            <span className="hero-highlight-label">USD Estimate</span>
            <strong>{formatUsd(toPoktNumber(data.totalRevenueUpokt) * data.poktPriceUsd, 0)}</strong>
          </article>
          <article className="explorer-summary-card">
            <span className="hero-highlight-label">Reward / 1k Relays</span>
            <strong>{formatDecimal(rewardPerRelay, 2)} POKT</strong>
          </article>
        </div>
      </section>

      <section className="kpi-grid kpi-grid-strong rewards-kpi-grid">
        <article className="panel kpi kpi-primary">
          <span className="kpi-label">Average provider reward</span>
          <span className="kpi-value">{formatDecimal(averageReward, 1)} POKT</span>
          <span className="kpi-foot">Across {formatInteger(data.activeProviders)} active providers</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Top provider share</span>
          <span className="kpi-value">{topProvider ? formatPercent(getShare(topProvider.revenueUpokt, data.totalRevenueUpokt), 1) : "n/a"}</span>
          <span className="kpi-foot">{topProvider?.providerLabel ?? "No provider activity"}</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Top 5 provider share</span>
          <span className="kpi-value">{formatPercent(getShare(top5ProviderRewards, data.totalRevenueUpokt), 1)}</span>
          <span className="kpi-foot">Reward concentration among market leaders</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Top service share</span>
          <span className="kpi-value">{topService ? formatPercent(getShare(topService.revenueUpokt, data.totalRevenueUpokt), 1) : "n/a"}</span>
          <span className="kpi-foot">{topService?.serviceName ?? "No service activity"}</span>
        </article>
      </section>

      <section className="section-grid rewards-grid">
        <article className="panel section">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Reward Methodology</h2>
              <p className="section-subtitle">How the dashboard defines provider-side revenue.</p>
            </div>
            <span className="pill">EventClaimSettled</span>
          </div>
          <div className="reward-method-list">
            <div className="reward-method-card">
              <span className="hero-highlight-label">Source event</span>
              <strong>EndBlock settlement events</strong>
              <p>The fallback path reads <code>pocket.tokenomics.EventClaimSettled</code> from block results, not transaction events.</p>
            </div>
            <div className="reward-method-card">
              <span className="hero-highlight-label">Supplier revenue</span>
              <strong>Supplier reward distribution entries</strong>
              <p>Revenue is derived from supplier reward entries in <code>reward_distribution_detailed</code>, not from gross minted value.</p>
            </div>
            <div className="reward-method-card">
              <span className="hero-highlight-label">Current rollup</span>
              <strong>Provider domain aggregation</strong>
              <p>Supplier operators are grouped into provider domains so new providers can benchmark market entities rather than individual nodes only.</p>
            </div>
          </div>
        </article>

        <article className="panel section">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Reward Concentration</h2>
              <p className="section-subtitle">Where provider-side rewards are most concentrated.</p>
            </div>
            <span className="pill">30d</span>
          </div>
          <div className="insight-list">
            <div className="insight-row"><span className="muted">Top 5 providers</span><strong>{formatUpokt(top5ProviderRewards, 1)}</strong></div>
            <div className="insight-row"><span className="muted">Top 5 services</span><strong>{formatUpokt(top5ServiceRewards, 1)}</strong></div>
            <div className="insight-row"><span className="muted">Total relays rewarded</span><strong>{formatCompactNumber(data.totalRelays)}</strong></div>
            <div className="insight-row"><span className="muted">Data source</span><strong>{data.dataSource === "poktscan" ? "Poktscan" : "RPC fallback"}</strong></div>
          </div>
        </article>
      </section>

      <section className="section-grid rewards-grid">
        <article className="panel section">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Top Rewarded Providers</h2>
              <p className="section-subtitle">Provider domains capturing the largest reward pools.</p>
            </div>
            <Link href="/providers" className="calculator-action">Explore Providers</Link>
          </div>
          <table className="mini-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th className="right">Rewards</th>
                <th className="right">Share</th>
              </tr>
            </thead>
            <tbody>
              {data.providers.slice(0, 8).map((provider) => (
                <tr key={provider.providerKey}>
                  <td>
                    <Link href={`/providers/${encodeURIComponent(provider.providerKey)}?window=30d`} className="explorer-primary-link">{provider.providerLabel}</Link>
                    <div className="muted mono">{provider.providerDomain}</div>
                  </td>
                  <td className="right">{formatUpokt(provider.revenueUpokt, 1)}</td>
                  <td className="right">{formatPercent(getShare(provider.revenueUpokt, data.totalRevenueUpokt), 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className="panel section">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Top Rewarded Chains</h2>
              <p className="section-subtitle">Services generating the largest supplier reward pools.</p>
            </div>
            <Link href="/chains" className="calculator-action">Explore Chains</Link>
          </div>
          <table className="mini-table">
            <thead>
              <tr>
                <th>Chain</th>
                <th className="right">Rewards</th>
                <th className="right">Providers</th>
              </tr>
            </thead>
            <tbody>
              {data.services.slice(0, 8).map((service) => (
                <tr key={service.serviceId}>
                  <td>
                    <strong>{service.serviceName}</strong>
                    <div className="muted mono">{service.serviceId}</div>
                  </td>
                  <td className="right">{formatUpokt(service.revenueUpokt, 1)}</td>
                  <td className="right">{formatInteger(service.providerCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </section>
    </main>
  );
}
