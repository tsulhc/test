"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

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
import { buildProviderServiceOpportunity } from "@/lib/opportunities";
import type {
  SerializedDashboardData,
  SerializedProviderDailyHistoryPoint,
  SerializedProviderStats,
  SerializedSupplierMember,
  TimeWindow
} from "@/lib/types";

const WINDOWS: TimeWindow[] = ["24h", "7d", "30d"];
const INITIAL_VISIBLE_SUPPLIERS = 30;

type ProviderDetailViewProps = {
  providerKey: string;
  initialWindow: TimeWindow;
  dataByWindow: Record<TimeWindow, SerializedDashboardData | null>;
  history: SerializedProviderDailyHistoryPoint[];
  supplierBreakdownByWindow: Record<TimeWindow, SerializedSupplierMember[]>;
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

function getShare(part: string, total: string): number {
  const totalBig = BigInt(total);
  const partBig = BigInt(part);
  if (totalBig === 0n) return 0;
  return Number((partBig * 10_000n) / totalBig) / 100;
}

function daysForWindow(window: TimeWindow): number {
  switch (window) {
    case "24h":
      return 1;
    case "7d":
      return 7;
    case "30d":
      return 30;
  }
}

function getProvider(data: SerializedDashboardData | null, providerKey: string): SerializedProviderStats | null {
  return data?.providers.find((provider) => provider.providerKey === providerKey) ?? null;
}

function buildMovingAverage(values: number[], windowSize: number): number[] {
  return values.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const slice = values.slice(start, index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });
}

function getDailyRunRate(provider: SerializedProviderStats | null, window: TimeWindow): number {
  if (!provider) return 0;
  return toPoktNumber(provider.revenueUpokt) / daysForWindow(window);
}

