type TimeseriesPoint = {
  label: string;
  value: number;
  secondaryValue?: number;
};

type TimeseriesPanelProps = {
  title: string;
  subtitle: string;
  eyebrow: string;
  points: TimeseriesPoint[];
  valueLabel: string;
  formatValue: (value: number) => string;
  emptyText?: string;
};

function buildLinePath(points: TimeseriesPoint[], maxValue: number): string {
  if (points.length === 0 || maxValue === 0) return "";

  return points
    .map((point, index) => {
      const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
      const y = 100 - (Math.max(0, point.secondaryValue ?? point.value) / maxValue) * 100;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export default function TimeseriesPanel({
  title,
  subtitle,
  eyebrow,
  points,
  valueLabel,
  formatValue,
  emptyText = "Timeseries data is not available yet."
}: TimeseriesPanelProps) {
  const hasData = points.some((point) => point.value > 0 || (point.secondaryValue ?? 0) > 0);
  const maxValue = Math.max(...points.map((point) => Math.max(point.value, point.secondaryValue ?? 0)), 0);
  const latestPoint = points.at(-1);
  const previousPoint = points.at(-2);
  const totalValue = points.reduce((sum, point) => sum + point.value, 0);
  const latestChange = latestPoint && previousPoint && previousPoint.value > 0
    ? ((latestPoint.value / previousPoint.value) - 1) * 100
    : 0;
  const linePath = buildLinePath(points, maxValue);

  return (
    <section className="panel section timeseries-panel">
      <div className="section-title-row">
        <div>
          <span className="eyebrow eyebrow-ghost">{eyebrow}</span>
          <h2 className="section-title">{title}</h2>
          <p className="section-subtitle">{subtitle}</p>
        </div>
        <span className="pill">{points.length}d</span>
      </div>

      {hasData ? (
        <>
          <div className="timeseries-metrics">
            <div>
              <span className="hero-highlight-label">Latest day</span>
              <strong>{latestPoint ? formatValue(latestPoint.value) : "n/a"}</strong>
            </div>
            <div>
              <span className="hero-highlight-label">Total {valueLabel}</span>
              <strong>{formatValue(totalValue)}</strong>
            </div>
            <div>
              <span className="hero-highlight-label">Day change</span>
              <strong>{latestChange === 0 ? "n/a" : `${latestChange > 0 ? "+" : ""}${latestChange.toFixed(1)}%`}</strong>
            </div>
          </div>

          <div className="timeseries-chart" aria-label={`${title} chart`}>
            <svg className="timeseries-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path d={linePath} />
            </svg>
            {points.map((point) => {
              const height = maxValue === 0 ? 2 : Math.max(2, Math.round((point.value / maxValue) * 100));
              return (
                <div key={point.label} className="timeseries-bar-group" title={`${point.label}: ${formatValue(point.value)}`}>
                  <div className="timeseries-bar" style={{ height: `${height}%` }} />
                  <span>{point.label.slice(5)}</span>
                </div>
              );
            })}
          </div>

          <p className="footer-note">Bars show daily {valueLabel}. The line tracks a 7-day moving average for momentum.</p>
        </>
      ) : (
        <p className="footer-note">{emptyText}</p>
      )}
    </section>
  );
}
