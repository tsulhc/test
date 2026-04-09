import Link from "next/link";

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
import { getDashboardData } from "@/lib/pocket";
import type { ProviderStats, ServiceStats, TimeWindow } from "@/lib/types";

const WINDOWS: TimeWindow[] = ["24h", "7d", "30d"];

type PageProps = {
  searchParams?: Promise<{
    window?: string;
  }>;
};

function isWindow(value: string | undefined): value is TimeWindow {
  return value === "24h" || value === "7d" || value === "30d";
}

function toPoktNumber(value: bigint): number {
  return Number(value) / 1_000_000;
}

function toUsdFromUpokt(value: bigint, poktPriceUsd: number): number {
  return toPoktNumber(value) * poktPriceUsd;
}

function getShare(part: bigint | number, total: bigint | number): number {
  if (typeof part === "bigint" || typeof total === "bigint") {
    const totalBig = typeof total === "bigint" ? total : BigInt(total);
    const partBig = typeof part === "bigint" ? part : BigInt(part);
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

function HeroBars({ providers }: { providers: ProviderStats[] }) {
  const topProviders = providers.slice(0, 6);
  const maxRevenue = topProviders[0]?.revenueUpokt ?? 0n;

  return (
    <div className="hero-bars">
      {topProviders.map((provider, index) => {
        const width = maxRevenue === 0n ? 0 : Math.max(8, Math.round((Number(provider.revenueUpokt) / Number(maxRevenue)) * 100));

        return (
          <div key={provider.providerKey} className="hero-bar-row">
            <div className="hero-bar-meta">
              <span>#{index + 1}</span>
              <span>{provider.providerLabel}</span>
            </div>
            <div className="hero-bar-track">
              <div className="hero-bar-fill" style={{ width: `${width}%` }} />
            </div>
            <strong>{formatUpokt(provider.revenueUpokt, 1)}</strong>
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
          background: `conic-gradient(from 220deg, #84f1bd 0deg, #5ea7ff ${degrees}deg, rgba(255,255,255,0.08) ${degrees}deg 360deg)`
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
  providers: ProviderStats[];
  totalRevenue: bigint;
  poktPriceUsd: number;
}) {
  const topProviders = providers.slice(0, 8);
  const maxRevenue = topProviders[0]?.revenueUpokt ?? 0n;

  return (
    <div className="chart-list">
      {topProviders.map((provider, index) => {
        const width = maxRevenue === 0n ? 0 : Math.max(6, Math.round((Number(provider.revenueUpokt) / Number(maxRevenue)) * 100));
        const share = getShare(provider.revenueUpokt, totalRevenue);

        return (
          <div key={provider.providerKey} className="chart-row">
            <div className="chart-row-head">
              <div>
                <strong>#{index + 1} {provider.providerLabel}</strong>
                <div className="muted mono">{provider.providerDomain}</div>
              </div>
              <div className="right">
                <strong>{formatUpokt(provider.revenueUpokt, 1)}</strong>
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

function OpportunityMap({ services, totalRevenue }: { services: ServiceStats[]; totalRevenue: bigint }) {
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
                {service.providerCount} provider
              </span>
            </div>
            <div className="opportunity-metric-row">
              <span className="muted">Revenue totale</span>
              <strong>{formatUpokt(service.revenueUpokt, 1)}</strong>
            </div>
            <div className="opportunity-metric-row">
              <span className="muted">Revenue / provider attivo</span>
              <strong>{formatDecimal(perProvider, 1)} POKT</strong>
            </div>
            <div className="opportunity-track">
              <div className="opportunity-fill" style={{ width: `${width}%` }} />
            </div>
            <div className="opportunity-foot">
              <span>{formatInteger(service.relays)} relay</span>
              <span>{formatPercent(share, 1)} della revenue totale</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default async function Home({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const window = isWindow(resolvedSearchParams.window) ? resolvedSearchParams.window : "24h";
  const data = await getDashboardData(window);

  const topProvider = data.providers[0];
  const topService = data.services[0];
  const averageRevenuePerProvider = data.activeProviders === 0 ? 0 : toPoktNumber(data.totalRevenueUpokt) / data.activeProviders;
  const medianRevenuePerProvider = median(data.providers.map((provider) => toPoktNumber(provider.revenueUpokt)));
  const revenuePerThousandRelays = data.totalRelays === 0 ? 0 : (toPoktNumber(data.totalRevenueUpokt) / data.totalRelays) * 1000;
  const topProviderShare = topProvider ? getShare(topProvider.revenueUpokt, data.totalRevenueUpokt) : 0;
  const top5ProviderShare = getShare(
    data.providers.slice(0, 5).reduce((sum, provider) => sum + provider.revenueUpokt, 0n),
    data.totalRevenueUpokt
  );
  const top5ServiceShare = getShare(
    data.services.slice(0, 5).reduce((sum, service) => sum + service.revenueUpokt, 0n),
    data.totalRevenueUpokt
  );
  const totalRevenueUsd = toUsdFromUpokt(data.totalRevenueUpokt, data.poktPriceUsd);
  const averageRevenuePerProviderUsd = averageRevenuePerProvider * data.poktPriceUsd;
  const revenuePerThousandRelaysUsd = revenuePerThousandRelays * data.poktPriceUsd;

  return (
    <main className="page">
      <section className="hero hero-stack">
        <div className="panel hero-showcase">
          <div className="hero-main">
            <div className="hero-copy hero-copy-strong">
              <span className="eyebrow">Pocket Provider Onboarding</span>
              <h1>Quanto gira davvero il protocollo lato provider.</h1>
              <p>
                Questa RC0 trasforma i settlement live di Pocket in una lettura immediata della redditivita: quanta
                revenue e stata distribuita, dove si concentra, e quali chain mostrano spazio per nuovi provider.
              </p>

              <div className="window-tabs" aria-label="time windows">
                {WINDOWS.map((entry) => {
                  const active = entry === window;
                  return (
                    <Link
                      key={entry}
                      className={`window-tab${active ? " active" : ""}`}
                      href={`/?window=${entry}`}
                    >
                      {entry}
                    </Link>
                  );
                })}
              </div>

              <div className="hero-highlight-grid">
                <div className="hero-highlight">
                  <span className="hero-highlight-label">Revenue lato provider</span>
                  <strong>{formatUpokt(data.totalRevenueUpokt, 1)}</strong>
                  <p>{formatUsd(totalRevenueUsd, 0)} nel range {formatRelativeRange(window)}.</p>
                </div>
                <div className="hero-highlight">
                  <span className="hero-highlight-label">Revenue media / provider</span>
                  <strong>{formatDecimal(averageRevenuePerProvider, 1)} POKT</strong>
                  <p>{formatUsd(averageRevenuePerProviderUsd, 0)} per provider attivo nel campione.</p>
                </div>
              </div>
            </div>

            <aside className="hero-side panel panel-inset">
              <div className="section-title-row compact-gap">
                <h2 className="section-title">Leaderboard live</h2>
                <span className="pill">{formatRelativeRange(window)}</span>
              </div>
              <HeroBars providers={data.providers} />
            </aside>
          </div>
        </div>

        <div className="hero-support-grid">
          <article className="panel hero-meta">
            <div className="section-title-row compact-gap">
              <h2 className="section-title">What to look at first</h2>
              <span className="pill">Runtime</span>
            </div>
            <div className="insight-list">
              <div className="insight-row">
                <span className="muted">Latest chain height</span>
                <strong>{formatInteger(data.latestHeight)}</strong>
              </div>
              <div className="insight-row">
                <span className="muted">Settlement block letti</span>
                <strong>{formatInteger(data.scannedSettlementHeights)}</strong>
              </div>
              <div className="insight-row">
                <span className="muted">EventClaimSettled aggregati</span>
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
                <span className="muted">Top chain</span>
                <strong>{topService ? topService.serviceName : "n/a"}</strong>
              </div>
              <div className="insight-row">
                <span className="muted">Ultimo refresh</span>
                <strong>{new Date(data.generatedAt).toLocaleString("it-IT")}</strong>
              </div>
            </div>
          </article>

          <article className="panel narrative-card">
            <span className="eyebrow eyebrow-ghost">Quick read</span>
            <h2>Se entrassi oggi nel protocollo, questi sono i numeri da pesare.</h2>
            <ul className="narrative-points">
              <li>
                <strong>{formatDecimal(revenuePerThousandRelays, 2)} POKT</strong> ogni 1.000 relay nel campione live.
              </li>
              <li>
                <strong>{formatUsd(revenuePerThousandRelaysUsd, 2)}</strong> per 1.000 relay al prezzo live di CoinGecko.
              </li>
              <li>
                <strong>{formatDecimal(medianRevenuePerProvider, 1)} POKT</strong> e la mediana per provider attivo.
              </li>
              <li>
                <strong>{topService ? topService.serviceName : "n/a"}</strong> e il service che sta drenando piu revenue.
              </li>
            </ul>
          </article>
        </div>
      </section>

      <section className="kpi-grid kpi-grid-strong">
        <article className="panel kpi kpi-primary">
          <span className="kpi-label">Provider-side revenue</span>
          <span className="kpi-value">{formatUpokt(data.totalRevenueUpokt)}</span>
          <span className="kpi-foot">{formatUsd(totalRevenueUsd, 0)} al prezzo live di CoinGecko</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Relay eseguiti</span>
          <span className="kpi-value">{formatCompactNumber(data.totalRelays)}</span>
          <span className="kpi-foot">{formatInteger(data.totalRelays)} relay nel campione live</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Revenue media / provider</span>
          <span className="kpi-value">{formatDecimal(averageRevenuePerProvider, 1)} POKT</span>
          <span className="kpi-foot">{formatUsd(averageRevenuePerProviderUsd, 0)} per provider nel range</span>
        </article>
        <article className="panel kpi">
          <span className="kpi-label">Revenue / 1k relay</span>
          <span className="kpi-value">{formatDecimal(revenuePerThousandRelays, 2)} POKT</span>
          <span className="kpi-foot">{formatUsd(revenuePerThousandRelaysUsd, 2)} per 1.000 relay</span>
        </article>
      </section>

      <section className="section-grid section-grid-visual">
        <article className="panel section section-visual">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Revenue concentration</h2>
              <p className="section-subtitle">Ti dice quanto il mercato e gia saturo o ancora contendibile.</p>
            </div>
            <span className="pill">Competition view</span>
          </div>

          <div className="donut-grid">
            <DonutMeter
              value={topProviderShare}
              label="Top provider"
              detail="Quota di revenue catturata dal primo provider-domain nel range selezionato."
            />
            <DonutMeter
              value={top5ProviderShare}
              label="Top 5 provider"
              detail="Se il top 5 pesa troppo, il mercato e piu concentrato e l'onboarding e piu competitivo."
            />
            <DonutMeter
              value={top5ServiceShare}
              label="Top 5 chain"
              detail="Misura quanto la domanda economica e concentrata su pochi service."
            />
          </div>
        </article>

        <article className="panel section section-visual">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Top provider revenue curve</h2>
              <p className="section-subtitle">Barre comparative per capire subito chi sta gia monetizzando.</p>
            </div>
            <span className="pill">Revenue ranking</span>
          </div>

          <ProviderRevenueChart providers={data.providers} totalRevenue={data.totalRevenueUpokt} poktPriceUsd={data.poktPriceUsd} />
        </article>
      </section>

      <section className="panel section section-opportunity">
        <div className="section-title-row">
          <div>
            <h2 className="section-title">Chain opportunity map</h2>
            <p className="section-subtitle">
              Evidenzia dove si concentra la revenue e quanta competizione c&apos;e gia per service.
            </p>
          </div>
          <span className="pill">Onboarding focus</span>
        </div>

        <OpportunityMap services={data.services} totalRevenue={data.totalRevenueUpokt} />
      </section>

      <section className="section-grid">
        <article className="panel section">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Market leaders</h2>
              <p className="section-subtitle">I provider-domain da osservare per capire il benchmark economico del momento.</p>
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
                      <strong>{formatUpokt(provider.revenueUpokt, 1)}</strong>
                      <div className="muted">{formatUsd(toUsdFromUpokt(provider.revenueUpokt, data.poktPriceUsd), 0)} · {formatInteger(provider.relays)} relay</div>
                    </div>
                  </div>
                  <div className="provider-row-metrics">
                    <span>{formatPercent(share, 1)} della revenue</span>
                    <span>{formatInteger(provider.chainCount)} chain attive</span>
                    <span>{formatInteger(provider.supplierCount)} supplier</span>
                    <span>{formatDecimal(toPoktNumber(provider.revenueUpokt) / Math.max(provider.chainCount, 1), 1)} POKT / chain</span>
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="panel section">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Most attractive chains</h2>
              <p className="section-subtitle">Revenue e densita provider per identificare service interessanti.</p>
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
                      <strong>{formatUpokt(service.revenueUpokt, 1)}</strong>
                      <div className="muted">{formatUsd(toUsdFromUpokt(service.revenueUpokt, data.poktPriceUsd), 0)} · {formatInteger(service.relays)} relay</div>
                    </div>
                  </div>
                  <div className="provider-row-metrics">
                    <span>{formatInteger(service.providerCount)} provider attivi</span>
                    <span>{formatDecimal(revenuePerProvider, 1)} POKT / provider</span>
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
            <h2 className="section-title">Provider x Chain breakdown</h2>
            <p className="section-subtitle">Dettaglio operativo per confrontare mix di chain e monetizzazione dei provider piu forti.</p>
          </div>
          <span className="pill">{Math.min(data.providers.length, 12)} provider mostrati</span>
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
                  <strong>{formatUpokt(provider.revenueUpokt)}</strong>
                  <div className="muted">{formatUsd(toUsdFromUpokt(provider.revenueUpokt, data.poktPriceUsd), 0)} · {formatInteger(provider.relays)} relay</div>
                </div>
              </div>

              <div className="provider-stats provider-stats-strong">
                <span>{formatInteger(provider.chainCount)} chain attive</span>
                <span>{formatInteger(provider.supplierCount)} supplier</span>
                <span>{formatDecimal(toPoktNumber(provider.revenueUpokt) / Math.max(provider.chainCount, 1), 1)} POKT / chain</span>
                <span>{formatDecimal((provider.relays / Math.max(provider.chainCount, 1)), 0)} relay / chain</span>
              </div>

              <div className="provider-stats provider-stats-strong">
                {provider.suppliers.slice(0, 6).map((supplier) => (
                  <span key={supplier.operatorAddress} className="mono">
                    {truncateAddress(supplier.operatorAddress, 10, 6)}
                  </span>
                ))}
                {provider.supplierCount > 6 ? <span>+{provider.supplierCount - 6} altri supplier</span> : null}
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
                      <td className="right">{formatUpokt(chain.revenueUpokt, 1)}</td>
                      <td className="right">{formatPercent(getShare(chain.revenueUpokt, provider.revenueUpokt), 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ))}
        </div>

        <p className="footer-note">
          RC0 live demo: nessun database, aggregazione in memoria con cache breve. Per restare usabile su RPC pubblici,
          ogni finestra usa un campione recente di settlement block e salta automaticamente i <code>block_results</code>
          troppo pesanti o lenti. I supplier vengono raggruppati per dominio ricavato dagli endpoint onchain, con
          fallback su owner address quando il dominio non e disponibile. Questa UI e pensata per dare una lettura
          immediata della redditivita, non ancora una contabilita completa storica come la futura RC1.
        </p>
      </section>
    </main>
  );
}