export default function ProviderDetailView({ providerKey, initialWindow, dataByWindow, history, supplierBreakdownByWindow }: ProviderDetailViewProps) {
  const [selectedWindow, setSelectedWindow] = useState<TimeWindow>(initialWindow);
  const [dataState, setDataState] = useState<Record<TimeWindow, SerializedDashboardData | null>>(dataByWindow);
  const [visibleSupplierCount, setVisibleSupplierCount] = useState<number>(INITIAL_VISIBLE_SUPPLIERS);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const data = dataState[selectedWindow];
    if (data) return;

    startTransition(() => {
      void fetch(`/api/dashboard?window=${selectedWindow}`, { cache: "no-store" })
        .then(async (response) => {
          const payload = (await response.json()) as DashboardApiResponse;
          if (!response.ok || "status" in payload) return null;
          return payload;
        })
        .then((payload) => {
          if (!payload) return;
          setDataState((current) => ({
            ...current,
            [selectedWindow]: payload
          }));
        })
        .catch(() => {
          // Keep the current state and rely on the cached snapshots already loaded.
        });
    });
  }, [dataState, selectedWindow]);

  useEffect(() => {
    setVisibleSupplierCount(INITIAL_VISIBLE_SUPPLIERS);
  }, [providerKey, selectedWindow]);

  const currentData = dataState[selectedWindow];
  const currentProvider = getProvider(currentData, providerKey);
  const supplierBreakdown = supplierBreakdownByWindow[selectedWindow] ?? [];
  const mergedSuppliers = useMemo(() => {
    const providerSuppliers = currentProvider?.suppliers ?? [];
    const withDetail = new Map(supplierBreakdown.map((supplier) => [supplier.operatorAddress, supplier]));
    const merged = providerSuppliers.map((supplier) => withDetail.get(supplier.operatorAddress) ?? supplier);

    for (const supplier of supplierBreakdown) {
      if (!merged.some((entry) => entry.operatorAddress === supplier.operatorAddress)) {
        merged.push(supplier);
      }
    }

    return merged.sort((a, b) => {
      const aRevenue = a.revenueUpokt ? toBigInt(a.revenueUpokt) : 0n;
      const bRevenue = b.revenueUpokt ? toBigInt(b.revenueUpokt) : 0n;
      return bRevenue === aRevenue ? a.operatorAddress.localeCompare(b.operatorAddress) : bRevenue > aRevenue ? 1 : -1;
    });
  }, [currentProvider, supplierBreakdown]);

  const providerByWindow = useMemo(() => {
    return Object.fromEntries(WINDOWS.map((window) => [window, getProvider(dataState[window], providerKey)])) as Record<
      TimeWindow,
      SerializedProviderStats | null
    >;
  }, [dataState, providerKey]);

  const currentRank = currentData && currentProvider
    ? currentData.providers.findIndex((provider) => provider.providerKey === currentProvider.providerKey) + 1
    : 0;

  const momentum24hVs7d = getDailyRunRate(providerByWindow["7d"], "7d") === 0
    ? 0
    : ((getDailyRunRate(providerByWindow["24h"], "24h") / getDailyRunRate(providerByWindow["7d"], "7d")) - 1) * 100;
  const momentum7dVs30d = getDailyRunRate(providerByWindow["30d"], "30d") === 0
    ? 0
    : ((getDailyRunRate(providerByWindow["7d"], "7d") / getDailyRunRate(providerByWindow["30d"], "30d")) - 1) * 100;

  const similarProviders = useMemo(() => {
    if (!currentData || !currentProvider) return [];

    return currentData.providers
      .filter((provider) => provider.providerKey !== currentProvider.providerKey)
      .map((provider) => ({
        provider,
        supplierGap: Math.abs(provider.supplierCount - currentProvider.supplierCount),
        chainGap: Math.abs(provider.chainCount - currentProvider.chainCount),
        revenueGap: Math.abs(toPoktNumber(provider.revenueUpokt) - toPoktNumber(currentProvider.revenueUpokt))
      }))
      .sort((a, b) => a.supplierGap - b.supplierGap || a.chainGap - b.chainGap || a.revenueGap - b.revenueGap)
      .slice(0, 5)
      .map((entry) => entry.provider);
  }, [currentData, currentProvider]);

  const peerMedianRevenue = useMemo(() => {
    if (similarProviders.length === 0) return 0;
    const values = similarProviders.map((provider) => toPoktNumber(provider.revenueUpokt)).sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
  }, [similarProviders]);

  const historyValues = history.map((point) => toPoktNumber(point.revenueUpokt));
  const movingAverage = buildMovingAverage(historyValues, 7);
  const maxHistoryRevenue = Math.max(...historyValues, 0);
  const lastHistoryPoint = history.at(-1);
  const previousHistoryPoint = history.at(-2);
  const trailing7dRevenue = history.slice(-7).reduce((sum, point) => sum + toPoktNumber(point.revenueUpokt), 0);
  const trailing14dRevenue = history.slice(-14, -7).reduce((sum, point) => sum + toPoktNumber(point.revenueUpokt), 0);
  const trailing7dGrowth = trailing14dRevenue === 0 ? 0 : ((trailing7dRevenue / trailing14dRevenue) - 1) * 100;
  const dayOverDayGrowth = !lastHistoryPoint || !previousHistoryPoint || toBigInt(previousHistoryPoint.revenueUpokt) === 0n
    ? 0
    : ((toPoktNumber(lastHistoryPoint.revenueUpokt) / toPoktNumber(previousHistoryPoint.revenueUpokt)) - 1) * 100;
  const bestHistoryDay = history.reduce<SerializedProviderDailyHistoryPoint | null>((best, point) => {
    if (!best || toBigInt(point.revenueUpokt) > toBigInt(best.revenueUpokt)) return point;
    return best;
  }, null);

  const opportunityServices = useMemo(() => {
    if (!currentData || !currentProvider) return [];

    const covered = new Set(currentProvider.chains.map((chain) => chain.serviceId));
    return currentData.services
      .filter((service) => !covered.has(service.serviceId))
      .map((service) => buildProviderServiceOpportunity(service, currentProvider.supplierCount))
      .sort((a, b) => {
        if (b.opportunityScore !== a.opportunityScore) {
          return b.opportunityScore - a.opportunityScore;
        }

        if (b.selectionProbability !== a.selectionProbability) {
          return b.selectionProbability - a.selectionProbability;
        }

        return b.projectedRevenueUpokt === a.projectedRevenueUpokt ? a.serviceName.localeCompare(b.serviceName) : b.projectedRevenueUpokt > a.projectedRevenueUpokt ? 1 : -1;
      })
      .slice(0, 6);
  }, [currentData, currentProvider]);

  if (!currentProvider || !currentData) {
    return (
      <main className="page provider-page">
        <section className="panel section provider-empty-state">
          <span className="eyebrow">Provider detail</span>
          <h1 className="section-title">Provider not available in the selected window.</h1>
          <p className="section-subtitle">
            This provider may still be warming into cache for <code>{selectedWindow}</code>, or it may not have visible activity in that range yet.
          </p>
          <div className="window-tabs">
            {WINDOWS.map((window) => (
              <button
                key={window}
                type="button"
                className={`window-tab${selectedWindow === window ? " active" : ""}`}
                onClick={() => setSelectedWindow(window)}
              >
                {window}
              </button>
            ))}
          </div>
          <Link href={`/?window=${selectedWindow}`} className="calculator-action provider-back-link">
            Back to dashboard
          </Link>
        </section>
      </main>
    );
  }

  const marketShare = getShare(currentProvider.revenueUpokt, currentData.totalRevenueUpokt);
  const revenuePerSupplier = currentProvider.supplierCount === 0 ? 0 : toPoktNumber(currentProvider.revenueUpokt) / currentProvider.supplierCount;
  const revenuePerService = currentProvider.chainCount === 0 ? 0 : toPoktNumber(currentProvider.revenueUpokt) / currentProvider.chainCount;
  const revenuePerThousandRelays = currentProvider.relays === 0 ? 0 : (toPoktNumber(currentProvider.revenueUpokt) / currentProvider.relays) * 1000;
  const supplierDetailAvailable = mergedSuppliers.some((supplier) => supplier.detailAvailable && supplier.revenueUpokt);
  const supplierDetailCoverage = mergedSuppliers.filter((supplier) => supplier.detailAvailable && supplier.revenueUpokt).length;
  const visibleSuppliers = mergedSuppliers.slice(0, visibleSupplierCount);
  const hasMoreSuppliers = mergedSuppliers.length > visibleSupplierCount;
  const supplierBreakdownVisible = supplierBreakdown.length > 0 || selectedWindow === "24h";

  return (
    <main className="page provider-page">
      <section className="hero provider-hero">
        <div className="provider-head panel" style={{ overflow: 'hidden', position: 'relative' }}>
          <div style={{ 
            position: 'absolute', 
            top: '-20%', 
            right: '-10%', 
            width: '50%', 
            height: '150%', 
            background: 'radial-gradient(circle, rgba(0, 194, 255, 0.04) 0%, transparent 70%)',
            pointerEvents: 'none'
          }} />

          <div className="provider-head-top">
            <div>
              <span className="eyebrow">Provider Profile</span>
              <h1>{currentProvider.providerLabel}</h1>
              <p className="section-subtitle mono" style={{ fontSize: '0.9rem' }}>{currentProvider.providerDomain}</p>
            </div>
            <div className="provider-head-actions">
              <div className="window-tabs provider-window-tabs provider-head-controls">
                {WINDOWS.map((window) => (
                  <button
                    key={window}
                    type="button"
                    className={`window-tab${selectedWindow === window ? " active" : ""}`}
                    onClick={() => setSelectedWindow(window)}
                  >
                    {window}
                  </button>
                ))}
                <Link href={`/?window=${selectedWindow}`} className="calculator-action" style={{ background: 'var(--panel-strong)', border: '1px solid var(--border)', color: 'var(--text)', boxShadow: 'none' }}>
                  Dashboard
                </Link>
              </div>
            </div>
          </div>

          <div className="provider-kpi-grid">
            <article className="panel kpi kpi-primary">
              <span className="kpi-label">Provider Revenue</span>
              <span className="kpi-value">{formatUpokt(toBigInt(currentProvider.revenueUpokt), 1)}</span>
              <span className="kpi-foot">{formatUsd(toUsdFromUpokt(currentProvider.revenueUpokt, currentData.poktPriceUsd), 0)} in window</span>
            </article>
            <article className="panel kpi">
              <span className="kpi-label">Network Share</span>
              <span className="kpi-value">{formatPercent(marketShare, 1)}</span>
              <span className="kpi-foot">Rank #{formatInteger(currentRank)} of {formatInteger(currentData.activeProviders)}</span>
            </article>
            <article className="panel kpi">
              <span className="kpi-label">Relay Traffic</span>
              <span className="kpi-value" style={{ color: 'var(--green)' }}>{formatCompactNumber(currentProvider.relays)}</span>
              <span className="kpi-foot">{formatInteger(currentProvider.relays)} total relays</span>
            </article>
            <article className="panel kpi">
              <span className="kpi-label">Operational Scale</span>
              <span className="kpi-value" style={{ color: 'var(--accent)' }}>{formatInteger(currentProvider.supplierCount)}</span>
              <span className="kpi-foot">Suppliers across {formatInteger(currentProvider.chainCount)} chains</span>
            </article>
          </div>
        </div>
      </section>

      <section className="provider-grid-top">
        <article className="panel section">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Performance Over Time</h2>
              <p className="section-subtitle">Daily provider-side revenue settled across the last 30 days.</p>
            </div>
            <span className="pill" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}>Verified History</span>
          </div>

          {history.length > 0 ? (
            <>
              <div className="provider-history-summary">
                <div className="provider-history-stat panel-inset" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <span className="hero-highlight-label">Latest Settled</span>
                  <strong style={{ color: 'var(--accent)' }}>{lastHistoryPoint ? formatUpokt(toBigInt(lastHistoryPoint.revenueUpokt), 1) : "n/a"}</strong>
                  <p style={{ fontSize: '0.8rem' }}>{lastHistoryPoint?.day ?? "No data"}</p>
                </div>
                <div className="provider-history-stat panel-inset" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <span className="hero-highlight-label">7d Momentum</span>
                  <strong style={{ color: trailing7dGrowth > 0 ? 'var(--green)' : 'var(--red)' }}>{formatPercent(trailing7dGrowth, 1)}</strong>
                  <p style={{ fontSize: '0.8rem' }}>vs previous week</p>
                </div>
                <div className="provider-history-stat panel-inset" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <span className="hero-highlight-label">24h Momentum</span>
                  <strong style={{ color: dayOverDayGrowth > 0 ? 'var(--green)' : 'var(--red)' }}>{formatPercent(dayOverDayGrowth, 1)}</strong>
                  <p style={{ fontSize: '0.8rem' }}>vs yesterday</p>
                </div>
                <div className="provider-history-stat panel-inset" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <span className="hero-highlight-label">All-Time Peak</span>
                  <strong style={{ color: 'var(--text)' }}>{bestHistoryDay ? formatUpokt(toBigInt(bestHistoryDay.revenueUpokt), 1) : "n/a"}</strong>
                  <p style={{ fontSize: '0.8rem' }}>{bestHistoryDay?.day ?? "n/a"}</p>
                </div>
              </div>

              <div className="provider-history-chart">
                {history.map((point, index) => {
                  const revenue = historyValues[index] ?? 0;
                  const average = movingAverage[index] ?? 0;
                  const height = maxHistoryRevenue === 0 ? 6 : Math.max(6, Math.round((revenue / maxHistoryRevenue) * 100));
                  const averageHeight = maxHistoryRevenue === 0 ? 6 : Math.max(6, Math.round((average / maxHistoryRevenue) * 100));
                  const isLatest = point === lastHistoryPoint;

                  return (
                    <div key={point.day} className="provider-history-bar-group" title={`${point.day}: ${formatDecimal(revenue, 1)} POKT`}>
                      <div className="provider-history-average" style={{ height: `${averageHeight}%` }} />
                      <div 
                        className="provider-history-bar" 
                        style={{ 
                          height: `${height}%`,
                          background: isLatest ? 'var(--accent)' : undefined,
                          boxShadow: isLatest ? '0 0 15px rgba(0, 194, 255, 0.4)' : undefined
                        }} 
                      />
                      <span style={{ fontWeight: isLatest ? 800 : 500, color: isLatest ? 'var(--text)' : 'var(--muted)' }}>
                        {point.day.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <p className="footer-note" style={{ textAlign: 'center', opacity: 0.8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginRight: '24px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '2px', background: 'var(--accent)' }} />
                  Daily Revenue
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '2px', background: 'rgba(245, 200, 66, 0.4)' }} />
                  7-Day Average
                </span>
              </p>
            </>
          ) : (
            <p className="footer-note">
              Daily provider history is not available for this provider yet.
            </p>
          )}
        </article>
      </section>

      <section className="section-grid provider-grid-top">
        <article className="panel section">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Growth Snapshot</h2>
              <p className="section-subtitle">Run-rate momentum and unit efficiency benchmarks.</p>
            </div>
            <span className="pill">KPI Analytics</span>
          </div>

          <div className="provider-timescale-grid">
            {WINDOWS.map((window) => {
              const provider = providerByWindow[window];
              return (
                <article key={window} className="provider-timescale-card panel-inset" style={{ border: '1px solid var(--border)' }}>
                  <span className="hero-highlight-label">{window} Snapshot</span>
                  <strong style={{ color: provider ? 'var(--text)' : 'var(--muted)' }}>{provider ? formatUpokt(toBigInt(provider.revenueUpokt), 1) : "Warming"}</strong>
                  <p style={{ fontSize: '0.8rem' }}>{provider ? `${formatDecimal(getDailyRunRate(provider, window), 1)} POKT/day run rate` : "Snapshot not ready."}</p>
                </article>
              );
            })}
          </div>

          <div className="provider-insight-list">
            <div className="insight-row"><span className="muted">Weekly Efficiency</span><strong style={{ color: 'var(--green)' }}>{formatPercent(momentum24hVs7d, 1)}</strong></div>
            <div className="insight-row"><span className="muted">Monthly Momentum</span><strong style={{ color: 'var(--green)' }}>{formatPercent(momentum7dVs30d, 1)}</strong></div>
            <div className="insight-row"><span className="muted">Revenue / Supplier</span><strong>{formatDecimal(revenuePerSupplier, 1)} POKT</strong></div>
            <div className="insight-row"><span className="muted">Revenue / Service</span><strong>{formatDecimal(revenuePerService, 1)} POKT</strong></div>
            <div className="insight-row"><span className="muted">Unit Yield (1k Relays)</span><strong style={{ color: 'var(--accent)' }}>{formatDecimal(revenuePerThousandRelays, 2)} POKT</strong></div>
            <div className="insight-row"><span className="muted">Top Chain Concentration</span><strong>{currentProvider.chains[0] ? formatPercent(getShare(currentProvider.chains[0].revenueUpokt, currentProvider.revenueUpokt), 1) : "n/a"}</strong></div>
            <div className="insight-row"><span className="muted">Source Integrity</span><strong style={{ color: 'var(--green)' }}>{currentData.dataSource === "poktscan" ? "Poktscan API" : "RPC direct"}</strong></div>
          </div>
        </article>

        <article className="panel section">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Similar Providers</h2>
              <p className="section-subtitle">Peers chosen by similar supplier footprint, service coverage, and revenue range.</p>
            </div>
            <span className="pill">Comparables</span>
          </div>

          <div className="provider-insight-list compact-gap">
            <div className="insight-row"><span className="muted">Peer median revenue</span><strong>{similarProviders.length > 0 ? `${formatDecimal(peerMedianRevenue, 1)} POKT` : "n/a"}</strong></div>
            <div className="insight-row"><span className="muted">Gap vs peer median</span><strong>{similarProviders.length > 0 ? formatDecimal(toPoktNumber(currentProvider.revenueUpokt) - peerMedianRevenue, 1) : 0} POKT</strong></div>
          </div>

          <div className="provider-list">
            {similarProviders.map((provider) => (
              <Link key={provider.providerKey} href={`/providers/${encodeURIComponent(provider.providerKey)}?window=${selectedWindow}`} className="provider-row provider-row-rich provider-row-link">
                <div className="provider-row-top">
                  <div>
                    <strong>{provider.providerLabel}</strong>
                    <div className="muted mono">{provider.providerDomain}</div>
                  </div>
                  <div className="right">
                    <strong>{formatUpokt(toBigInt(provider.revenueUpokt), 1)}</strong>
                    <div className="muted">{formatInteger(provider.supplierCount)} suppliers · {formatInteger(provider.chainCount)} services</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <section className="section-grid provider-grid-top">
        <article className="panel section">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Service Footprint</h2>
              <p className="section-subtitle">Where this provider is currently earning and how concentrated its mix is.</p>
            </div>
            <span className="pill">Coverage</span>
          </div>

          <table className="mini-table">
            <thead>
              <tr>
                <th>Chain</th>
                <th>Service ID</th>
                <th className="right">Relays</th>
                <th className="right">Revenue</th>
                <th className="right">Mix</th>
              </tr>
            </thead>
            <tbody>
              {currentProvider.chains.map((chain) => (
                <tr key={`${currentProvider.providerKey}-${chain.serviceId}`}>
                  <td>{chain.serviceName}</td>
                  <td className="mono">{chain.serviceId}</td>
                  <td className="right">{formatInteger(chain.relays)}</td>
                  <td className="right">{formatUpokt(toBigInt(chain.revenueUpokt), 1)}</td>
                  <td className="right">{formatPercent(getShare(chain.revenueUpokt, currentProvider.revenueUpokt), 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className="panel section">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Expansion Opportunities</h2>
              <p className="section-subtitle">Chains not currently monetized, ranked by yield potential for your {formatInteger(currentProvider.supplierCount)} suppliers.</p>
            </div>
            <span className="pill">Strategic Growth</span>
          </div>

          <div className="service-list" style={{ marginTop: '24px' }}>
            {opportunityServices.map((service) => {
              const scoreWidth = Math.min(100, Math.max(10, service.opportunityScore * 10));
              const isHighYield = Number(service.projectedRevenuePerSupplierUpokt) / 1_000_000 > toPoktNumber(currentProvider.revenueUpokt) / Math.max(currentProvider.supplierCount, 1) * 1.2;
              const isLowComp = service.providerCount <= 5;
              
              return (
                <div key={service.serviceId} className="service-row service-row-rich" style={{ padding: '28px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: service.opportunityScore > 7 ? 'var(--green)' : service.opportunityScore > 4 ? 'var(--accent)' : 'var(--border)' }} />
                  
                  <div className="service-row-top">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '1.2rem' }}>{service.serviceName}</strong>
                        <span className="mono" style={{ fontSize: '0.8rem', opacity: 0.6 }}>{service.serviceId}</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {isHighYield && <span className="density density-low" style={{ background: 'rgba(0, 209, 160, 0.1)', color: 'var(--green)' }}>High Yield</span>}
                        {isLowComp && <span className="density density-medium" style={{ background: 'rgba(0, 194, 255, 0.1)', color: 'var(--accent)' }}>Early Entry</span>}
                        {service.selectionProbability >= 80 && <span className="pill" style={{ fontSize: '0.7rem' }}>High Prob.</span>}
                      </div>
                    </div>
                    <div className="right">
                      <span className="hero-highlight-label" style={{ textAlign: 'right', display: 'block' }}>Est. Revenue Contribution</span>
                      <strong className="accent-number" style={{ fontSize: '1.4rem', color: 'var(--accent)' }}>+{formatUpokt(service.projectedRevenueUpokt, 1)}</strong>
                    </div>
                  </div>

                  <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
                    <div>
                      <span className="hero-highlight-label" style={{ fontSize: '9px', marginBottom: '8px', display: 'block' }}>Opportunity Score</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div className="hero-bar-track" style={{ flex: 1, height: '8px' }}>
                          <div className="hero-bar-fill" style={{ 
                            width: `${scoreWidth}%`, 
                            background: service.opportunityScore > 7 ? 'var(--green)' : 'var(--accent)' 
                          }} />
                        </div>
                        <strong style={{ fontSize: '1.1rem' }}>{formatDecimal(service.opportunityScore, 1)}</strong>
                      </div>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <span className="muted" style={{ fontSize: '0.8rem', display: 'block' }}>Yield/Supplier</span>
                        <strong style={{ fontSize: '1rem' }}>{formatUpokt(service.projectedRevenuePerSupplierUpokt, 1)}</strong>
                      </div>
                      <div>
                        <span className="muted" style={{ fontSize: '0.8rem', display: 'block' }}>Selection Prob.</span>
                        <strong style={{ fontSize: '1rem' }}>{formatPercent(service.selectionProbability, 0)}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="provider-row-metrics" style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                    <span><strong>{formatInteger(service.supplierCount)}</strong> current suppliers</span>
                    <span><strong>{formatInteger(service.providerCount)}</strong> domains</span>
                    <span><strong>{formatCompactNumber(service.relays)}</strong> daily relays</span>
                    <span><strong>{formatPercent(service.expectedSharePercent, 1)}</strong> modeled share</span>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="footer-note" style={{ background: 'var(--panel-soft)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <strong>Intelligence Note:</strong> Rankings are calculated by simulating your <strong>{formatInteger(currentProvider.supplierCount)} suppliers</strong> across all unmonetized chains. High Yield indicates services where projected revenue per unit exceeds your current average.
          </p>
        </article>
      </section>

      <section className="provider-grid-top">
        <article className="panel section">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Supplier Breakdown</h2>
              <p className="section-subtitle">Supplier-level view of the provider footprint, with revenue where the current data source exposes it.</p>
            </div>
            <span className="pill">Operators</span>
          </div>

          {supplierBreakdownVisible ? (
            <>

          <table className="mini-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th className="right">Services</th>
                <th className="right">Relays</th>
                <th className="right">Revenue</th>
              </tr>
            </thead>
            <tbody>
                {visibleSuppliers.map((supplier) => (
                  <tr key={supplier.operatorAddress}>
                    <td className="mono">
                      <a
                      href={`https://poktscan.com/supplier/${supplier.operatorAddress}`}
                      target="_blank"
                      rel="noreferrer"
                      className="supplier-link"
                    >
                      {truncateAddress(supplier.operatorAddress, 12, 6)}
                    </a>
                  </td>
                  <td className="right">{supplier.detailAvailable ? formatInteger(supplier.chainCount ?? 0) : "n/a"}</td>
                  <td className="right">{supplier.detailAvailable ? formatInteger(supplier.relays ?? 0) : "n/a"}</td>
                  <td className="right">{supplier.revenueUpokt ? formatUpokt(toBigInt(supplier.revenueUpokt), 1) : "n/a"}</td>
                </tr>
                ))}
              </tbody>
            </table>

           {hasMoreSuppliers ? (
             <div className="provider-load-more-row">
              <button
                type="button"
                className="calculator-action"
                onClick={() => setVisibleSupplierCount((current) => current + INITIAL_VISIBLE_SUPPLIERS)}
              >
                Load More
              </button>
              <span className="muted">
                 Showing {formatInteger(visibleSuppliers.length)} of {formatInteger(mergedSuppliers.length)} suppliers
               </span>
             </div>
           ) : mergedSuppliers.length > INITIAL_VISIBLE_SUPPLIERS ? (
             <div className="provider-load-more-row">
               <span className="muted">
                 Showing all {formatInteger(mergedSuppliers.length)} suppliers
               </span>
             </div>
           ) : null}

          <p className="footer-note">
            {supplierDetailAvailable
              ? `${formatInteger(supplierDetailCoverage)} of ${formatInteger(mergedSuppliers.length)} suppliers have direct revenue detail in this ${selectedWindow} snapshot.`
              : `This ${selectedWindow} snapshot does not expose direct supplier-level revenue yet.`}{" "}
            Supplier-level monetization is most reliable on finer-grained snapshots, especially <code>24h</code>. Clicking a supplier opens its Poktscan page.
          </p>
            </>
          ) : (
            <p className="footer-note">
              Supplier-level settlement breakdown is not currently available for this window. The provider footprint above remains available.
            </p>
          )}
        </article>
      </section>
    </main>
  );
}
