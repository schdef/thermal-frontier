import type {
  PlantTelemetry,
  ResourceDepletion,
  RoundSettlement,
} from '../simulation/types';
import type { SettlementLine } from '../ui/types';

export interface RoundReportScreenProps {
  campaignRound: number;
  totalProfit: number;
  profitPercentage: number;
  depletion: ResourceDepletion;
  lines: SettlementLine[];
  settlement?: RoundSettlement;
  telemetry?: PlantTelemetry;
  mineralsDiscovered?: number;
  groundStabilityScore?: number;
  onContinue: () => void;
  onNewGame?: () => void;
  onResetGame?: () => void;
}

function formatSignedCurrency(amount: number): string {
  const rounded = Math.round(amount);
  if (rounded < 0) return `−$${Math.abs(rounded).toLocaleString()}`;
  if (rounded > 0) return `+$${rounded.toLocaleString()}`;
  return '$0';
}

function formatSignedPercent(pct: number): string {
  const rounded = Math.round(pct);
  return rounded >= 0 ? `+${rounded}%` : `${rounded}%`;
}

export function RoundReportScreen({
  campaignRound,
  totalProfit,
  profitPercentage = 0,
  depletion,
  lines,
  settlement,
  telemetry,
  mineralsDiscovered,
  groundStabilityScore,
  onContinue,
  onNewGame,
  onResetGame,
}: RoundReportScreenProps) {
  const isPositive = totalProfit > 0;
  const isNegative = totalProfit < 0;
  const profitClass = isPositive
    ? 'is-positive'
    : isNegative
      ? 'is-negative'
      : 'is-neutral';

  const thermalPercent = Math.max(
    0,
    Math.min(100, Math.round(depletion?.thermalDepletionPercent ?? 0)),
  );
  const mineralsPercent = Math.max(
    0,
    Math.min(100, Math.round(depletion?.mineralsDepletionPercent ?? 0)),
  );
  const groundPercent = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        groundStabilityScore ??
          depletion?.stableGroundRemainingPercent ??
          100 - (depletion?.stableGroundDepletionPercent ?? 0),
      ),
    ),
  );

  const roiPercent = settlement?.roiPercent ?? profitPercentage;
  const exportedMWh = Math.round(
    settlement?.powerGeneratedMWh ?? telemetry?.totalEnergyExportedMWh ?? 0,
  );
  const efficiencyPct = Math.round(
    (telemetry?.heatExchangerEfficiency ?? 0.94) * 100,
  );
  const wellsCount = settlement?.wellsDrilled ?? 1;

  const feedbackHeadline = isPositive
    ? roiPercent >= 25
      ? 'Strong geothermal return!'
      : 'Profitable extraction round.'
    : 'Operating costs exceeded revenue.';

  const feedbackBody = isPositive
    ? thermalPercent >= 75
      ? 'Reservoir depletion is high — watch reinjection return flow and survey deeper pockets next round.'
      : 'Balanced well placement and market timing kept margins healthy.'
    : 'Survey carefully before bidding high, avoid fault/aquifer penalties, and export when market prices peak.';

  return (
    <section
      className="tf-screen tf-round-report-screen"
      aria-labelledby="report-heading"
    >
      {/* Top Header Row */}
      <header className="tf-screen-top-row">
        <div className="tf-screen-title-group">
          <span className="tf-screen-badge-icon" aria-hidden="true">
            🏁
          </span>
          <div className="tf-screen-title-copy">
            <h1 id="report-heading">Round Report</h1>
            <span>Your performance this round</span>
          </div>
        </div>

        <div className="tf-screen-meta-pills">
          <span className="tf-pill">Round {campaignRound} Completed</span>
        </div>
      </header>

      {/* Main Two-Column Zero-Scroll Report Body */}
      <div className="tf-report-body">
        {/* Left Column: Profit Hero + Performance + Financial Breakdown */}
        <div className="tf-report-col">
          <article className="tf-report-card tf-report-card--profit">
            <div className="tf-report-hero-top">
              <div className="tf-profit-hero-left">
                <span className="tf-card-label">⭐ Total Profit</span>
                <div className={`tf-giant-profit-number ${profitClass}`}>
                  {formatSignedCurrency(totalProfit)}
                </div>
              </div>

              <div
                className={`tf-profit-badge-pill ${
                  profitPercentage >= 0 ? 'is-positive' : 'is-negative'
                }`}
              >
                <span aria-hidden="true">
                  {profitPercentage >= 0 ? '⬆' : '⬇'}
                </span>
                <strong>{formatSignedPercent(profitPercentage)}</strong>
              </div>
            </div>

            <div className="tf-report-kpis-row">
              <div className="tf-kpi-chip">
                <span>ROI</span>
                <strong>{formatSignedPercent(roiPercent)}</strong>
              </div>
              <div className="tf-kpi-chip">
                <span>Exported</span>
                <strong>{exportedMWh} MWh</strong>
              </div>
              <div className="tf-kpi-chip">
                <span>Efficiency</span>
                <strong>{efficiencyPct}%</strong>
              </div>
              <div className="tf-kpi-chip">
                <span>Wells</span>
                <strong>{wellsCount}</strong>
              </div>
            </div>
          </article>

          <div className="tf-report-financial-ledger">
            <h2 className="tf-ledger-heading">Revenue &amp; Cost Breakdown</h2>
            <div className="tf-ledger-lines-grid">
              {lines.map((line, idx) => (
                <div
                  key={`${line.label}-${idx}`}
                  className={`tf-ledger-line tf-tone-${line.tone ?? 'muted'}`}
                >
                  <span className="tf-ledger-label">{line.label}</span>
                  <strong className="tf-ledger-value">{line.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Resource Depletion Bars + Constructive Feedback */}
        <div className="tf-report-col">
          <article className="tf-report-card tf-report-card--depletion">
            <span className="tf-card-label">Resource Depletion</span>

            <div className="tf-depletion-bars-stack">
              <div>
                <div className="tf-depletion-label">
                  <span>🔥 Thermal Energy</span>
                  <span className="tf-depletion-sub">
                    ({100 - thermalPercent}% left)
                  </span>
                  <strong className="tf-depletion-percent">
                    {thermalPercent}%
                  </strong>
                </div>
                <div className="tf-progress-track">
                  <div
                    className="tf-progress-fill tf-fill--thermal"
                    style={{ width: `${thermalPercent}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="tf-depletion-label">
                  <span>💎 Minerals</span>
                  {typeof mineralsDiscovered === 'number' && (
                    <span className="tf-depletion-sub">
                      ({mineralsDiscovered} found)
                    </span>
                  )}
                  <strong className="tf-depletion-percent">
                    {mineralsPercent}%
                  </strong>
                </div>
                <div className="tf-progress-track">
                  <div
                    className="tf-progress-fill tf-fill--minerals"
                    style={{ width: `${mineralsPercent}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="tf-depletion-label">
                  <span>🌱 Stable Ground</span>
                  <strong className="tf-depletion-percent">
                    {groundPercent}%
                  </strong>
                </div>
                <div className="tf-progress-track">
                  <div
                    className="tf-progress-fill tf-fill--ground"
                    style={{ width: `${groundPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </article>

          <div className="tf-report-feedback-card">
            <strong>{feedbackHeadline}</strong>
            <p>{feedbackBody}</p>
          </div>
        </div>
      </div>

      {/* Bottom Action Footer */}
      <footer className="tf-report-footer-action">
        {(onNewGame || onResetGame) && (
          <div className="tf-report-footer-secondary">
            {onNewGame && (
              <button
                type="button"
                className="tf-btn tf-btn--quiet"
                onClick={onNewGame}
              >
                New Game
              </button>
            )}
            {onResetGame && (
              <button
                type="button"
                className="tf-btn tf-btn--quiet"
                onClick={onResetGame}
              >
                Reset
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          className="tf-btn-report-continue"
          onClick={onContinue}
        >
          Continue ▶
        </button>
      </footer>
    </section>
  );
}
