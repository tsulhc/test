"use client";

import { useMemo, useState } from "react";

import { formatCompactNumber, formatDecimal, formatInteger, formatUsd, formatUpokt } from "@/lib/format";
import {
  allocateSuppliersByMarginalReturn,
  buildAllocatedServiceOpportunity,
  DEFAULT_NEW_PROVIDER_SUPPLIERS,
  SESSION_SUPPLIER_SLOTS
} from "@/lib/opportunities";

type CalculatorService = {
  serviceId: string;
  serviceName: string;
  relays: number;
  revenueUpokt: string;
  providerCount: number;
  supplierCount?: number;
};

type RevenueCalculatorProps = {
  poktPriceUsd: number;
  services: CalculatorService[];
};

const FREE_SUPPLIER_BUDGET = DEFAULT_NEW_PROVIDER_SUPPLIERS;
const DEFAULT_SELECTED_CHAIN_COUNT = 10;
const SESSION_DURATION_MINUTES = 30;

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
    return allocateSuppliersByMarginalReturn(selectedServices, supplierCount);
  }, [selectedServices, supplierCount]);

  const selectedRevenueUpokt = selectedServices.reduce((sum, service) => sum + BigInt(service.revenueUpokt), 0n);
  const selectedRelays = selectedServices.reduce((sum, service) => sum + service.relays, 0);
  const serviceOpportunities = selectedServices.map((service) =>
    buildAllocatedServiceOpportunity(service, supplierCount, supplierAllocation.get(service.serviceId) ?? 0)
  );
  const projectedEntryUpokt = serviceOpportunities.reduce((sum, service) => sum + service.projectedRevenueUpokt, 0n);
  const selectedChainCount = selectedServices.length;
  const coveredChainCount = selectedServices.filter((service) => (supplierAllocation.get(service.serviceId) ?? 0) > 0).length;
  const foundationCoveredSuppliers = Math.min(supplierCount, FREE_SUPPLIER_BUDGET);
  const selfFundedSuppliers = Math.max(0, supplierCount - FREE_SUPPLIER_BUDGET);
  const entryPerSupplierUpokt = supplierCount === 0 ? 0n : projectedEntryUpokt / BigInt(supplierCount);
  const averageSelectionProbability = serviceOpportunities.length === 0
    ? 0
    : serviceOpportunities.reduce((sum, service) => sum + service.selectionProbability, 0) / serviceOpportunities.length;

  function toggleService(serviceId: string) {
    setSelectedIds((current) =>
      current.includes(serviceId) ? current.filter((entry) => entry !== serviceId) : [...current, serviceId]
    );
  }

  function resetTopChains() {
    setSelectedIds(services.slice(0, DEFAULT_SELECTED_CHAIN_COUNT).map((service) => service.serviceId));
  }

  return (
    <section className="panel section calculator-section" style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ 
        position: 'absolute', 
        bottom: '-10%', 
        left: '-5%', 
        width: '30%', 
        height: '40%', 
        background: 'radial-gradient(circle, rgba(0, 133, 255, 0.03) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      <div className="section-title-row calculator-title-row">
        <div>
          <h2 className="section-title">Project Your Growth</h2>
          <p className="section-subtitle">
            Model your market entry with Foundation-backed incentives and real network demand.
          </p>
        </div>
        <span className="pill">Growth Simulator</span>
      </div>

      <div className="calculator-layout">
        <div className="calculator-summary">
          <div className="calculator-assumption panel-inset" style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
            <div>
              <span className="hero-highlight-label">Foundation Support</span>
             <strong style={{ display: 'block', margin: '8px 0', fontSize: '1.5rem', color: 'var(--accent)' }}>15 Subsidized Suppliers</strong>
              <p style={{ fontSize: '0.9rem' }}>
                Pocket Network Foundation provides <strong>15 free suppliers</strong> to bootstrap new providers. 
                Our model assumes <strong>{SESSION_SUPPLIER_SLOTS} slots</strong> per <strong>{formatInteger(SESSION_DURATION_MINUTES)}m session</strong>.
              </p>
            </div>

            <label className="calculator-input-group">
              <span className="hero-highlight-label">Total Suppliers</span>
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
              <span className="kpi-label">Market Revenue Pool</span>
              <strong className="calculator-kpi-value accent-number">{formatUpokt(selectedRevenueUpokt, 1)}</strong>
              <span className="kpi-foot">Aggregated demand in window</span>
            </article>

            <article className="calculator-kpi-card calculator-kpi-card-accent" style={{ background: 'linear-gradient(135deg, rgba(0, 194, 255, 0.05) 0%, transparent 100%)', borderColor: 'var(--cyan-accent)' }}>
              <span className="kpi-label" style={{ color: 'var(--cyan-accent)' }}>Projected Daily Earnings</span>
              <strong className="calculator-kpi-value accent-number" style={{ color: 'var(--cyan-accent)', textShadow: '0 0 20px rgba(0, 194, 255, 0.2)' }}>
                {formatUpokt(projectedEntryUpokt, 1)}
              </strong>
              <span className="kpi-foot" style={{ color: 'var(--text)' }}>
                Session-aware revenue estimate
              </span>
            </article>
          </div>

          <div className="calculator-meta-grid">
            <div className="calculator-meta-card">
              <span className="hero-highlight-label">Target Footprint</span>
              <strong className="accent-number">{formatInteger(selectedChainCount)} chains</strong>
              <p>{formatInteger(coveredChainCount)} chains covered by modeled traffic.</p>
            </div>

            <div className="calculator-meta-card">
              <span className="hero-highlight-label">Supplier Mix</span>
              <strong className="accent-number">{formatInteger(supplierCount)} units</strong>
              <p>
                {formatInteger(foundationCoveredSuppliers)} subsidized, {formatInteger(selfFundedSuppliers)} self-funded.
              </p>
            </div>

            <div className="calculator-meta-card">
              <span className="hero-highlight-label">Demand Intensity</span>
              <strong className="accent-number">{formatCompactNumber(selectedRelays)}</strong>
              <p>Total relays across selected chains.</p>
            </div>

            <div className="calculator-meta-card">
              <span className="hero-highlight-label">Efficiency</span>
              <strong className="accent-number" style={{ color: 'var(--green)' }}>{formatUpokt(entryPerSupplierUpokt, 1)}</strong>
              <p>Projected revenue per active supplier.</p>
            </div>

            <div className="calculator-meta-card">
              <span className="hero-highlight-label">Selection Odds</span>
              <strong className="accent-number" style={{ color: 'var(--accent)' }}>{formatDecimal(averageSelectionProbability, 0)}%</strong>
              <p>Average chance of landing at least one 30m session slot on covered chains.</p>
            </div>
          </div>

          <p className="footer-note" style={{ opacity: 0.8 }}>
            <strong>Simulation Logic:</strong> Your suppliers are distributed across selected chains, prioritizing high-yield services. 
            Competition is modeled against the real supplier count already active on each service, while the 15-supplier Foundation assumption remains specific to new-provider onboarding.
          </p>
        </div>

        <div className="calculator-checklist panel-inset" style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
          <div className="section-title-row compact-gap">
            <div>
              <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Service Selection</h3>
              <p className="section-subtitle" style={{ fontSize: '0.85rem' }}>Select chains to include in your deployment.</p>
            </div>
          </div>
          
          <div className="calculator-actions" style={{ marginBottom: '20px' }}>
            <button type="button" className="btn btn-secondary" onClick={resetTopChains} style={{ fontSize: '12px' }}>
              Top 10 Default
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setSelectedIds(services.map((service) => service.serviceId))} style={{ fontSize: '12px' }}>
              Select All
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setSelectedIds([])} style={{ fontSize: '12px' }}>
              Clear
            </button>
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
                      <strong style={{ color: checked ? 'var(--text)' : 'var(--muted)' }}>{service.serviceName}</strong>
                      <span className="mono" style={{ fontSize: '0.7rem' }}>{service.serviceId}</span>
                    </div>
                    <div className="calculator-item-meta">
                      <span style={{ color: 'var(--accent)' }}>{formatUpokt(BigInt(service.revenueUpokt), 1)}</span>
                      <span>{formatInteger(service.providerCount)} providers</span>
                      <span>{formatInteger(service.supplierCount ?? 0)} suppliers</span>
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
