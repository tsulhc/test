import Link from "next/link";

import TimeseriesPanel from "@/app/timeseries-panel";
import { formatCompactNumber, formatDecimal, formatInteger, formatPercent, formatUsd, formatUpokt } from "@/lib/format";
import { getDashboardDataSafe, getNetworkDailyHistory } from "@/lib/pocket";

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

function movingAverage(values: number[], windowSize: number): number[] {
  return values.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const slice = values.slice(start, index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });
}

export default async function RewardsPage() {
  const result = getDashboardDataSafe("30d");
  const data = result.data;
  const history = await getNetworkDailyHistory();

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
  const rewardHistoryValues = history.map((point) => toPoktNumber(point.revenueUpokt));
  const rewardHistoryAverage = movingAverage(rewardHistoryValues, 7);
  const rewardHistoryPoints = history.map((point, index) => ({
    label: point.day,
    value: rewardHistoryValues[index] ?? 0,
    secondaryValue: rewardHistoryAverage[index] ?? 0
  }));

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
          <span className="eyebrow">Settlement Analysis</span>
          <h1>Provider Rewards.</h1>
          <p className="section-subtitle" style={{ fontSize: '1.1rem', maxWidth: '600px' }}>
            Inspect finalized provider-side rewards across the ecosystem. Analyze concentration, 
            unit yields, and settlement methodology.
          </p>
        </div>
        
        <div className="explorer-summary-grid">
          <article className="explorer-summary-card panel-inset" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            <span className="hero-highlight-label">Cumulative Rewards</span>
            <strong style={{ color: 'var(--accent)' }}>{formatUpokt(data.totalRevenueUpokt, 1)}</strong>
          </article>
          <article className="explorer-summary-card panel-inset" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            <span className="hero-highlight-label">USD Equivalent</span>
            <strong style={{ color: 'var(--text)' }}>{formatUsd(toPoktNumber(data.totalRevenueUpokt) * data.poktPriceUsd, 0)}</strong>
          </article>
          <article className="explorer-summary-card panel-inset" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            <span className="hero-highlight-label">Yield / 1k Relays</span>
            <strong style={{ color: 'var(--green)' }}>{formatDecimal(rewardPerRelay, 2)} POKT</strong>
          </article>
        </div>
      </section>

      <section className="kpi-grid kpi-grid-strong rewards-kpi-grid">
        <article className="panel kpi kpi-primary">
          <span className="kpi-label">Average Provider Reward</span>
          <span className="kpi-value">{formatDecimal(averageReward, 1)} POKT</span>
          <span className="kpi-foot">Across {formatInteger(data.activeProviders)} active domains</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Top Leader Share</span>
          <span className="kpi-value">{topProvider ? formatPercent(getShare(topProvider.revenueUpokt, data.totalRevenueUpokt), 1) : "n/a"}</span>
          <span className="kpi-foot">{topProvider?.providerLabel ?? "No provider activity"}</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Top 5 Concentration</span>
          <span className="kpi-value">{formatPercent(getShare(top5ProviderRewards, data.totalRevenueUpokt), 1)}</span>
          <span className="kpi-foot">Market share of top 5 entities</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Top Service Share</span>
          <span className="kpi-value" style={{ color: 'var(--accent)' }}>{topService ? formatPercent(getShare(topService.revenueUpokt, data.totalRevenueUpokt), 1) : "n/a"}</span>
          <span className="kpi-foot">{topService?.serviceName ?? "No service activity"}</span>
        </article>
      </section>

      <TimeseriesPanel
        title="Daily Provider Reward Flow"
        subtitle="Provider-side rewards by settlement day, with a 7-day moving average for trend direction."
        eyebrow="Reward Trend"
        points={rewardHistoryPoints}
        valueLabel="rewards"
        formatValue={(value) => `${formatDecimal(value, 1)} POKT`}
        emptyText="Daily reward history is not available yet. Reward concentration tables remain available from the 30d snapshot."
      />

      <section className="section-grid rewards-grid">
        <article className="panel section">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Reward Methodology</h2>
              <p className="section-subtitle">Defining provider-side finalized revenue.</p>
            </div>
            <span className="pill">Settlement</span>
          </div>
          <div className="reward-method-list">
            <div className="reward-method-card panel-inset" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
              <span className="hero-highlight-label">Source Protocol Event</span>
              <strong style={{ fontSize: '1.1rem' }}>EndBlock Claim Settlements</strong>
              <p style={{ fontSize: '0.85rem' }}>Finalized revenue is extracted from <code>pocket.tokenomics.EventClaimSettled</code> results emitted by the protocol during block finalization.</p>
            </div>
            <div className="reward-method-card panel-inset" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
              <span className="hero-highlight-label">Attribution Model</span>
              <strong style={{ fontSize: '1.1rem' }}>Supplier-Direct Allocation</strong>
              <p style={{ fontSize: '0.85rem' }}>The dashboard captures the specific share of the minted POKT that is allocated directly to suppliers, excluding other distribution targets.</p>
            </div>
            <div className="reward-method-card panel-inset" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
              <span className="hero-highlight-label">Market Rollup</span>
              <strong style={{ fontSize: '1.1rem' }}>Provider Domain Grouping</strong>
              <p style={{ fontSize: '0.85rem' }}>Individual supplier operators are aggregated into domain-level groups to provide a clear benchmark for professional market participants.</p>
            </div>
          </div>
        </article>

        <article className="panel section">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Market Concentration</h2>
              <p className="section-subtitle">Finalized 30d reward distribution profile.</p>
            </div>
            <span className="pill">Concentration</span>
          </div>
          <div className="insight-list">
            <div className="insight-row">
              <span className="muted">Top 5 Groups Cumulative</span>
              <strong className="accent-number" style={{ color: 'var(--accent)' }}>{formatUpokt(top5ProviderRewards, 1)}</strong>
            </div>
            <div className="insight-row">
              <span className="muted">Top 5 Services Cumulative</span>
              <strong className="accent-number">{formatUpokt(top5ServiceRewards, 1)}</strong>
            </div>
            <div className="insight-row">
              <span className="muted">Settled Relay Volume</span>
              <strong>{formatCompactNumber(data.totalRelays)} relays</strong>
            </div>
            <div className="insight-row">
              <span className="muted">Intelligence Source</span>
              <strong style={{ color: 'var(--green)' }}>{data.dataSource === "poktscan" ? "Poktscan Verified" : "Direct Node Sync"}</strong>
            </div>
          </div>
        </article>
      </section>

      <section className="section-grid rewards-grid">
        <article className="panel section">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Top Earning Providers</h2>
              <p className="section-subtitle">Domains capturing largest finalized reward pools.</p>
            </div>
            <Link href="/providers" className="calculator-action" style={{ background: 'var(--panel-strong)', border: '1px solid var(--border)', color: 'var(--text)', boxShadow: 'none' }}>
              Registry →
            </Link>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="mini-table">
              <thead>
                <tr>
                  <th>Provider Entity</th>
                  <th className="right">Rewards (30d)</th>
                  <th className="right">Market Mix</th>
                </tr>
              </thead>
              <tbody>
                {data.providers.slice(0, 10).map((provider) => (
                  <tr key={provider.providerKey}>
                    <td>
                      <Link href={`/providers/${encodeURIComponent(provider.providerKey)}?window=30d`} className="explorer-primary-link">
                        {provider.providerLabel}
                      </Link>
                      <div className="muted mono" style={{ fontSize: '0.75rem', marginTop: '4px' }}>{provider.providerDomain}</div>
                    </td>
                    <td className="right">
                      <strong className="accent-number">{formatUpokt(provider.revenueUpokt, 1)}</strong>
                    </td>
                    <td className="right" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      {formatPercent(getShare(provider.revenueUpokt, data.totalRevenueUpokt), 1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel section">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Top Earning Chains</h2>
              <p className="section-subtitle">Services driving highest provider-side monetization.</p>
            </div>
            <Link href="/chains" className="calculator-action" style={{ background: 'var(--panel-strong)', border: '1px solid var(--border)', color: 'var(--text)', boxShadow: 'none' }}>
              Chains →
            </Link>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="mini-table">
              <thead>
                <tr>
                  <th>Service Identity</th>
                  <th className="right">Final Rewards</th>
                  <th className="right">Participants</th>
                </tr>
              </thead>
              <tbody>
                {data.services.slice(0, 10).map((service) => (
                  <tr key={service.serviceId}>
                    <td>
                      <strong style={{ fontSize: '1.05rem' }}>{service.serviceName}</strong>
                      <div className="muted mono" style={{ fontSize: '0.75rem', marginTop: '4px' }}>{service.serviceId}</div>
                    </td>
                    <td className="right">
                      <strong className="accent-number">{formatUpokt(service.revenueUpokt, 1)}</strong>
                    </td>
                    <td className="right">
                      {formatInteger(service.providerCount)} domains
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}
