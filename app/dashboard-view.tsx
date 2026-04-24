"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

import RevenueCalculator from "@/app/revenue-calculator";
import TimeseriesPanel from "@/app/timeseries-panel";
import {
  formatCompactNumber,
  formatDecimal,
  formatInteger,
  formatPercent,
  formatRelativeRange,
  formatUsd,
  formatUpokt
} from "@/lib/format";
import type {
  SerializedDashboardData,
  SerializedNetworkDailyHistoryPoint,
  SerializedProviderStats,
  SerializedServiceStats,
  TimeWindow
} from "@/lib/types";

const WINDOWS: TimeWindow[] = ["24h", "7d", "30d"];

type DashboardViewProps = {
  initialWindow: TimeWindow;
  dataByWindow: Record<TimeWindow, SerializedDashboardData | null>;
  networkHistory: SerializedNetworkDailyHistoryPoint[];
};

type DashboardApiResponse = SerializedDashboardData | { status: "warming" | "ready" };

function toBigInt(value: string): bigint {
  return BigInt(value);
}

function toPoktNumber(value: string): number {
  return Number(toBigInt(value)) / 1_000_000;
}

function toUsdFromUpokt(value: string, poktPriceUsd: number): number {
  return toPoktNumber(value) * poktPriceUsd;
}

function getShare(part: string | number, total: string | number): number {
  if (typeof part === "string" || typeof total === "string") {
    const totalBig = typeof total === "string" ? BigInt(total) : BigInt(total);
    const partBig = typeof part === "string" ? BigInt(part) : BigInt(part);
    if (totalBig === 0n) return 0;
    return Number((partBig * 10_000n) / totalBig) / 100;
  }

  if (total === 0) return 0;
  return (part / total) * 100;
}

function median(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function movingAverage(values: number[], windowSize: number): number[] {
  return values.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const slice = values.slice(start, index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });
}

