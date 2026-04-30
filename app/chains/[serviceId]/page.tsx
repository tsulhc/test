import Link from "next/link";
import { notFound } from "next/navigation";

import TimeseriesPanel from "@/app/timeseries-panel";
import { formatCompactNumber, formatDecimal, formatInteger, formatPercent, formatUsd, formatUpokt } from "@/lib/format";
import { getDashboardDataSafe, getServiceDailyHistoryLocal } from "@/lib/pocket";
import type { ProviderChainStats, ProviderStats } from "@/lib/types";

type PageProps = {
  params: Promise<{
    serviceId: string;
  }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProviderServiceRow = {
  provider: ProviderStats;
  chain: ProviderChainStats;
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

export async function generateMetadata({ params }: PageProps) {
  const { serviceId } = await params;
  const decodedServiceId = decodeURIComponent(serviceId);

  return {
    title: `${decodedServiceId} | Pocket Chain Detail`,
    description: `Pocket provider revenue, relay demand, and provider leaderboard for ${decodedServiceId}.`
  };
}

export default async function ChainDetailPage({ params }: PageProps) {
  const { serviceId } = await params;
  const decodedServiceId = decodeURIComponent(serviceId);
  const result = getDashboardDataSafe("30d");
  const data = result.data;

  if (!data) {
    return (
      <main className="page">
        <section className="panel section explorer-empty">
          <span className="eyebrow">Chain Detail</span>
          <h1 className="section-title">Chain detail is warming up.</h1>
          <p className="section-subtitle">The 30d market snapshot is still being prepared. Refresh shortly to inspect this service.</p>
          <Link href="/chains" className="calculator-action provider-back-link">Back to chains</Link>
        </section>
      </main>
    );
  }

  const service = data.services.find((entry) => entry.serviceId === decodedServiceId);
  if (!service) {
    notFound();
  }

  const history = getServiceDailyHistoryLocal(decodedServiceId);
  const historyValues = history.map((point) => toPoktNumber(point.revenueUpokt));
  const historyAverage = movingAverage(historyValues, 7);
  const historyPoints = history.map((point, index) => ({
    label: point.day,
    value: historyValues[index] ?? 0,
    secondaryValue: historyAverage[index] ?? 0
  }));
  const providerRows = data.providers
    .flatMap<ProviderServiceRow>((provider) => {
      const chain = provider.chains.find((entry) => entry.serviceId === decodedServiceId);
      return chain ? [{ provider, chain }] : [];
    })
    .sort((a, b) => b.chain.revenueUpokt === a.chain.revenueUpokt ? b.chain.relays - a.chain.relays : b.chain.revenueUpokt > a.chain.revenueUpokt ? 1 : -1);
  const topProvider = providerRows[0];
  const revenuePerProvider = toPoktNumber(service.revenueUpokt) / Math.max(service.providerCount, 1);
  const revenuePerThousandRelays = service.relays === 0 ? 0 : (toPoktNumber(service.revenueUpokt) / service.relays) * 1000;

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
          <span className="eyebrow">Chain Profile</span>
          <h1>{service.serviceName}</h1>
          <p className="section-subtitle mono" style={{ fontSize: '0.9rem' }}>{service.serviceId}</p>
          <p className="section-subtitle" style={{ fontSize: '1.1rem', maxWidth: '600px', marginTop: '12px' }}>
            Analyze specialized demand, unit yields, and the provider leaderboard for this specific service.
          </p>
          <div className="window-tabs" style={{ marginTop: '24px' }}>
            <Link href="/chains" className="calculator-action" style={{ background: 'var(--panel-strong)', border: '1px solid var(--border)', color: 'var(--text)', boxShadow: 'none' }}>
              Back to Explorer
            </Link>
          </div>
        </div>
        
        <div className="explorer-summary-grid">
          <article className="explorer-summary-card panel-inset" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            <span className="hero-highlight-label">Service Revenue</span>
            <strong style={{ color: 'var(--accent)' }}>{formatUpokt(service.revenueUpokt, 1)}</strong>
          </article>
          <article className="explorer-summary-card panel-inset" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            <span className="hero-highlight-label">Final Relays</span>
            <strong style={{ color: 'var(--green)' }}>{formatCompactNumber(service.relays)}</strong>
          </article>
          <article className="explorer-summary-card panel-inset" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            <span className="hero-highlight-label">Active Domains</span>
            <strong style={{ color: 'var(--text)' }}>{formatInteger(service.providerCount)}</strong>
          </article>
          <article className="explorer-summary-card panel-inset" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            <span className="hero-highlight-label">Live Suppliers</span>
            <strong style={{ color: 'var(--accent)' }}>{formatInteger(service.supplierCount ?? 0)}</strong>
          </article>
        </div>
      </section>

      <section className="kpi-grid kpi-grid-strong rewards-kpi-grid">
        <article className="panel kpi kpi-primary">
          <span className="kpi-label">Yield / active domain</span>
          <span className="kpi-value">{formatDecimal(revenuePerProvider, 1)} POKT</span>
          <span className="kpi-foot">{formatUsd(revenuePerProvider * data.poktPriceUsd, 0)} per domain (30d)</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Monetization density</span>
          <span className="kpi-value" style={{ color: 'var(--accent)' }}>{formatDecimal(revenuePerThousandRelays, 2)} POKT</span>
          <span className="kpi-foot">Revenue per 1,000 relays</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Market influence</span>
          <span className="kpi-value">{formatPercent(getShare(service.revenueUpokt, data.totalRevenueUpokt), 1)}</span>
          <span className="kpi-foot">Share of total network rewards</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Top domain focus</span>
          <span className="kpi-value" style={{ color: 'var(--green)' }}>{topProvider ? formatPercent(getShare(topProvider.chain.revenueUpokt, service.revenueUpokt), 1) : "n/a"}</span>
          <span className="kpi-foot">{topProvider?.provider.providerLabel ?? "No activity"}</span>
        </article>
      </section>

      <TimeseriesPanel
        title="Service Reward Trend"
        subtitle="Daily provider-side rewards for this service with a 7-day moving average."
        eyebrow="Service Trend"
        points={historyPoints}
        valueLabel="rewards"
        formatValue={(value) => `${formatDecimal(value, 1)} POKT`}
        emptyText="Daily service history is not available yet. The 30d service snapshot remains available above."
      />

      <section className="panel section">
        <div className="section-title-row">
          <div>
            <h2 className="section-title">Top Providers on This Chain</h2>
            <p className="section-subtitle">Domains earning the most from this specific service in 30d.</p>
          </div>
          <span className="pill">Leaderboard</span>
        </div>

        <div className="explorer-table-wrap">
          <table className="mini-table explorer-table">
            <thead>
              <tr>
                <th>Provider Entity</th>
                <th className="right">Revenue (30d)</th>
                <th className="right">Final Relays</th>
                <th className="right">Service Share</th>
                <th className="right">Provider Mix</th>
              </tr>
            </thead>
            <tbody>
              {providerRows.slice(0, 15).map(({ provider, chain }) => (
                <tr key={provider.providerKey}>
                  <td>
                    <Link href={`/providers/${encodeURIComponent(provider.providerKey)}?window=30d`} className="explorer-primary-link">
                      {provider.providerLabel}
                    </Link>
                    <div className="muted mono" style={{ fontSize: '0.75rem', marginTop: '4px' }}>{provider.providerDomain}</div>
                  </td>
                  <td className="right">
                    <strong className="accent-number">{formatUpokt(chain.revenueUpokt, 1)}</strong>
                  </td>
                  <td className="right">{formatInteger(chain.relays)}</td>
                  <td className="right" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                    {formatPercent(getShare(chain.revenueUpokt, service.revenueUpokt), 1)}
                  </td>
                  <td className="right">
                    {formatPercent(getShare(chain.revenueUpokt, provider.revenueUpokt), 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
