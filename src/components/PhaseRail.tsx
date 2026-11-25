import type { KeyboardEvent } from 'react';
import type { RoundPhase } from '../game/session';

export interface PhaseRailProps {
  phase: RoundPhase;
  onSelectPhase?: (phase: RoundPhase) => void;
  disabledPhases?: RoundPhase[];
}

export const PHASES: Array<{
  id: RoundPhase;
  number: string;
  label: string;
  shortLabel: string;
  icon: string;
}> = [
  { id: 'planet', number: '01', label: 'Planet Select', shortLabel: 'Planet', icon: '🪐' },
  { id: 'auction', number: '02', label: 'Choose land', shortLabel: 'Auction', icon: '🔨' },
  { id: 'survey', number: '03', label: 'Surface Survey', shortLabel: 'Survey', icon: '🎯' },
  { id: 'drill', number: '04', label: 'Drilling', shortLabel: 'Drill', icon: '🔩' },
  { id: 'operate', number: '05', label: 'Production Setup', shortLabel: 'Plant', icon: '⚙' },
  { id: 'settled', number: '06', label: 'Round Report', shortLabel: 'Report', icon: '🏁' },
];

export function PhaseRail({ phase, onSelectPhase, disabledPhases = [] }: PhaseRailProps) {
  const normalizedPhase: RoundPhase =
    phase === 'production' ? 'operate' : phase === 'report' ? 'settled' : phase;
  const currentIndex = PHASES.findIndex((item) => item.id === normalizedPhase);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>, target: RoundPhase, disabled: boolean) => {
    if (!onSelectPhase || disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelectPhase(target);
    }
  };

  return (
    <nav className="tf-phase-rail" aria-label="Round progress">
      {PHASES.map((item, index) => {
        const state =
          index < currentIndex
            ? 'complete'
            : index === currentIndex
              ? 'current'
              : 'upcoming';
        const isDisabled = disabledPhases.includes(item.id);
        const clickable = Boolean(onSelectPhase) && !isDisabled;

        return (
          <div
            className={`tf-phase-step tf-phase-step--${state} ${
              clickable ? 'is-clickable' : ''
            }`}
            key={item.id}
            title={item.label}
            aria-label={item.label}
            aria-current={state === 'current' ? 'step' : undefined}
            aria-disabled={isDisabled || undefined}
            onClick={() => clickable && onSelectPhase?.(item.id)}
            onKeyDown={(e) => handleKeyDown(e, item.id, isDisabled)}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
          >
            <span className="tf-phase-number" aria-hidden="true">
              {state === 'complete' ? '✓' : item.number}
            </span>
            <span className="tf-phase-copy">
              <strong>{item.label}</strong>
              <small>
                {state === 'current'
                  ? 'Now'
                  : state === 'complete'
                    ? 'Done'
                    : 'Next'}
              </small>
            </span>
          </div>
        );
      })}
    </nav>
  );
}