function HeroBars({ providers, window }: { providers: SerializedProviderStats[]; window: TimeWindow }) {
  const topProviders = providers.slice(0, 6);
  const maxRevenue = topProviders[0]?.revenueUpokt ?? "0";

  return (
    <div className="hero-bars">
      {topProviders.map((provider, index) => {
        const width = maxRevenue === "0" ? 0 : Math.max(8, Math.round((Number(provider.revenueUpokt) / Number(maxRevenue)) * 100));

        return (
          <Link key={provider.providerKey} href={`/providers/${encodeURIComponent(provider.providerKey)}?window=${window}`} className="hero-bar-row hero-bar-link">
            <div className="hero-bar-meta">
              <span className="eyebrow" style={{ marginBottom: 0 }}>#{index + 1}</span>
              <strong style={{ fontSize: '0.95rem' }}>{provider.providerLabel}</strong>
              <span className="provider-link-cue">Analysis →</span>
            </div>
            <div className="hero-bar-track">
              <div className="hero-bar-fill" style={{ width: `${width}%` }} />
            </div>
            <div className="provider-link-end">
              <strong className="accent-number">{formatUpokt(toBigInt(provider.revenueUpokt), 1)}</strong>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function DonutMeter({ value, label, detail, icon }: { value: number; label: string; detail: string; icon?: React.ReactNode }) {
  const degrees = Math.max(0, Math.min(360, Math.round((value / 100) * 360)));

  return (
    <div className="donut-card">
      <div
        className="donut-ring"
        style={{
          background: `conic-gradient(from 220deg, var(--accent) 0deg, var(--accent-strong) ${degrees}deg, rgba(255,255,255,0.05) ${degrees}deg 360deg)`
        }}
      >
        <div className="donut-inner">
          {icon && <div style={{ color: 'var(--accent)', marginBottom: '4px' }}>{icon}</div>}
          <strong>{formatPercent(value, 1)}</strong>
          <span>{label}</span>
        </div>
      </div>
      <p className="muted" style={{ fontSize: '0.85rem', marginTop: '12px' }}>{detail}</p>
    </div>
  );
}

function ProviderRevenueChart({
  providers,
  totalRevenue,
  poktPriceUsd
}: {
  providers: SerializedProviderStats[];
  totalRevenue: string;
  poktPriceUsd: number;
}) {
  const topProviders = providers.slice(0, 8);
  const maxRevenue = topProviders[0]?.revenueUpokt ?? "0";

  return (
    <div className="chart-list">
      {topProviders.map((provider, index) => {
        const width = maxRevenue === "0" ? 0 : Math.max(6, Math.round((Number(provider.revenueUpokt) / Number(maxRevenue)) * 100));
        const share = getShare(provider.revenueUpokt, totalRevenue);

        return (
          <div key={provider.providerKey} className="chart-row">
            <div className="chart-row-head">
              <div>
                <strong style={{ fontSize: '1.05rem' }}>#{index + 1} {provider.providerLabel}</strong>
                <div className="muted mono">{provider.providerDomain}</div>
              </div>
              <div className="right">
                <strong className="accent-number" style={{ fontSize: '1.1rem' }}>{formatUpokt(toBigInt(provider.revenueUpokt), 1)}</strong>
                <div className="muted" style={{ fontSize: '0.85rem' }}>{formatUsd(toUsdFromUpokt(provider.revenueUpokt, poktPriceUsd), 0)} · {formatPercent(share, 1)} share</div>
              </div>
            </div>
            <div className="chart-track" style={{ marginTop: '12px' }}>
              <div className="chart-fill" style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OpportunityMap({ services, totalRevenue }: { services: SerializedServiceStats[]; totalRevenue: string }) {
  const topServices = services.slice(0, 8);
  const maxOpportunity = Math.max(
    ...topServices.map((service) => toPoktNumber(service.revenueUpokt) / Math.max(service.providerCount, 1)),
    1
  );

  return (
    <div className="opportunity-grid">
      {topServices.map((service) => {
        const revenuePokt = toPoktNumber(service.revenueUpokt);
        const perProvider = revenuePokt / Math.max(service.providerCount, 1);
        const width = Math.max(10, Math.round((perProvider / maxOpportunity) * 100));
        const share = getShare(service.revenueUpokt, totalRevenue);
        const density = service.providerCount <= 2 ? "low" : service.providerCount <= 5 ? "medium" : "high";

        return (
          <div key={service.serviceId} className="opportunity-card">
            <div className="opportunity-head">
              <div>
                <strong style={{ fontSize: '1.1rem' }}>{service.serviceName}</strong>
                <div className="muted mono">{service.serviceId}</div>
              </div>
              <span className={`density density-${density}`}>
                {service.providerCount} {service.providerCount === 1 ? "provider" : "providers"}
              </span>
            </div>
            <div className="opportunity-metric-row" style={{ marginTop: '16px' }}>
              <span className="muted">Total revenue</span>
              <strong className="accent-number">{formatUpokt(toBigInt(service.revenueUpokt), 1)}</strong>
            </div>
            <div className="opportunity-metric-row">
              <span className="muted">Revenue per provider</span>
              <strong className="accent-number" style={{ color: 'var(--green)' }}>{formatDecimal(perProvider, 1)} POKT</strong>
            </div>
            <div className="opportunity-track" style={{ margin: '16px 0' }}>
              <div className="opportunity-fill" style={{ width: `${width}%` }} />
            </div>
            <div className="opportunity-foot">
              <span>{formatInteger(service.relays)} relays</span>
              <span>{formatPercent(share, 1)} market share</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardView({ initialWindow, dataByWindow, networkHistory }: DashboardViewProps) {
  const [datasets, setDatasets] = useState<Record<TimeWindow, SerializedDashboardData | null>>(dataByWindow);
  const [window, setWindow] = useState<TimeWindow>(initialWindow);
  const [isPending, startTransition] = useTransition();
  const data = useMemo(() => datasets[window] ?? datasets[initialWindow], [datasets, initialWindow, window]);

  function loadWindow(entry: TimeWindow, activate = false) {
    if (datasets[entry]) {
      if (activate) {
        setWindow(entry);
      }
      return;
    }

    void fetch(`/api/dashboard?window=${entry}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok && response.status !== 202) {
          return null;
        }

        return (await response.json()) as DashboardApiResponse;
      })
      .then((payload) => {
        if (!payload || "status" in payload) {
          return;
        }

        startTransition(() => {
          setDatasets((current) => ({ ...current, [entry]: payload }));
          if (activate) {
            setWindow(entry);
          }
        });
      })
      .catch(() => {
        // Leave the current view in place if this background request fails.
      });
  }

  useEffect(() => {
    const missingWindows = WINDOWS.filter((entry) => !datasets[entry]);
    if (missingWindows.length === 0) {
      return;
    }

    for (const entry of missingWindows) {
      loadWindow(entry, false);
    }
  }, [datasets]);

  if (!data) {
    return (
      <main className="page">
        <section className="hero hero-stack">
          <div className="panel hero-showcase">
            <div className="hero-main">
              <div className="hero-copy hero-copy-strong">
                <span className="eyebrow">Pocket Network</span>
                <h1>Fuel the Unstoppable. Become a Pocket Provider.</h1>
                <p>
                  Real-time market intelligence to guide your infrastructure journey. Analyze revenue trends, relay
                  demand, and competitive landscapes to identify where your node capacity can make the most impact.
                </p>

                <div className="window-tabs" aria-label="time windows">
                  {WINDOWS.map((entry) => {
                    const active = entry === window;
                    return (
                      <button
                        key={entry}
                        type="button"
                        className={`window-tab${active ? " active" : ""}`}
                        onClick={() => loadWindow(entry, true)}
                      >
                        {entry}
                      </button>
                    );
                  })}
                </div>
              </div>

              <aside className="hero-side panel panel-inset">
                <div className="section-title-row compact-gap">
                  <h2 className="section-title">Status</h2>
                  <span className="pill">Calibrating market data</span>
                </div>
                <div className="insight-list">
                  <div className="insight-row">
                    <span className="muted">Initial dataset</span>
                    <strong>Refreshing in background</strong>
                  </div>
                  <div className="insight-row">
                    <span className="muted">Experience mode</span>
                    <strong>Instant shell, no blocking</strong>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const topProvider = data.providers[0];
  const topService = data.services[0];
  const averageRevenuePerProvider = data.activeProviders === 0 ? 0 : toPoktNumber(data.totalRevenueUpokt) / data.activeProviders;
  const medianRevenuePerProvider = median(data.providers.map((provider) => toPoktNumber(provider.revenueUpokt)));
  const revenuePerThousandRelays = data.totalRelays === 0 ? 0 : (toPoktNumber(data.totalRevenueUpokt) / data.totalRelays) * 1000;
  const topProviderShare = topProvider ? getShare(topProvider.revenueUpokt, data.totalRevenueUpokt) : 0;
  const top5ProviderShare = getShare(
    data.providers.slice(0, 5).reduce((sum, provider) => sum + BigInt(provider.revenueUpokt), 0n).toString(),
    data.totalRevenueUpokt
  );
  const top5ServiceShare = getShare(
    data.services.slice(0, 5).reduce((sum, service) => sum + BigInt(service.revenueUpokt), 0n).toString(),
    data.totalRevenueUpokt
  );
  const totalRevenueUsd = toUsdFromUpokt(data.totalRevenueUpokt, data.poktPriceUsd);
  const averageRevenuePerProviderUsd = averageRevenuePerProvider * data.poktPriceUsd;
  const revenuePerThousandRelaysUsd = revenuePerThousandRelays * data.poktPriceUsd;
  const indexerLag =
    data.indexerTargetHeight != null && data.indexerProcessedHeight != null
      ? Math.max(0, data.indexerTargetHeight - data.indexerProcessedHeight)
      : null;
  const revenueHistoryValues = networkHistory.map((point) => toPoktNumber(point.revenueUpokt));
  const revenueHistoryAverage = movingAverage(revenueHistoryValues, 7);
  const revenueHistoryPoints = networkHistory.map((point, index) => ({
    label: point.day,
    value: revenueHistoryValues[index] ?? 0,
    secondaryValue: revenueHistoryAverage[index] ?? 0
  }));

  return (
    <main className="page">
      <section className="hero hero-stack">
        <div className="panel hero-showcase" style={{ overflow: 'hidden', position: 'relative' }}>
          <div style={{ 
            position: 'absolute', 
            top: '-10%', 
            right: '-5%', 
            width: '40%', 
            height: '120%', 
            background: 'radial-gradient(circle, rgba(0, 194, 255, 0.05) 0%, transparent 70%)',
            pointerEvents: 'none'
          }} />
          
          <div className="hero-main">
            <div className="hero-copy hero-copy-strong">
              <span className="eyebrow">Pocket Network Intelligence</span>
              <h1>Scale the Decentralized Web.</h1>
              <p style={{ fontSize: '1.1rem', maxWidth: '600px' }}>
                Real-time market intelligence for the next generation of infrastructure providers. 
                Analyze demand, optimize your node deployment, and capture your share of the network revenue.
              </p>

              <div className="window-tabs" aria-label="time windows">
                {WINDOWS.map((entry) => {
                  const active = entry === window;
                  return (
                    <button
                      key={entry}
                      type="button"
                      className={`window-tab${active ? " active" : ""}`}
                      onClick={() => loadWindow(entry, true)}
                    >
                      {entry === "24h" ? "Real-time" : entry === "7d" ? "Weekly" : "Monthly"} ({entry})
                    </button>
                  );
                })}
              </div>

              <div className="hero-highlight-grid">
                <div className="hero-highlight">
                  <span className="hero-highlight-label">Market Revenue Pool</span>
                  <strong className="accent-number" style={{ color: 'var(--accent)' }}>{formatUpokt(toBigInt(data.totalRevenueUpokt), 1)}</strong>
                  <p>Total provider earnings final settled in {formatRelativeRange(window)}.</p>
                </div>
                <div className="hero-highlight">
                  <span className="hero-highlight-label">Growth Benchmark</span>
                  <strong className="accent-number" style={{ color: 'var(--green)' }}>{formatDecimal(averageRevenuePerProvider, 1)} POKT</strong>
                  <p>Average revenue target for active provider domains.</p>
                </div>
              </div>
            </div>

            <aside className="hero-side panel-inset" style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
              <div className="section-title-row compact-gap">
                <div>
                  <h2 className="section-title">Market Leaders</h2>
                  <p className="muted" style={{ fontSize: '0.8rem' }}>Top performers by revenue</p>
                </div>
                <span className="pill">{formatRelativeRange(window)}</span>
              </div>
              <HeroBars providers={data.providers} window={window} />
            </aside>
          </div>
        </div>

        <div className="hero-support-grid">
          <article className="panel narrative-card">
            <span className="eyebrow eyebrow-ghost">Strategic Insight</span>
            <h2>Entry Strategy: Benchmarks for Success.</h2>
            <ul className="narrative-points">
              <li>
                <strong>Target {formatDecimal(revenuePerThousandRelays, 2)} POKT</strong> per 1k relays for peak efficiency.
              </li>
              <li>
                <strong>~{formatUsd(revenuePerThousandRelaysUsd, 2)}</strong> projected revenue per 1,000 relays served.
              </li>
              <li>
                <strong>{formatDecimal(medianRevenuePerProvider, 1)} POKT</strong> median benchmark for active domains.
              </li>
              <li>
                <strong>{topService ? topService.serviceName : "n/a"}</strong> is currently the highest demand chain.
              </li>
            </ul>
          </article>

          <article className="panel section section-visual">
            <div className="section-title-row">
              <div>
                <h2 className="section-title">Network Dynamics</h2>
                <p className="section-subtitle">Revenue distribution across the provider ecosystem.</p>
              </div>
              <span className="pill">Concentration</span>
            </div>

            <div className="donut-grid">
              <DonutMeter 
                value={topProviderShare} 
                label="Top Leader" 
                detail="Market share of the #1 provider domain." 
                icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>}
              />
              <DonutMeter 
                value={top5ProviderShare} 
                label="Top 5 Entity" 
                detail="Revenue held by the top 5 provider groups." 
                icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
              />
              <DonutMeter 
                value={top5ServiceShare} 
                label="Core Mix" 
                detail="Revenue driven by the top 5 high-demand chains." 
                icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>}
              />
            </div>
          </article>
        </div>
      </section>

      <section className="kpi-grid kpi-grid-strong">
        <article className="panel kpi kpi-primary">
          <span className="kpi-label">Total Network Revenue</span>
          <span className="kpi-value">{formatUpokt(toBigInt(data.totalRevenueUpokt))}</span>
          <span className="kpi-foot">{formatUsd(totalRevenueUsd, 0)} at market rate</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Relays Finalized</span>
          <span className="kpi-value">{formatCompactNumber(data.totalRelays)}</span>
          <span className="kpi-foot">{formatInteger(data.totalRelays)} total relays</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Avg. Revenue / Provider</span>
          <span className="kpi-value" style={{ color: 'var(--green)' }}>{formatDecimal(averageRevenuePerProvider, 1)} POKT</span>
          <span className="kpi-foot">{formatUsd(averageRevenuePerProviderUsd, 0)} per active domain</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Unit Revenue (1k Relays)</span>
          <span className="kpi-value" style={{ color: 'var(--accent)' }}>{formatDecimal(revenuePerThousandRelays, 2)} POKT</span>
          <span className="kpi-foot">{formatUsd(revenuePerThousandRelaysUsd, 2)} per unit</span>
        </article>
      </section>

      <TimeseriesPanel
        title="30-Day Market Revenue Trend"
        subtitle="Daily provider-side revenue with a 7-day moving average to make network momentum easier to read."
        eyebrow="Market Trend"
        points={revenueHistoryPoints}
        valueLabel="revenue"
        formatValue={(value) => `${formatDecimal(value, 1)} POKT`}
        emptyText="Network daily history is not available yet. The snapshot metrics above remain available."
      />

      <RevenueCalculator
        poktPriceUsd={data.poktPriceUsd}
        services={data.services.map((service) => ({
          serviceId: service.serviceId,
          serviceName: service.serviceName,
          relays: service.relays,
          revenueUpokt: service.revenueUpokt,
          providerCount: service.providerCount
        }))}
      />

      <section>
        <article className="panel section section-visual">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Revenue Distribution</h2>
              <p className="section-subtitle">Visualizing monetization across the network's top provider domains.</p>
            </div>
            <span className="pill">Leaderboard</span>
          </div>

          <ProviderRevenueChart providers={data.providers} totalRevenue={data.totalRevenueUpokt} poktPriceUsd={data.poktPriceUsd} />
        </article>
      </section>

      <section className="panel section section-opportunity">
        <div className="section-title-row">
          <div>
              <h2 className="section-title">High-Growth Opportunities</h2>
              <p className="section-subtitle">
                Target the most attractive services based on current revenue pool and provider density.
              </p>
            </div>
            <span className="pill">Onboarding Focus</span>
        </div>

        <OpportunityMap services={data.services} totalRevenue={data.totalRevenueUpokt} />
      </section>

      <section className="section-grid">
        <article className="panel section">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Top Provider Domains</h2>
              <p className="section-subtitle">Leaders by service coverage and revenue.</p>
            </div>
            <span className="pill">Leaderboard</span>
          </div>

          <div className="provider-list">
            {data.providers.slice(0, 8).map((provider, index) => {
              const share = getShare(provider.revenueUpokt, data.totalRevenueUpokt);
              return (
                <div key={provider.providerKey} className="provider-row provider-row-rich">
                  <div className="provider-row-top">
                    <div>
                      <strong style={{ fontSize: '1.05rem' }}>#{index + 1} {provider.providerLabel}</strong>
                      <div className="muted mono">{provider.providerDomain}</div>
                      <Link href={`/providers/${encodeURIComponent(provider.providerKey)}?window=${window}`} className="provider-inline-link">
                        Performance Analysis →
                      </Link>
                    </div>
                    <div className="right">
                      <strong className="accent-number" style={{ fontSize: '1.1rem' }}>{formatUpokt(toBigInt(provider.revenueUpokt), 1)}</strong>
                      <div className="muted" style={{ fontSize: '0.85rem' }}>{formatUsd(toUsdFromUpokt(provider.revenueUpokt, data.poktPriceUsd), 0)} · {formatInteger(provider.relays)} relays</div>
                    </div>
                  </div>
                  <div className="provider-row-metrics">
                    <span>{formatPercent(share, 1)} market share</span>
                    <span>{formatInteger(provider.chainCount)} services</span>
                    <span>{formatInteger(provider.supplierCount)} suppliers</span>
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="panel section">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">High-Demand Services</h2>
              <p className="section-subtitle">Chains with the strongest revenue pools.</p>
            </div>
            <span className="pill">Demand</span>
          </div>

          <div className="service-list">
            {data.services.slice(0, 8).map((service) => {
              const revenuePerProvider = toPoktNumber(service.revenueUpokt) / Math.max(service.providerCount, 1);
              return (
                <div key={service.serviceId} className="service-row service-row-rich">
                  <div className="service-row-top">
                    <div>
                      <strong style={{ fontSize: '1.05rem' }}>{service.serviceName}</strong>
                      <div className="muted mono">{service.serviceId}</div>
                    </div>
                    <div className="right">
                      <strong className="accent-number" style={{ fontSize: '1.1rem' }}>{formatUpokt(toBigInt(service.revenueUpokt), 1)}</strong>
                       <div className="muted" style={{ fontSize: '0.85rem' }}>{formatInteger(service.relays)} total relays</div>
                     </div>
                   </div>
                   <div className="provider-row-metrics">
                     <span>{formatInteger(service.providerCount)} providers active</span>
                     <span style={{ color: 'var(--green)' }}>{formatDecimal(revenuePerProvider, 1)} POKT / provider</span>
                   </div>
                 </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="panel section section-detail">
        <div className="section-title-row">
          <div>
            <h2 className="section-title">Infrastructure Deep Dive</h2>
            <p className="section-subtitle">Granular operational detail for top network participants.</p>
          </div>
          <span className="pill">Operational View</span>
        </div>

        <div className="provider-cards">
          {data.providers.slice(0, 12).map((provider) => (
            <article key={provider.providerKey} className="panel provider-card provider-card-rich">
              <div className="provider-card-top">
                <div>
                  <Link href={`/providers/${encodeURIComponent(provider.providerKey)}?window=${window}`} className="provider-card-link">
                    <strong style={{ fontSize: '1.2rem' }}>{provider.providerLabel}</strong>
                    <div className="muted mono">{provider.providerDomain}</div>
                    <div className="provider-link-cue">View full report →</div>
                  </Link>
                </div>
                <div className="right">
                  <div className="provider-link-end provider-link-end-right">
                    <strong className="accent-number" style={{ fontSize: '1.3rem' }}>{formatUpokt(toBigInt(provider.revenueUpokt))}</strong>
                  </div>
                  <div className="muted" style={{ fontSize: '0.85rem' }}>{formatUsd(toUsdFromUpokt(provider.revenueUpokt, data.poktPriceUsd), 0)} · {formatInteger(provider.relays)} relays</div>
                </div>
              </div>

              <div className="provider-stats">
                <span>{formatInteger(provider.chainCount)} services</span>
                <span>{formatInteger(provider.supplierCount)} suppliers</span>
                <span>{formatDecimal(toPoktNumber(provider.revenueUpokt) / Math.max(provider.chainCount, 1), 1)} POKT/chain</span>
              </div>

              <div style={{ marginTop: '24px', overflowX: 'auto' }}>
                <table className="mini-table">
                  <thead>
                    <tr>
                      <th>Chain</th>
                      <th className="right">Relay</th>
                      <th className="right">Revenue</th>
                      <th className="right">Mix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {provider.chains.slice(0, 5).map((chain) => (
                      <tr key={`${provider.providerKey}-${chain.serviceId}`}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{chain.serviceName}</div>
                          <div className="muted mono" style={{ fontSize: '0.75rem' }}>{chain.serviceId}</div>
                        </td>
                        <td className="right">{formatInteger(chain.relays)}</td>
                        <td className="right">{formatUpokt(toBigInt(chain.revenueUpokt), 1)}</td>
                        <td className="right">{formatPercent(getShare(chain.revenueUpokt, provider.revenueUpokt), 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </div>

        <p className="footer-note">
          This public dashboard prioritizes fast provider-side market visibility. It uses short-lived caching, domain-level
          supplier grouping, and resilient fallbacks. Data is continuously refined as Pocket Network moves toward RC1.
        </p>
      </section>

      <section className="panel section hero-meta">
        <div className="section-title-row compact-gap">
          <div>
            <h2 className="section-title">Network Integrity</h2>
            <p className="muted" style={{ fontSize: '0.8rem' }}>Runtime diagnostics and source validation</p>
          </div>
          <span className="pill">System Status</span>
        </div>
        
        <div className="insight-list">
          <div className="insight-row">
            <span className="muted">Primary Data Source</span>
            <strong style={{ color: data.dataSource === "poktscan" ? 'var(--green)' : 'var(--orange)' }}>
              {data.dataSource === "poktscan" ? "Poktscan API (Verified)" : "RPC direct fallback"}
            </strong>
          </div>
          <div className="insight-row">
            <span className="muted">Chain Height</span>
            <strong className="mono">{formatInteger(data.latestHeight)}</strong>
          </div>
          {indexerLag != null && (
            <div className="insight-row">
              <span className="muted">Indexer Latency</span>
              <strong style={{ color: indexerLag > 10 ? 'var(--red)' : 'var(--green)' }}>{formatInteger(indexerLag)} blocks</strong>
            </div>
          )}
          <div className="insight-row">
            <span className="muted">Settlement Scanned</span>
            <strong>{formatInteger(data.scannedSettlementHeights)} heights</strong>
          </div>
          <div className="insight-row">
            <span className="muted">Market Liquidity</span>
            <strong className="accent-number" style={{ color: 'var(--accent)' }}>{formatUsd(data.poktPriceUsd, 4)} POKT/USD</strong>
          </div>
          <div className="insight-row">
            <span className="muted">Last Intelligence Refresh</span>
            <strong>{new Date(data.generatedAt).toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong>
          </div>
          {isPending && (
            <div className="insight-row">
              <span className="muted">Sync Status</span>
              <strong style={{ color: 'var(--accent)' }}>Refreshing data stream...</strong>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
