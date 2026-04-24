import Link from "next/link";
import { notFound } from "next/navigation";

import TimeseriesPanel from "@/app/timeseries-panel";
import { formatCompactNumber, formatDecimal, formatInteger, formatPercent, formatUsd, formatUpokt } from "@/lib/format";
import { getDashboardDataSafe, getServiceDailyHistory } from "@/lib/pocket";
import type { ProviderChainStats, ProviderStats } from "@/lib/types";

type PageProps = {
  params: Promise<{
    serviceId: string;
  }>;
};

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

  const history = await getServiceDailyHistory(decodedServiceId);
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
      <section className="panel section explorer-hero">
        <div>
          <span className="eyebrow">Chain Detail</span>
          <h1>{service.serviceName}</h1>
          <p className="section-subtitle mono">{service.serviceId}</p>
          <p className="section-subtitle">
            Analyze 30d provider rewards, relay demand, competition density, and the providers currently monetizing this service.
          </p>
          <div className="window-tabs">
            <Link href="/chains" className="calculator-action provider-back-link">Back to chains</Link>
          </div>
        </div>
        <div className="explorer-summary-grid">
          <article className="explorer-summary-card">
            <span className="hero-highlight-label">Revenue</span>
            <strong>{formatUpokt(service.revenueUpokt, 1)}</strong>
          </article>
          <article className="explorer-summary-card">
            <span className="hero-highlight-label">Relays</span>
            <strong>{formatCompactNumber(service.relays)}</strong>
          </article>
          <article className="explorer-summary-card">
            <span className="hero-highlight-label">Providers</span>
            <strong>{formatInteger(service.providerCount)}</strong>
          </article>
          <article className="explorer-summary-card">
            <span className="hero-highlight-label">Compute Units</span>
            <strong>{service.computeUnits ? formatCompactNumber(service.computeUnits) : "n/a"}</strong>
          </article>
        </div>
      </section>

      <section className="kpi-grid kpi-grid-strong rewards-kpi-grid">
        <article className="panel kpi kpi-primary">
          <span className="kpi-label">Revenue / provider</span>
          <span className="kpi-value">{formatDecimal(revenuePerProvider, 1)} POKT</span>
          <span className="kpi-foot">{formatUsd(revenuePerProvider * data.poktPriceUsd, 0)} average in 30d</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Revenue / 1k relays</span>
          <span className="kpi-value">{formatDecimal(revenuePerThousandRelays, 2)} POKT</span>
          <span className="kpi-foot">Service-level monetization density</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Network reward share</span>
          <span className="kpi-value">{formatPercent(getShare(service.revenueUpokt, data.totalRevenueUpokt), 1)}</span>
          <span className="kpi-foot">Share of total provider rewards</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Top provider</span>
          <span className="kpi-value">{topProvider ? formatPercent(getShare(topProvider.chain.revenueUpokt, service.revenueUpokt), 1) : "n/a"}</span>
          <span className="kpi-foot">{topProvider?.provider.providerLabel ?? "No provider activity"}</span>
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
            <p className="section-subtitle">Provider domains earning the most from this service in the 30d snapshot.</p>
          </div>
          <span className="pill">Top {Math.min(providerRows.length, 12)}</span>
        </div>

        <div className="explorer-table-wrap">
          <table className="mini-table explorer-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th className="right">Revenue</th>
                <th className="right">Relays</th>
                <th className="right">Service Share</th>
                <th className="right">Provider Mix</th>
              </tr>
            </thead>
            <tbody>
              {providerRows.slice(0, 12).map(({ provider, chain }) => (
                <tr key={provider.providerKey}>
                  <td>
                    <Link href={`/providers/${encodeURIComponent(provider.providerKey)}?window=30d`} className="explorer-primary-link">
                      {provider.providerLabel}
                    </Link>
                    <div className="muted mono">{provider.providerDomain}</div>
                  </td>
                  <td className="right">{formatUpokt(chain.revenueUpokt, 1)}</td>
                  <td className="right">{formatInteger(chain.relays)}</td>
                  <td className="right">{formatPercent(getShare(chain.revenueUpokt, service.revenueUpokt), 1)}</td>
                  <td className="right">{formatPercent(getShare(chain.revenueUpokt, provider.revenueUpokt), 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
