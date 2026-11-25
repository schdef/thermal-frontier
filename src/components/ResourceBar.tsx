import type { ReactNode } from 'react';
import type { ResourceValue } from '../ui/types';

export interface ResourceBarProps {
  resources: ResourceValue[];
  onOpenLedger?: () => void;
  /** Optional inline navigation/phase rail slot inside the single ~48px top HUD bar */
  centerSlot?: ReactNode;
  /** Optional compact action buttons (e.g. Orbit / Reset) on the right */
  actions?: ReactNode;
}

export function ResourceBar({
  resources,
  onOpenLedger,
  centerSlot,
  actions,
}: ResourceBarProps) {
  return (
    <header className="tf-resource-bar tf-hud-bar">
      <div className="tf-brand-lockup">
        <span className="tf-brand-mark" aria-hidden="true">
          TF
        </span>
        <span>
          <strong>Thermal</strong> Frontier
        </span>
      </div>

      {centerSlot && <div className="tf-hud-slot">{centerSlot}</div>}

      <div className="tf-resource-list" aria-label="Current resources">
        {resources.map((resource) => (
          <div className={`tf-resource tf-tone-${resource.tone}`} key={resource.label}>
            <span className="tf-resource-icon" aria-hidden="true">
              {resource.icon}
            </span>
            <span className="tf-resource-copy">
              <small>{resource.label}</small>
              <strong>{resource.value}</strong>
              {resource.detail && <em>{resource.detail}</em>}
            </span>
          </div>
        ))}
      </div>

      <div className="tf-hud-actions">
        {actions}
        {onOpenLedger && (
          <button
            className="tf-avatar-button"
            onClick={onOpenLedger}
            aria-label="Open company ledger"
            type="button"
          >
            SH<span>⌄</span>
          </button>
        )}
      </div>
    </header>
  );
}
