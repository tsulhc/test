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
import type { SerializedDashboardData, SerializedProviderStats, SerializedServiceStats, TimeWindow } from "@/lib/types";

const WINDOWS: TimeWindow[] = ["24h", "7d", "30d"];

type ProviderDetailViewProps = {
  providerKey: string;
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

function getDailyRunRate(provider: SerializedProviderStats | null, window: TimeWindow): number {
  if (!provider) return 0;
  return toPoktNumber(provider.revenueUpokt) / daysForWindow(window);
}

export default function ProviderDetailView({ providerKey, initialWindow, dataByWindow }: ProviderDetailViewProps) {
  const [selectedWindow, setSelectedWindow] = useState<TimeWindow>(initialWindow);
  const [dataState, setDataState] = useState<Record<TimeWindow, SerializedDashboardData | null>>(dataByWindow);
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

  const currentData = dataState[selectedWindow];
  const currentProvider = getProvider(currentData, providerKey);

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

  const opportunityServices = useMemo(() => {
    if (!currentData || !currentProvider) return [];

    const covered = new Set(currentProvider.chains.map((chain) => chain.serviceId));
    return currentData.services
      .filter((service) => !covered.has(service.serviceId))
      .map((service) => ({
        ...service,
        revenuePerProvider: toPoktNumber(service.revenueUpokt) / Math.max(service.providerCount, 1)
      }))
      .sort((a, b) => b.revenuePerProvider - a.revenuePerProvider || Number(BigInt(b.revenueUpokt) - BigInt(a.revenueUpokt)))
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
  const supplierDetailAvailable = currentProvider.suppliers.some((supplier) => supplier.detailAvailable && supplier.revenueUpokt);
  const supplierDetailCoverage = currentProvider.suppliers.filter((supplier) => supplier.detailAvailable && supplier.revenueUpokt).length;

  return (
    <main className="page provider-page">
      <section className="hero provider-hero">
        <div className="provider-head panel">
          <div className="provider-head-top">
            <div>
              <span className="eyebrow">Provider detail</span>
              <h1>{currentProvider.providerLabel}</h1>
              <p className="section-subtitle mono">{currentProvider.providerDomain}</p>
            </div>
            <div className="provider-head-actions">
              <div className="window-tabs provider-window-tabs">
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
            </div>
          </div>

          <div className="provider-kpi-grid">
            <article className="panel kpi kpi-primary">
              <span className="kpi-label">Provider-side revenue</span>
              <span className="kpi-value">{formatUpokt(toBigInt(currentProvider.revenueUpokt), 1)}</span>
              <span className="kpi-foot">{formatUsd(toUsdFromUpokt(currentProvider.revenueUpokt, currentData.poktPriceUsd), 0)} in {formatRelativeRange(selectedWindow)}</span>
            </article>
            <article className="panel kpi">
              <span className="kpi-label">Market share</span>
              <span className="kpi-value">{formatPercent(marketShare, 1)}</span>
              <span className="kpi-foot">Rank #{formatInteger(currentRank)} among {formatInteger(currentData.activeProviders)} active providers</span>
            </article>
            <article className="panel kpi">
              <span className="kpi-label">Relay volume</span>
              <span className="kpi-value">{formatCompactNumber(currentProvider.relays)}</span>
              <span className="kpi-foot">{formatInteger(currentProvider.relays)} relays across {formatInteger(currentProvider.chainCount)} services</span>
            </article>
            <article className="panel kpi">
              <span className="kpi-label">Supplier footprint</span>
              <span className="kpi-value">{formatInteger(currentProvider.supplierCount)}</span>
              <span className="kpi-foot">{formatDecimal(revenuePerSupplier, 1)} POKT per supplier in this window</span>
            </article>
          </div>
        </div>
      </section>

      <section className="section-grid provider-grid-top">
        <article className="panel section">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Performance Snapshot</h2>
              <p className="section-subtitle">Current efficiency, concentration, and monetization quality for this provider.</p>
            </div>
            <span className="pill">{formatRelativeRange(selectedWindow)}</span>
          </div>

          <div className="provider-insight-list">
            <div className="insight-row"><span className="muted">Revenue per supplier</span><strong>{formatDecimal(revenuePerSupplier, 1)} POKT</strong></div>
            <div className="insight-row"><span className="muted">Revenue per service</span><strong>{formatDecimal(revenuePerService, 1)} POKT</strong></div>
            <div className="insight-row"><span className="muted">Revenue per 1k relays</span><strong>{formatDecimal(revenuePerThousandRelays, 2)} POKT</strong></div>
            <div className="insight-row"><span className="muted">Top service concentration</span><strong>{currentProvider.chains[0] ? formatPercent(getShare(currentProvider.chains[0].revenueUpokt, currentProvider.revenueUpokt), 1) : "n/a"}</strong></div>
            <div className="insight-row"><span className="muted">Live data source</span><strong>{currentData.dataSource === "poktscan" ? "Poktscan" : "RPC fallback"}</strong></div>
            {isPending ? <div className="insight-row"><span className="muted">Background refresh</span><strong>Updating window snapshot</strong></div> : null}
          </div>
        </article>

        <article className="panel section">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Growth Signal</h2>
              <p className="section-subtitle">A simple run-rate view using the available 24h, 7d, and 30d snapshots.</p>
            </div>
            <span className="pill">Momentum</span>
          </div>

          <div className="provider-timescale-grid">
            {WINDOWS.map((window) => {
              const provider = providerByWindow[window];
              return (
                <article key={window} className="provider-timescale-card">
                  <span className="hero-highlight-label">{window}</span>
                  <strong>{provider ? formatUpokt(toBigInt(provider.revenueUpokt), 1) : "Warming"}</strong>
                  <p>{provider ? `${formatDecimal(getDailyRunRate(provider, window), 1)} POKT/day run rate` : "Snapshot not ready yet."}</p>
                </article>
              );
            })}
          </div>

          <div className="provider-insight-list">
            <div className="insight-row"><span className="muted">24h vs 7d run rate</span><strong>{formatPercent(momentum24hVs7d, 1)}</strong></div>
            <div className="insight-row"><span className="muted">7d vs 30d run rate</span><strong>{formatPercent(momentum7dVs30d, 1)}</strong></div>
          </div>
        </article>
      </section>

      <section className="section-grid provider-grid-top">
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

        <article className="panel section">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Expansion Opportunities</h2>
              <p className="section-subtitle">High-value services the provider is not currently monetizing in this window.</p>
            </div>
            <span className="pill">Next chains</span>
          </div>

          <div className="service-list">
            {opportunityServices.map((service) => (
              <div key={service.serviceId} className="service-row service-row-rich">
                <div className="service-row-top">
                  <div>
                    <strong>{service.serviceName}</strong>
                    <div className="muted mono">{service.serviceId}</div>
                  </div>
                  <div className="right">
                    <strong>{formatUpokt(toBigInt(service.revenueUpokt), 1)}</strong>
                    <div className="muted">{formatInteger(service.providerCount)} active providers</div>
                  </div>
                </div>
                <div className="provider-row-metrics">
                  <span>{formatDecimal(service.revenuePerProvider, 1)} POKT per provider</span>
                  <span>{formatCompactNumber(service.relays)} relays</span>
                </div>
              </div>
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
              <h2 className="section-title">Supplier Breakdown</h2>
              <p className="section-subtitle">Supplier-level view of the provider footprint, with revenue where the current data source exposes it.</p>
            </div>
            <span className="pill">Operators</span>
          </div>

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
              {currentProvider.suppliers.map((supplier) => (
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

          <p className="footer-note">
            {supplierDetailAvailable
              ? `${formatInteger(supplierDetailCoverage)} of ${formatInteger(currentProvider.suppliers.length)} suppliers have direct revenue detail in this ${selectedWindow} snapshot.`
              : `This ${selectedWindow} snapshot does not expose direct supplier-level revenue yet.`}{" "}
            Supplier-level monetization is most reliable on finer-grained snapshots, especially <code>24h</code>. Clicking a supplier opens its Poktscan page.
          </p>
        </article>
      </section>
    </main>
  );
}
