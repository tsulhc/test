"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import RevenueCalculator from "@/app/revenue-calculator";
import {
  formatCompactNumber,
  formatDecimal,
  formatInteger,
  formatPercent,
  formatRelativeRange,
  formatUsd,
  formatUpokt,
  truncateAddress
} from "@/lib/format";
import type { SerializedDashboardData, SerializedProviderStats, SerializedServiceStats, TimeWindow } from "@/lib/types";

const WINDOWS: TimeWindow[] = ["24h", "7d", "30d"];

type DashboardViewProps = {
  initialWindow: TimeWindow;
  dataByWindow: Record<TimeWindow, SerializedDashboardData | null>;
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

function HeroBars({ providers }: { providers: SerializedProviderStats[] }) {
  const topProviders = providers.slice(0, 6);
  const maxRevenue = topProviders[0]?.revenueUpokt ?? "0";

  return (
    <div className="hero-bars">
      {topProviders.map((provider, index) => {
        const width = maxRevenue === "0" ? 0 : Math.max(8, Math.round((Number(provider.revenueUpokt) / Number(maxRevenue)) * 100));

        return (
          <div key={provider.providerKey} className="hero-bar-row">
            <div className="hero-bar-meta">
              <span>#{index + 1}</span>
              <span>{provider.providerLabel}</span>
            </div>
            <div className="hero-bar-track">
              <div className="hero-bar-fill" style={{ width: `${width}%` }} />
            </div>
            <strong className="accent-number">{formatUpokt(toBigInt(provider.revenueUpokt), 1)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function DonutMeter({ value, label, detail }: { value: number; label: string; detail: string }) {
  const degrees = Math.max(0, Math.min(360, Math.round((value / 100) * 360)));

  return (
    <div className="donut-card">
      <div
        className="donut-ring"
        style={{
          background: `conic-gradient(from 220deg, var(--green) 0deg, var(--accent) ${degrees}deg, rgba(255,255,255,0.05) ${degrees}deg 360deg)`
        }}
      >
        <div className="donut-inner">
          <strong>{formatPercent(value, 1)}</strong>
          <span>{label}</span>
        </div>
      </div>
      <p className="muted">{detail}</p>
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
                <strong>#{index + 1} {provider.providerLabel}</strong>
                <div className="muted mono">{provider.providerDomain}</div>
              </div>
              <div className="right">
                <strong className="accent-number">{formatUpokt(toBigInt(provider.revenueUpokt), 1)}</strong>
                <div className="muted">{formatUsd(toUsdFromUpokt(provider.revenueUpokt, poktPriceUsd), 0)} · {formatPercent(share, 1)} share</div>
              </div>
            </div>
            <div className="chart-track">
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
                <strong>{service.serviceName}</strong>
                <div className="muted mono">{service.serviceId}</div>
              </div>
              <span className={`density density-${density}`}>
                {service.providerCount} {service.providerCount === 1 ? "provider" : "providers"}
              </span>
            </div>
            <div className="opportunity-metric-row">
              <span className="muted">Total revenue</span>
              <strong>{formatUpokt(toBigInt(service.revenueUpokt), 1)}</strong>
            </div>
            <div className="opportunity-metric-row">
              <span className="muted">Revenue per active provider</span>
              <strong>{formatDecimal(perProvider, 1)} POKT</strong>
            </div>
            <div className="opportunity-track">
              <div className="opportunity-fill" style={{ width: `${width}%` }} />
            </div>
            <div className="opportunity-foot">
              <span>{formatInteger(service.relays)} relays</span>
              <span>{formatPercent(share, 1)} of total revenue</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardView({ initialWindow, dataByWindow }: DashboardViewProps) {
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

              <div className="hero-highlight-grid">
                <div className="hero-highlight">
                  <span className="hero-highlight-label">Network Revenue Pool</span>
                  <strong className="accent-number">{formatUpokt(toBigInt(data.totalRevenueUpokt), 1)}</strong>
                  <p>Aggregated provider-side revenue across {formatRelativeRange(window)}.</p>
                </div>
                <div className="hero-highlight">
                  <span className="hero-highlight-label">Benchmark Revenue</span>
                  <strong className="accent-number">{formatDecimal(averageRevenuePerProvider, 1)} POKT</strong>
                  <p>The average revenue target per active provider domain.</p>
                </div>
              </div>
            </div>

            <aside className="hero-side panel panel-inset">
              <div className="section-title-row compact-gap">
                <h2 className="section-title">Market Leaders</h2>
                  <span className="pill">{formatRelativeRange(window)}</span>
              </div>
              <HeroBars providers={data.providers} />
            </aside>
          </div>
        </div>

        <div className="hero-support-grid">
          <article className="panel hero-meta">
            <div className="section-title-row compact-gap">
              <h2 className="section-title">Network Integrity</h2>
              <span className="pill">Runtime</span>
            </div>
            <div className="insight-list">
              <div className="insight-row">
                <span className="muted">Data source</span>
                <strong>{data.dataSource === "poktscan" ? "Poktscan" : "RPC fallback"}</strong>
              </div>
              <div className="insight-row">
                <span className="muted">Latest chain height</span>
                <strong>{formatInteger(data.latestHeight)}</strong>
              </div>
              {indexerLag != null ? (
                <div className="insight-row">
                  <span className="muted">Indexer lag</span>
                  <strong>{formatInteger(indexerLag)} block</strong>
                </div>
              ) : null}
              <div className="insight-row">
                <span className="muted">Settlement blocks scanned</span>
                <strong>{formatInteger(data.scannedSettlementHeights)}</strong>
              </div>
              <div className="insight-row">
                <span className="muted">EventClaimSettled records</span>
                <strong>{formatInteger(data.settlementEvents)}</strong>
              </div>
              <div className="insight-row">
                <span className="muted">Top provider share</span>
                <strong>{formatPercent(topProviderShare, 1)}</strong>
              </div>
              <div className="insight-row">
                <span className="muted">POKT price</span>
                <strong>{formatUsd(data.poktPriceUsd, 4)}</strong>
              </div>
              <div className="insight-row">
                <span className="muted">Top service</span>
                <strong>{topService ? topService.serviceName : "n/a"}</strong>
              </div>
              <div className="insight-row">
                <span className="muted">Last refresh</span>
                <strong>{new Date(data.generatedAt).toLocaleString("en-US")}</strong>
              </div>
              {isPending ? (
                <div className="insight-row">
                  <span className="muted">Background refresh</span>
                  <strong>Updating cached windows</strong>
                </div>
              ) : null}
            </div>
          </article>

            <article className="panel narrative-card">
              <span className="eyebrow eyebrow-ghost">Quick read</span>
            <h2>Market Entry Benchmarks: Your Day-One Strategy.</h2>
            <ul className="narrative-points">
              <li>
                <strong>Target {formatDecimal(revenuePerThousandRelays, 2)} POKT</strong> per 1,000 relays as your baseline efficiency.
              </li>
              <li>
                <strong>Estimated {formatUsd(revenuePerThousandRelaysUsd, 2)}</strong> per 1,000 relays at current market rates.
              </li>
              <li>
                <strong>{formatDecimal(medianRevenuePerProvider, 1)} POKT</strong> is the median benchmark for active provider domains.
              </li>
              <li>
                <strong>{topService ? topService.serviceName : "n/a"}</strong> is currently the high-demand service to prioritize.
              </li>
            </ul>
          </article>
        </div>
      </section>

      <section className="kpi-grid kpi-grid-strong">
        <article className="panel kpi kpi-primary">
          <span className="kpi-label">Provider-side revenue</span>
          <span className="kpi-value">{formatUpokt(toBigInt(data.totalRevenueUpokt))}</span>
          <span className="kpi-foot">{formatUsd(totalRevenueUsd, 0)} at the live CoinGecko price</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Relays served</span>
          <span className="kpi-value">{formatCompactNumber(data.totalRelays)}</span>
          <span className="kpi-foot">{formatInteger(data.totalRelays)} relays in the selected window</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Average revenue per provider</span>
          <span className="kpi-value">{formatDecimal(averageRevenuePerProvider, 1)} POKT</span>
          <span className="kpi-foot">{formatUsd(averageRevenuePerProviderUsd, 0)} per provider across the period</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Revenue per 1k relays</span>
          <span className="kpi-value">{formatDecimal(revenuePerThousandRelays, 2)} POKT</span>
          <span className="kpi-foot">{formatUsd(revenuePerThousandRelaysUsd, 2)} per 1,000 relays</span>
        </article>
      </section>

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

      <section className="section-grid section-grid-visual">
        <article className="panel section section-visual">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Market Dynamics</h2>
              <p className="section-subtitle">A high-level view of revenue distribution across the provider ecosystem.</p>
            </div>
            <span className="pill">Competition</span>
          </div>

          <div className="donut-grid">
            <DonutMeter value={topProviderShare} label="Top Performer" detail="Market share captured by the leading provider domain." />
            <DonutMeter value={top5ProviderShare} label="Top 5 Focus" detail="Measures how much of the network revenue is held by the top 5 entities." />
            <DonutMeter value={top5ServiceShare} label="High-Demand Mix" detail="The share of revenue driven by the top 5 services." />
          </div>
        </article>

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
              <p className="section-subtitle">Leading entities setting the benchmark for revenue and service coverage.</p>
            </div>
            <span className="pill">Top {Math.min(data.providers.length, 8)}</span>
          </div>

          <div className="provider-list">
            {data.providers.slice(0, 8).map((provider, index) => {
              const share = getShare(provider.revenueUpokt, data.totalRevenueUpokt);
              return (
                <div key={provider.providerKey} className="provider-row provider-row-rich">
                  <div className="provider-row-top">
                    <div>
                      <strong>#{index + 1} {provider.providerLabel}</strong>
                      <div className="muted mono">{provider.providerDomain}</div>
                    </div>
                    <div className="right">
                      <strong>{formatUpokt(toBigInt(provider.revenueUpokt), 1)}</strong>
                      <div className="muted">{formatUsd(toUsdFromUpokt(provider.revenueUpokt, data.poktPriceUsd), 0)} · {formatInteger(provider.relays)} relays</div>
                    </div>
                  </div>
                  <div className="provider-row-metrics">
                    <span>{formatPercent(share, 1)} of network revenue</span>
                    <span>{formatInteger(provider.chainCount)} active services</span>
                    <span>{formatInteger(provider.supplierCount)} suppliers</span>
                    <span>{formatDecimal(toPoktNumber(provider.revenueUpokt) / Math.max(provider.chainCount, 1), 1)} POKT per service</span>
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
              <p className="section-subtitle">Current services with the strongest revenue pools for active providers.</p>
            </div>
            <span className="pill">Top {Math.min(data.services.length, 8)}</span>
          </div>

          <div className="service-list">
            {data.services.slice(0, 8).map((service) => {
              const revenuePerProvider = toPoktNumber(service.revenueUpokt) / Math.max(service.providerCount, 1);
              return (
                <div key={service.serviceId} className="service-row service-row-rich">
                  <div className="service-row-top">
                    <div>
                      <strong>{service.serviceName}</strong>
                      <div className="muted mono">{service.serviceId}</div>
                    </div>
                    <div className="right">
                      <strong>{formatUpokt(toBigInt(service.revenueUpokt), 1)}</strong>
                       <div className="muted">{formatUsd(toUsdFromUpokt(service.revenueUpokt, data.poktPriceUsd), 0)} · {formatInteger(service.relays)} relays</div>
                     </div>
                   </div>
                   <div className="provider-row-metrics">
                     <span>{formatInteger(service.providerCount)} active providers</span>
                     <span>{formatDecimal(revenuePerProvider, 1)} POKT per provider</span>
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
            <p className="section-subtitle">Granular operational detail to benchmark your setup against top network participants.</p>
          </div>
          <span className="pill">{Math.min(data.providers.length, 12)} providers shown</span>
        </div>

        <div className="provider-cards">
          {data.providers.slice(0, 12).map((provider) => (
            <article key={provider.providerKey} className="panel provider-card provider-card-rich">
              <div className="provider-card-top">
                <div>
                  <strong>{provider.providerLabel}</strong>
                  <div className="muted mono">{provider.providerDomain}</div>
                </div>
                <div className="right">
                  <strong>{formatUpokt(toBigInt(provider.revenueUpokt))}</strong>
                  <div className="muted">{formatUsd(toUsdFromUpokt(provider.revenueUpokt, data.poktPriceUsd), 0)} · {formatInteger(provider.relays)} relays</div>
                </div>
              </div>

              <div className="provider-stats provider-stats-strong">
                <span>{formatInteger(provider.chainCount)} active services</span>
                <span>{formatInteger(provider.supplierCount)} suppliers</span>
                <span>{formatDecimal(toPoktNumber(provider.revenueUpokt) / Math.max(provider.chainCount, 1), 1)} POKT per service</span>
                <span>{formatDecimal(provider.relays / Math.max(provider.chainCount, 1), 0)} relays per service</span>
              </div>

              <div className="provider-stats provider-stats-strong">
                {provider.suppliers.slice(0, 6).map((supplier) => (
                  <span key={supplier.operatorAddress} className="mono">
                    {truncateAddress(supplier.operatorAddress, 10, 6)}
                  </span>
                ))}
                {provider.supplierCount > 6 ? <span>+{provider.supplierCount - 6} more suppliers</span> : null}
              </div>

              <table className="mini-table">
                <thead>
                  <tr>
                    <th>Chain</th>
                    <th>Service ID</th>
                    <th className="right">Relay</th>
                    <th className="right">Revenue</th>
                    <th className="right">Mix</th>
                  </tr>
                </thead>
                <tbody>
                  {provider.chains.slice(0, 6).map((chain) => (
                    <tr key={`${provider.providerKey}-${chain.serviceId}`}>
                      <td>{chain.serviceName}</td>
                      <td className="mono">{chain.serviceId}</td>
                      <td className="right">{formatInteger(chain.relays)}</td>
                      <td className="right">{formatUpokt(toBigInt(chain.revenueUpokt), 1)}</td>
                      <td className="right">{formatPercent(getShare(chain.revenueUpokt, provider.revenueUpokt), 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ))}
        </div>

        <p className="footer-note">
          This public dashboard prioritizes fast provider-side market visibility. It uses short-lived caching, domain-level
          supplier grouping, and resilient fallbacks so the experience remains responsive while Pocket Network continues
          moving toward a fuller historical RC1 data product.
        </p>
      </section>
    </main>
  );
}
