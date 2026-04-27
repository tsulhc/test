export default function ProviderLoading() {
  return (
    <main className="page provider-page provider-loading-shell">
      <div className="route-loading-bar" aria-hidden="true" />

      <section className="hero provider-hero">
        <div className="provider-head panel provider-loading-card">
          <div className="provider-head-top">
            <div>
              <span className="eyebrow">Provider Profile</span>
              <h1>Loading provider intelligence</h1>
              <p className="section-subtitle">Fetching provider history, supplier breakdown, and market benchmarks.</p>
            </div>
            <span className="pill">Loading</span>
          </div>

          <div className="provider-kpi-grid">
            {Array.from({ length: 4 }).map((_, index) => (
              <article key={index} className="panel kpi provider-loading-tile">
                <span className="provider-loading-line provider-loading-line-small" />
                <span className="provider-loading-line provider-loading-line-large" />
                <span className="provider-loading-line" />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="provider-grid-top">
        <article className="panel section provider-loading-card">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">Preparing performance data</h2>
              <p className="section-subtitle">This can take a moment the first time a provider is opened.</p>
            </div>
            <span className="pill">Poktscan Sync</span>
          </div>
          <div className="provider-loading-chart" aria-hidden="true">
            {Array.from({ length: 30 }).map((_, index) => (
              <span key={index} style={{ height: `${18 + ((index * 17) % 72)}%` }} />
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
