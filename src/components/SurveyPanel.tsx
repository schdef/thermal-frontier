import type { Point, ThermalZoneHint } from '../simulation/types';
import type { SurveyTool } from '../ui/types';

export interface SurveySummaryStats {
  hotspotsCount: number;
  mineralsCount: number;
  faultsCount: number;
  stableZonesCount: number;
  waterPoolsCount: number;
  thermalHints?: ThermalZoneHint[];
}

export interface SurveyPanelProps {
  tools: SurveyTool[];
  selectedToolId?: string;
  isAvailable?: boolean;
  onSelectTool: (tool: SurveyTool) => void;
  onPurchase: (tool: SurveyTool, target?: Point) => void;
  compact?: boolean;
  coveragePercent?: number;
  scanCount?: number;
  scanCost?: number;
  canAffordScan?: boolean;
  isScanning?: boolean;
  targetPoint?: Point;
  summary?: SurveySummaryStats;
  onScanArea?: () => void;
  onProceedToDrilling?: () => void;
}

export function SurveyPanel({
  tools,
  selectedToolId,
  isAvailable = true,
  onSelectTool,
  onPurchase,
  compact = false,
  coveragePercent = 0,
  scanCount = 0,
  scanCost = 30,
  canAffordScan = true,
  isScanning = false,
  targetPoint,
  summary,
  onScanArea,
  onProceedToDrilling,
}: SurveyPanelProps) {
  const selectedTool = tools.find((tool) => tool.id === selectedToolId);

  if (compact) {
    const primaryThermalHint = summary?.thermalHints?.[0];
    return (
      <aside className="tf-survey-controls-sidebar" aria-label="Survey controls">
        <div className="tf-survey-primary-actions">
          <button
            type="button"
            className="tf-btn-scan-area"
            onClick={onScanArea}
            disabled={!isAvailable || isScanning || !canAffordScan}
          >
            <span className="tf-scan-icon" aria-hidden="true">📡</span>
            <strong>
              {isScanning
                ? 'Scanning...'
                : !canAffordScan
                  ? `Low Cash ($${scanCost})`
                  : `Scan Area ($${scanCost})`}
            </strong>
          </button>

          {onProceedToDrilling && (
            <button
              type="button"
              className="tf-btn-proceed-drilling"
              onClick={onProceedToDrilling}
            >
              Proceed to Drilling ▶
            </button>
          )}
        </div>

        <div className="tf-survey-summary-card">
          <div className="tf-coverage-row">
            <span>Scan Coverage ({scanCount} sweep{scanCount === 1 ? '' : 's'})</span>
            <strong>{coveragePercent}%</strong>
          </div>
          <div className="tf-coverage-track" aria-hidden="true">
            <div
              className="tf-coverage-fill"
              style={{ width: `${Math.min(100, Math.max(0, coveragePercent))}%` }}
            />
          </div>

          {summary && (
            <div className="tf-findings-chips">
              <div className="tf-finding-chip" title="Thermal Hotspots">
                <span className="tf-finding-key">
                  <span className="tf-finding-icon" aria-hidden="true">🔥</span>
                  <span className="tf-finding-label">Hotspots</span>
                </span>
                <strong>{summary.hotspotsCount}</strong>
              </div>
              <div className="tf-finding-chip" title="Mineral Deposits">
                <span className="tf-finding-key">
                  <span className="tf-finding-icon" aria-hidden="true">💎</span>
                  <span className="tf-finding-label">Minerals</span>
                </span>
                <strong>{summary.mineralsCount}</strong>
              </div>
              <div className="tf-finding-chip" title="Stable Ground">
                <span className="tf-finding-key">
                  <span className="tf-finding-icon" aria-hidden="true">🛡</span>
                  <span className="tf-finding-label">Stable</span>
                </span>
                <strong>{summary.stableZonesCount}</strong>
              </div>
              <div className="tf-finding-chip" title="Fault Markers">
                <span className="tf-finding-key">
                  <span className="tf-finding-icon" aria-hidden="true">⚠</span>
                  <span className="tf-finding-label">Faults</span>
                </span>
                <strong>{summary.faultsCount}</strong>
              </div>
            </div>
          )}

          {primaryThermalHint && (
            <div className="tf-thermal-band-note">
              Thermal anomaly: {primaryThermalHint.approxTempRangeC[0]}–
              {primaryThermalHint.approxTempRangeC[1]}°C ({primaryThermalHint.intensityLabel})
            </div>
          )}
        </div>

        <div className="tf-survey-tool-list">
          <span className="tf-kicker">Survey Tooling</span>
          {tools.map((tool) => {
            const isSelected = tool.id === selectedToolId;
            return (
              <button
                key={tool.id}
                type="button"
                className={`tf-survey-tool-btn ${isSelected ? 'is-selected' : ''}`}
                disabled={!isAvailable}
                aria-pressed={isSelected}
                onClick={() => {
                  onSelectTool(tool);
                  onPurchase(tool, targetPoint);
                }}
              >
                <span className="tf-tool-glyph" aria-hidden="true">{tool.icon}</span>
                <div className="tf-tool-meta">
                  <strong>{tool.name}</strong>
                  <small>{tool.description}</small>
                </div>
                <b className="tf-tool-cost">{tool.cost}</b>
              </button>
            );
          })}
        </div>

        <p className="tf-survey-helper-text">
          Tap the terrain map to aim your rover radar ring, then sweep to reveal surface vents,
          crystals, faults, and stable drill pads.
        </p>
      </aside>
    );
  }

  return (
    <section
      className={`tf-panel tf-survey-panel ${isAvailable ? '' : 'tf-panel--disabled'}`}
      aria-labelledby="survey-heading"
    >
      <div className="tf-panel-heading">
        <div>
          <span className="tf-kicker">Information is leverage</span>
          <h2 id="survey-heading">Survey the unknown</h2>
        </div>
        <span className="tf-step-label">03 / 06</span>
      </div>
      <p className="tf-panel-intro">
        {isAvailable
          ? 'Scan surface vents and mineral clues before drilling. Deep reservoirs stay hidden until drilled.'
          : 'Win a parcel first. Survey tools unlock as soon as the auction resolves.'}
      </p>
      <div className="tf-survey-tools">
        {tools.map((tool) => {
          const selected = tool.id === selectedToolId;
          return (
            <button
              className={`tf-survey-tool ${selected ? 'is-selected' : ''}`}
              key={tool.id}
              type="button"
              disabled={!isAvailable}
              aria-pressed={selected}
              onClick={() => onSelectTool(tool)}
            >
              <span className="tf-tool-icon" aria-hidden="true">{tool.icon}</span>
              <span>
                <strong>{tool.name}</strong>
                <small>{tool.description}</small>
                <em>{tool.reveal}</em>
              </span>
              <b>{tool.cost}</b>
            </button>
          );
        })}
      </div>
      <button
        className="tf-button tf-button-primary tf-full-button"
        type="button"
        disabled={!isAvailable || !selectedToolId}
        onClick={() => {
          if (selectedTool) onPurchase(selectedTool);
        }}
      >
        {selectedTool ? `Purchase ${selectedTool.name.toLowerCase()}` : 'Select a survey'}{' '}
        <span aria-hidden="true">↗</span>
      </button>
    </section>
  );
}
