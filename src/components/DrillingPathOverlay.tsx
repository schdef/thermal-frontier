import type { MapPoint } from '../ui/types';

export interface DrillingPathOverlayProps {
  points: MapPoint[];
  estimatedCost?: number;
  onUndo?: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DrillingPathOverlay({ points, estimatedCost = 0, onUndo, onConfirm, onCancel }: DrillingPathOverlayProps) {
  const hasTarget = points.length > 1;
  return <div className="tf-drilling-overlay"><div className="tf-path-toolbar"><div><span className="tf-kicker">Turmoil-style drilling</span><strong>{hasTarget ? 'Route ready to drill' : 'Choose a thermal pocket'}</strong></div><span className="tf-cost-preview">Estimated cost <b>${Math.round(estimatedCost).toLocaleString()}</b></span></div><p className="tf-path-help">Start at the surface pipe, tap one underground pocket, then confirm the direct orange route.</p><div className="tf-path-actions"><span><i className="tf-path-key confirmed" /> START PIPE <span className="tf-path-depth">→ {hasTarget ? 'TARGET SELECTED' : 'SELECT TARGET'}</span></span><div><button className="tf-button tf-button-quiet" type="button" onClick={onUndo} disabled={!onUndo || !hasTarget}>Reset target</button><button className="tf-button tf-button-quiet" type="button" onClick={onCancel}>Start over</button><button className="tf-button tf-button-primary" type="button" onClick={onConfirm} disabled={!hasTarget}>Drill to target</button></div></div></div>;
}
