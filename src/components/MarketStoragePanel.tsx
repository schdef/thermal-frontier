import type { MarketPoint } from '../ui/types';

export interface MarketStoragePanelProps {
  points: MarketPoint[];
  storedTherm: number;
  storageCapacity: number;
  currentPrice: string;
  trend: string;
  onSell: () => void;
  onSetThreshold: () => void;
}

export function MarketStoragePanel({
  points,
  storedTherm,
  storageCapacity,
  currentPrice,
  trend,
  onSell,
  onSetThreshold,
}: MarketStoragePanelProps) {
  const chartPoints = points.map((point) => `${point.x},${point.y}`).join(' ');
  const fillPercent = Math.min(
    100,
    Math.round((storedTherm / Math.max(1, storageCapacity)) * 100),
  );

  return (
    <section
      className="tf-panel tf-market-panel"
      aria-labelledby="market-heading"
    >
      <div className="tf-panel-heading">
        <div>
          <span className="tf-kicker">Regional exchange · Live</span>
          <h2 id="market-heading">Market &amp; storage</h2>
        </div>
        <span className="tf-market-signal">{trend}</span>
      </div>

      <div className="tf-market-price">
        <span>Current export price</span>
        <strong>{currentPrice}</strong>
        <small>per MWh · grid connection</small>
      </div>

      <svg
        className="tf-market-chart"
        viewBox="0 0 100 80"
        preserveAspectRatio="none"
        aria-label="Therm price trend"
      >
        <path
          className="tf-chart-band"
          d="M0 67 L10 64 L20 70 L30 58 L40 61 L50 46 L60 49 L70 32 L80 40 L90 22 L100 26 L100 51 L90 46 L80 56 L70 48 L60 64 L50 59 L40 72 L30 69 L20 78 L10 73 L0 76Z"
        />
        <polyline className="tf-chart-line" points={chartPoints} />
        <line x1="70" x2="70" y1="0" y2="80" className="tf-chart-marker" />
        <text x="71" y="12">NOW</text>
      </svg>

      <div className="tf-storage-readout">
        <div>
          <span>Stored TH</span>
          <strong>
            {Math.round(storedTherm).toLocaleString()}{' '}
            <small>/ {storageCapacity.toLocaleString()}</small>
          </strong>
        </div>
        <div className="tf-storage-meter">
          <span style={{ width: `${fillPercent}%` }} />
        </div>
      </div>

      <div className="tf-market-actions">
        <button
          className="tf-button tf-button-primary"
          type="button"
          onClick={onSell}
        >
          Sell stored TH
        </button>
        <button
          className="tf-button tf-button-quiet"
          type="button"
          onClick={onSetThreshold}
        >
          Set threshold
        </button>
      </div>
    </section>
  );
}
