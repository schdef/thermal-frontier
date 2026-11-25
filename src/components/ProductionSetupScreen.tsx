import type {
  PlantChainState,
  PlantTelemetry,
  Reservoir,
  WellRecord,
} from '../simulation/types';

export interface ProductionSetupScreenProps {
  cash: number;
  storedTherm: number;
  storageCapacity: number;
  telemetry: PlantTelemetry;
  currentPrice: number;
  isPaused: boolean;
  speed: 1 | 2 | 3;
  returnLoopActive: boolean;
  plant?: PlantChainState;
  wells?: WellRecord[];
  reservoirs?: Reservoir[];
  extractionRate?: number;
  hotPipeConnected?: boolean;
  onTogglePause: () => void;
  onToggleProduction?: () => void;
  onSetSpeed: (speed: 1 | 2 | 3) => void;
  onSetExtractionRate?: (rate: number) => void;
  onToggleReturnLoop: () => void;
  onTogglePipe?: (pipe: 'hot' | 'return' | 'export') => void;
  onExportToMarket: () => void;
  onSettleRound: () => void;
  onFinishRound?: () => void;
  onDrillAnotherWell?: () => void;
}

function formatMMSS(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export function ProductionSetupScreen({
  cash,
  storedTherm,
  storageCapacity,
  telemetry,
  currentPrice,
  isPaused,
  speed,
  returnLoopActive,
  plant,
  wells = [],
  reservoirs = [],
  extractionRate = 6,
  hotPipeConnected = true,
  onTogglePause,
  onToggleProduction,
  onSetSpeed,
  onSetExtractionRate,
  onToggleReturnLoop,
  onTogglePipe,
  onExportToMarket,
  onSettleRound,
  onFinishRound,
  onDrillAnotherWell,
}: ProductionSetupScreenProps) {
  const effectiveStorage = plant?.storageTankTH ?? storedTherm;
  const effectiveCapacity = Math.max(1, plant?.storageCapacityTH ?? storageCapacity);
  const tankPercent = Math.min(100, Math.round((effectiveStorage / effectiveCapacity) * 100));

  const tempC = Math.round(telemetry.temperatureC);
  const powerMW = telemetry.powerMW;
  const exportRateMW = plant?.exportRateMW ?? telemetry.exportRateMW ?? powerMW;
  const exportCapMW = plant?.exportCapacityMW ?? 150;
  const exchangerEffPct = Math.round(
    (plant?.heatExchanger.efficiency ?? telemetry.heatExchangerEfficiency ?? 0.94) * 100,
  );
  const exportActive = plant?.exportActive ?? true;
  const marketPrice = Math.round(plant?.marketPricePerMWh ?? currentPrice);
  const revenuePerSec = ((exportRateMW / 3600) * marketPrice).toFixed(2);
  const roundTimeRemaining =
    plant?.roundTimeRemainingSeconds ?? telemetry.roundTimeRemainingSeconds ?? 240;

  const depletionPct = Math.max(
    0,
    Math.min(100, Math.round(telemetry.thermalDepletionPercent ?? 0)),
  );
  const reserveRemainingPct = 100 - depletionPct;
  const isDepleted =
    plant?.operatingState === 'depleted' || reserveRemainingPct <= 0;
  const activeWellCount =
    wells.filter((w) => w.status === 'active').length || 1;
  const flowRate = plant?.wellFlow ?? (isPaused || isDepleted ? 0 : extractionRate);
  const flowing = !isPaused && !isDepleted && hotPipeConnected;

  const handlePauseToggle = () => {
    if (onToggleProduction) {
      onToggleProduction();
    } else {
      onTogglePause();
    }
  };

  const handleToggleReturn = () => {
    if (onTogglePipe) {
      onTogglePipe('return');
    } else {
      onToggleReturnLoop();
    }
  };

  const handleFinish = () => {
    if (onFinishRound) {
      onFinishRound();
    } else {
      onSettleRound();
    }
  };

  return (
    <section
      className="tf-screen tf-production-screen"
      aria-labelledby="production-heading"
    >
      {/* Top Compact Production Header + Live Telemetry */}
      <header className="tf-prod-header">
        <div className="tf-prod-header-left">
          <span className="tf-prod-icon" aria-hidden="true">
            ⚙
          </span>
          <div className="tf-prod-title-wrap">
            <h1 id="production-heading">Production Setup</h1>
            <span>Turn the heat into profit! Closed-loop geothermal extraction</span>
          </div>
        </div>

        <div className="tf-prod-telemetry-pills">
          <span className="tf-pill tf-pill--thermal">
            🌡 <strong>{tempC} °C</strong>
          </span>
          <span className="tf-pill tf-pill--power">
            ⚡ <strong>{powerMW} MW</strong>
          </span>
          <span className="tf-pill tf-pill--reserve">
            🔥 <strong>{reserveRemainingPct}%</strong>
          </span>
          <span className="tf-pill tf-pill--timer">
            ⏱ <strong>{formatMMSS(roundTimeRemaining)}</strong>
          </span>
          <span className="tf-pill tf-pill--cash">
            ⭐ <strong>${Math.round(cash).toLocaleString()}</strong>
          </span>
        </div>
      </header>

      {/* Main Schematic + Compact Control Dock */}
      <div className="tf-prod-main-layout">
        {/* Left: Complete 6-Node Circulation Loop SVG */}
        <div className="tf-prod-stage">
          {isDepleted && (
            <div className="tf-depletion-overlay-banner" role="status">
              <span>⚠ Reservoir depleted!</span>
              {onDrillAnotherWell && (
                <button
                  type="button"
                  className="tf-btn tf-btn--cta"
                  style={{ padding: '3px 10px', fontSize: 10 }}
                  onClick={onDrillAnotherWell}
                >
                  Drill Another Well
                </button>
              )}
            </div>
          )}

          {!returnLoopActive && !isDepleted && (
            <div className="tf-loop-warning-badge" role="status">
              ⚠ Return Fluid Disconnected — Flow throttled to 15%
            </div>
          )}

          <svg
            viewBox="0 0 760 360"
            className="tf-plant-schematic-svg"
            preserveAspectRatio="xMidYMid meet"
            xmlns="http://www.w3.org/2000/svg"
            aria-label="Geothermal circulation loop schematic"
          >
            <defs>
              <linearGradient id="plantSkyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0f2b4d" />
                <stop offset="65%" stopColor="#1e4976" />
                <stop offset="100%" stopColor="#2c669e" />
              </linearGradient>

              <linearGradient id="groundTop" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" />
                <stop offset="100%" stopColor="#15803d" />
              </linearGradient>

              <linearGradient id="undergroundGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2a3548" />
                <stop offset="55%" stopColor="#172336" />
                <stop offset="100%" stopColor="#0b1424" />
              </linearGradient>

              <radialGradient id="magmaReservoirGlow" cx="50%" cy="45%" r="60%">
                <stop offset="0%" stopColor="#fef08a" />
                <stop offset="32%" stopColor="#f97316" />
                <stop offset="72%" stopColor="#b91c1c" />
                <stop offset="100%" stopColor="#450a0a" />
              </radialGradient>

              <filter id="plantSteam" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Surface Sky & Geothermal Meadow */}
            <rect x="0" y="0" width="760" height="142" fill="url(#plantSkyGrad)" />
            <polygon points="30,142 105,68 180,142" fill="#1d3b5e" opacity="0.7" />
            <polygon points="140,142 225,52 310,142" fill="#16304e" opacity="0.8" />
            <polygon points="560,142 645,70 730,142" fill="#1d3b5e" opacity="0.7" />
            <rect x="0" y="142" width="760" height="12" fill="url(#groundTop)" />

            {/* Underground Strata */}
            <rect x="0" y="154" width="760" height="206" fill="url(#undergroundGrad)" />
            <path d="M 0 212 Q 220 202 450 216 T 760 208" stroke="#334155" strokeWidth="1.5" fill="none" />
            <path d="M 0 268 Q 260 278 520 262 T 760 272" stroke="#1e293b" strokeWidth="1.5" fill="none" />

            {/* 1. UNDERGROUND MAGMA RESERVOIR(S) */}
            <g>
              <ellipse
                cx="330"
                cy="315"
                rx="240"
                ry="34"
                fill="url(#magmaReservoirGlow)"
                stroke="#f97316"
                strokeWidth="2.5"
                opacity={isDepleted ? 0.35 : 0.95}
              />
              <rect x="242" y="298" width="176" height="20" rx="10" fill="#081426" opacity="0.85" />
              <text x="330" y="312" textAnchor="middle" fill="#fef08a" fontSize="11" fontWeight="900">
                MAGMA RESERVOIR ({reservoirs.length || 1})
              </text>
              <text x="330" y="334" textAnchor="middle" fill="#fed7aa" fontSize="9.5" fontWeight="700">
                {tempC}°C · {reserveRemainingPct}% TU Remaining
              </text>
            </g>

            {/* 2. PRODUCTION WELLHEAD & ORANGE/RED HOT PIPE */}
            <g className="tf-plant-wellhead" transform="translate(65, 58)">
              <rect x="2" y="0" width="96" height="18" rx="9" fill="#081426" stroke="#f97316" strokeWidth="1.2" />
              <text x="50" y="12.5" textAnchor="middle" fill="#fed7aa" fontSize="9.5" fontWeight="900">
                WELLHEAD ({activeWellCount})
              </text>
              {/* Clean Geothermal Borehole Frame */}
              <polygon points="50,24 34,86 66,86" fill="#334155" stroke="#94a3b8" strokeWidth="1.5" />
              <line x1="39" y1="50" x2="61" y2="50" stroke="#94a3b8" strokeWidth="1.2" />
              <line x1="36" y1="70" x2="64" y2="70" stroke="#94a3b8" strokeWidth="1.2" />
              <rect x="30" y="72" width="40" height="18" rx="4" fill="#0f213a" stroke="#f97316" strokeWidth="1.5" />
              <circle cx="50" cy="81" r="5" fill="#f97316" />
            </g>

            {/* Hot Fluid Borehole + Surface Pipe -> Heat Exchanger */}
            <path
              d="M 180 308 L 115 220 L 115 135 L 220 112"
              fill="none"
              stroke={hotPipeConnected ? '#f97316' : '#64748b'}
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={flowing ? 'tf-flowing-hot-pipe' : 'tf-flowing-hot-pipe is-paused'}
            />
            <rect x="122" y="218" width="118" height="18" rx="9" fill="#081426" stroke="#f97316" strokeWidth="1" />
            <text x="181" y="230" textAnchor="middle" fill="#fed7aa" fontSize="9" fontWeight="800">
              🔥 Hot Pipe · {flowRate.toFixed(1)} TU/s
            </text>

            {/* 3. SURFACE HEAT EXCHANGER */}
            <g className="tf-plant-exchanger" transform="translate(220, 62)">
              <rect x="-12" y="-8" width="124" height="18" rx="9" fill="#081426" stroke="#38bdf8" strokeWidth="1.2" />
              <text x="50" y="4.5" textAnchor="middle" fill="#bae6fd" fontSize="9.5" fontWeight="900">
                HEAT EXCHANGER ({exchangerEffPct}%)
              </text>

              {/* Animated Steam */}
              {flowing && (
                <g filter="url(#plantSteam)" opacity="0.55">
                  <circle cx="38" cy="14" r="9" fill="#f8fafc" />
                  <circle cx="60" cy="10" r="12" fill="#e0f2fe" />
                </g>
              )}

              <rect x="5" y="20" width="90" height="58" rx="8" fill="#0f213a" stroke="#38bdf8" strokeWidth="2" />
              <line x1="20" y1="22" x2="20" y2="76" stroke="#334155" strokeWidth="2" />
              <line x1="80" y1="22" x2="80" y2="76" stroke="#334155" strokeWidth="2" />
              <circle cx="50" cy="49" r="16" fill="#0284c7" />
              <g className={flowing ? 'tf-spinning-turbine' : ''} style={{ transformOrigin: '50px 49px' }}>
                <line x1="50" y1="36" x2="50" y2="62" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" />
                <line x1="37" y1="49" x2="63" y2="49" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" />
              </g>
              <text x="50" y="92" textAnchor="middle" fill="#38bdf8" fontSize="9" fontWeight="800">
                ⚡ {powerMW} MW
              </text>
            </g>

            {/* Pipe: Heat Exchanger -> Storage Tank */}
            <path
              d="M 315 112 L 385 112"
              fill="none"
              stroke="#fb923c"
              strokeWidth="5"
              strokeLinecap="round"
              className={flowing ? 'tf-flowing-hot-pipe' : 'tf-flowing-hot-pipe is-paused'}
            />

            {/* 4. THERMAL STORAGE TANK SILO */}
            <g className="tf-plant-storage-silo" transform="translate(385, 52)">
              <rect x="-10" y="-4" width="110" height="18" rx="9" fill="#081426" stroke="#38bdf8" strokeWidth="1.2" />
              <text x="45" y="8.5" textAnchor="middle" fill="#e0f2fe" fontSize="9.5" fontWeight="900">
                STORAGE TANK
              </text>

              <rect x="8" y="22" width="74" height="72" rx="10" fill="#162d4e" stroke="#64748b" strokeWidth="2" />
              <ellipse cx="45" cy="22" rx="37" ry="9" fill="#254166" stroke="#94a3b8" strokeWidth="1.5" />

              {/* Fill Bar Inside Tank */}
              <rect x="58" y="32" width="12" height="52" rx="3" fill="#081426" stroke="#38bdf8" strokeWidth="1.2" />
              <rect
                x="59"
                y={83 - (tankPercent * 50) / 100}
                width="10"
                height={Math.max(0, (tankPercent * 50) / 100)}
                rx="2"
                fill="#f97316"
              />

              <text x="32" y="56" textAnchor="middle" fill="#f8fafc" fontSize="14" fontWeight="900">
                {tankPercent}%
              </text>
              <text x="32" y="72" textAnchor="middle" fill="#94a3b8" fontSize="8.5" fontWeight="700">
                {Math.round(effectiveStorage)} TH
              </text>
            </g>

            {/* 5. YELLOW ELECTRICITY EXPORT PIPE & GRID GATEWAY */}
            <path
              d="M 467 112 L 545 112"
              fill="none"
              stroke={exportActive ? '#fbbf24' : '#475569'}
              strokeWidth="5"
              strokeLinecap="round"
              className={flowing && exportActive ? 'tf-flowing-export-line' : 'tf-flowing-export-line is-paused'}
            />

            <g className="tf-plant-export-gateway" transform="translate(545, 56)">
              <rect x="0" y="14" width="165" height="74" rx="12" fill="#0f213a" stroke="#fbbf24" strokeWidth="2" />
              <text x="14" y="34" fill="#fef08a" fontSize="11" fontWeight="900">
                ⚡ Export (Market)
              </text>
              <text x="14" y="51" fill="#fbbf24" fontSize="10" fontWeight="800">
                {exportRateMW} / {exportCapMW} MW · ${marketPrice}/MWh
              </text>
              <text x="14" y="67" fill="#4ade80" fontSize="9.5" fontWeight="800">
                +${revenuePerSec}/s live revenue
              </text>

              <g
                className="tf-export-btn-group"
                onClick={onExportToMarket}
                cursor="pointer"
                role="button"
                aria-label="Export power to market"
              >
                <circle cx="144" cy="56" r="14" fill="#f59e0b" />
                <text x="144" y="61" textAnchor="middle" fill="#1e1b4b" fontSize="14" fontWeight="900">
                  ➔
                </text>
              </g>
            </g>

            {/* 6. BLUE/CYAN RETURN-FLUID PIPE + INJECTION WELLHEAD */}
            <path
              d="M 270 140 L 270 236 L 490 236 L 490 296"
              fill="none"
              stroke={returnLoopActive ? '#38bdf8' : '#475569'}
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={returnLoopActive ? '10 6' : '5 7'}
              className={
                returnLoopActive && !isPaused && !isDepleted
                  ? 'tf-flowing-return-pipe'
                  : 'tf-flowing-return-pipe is-paused'
              }
            />

            {/* Injection Wellhead Pad */}
            <g transform="translate(466, 134)">
              <rect x="6" y="0" width="36" height="16" rx="4" fill="#0f213a" stroke="#38bdf8" strokeWidth="1.5" />
              <text x="24" y="11" textAnchor="middle" fill="#bae6fd" fontSize="7.5" fontWeight="900">
                INJECT
              </text>
            </g>

            {/* Clickable Return Fluid Pill */}
            <g
              transform="translate(298, 224)"
              cursor="pointer"
              onClick={handleToggleReturn}
              role="button"
              aria-label="Toggle return fluid loop"
            >
              <rect
                x="0"
                y="0"
                width="164"
                height="22"
                rx="11"
                fill={returnLoopActive ? '#0284c7' : '#7c2d12'}
                stroke={returnLoopActive ? '#7dd3fc' : '#f97316'}
                strokeWidth="1.5"
              />
              <text x="82" y="14.5" textAnchor="middle" fill="#ffffff" fontSize="9.5" fontWeight="900">
                ⬅ Return Fluid: {returnLoopActive ? 'CONNECTED' : 'DISCONNECTED'}
              </text>
            </g>
          </svg>
        </div>

        {/* Right / Mobile Bottom Compact Ops Controls Dock */}
        <aside className="tf-ops-sidebar" aria-label="Plant controls">
          <div className="tf-ops-card-block">
            <div className="tf-ops-block-head">
              <span>Extraction Rate</span>
              <strong>{flowRate.toFixed(1)} TU/s</strong>
            </div>
            <div className="tf-rate-slider-row">
              <input
                type="range"
                min={1}
                max={Math.max(12, Math.ceil(extractionRate))}
                step={0.5}
                value={extractionRate}
                onChange={(e) => onSetExtractionRate?.(Number(e.target.value))}
                className="tf-rate-slider"
                aria-label="Requested extraction rate"
              />
            </div>
          </div>

          <div className="tf-ops-card-block">
            <div className="tf-ops-block-head">
              <span>Circulation Pipes</span>
              <strong>{returnLoopActive ? 'Closed Loop' : 'Throttled'}</strong>
            </div>
            <div className="tf-pipe-toggle-grid">
              <button
                type="button"
                className={`tf-pipe-toggle-btn ${
                  returnLoopActive ? 'is-active-return' : ''
                }`}
                onClick={handleToggleReturn}
              >
                🔄 Return {returnLoopActive ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                className={`tf-pipe-toggle-btn ${
                  exportActive ? 'is-active-export' : ''
                }`}
                onClick={() => onTogglePipe?.('export')}
              >
                ⚡ Export {exportActive ? 'ON' : 'HOLD'}
              </button>
            </div>
          </div>

          <div className="tf-ops-card-block">
            <div className="tf-reserve-bar-wrap">
              <div className="tf-ops-block-head">
                <span>Thermal Reserve</span>
                <strong>{reserveRemainingPct}% Left</strong>
              </div>
              <div className="tf-reserve-track">
                <div
                  className="tf-reserve-fill"
                  style={{ width: `${reserveRemainingPct}%` }}
                />
              </div>
            </div>

            <div className="tf-ops-metrics-mini">
              <div className="tf-ops-mini-pill">
                <span>Exported</span>
                <strong>
                  {Math.round(telemetry.totalEnergyExportedMWh)} MWh
                </strong>
              </div>
              <div className="tf-ops-mini-pill">
                <span>Market</span>
                <strong>${marketPrice}/MWh</strong>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="tf-btn-export-market"
            onClick={onExportToMarket}
            disabled={effectiveStorage <= 0 && !exportActive}
          >
            ⚡ Sell Stored Heat (${Math.round(effectiveStorage)} TH)
          </button>
        </aside>
      </div>

      {/* Bottom Production Controls & Settle Round Bar */}
      <footer className="tf-production-footer-bar">
        <div className="tf-operating-bar">
          <button
            type="button"
            className={`tf-control-play ${isPaused ? 'is-paused' : ''}`}
            onClick={handlePauseToggle}
            aria-label={isPaused ? 'Resume production' : 'Pause production'}
          >
            {isPaused ? '▶' : '⏸'}
          </button>

          <div className="tf-speed-chips" role="group" aria-label="Simulation speed">
            {([1, 2, 3] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={`tf-speed-chip ${speed === s ? 'is-active' : ''}`}
                onClick={() => onSetSpeed(s)}
              >
                {s}x
              </button>
            ))}
          </div>

          <div className="tf-storage-readout-pill">
            <span>Storage:</span>
            <strong>
              {Math.round(effectiveStorage)} / {effectiveCapacity} TH
            </strong>
          </div>
        </div>

        <div className="tf-footer-cta-group">
          {onDrillAnotherWell && (
            <button
              type="button"
              className="tf-btn tf-btn--quiet"
              style={{ padding: '6px 12px', fontSize: 11 }}
              onClick={onDrillAnotherWell}
            >
              + Drill Well
            </button>
          )}
          <button
            type="button"
            className="tf-btn-settle-round"
            onClick={handleFinish}
          >
            Settle Round ▶
          </button>
        </div>
      </footer>
    </section>
  );
}
