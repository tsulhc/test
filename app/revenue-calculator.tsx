"use client";

import { useMemo, useState } from "react";

import { formatCompactNumber, formatDecimal, formatInteger, formatUsd, formatUpokt } from "@/lib/format";

type CalculatorService = {
  serviceId: string;
  serviceName: string;
  relays: number;
  revenueUpokt: string;
  providerCount: number;
};

type RevenueCalculatorProps = {
  poktPriceUsd: number;
  services: CalculatorService[];
};

const FREE_SUPPLIER_BUDGET = 15;

function toUsdFromUpokt(value: bigint, poktPriceUsd: number): number {
  return (Number(value) / 1_000_000) * poktPriceUsd;
}

export default function RevenueCalculator({ poktPriceUsd, services }: RevenueCalculatorProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(services.map((service) => service.serviceId));

  const selectedServices = useMemo(() => {
    const selected = new Set(selectedIds);
    return services.filter((service) => selected.has(service.serviceId));
  }, [selectedIds, services]);

  const selectedRevenueUpokt = selectedServices.reduce((sum, service) => sum + BigInt(service.revenueUpokt), 0n);
  const selectedRelays = selectedServices.reduce((sum, service) => sum + service.relays, 0);
  const conservativeEntryUpokt = selectedServices.reduce(
    (sum, service) => sum + BigInt(service.revenueUpokt) / BigInt(Math.max(service.providerCount + 1, 1)),
    0n
  );
  const selectedChainCount = selectedServices.length;
  const remainingFreeSuppliers = Math.max(0, FREE_SUPPLIER_BUDGET - selectedChainCount);
  const needsPaidSuppliers = Math.max(0, selectedChainCount - FREE_SUPPLIER_BUDGET);
  const entryPerSupplierUpokt =
    selectedChainCount === 0 ? 0n : conservativeEntryUpokt / BigInt(Math.min(selectedChainCount, FREE_SUPPLIER_BUDGET));

  function toggleService(serviceId: string) {
    setSelectedIds((current) =>
      current.includes(serviceId) ? current.filter((entry) => entry !== serviceId) : [...current, serviceId]
    );
  }

  return (
    <section className="panel section calculator-section">
      <div className="section-title-row calculator-title-row">
        <div>
          <h2 className="section-title">Revenue calculator</h2>
          <p className="section-subtitle">
            Assume 15 supplier gratuiti forniti da PNF e una prima copertura da 1 supplier per chain selezionata.
          </p>
        </div>
        <span className="pill">PNF bootstrapped</span>
      </div>

      <div className="calculator-layout">
        <div className="calculator-summary">
          <div className="calculator-kpis">
            <article className="calculator-kpi-card">
              <span className="kpi-label">Revenue pool selezionato</span>
              <strong className="kpi-value calculator-kpi-value">{formatUpokt(selectedRevenueUpokt, 1)}</strong>
              <span className="kpi-foot">{formatUsd(toUsdFromUpokt(selectedRevenueUpokt, poktPriceUsd), 0)} nel campione</span>
            </article>

            <article className="calculator-kpi-card calculator-kpi-card-accent">
              <span className="kpi-label">Entry scenario prudente</span>
              <strong className="kpi-value calculator-kpi-value">{formatUpokt(conservativeEntryUpokt, 1)}</strong>
              <span className="kpi-foot">
                {formatUsd(toUsdFromUpokt(conservativeEntryUpokt, poktPriceUsd), 0)} se dividi il pool con i provider gia attivi
              </span>
            </article>
          </div>

          <div className="calculator-meta-grid">
            <div className="calculator-meta-card">
              <span className="hero-highlight-label">Chain selezionate</span>
              <strong>{formatInteger(selectedChainCount)}</strong>
              <p>{formatInteger(Math.min(selectedChainCount, FREE_SUPPLIER_BUDGET))} supplier PNF allocati nella stima.</p>
            </div>

            <div className="calculator-meta-card">
              <span className="hero-highlight-label">Supplier gratuiti residui</span>
              <strong>{formatInteger(remainingFreeSuppliers)}</strong>
              <p>{needsPaidSuppliers > 0 ? `${formatInteger(needsPaidSuppliers)} oltre il bundle PNF.` : "Nessun supplier extra richiesto."}</p>
            </div>

            <div className="calculator-meta-card">
              <span className="hero-highlight-label">Relay coperti</span>
              <strong>{formatCompactNumber(selectedRelays)}</strong>
              <p>{formatInteger(selectedRelays)} relay sulle chain incluse.</p>
            </div>

            <div className="calculator-meta-card">
              <span className="hero-highlight-label">Revenue / supplier gratuito</span>
              <strong>{formatUpokt(entryPerSupplierUpokt, 1)}</strong>
              <p>{formatUsd(toUsdFromUpokt(entryPerSupplierUpokt, poktPriceUsd), 0)} per supplier incluso.</p>
            </div>
          </div>

          <p className="footer-note">
            Formula: per ogni chain selezionata il calcolo usa la revenue osservata nel range corrente e una quota di ingresso
            pari a <code>revenue / (provider attivi + 1)</code>. E una stima prudente, non un forecast contrattuale.
          </p>
        </div>

        <div className="calculator-checklist panel panel-inset">
          <div className="section-title-row compact-gap">
            <h3 className="section-title">Chain checklist</h3>
            <div className="calculator-actions">
              <button type="button" className="calculator-action" onClick={() => setSelectedIds(services.map((service) => service.serviceId))}>
                Tutte
              </button>
              <button type="button" className="calculator-action" onClick={() => setSelectedIds([])}>
                Nessuna
              </button>
            </div>
          </div>

          <div className="calculator-list">
            {services.map((service) => {
              const checked = selectedIds.includes(service.serviceId);

              return (
                <label key={service.serviceId} className={`calculator-item${checked ? " is-checked" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleService(service.serviceId)}
                  />
                  <div className="calculator-item-copy">
                    <div className="calculator-item-head">
                      <strong>{service.serviceName}</strong>
                      <span className="mono">{service.serviceId}</span>
                    </div>
                    <div className="calculator-item-meta">
                      <span>{formatUpokt(BigInt(service.revenueUpokt), 1)}</span>
                      <span>{formatInteger(service.providerCount)} provider</span>
                      <span>{formatCompactNumber(service.relays)} relay</span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
