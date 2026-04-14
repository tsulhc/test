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
const DEFAULT_SELECTED_CHAIN_COUNT = 10;
const SESSION_DURATION_MINUTES = 30;
const SESSION_SUPPLIER_SLOTS = 50;

function clampSupplierCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(250, Math.trunc(value)));
}

function toUsdFromUpokt(value: bigint, poktPriceUsd: number): number {
  return (Number(value) / 1_000_000) * poktPriceUsd;
}

export default function RevenueCalculator({ poktPriceUsd, services }: RevenueCalculatorProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    services.slice(0, DEFAULT_SELECTED_CHAIN_COUNT).map((service) => service.serviceId)
  );
  const [supplierCount, setSupplierCount] = useState<number>(FREE_SUPPLIER_BUDGET);

  const selectedServices = useMemo(() => {
    const selected = new Set(selectedIds);
    return services.filter((service) => selected.has(service.serviceId));
  }, [selectedIds, services]);

  const supplierAllocation = useMemo(() => {
    const allocation = new Map<string, number>();
    if (selectedServices.length === 0 || supplierCount === 0) {
      return allocation;
    }

    for (const service of selectedServices) {
      allocation.set(service.serviceId, 0);
    }

    let remainingSuppliers = supplierCount;

    for (const service of selectedServices) {
      if (remainingSuppliers === 0) {
        break;
      }

      allocation.set(service.serviceId, 1);
      remainingSuppliers -= 1;
    }

    for (let index = 0; index < remainingSuppliers; index += 1) {
      const service = selectedServices[index % selectedServices.length];
      allocation.set(service.serviceId, (allocation.get(service.serviceId) ?? 0) + 1);
    }

    return allocation;
  }, [selectedServices, supplierCount]);

  const selectedRevenueUpokt = selectedServices.reduce((sum, service) => sum + BigInt(service.revenueUpokt), 0n);
  const selectedRelays = selectedServices.reduce((sum, service) => sum + service.relays, 0);
  const projectedEntryUpokt = selectedServices.reduce((sum, service) => {
    const allocatedSuppliers = supplierAllocation.get(service.serviceId) ?? 0;
    if (allocatedSuppliers === 0) {
      return sum;
    }

    const effectiveCompetitivePool = Math.max(SESSION_SUPPLIER_SLOTS, service.providerCount);
    const modeledShareNumerator = Math.min(allocatedSuppliers, effectiveCompetitivePool);

    return sum + (BigInt(service.revenueUpokt) * BigInt(modeledShareNumerator)) / BigInt(effectiveCompetitivePool);
  }, 0n);
  const selectedChainCount = selectedServices.length;
  const coveredChainCount = selectedServices.filter((service) => (supplierAllocation.get(service.serviceId) ?? 0) > 0).length;
  const foundationCoveredSuppliers = Math.min(supplierCount, FREE_SUPPLIER_BUDGET);
  const selfFundedSuppliers = Math.max(0, supplierCount - FREE_SUPPLIER_BUDGET);
  const entryPerSupplierUpokt = supplierCount === 0 ? 0n : projectedEntryUpokt / BigInt(supplierCount);

  function toggleService(serviceId: string) {
    setSelectedIds((current) =>
      current.includes(serviceId) ? current.filter((entry) => entry !== serviceId) : [...current, serviceId]
    );
  }

  function resetTopChains() {
    setSelectedIds(services.slice(0, DEFAULT_SELECTED_CHAIN_COUNT).map((service) => service.serviceId));
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
          <div className="calculator-assumption panel panel-inset">
            <div>
              <span className="hero-highlight-label">Default Assumption</span>
              <strong className="accent-number">15 Foundation-covered suppliers</strong>
              <p>
                The calculator starts from the Foundation assumption of <strong>15 free suppliers</strong>. It also uses a
                simple Pocket session model: sessions last <strong>{SESSION_DURATION_MINUTES} minutes</strong> and only <strong>{SESSION_SUPPLIER_SLOTS} suppliers</strong> are selected to receive traffic in each session.
                You can change your planned supplier count below.
              </p>
            </div>

            <label className="calculator-input-group">
              <span className="hero-highlight-label">Planned suppliers</span>
              <input
                type="number"
                min={0}
                max={250}
                step={1}
                value={supplierCount}
                onChange={(event) => setSupplierCount(clampSupplierCount(Number(event.target.value)))}
              />
            </label>
          </div>

          <div className="calculator-kpis">
            <article className="calculator-kpi-card">
              <span className="kpi-label">Addressable Revenue Pool</span>
              <strong className="kpi-value calculator-kpi-value accent-number">{formatUpokt(selectedRevenueUpokt, 1)}</strong>
              <span className="kpi-foot">Aggregated demand across selected chains</span>
            </article>

            <article className="calculator-kpi-card calculator-kpi-card-accent">
              <span className="kpi-label">Market Entry Projection</span>
              <strong className="kpi-value calculator-kpi-value accent-number">{formatUpokt(projectedEntryUpokt, 1)}</strong>
              <span className="kpi-foot">
                Session-aware estimate based on selected chains and planned supplier count
              </span>
            </article>
          </div>

          <div className="calculator-meta-grid">
            <div className="calculator-meta-card">
              <span className="hero-highlight-label">Target Chains</span>
              <strong className="accent-number">{formatInteger(selectedChainCount)}</strong>
              <p>{formatInteger(coveredChainCount)} of them receive at least one modeled supplier.</p>
            </div>

            <div className="calculator-meta-card">
              <span className="hero-highlight-label">Supplier Plan</span>
              <strong className="accent-number">{formatInteger(supplierCount)}</strong>
              <p>
                {formatInteger(foundationCoveredSuppliers)} Foundation-covered, {formatInteger(selfFundedSuppliers)} self-funded.
              </p>
            </div>

            <div className="calculator-meta-card">
              <span className="hero-highlight-label">Session Model</span>
              <strong className="accent-number">{formatInteger(SESSION_SUPPLIER_SLOTS)}</strong>
              <p>Selected suppliers per {formatInteger(SESSION_DURATION_MINUTES)}-minute session.</p>
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
            <strong>Methodology:</strong> The default model assumes 15 free suppliers from the Foundation. Your planned
            suppliers are allocated across the selected chains, prioritizing the most profitable ones first. For each chain,
            the calculator uses the observed revenue and estimates your expected session share as <code>suppliers / max({SESSION_SUPPLIER_SLOTS}, active_providers)</code>, using active provider domains as a
            simple proxy for the competitive supplier pool.
          </p>

        </div>

        <div className="calculator-checklist panel panel-inset">
          <div className="section-title-row compact-gap">
            <div>
              <h3 className="section-title">Chain checklist</h3>
              <p className="section-subtitle">Default selection: the 10 most profitable chains in the current window.</p>
            </div>
            <div className="calculator-actions">
              <button type="button" className="calculator-action" onClick={resetTopChains}>
                Top 10 default
              </button>
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
