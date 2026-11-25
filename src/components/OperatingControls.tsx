export interface OperatingControlsProps {
  isPaused: boolean;
  speed: 1 | 2 | 3;
  label?: string;
  roundTimeRemaining?: number;
  onTogglePause: () => void;
  onSetSpeed: (speed: 1 | 2 | 3) => void;
}

function formatMMSS(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export function OperatingControls({
  isPaused,
  speed,
  label = 'Operating',
  roundTimeRemaining,
  onTogglePause,
  onSetSpeed,
}: OperatingControlsProps) {
  return (
    <div className="tf-operating-controls" aria-label={label}>
      <button
        className={`tf-control-play ${isPaused ? 'is-paused' : ''}`}
        type="button"
        onClick={onTogglePause}
        aria-label={isPaused ? `Resume ${label.toLowerCase()}` : `Pause ${label.toLowerCase()}`}
      >
        {isPaused ? '▶' : 'Ⅱ'}
      </button>
      <span className="tf-control-status">{isPaused ? 'Paused' : label}</span>
      <span className="tf-speed-group" role="group" aria-label="Simulation speed">
        {([1, 2, 3] as const).map((value) => (
          <button
            className={speed === value ? 'is-active' : ''}
            key={value}
            type="button"
            onClick={() => onSetSpeed(value)}
          >
            {value}×
          </button>
        ))}
      </span>
      {typeof roundTimeRemaining === 'number' && (
        <span className="tf-round-countdown" aria-label="Round time remaining">
          ⏱ {formatMMSS(roundTimeRemaining)}
        </span>
      )}
    </div>
  );
}
