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
          <h2 className="section-title">Project Your Growth</h2>
          <p className="section-subtitle">
            Model your entry with PNF-bootstrapped incentives and calculate projected revenue based on current network demand.
          </p>
        </div>
        <span className="pill">Startup Incentives</span>
      </div>

      <div className="calculator-layout">
        <div className="calculator-summary">
          <div className="calculator-kpis">
            <article className="calculator-kpi-card">
              <span className="kpi-label">Addressable Revenue Pool</span>
              <strong className="kpi-value calculator-kpi-value accent-number">{formatUpokt(selectedRevenueUpokt, 1)}</strong>
              <span className="kpi-foot">Aggregated demand across selected chains</span>
            </article>

            <article className="calculator-kpi-card calculator-kpi-card-accent">
              <span className="kpi-label">Market Entry Projection</span>
              <strong className="kpi-value calculator-kpi-value accent-number">{formatUpokt(conservativeEntryUpokt, 1)}</strong>
              <span className="kpi-foot">
                Projected share based on current provider density
              </span>
            </article>
          </div>

          <div className="calculator-meta-grid">
            <div className="calculator-meta-card">
              <span className="hero-highlight-label">Target Chains</span>
              <strong className="accent-number">{formatInteger(selectedChainCount)}</strong>
              <p>{formatInteger(Math.min(selectedChainCount, FREE_SUPPLIER_BUDGET))} PNF-covered suppliers in your model.</p>
            </div>

            <div className="calculator-meta-card">
              <span className="hero-highlight-label">Startup Allowance</span>
              <strong className="accent-number">{formatInteger(remainingFreeSuppliers)}</strong>
              <p>{needsPaidSuppliers > 0 ? `${formatInteger(needsPaidSuppliers)} suppliers beyond the initial allocation.` : "No additional suppliers required."}</p>
            </div>

            <div className="calculator-meta-card">
              <span className="hero-highlight-label">Relay Demand</span>
              <strong className="accent-number">{formatCompactNumber(selectedRelays)}</strong>
              <p>Aggregated relays across the included chains.</p>
            </div>

            <div className="calculator-meta-card">
              <span className="hero-highlight-label">Efficiency Target</span>
              <strong className="accent-number">{formatUpokt(entryPerSupplierUpokt, 1)}</strong>
              <p>Projected revenue per supplier in your allocation.</p>
            </div>
          </div>

          <p className="footer-note">
            Methodology: This model estimates your entry share as <code>observed revenue / (active providers + 1)</code>. 
            It assumes a baseline entry of one supplier per selected chain within the PNF-bootstrapped allocation.
          </p>
        </div>

        <div className="calculator-checklist panel panel-inset">
          <div className="section-title-row compact-gap">
            <h3 className="section-title">Chain checklist</h3>
            <div className="calculator-actions">
              <button type="button" className="calculator-action" onClick={() => setSelectedIds(services.map((service) => service.serviceId))}>
                Select all
              </button>
              <button type="button" className="calculator-action" onClick={() => setSelectedIds([])}>
                Clear all
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
                      <span>{formatInteger(service.providerCount)} providers</span>
                      <span>{formatCompactNumber(service.relays)} relays</span>
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
