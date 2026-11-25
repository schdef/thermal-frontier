import type { MouseEvent } from 'react';
import type { PipeRoute, Reservoir, Well } from '../ui/types';
import { DrillingPathOverlay, type DrillingPathOverlayProps } from './DrillingPathOverlay';

export interface UndergroundMapProps {
  reservoirs: Reservoir[];
  wells: Well[];
  pipes: PipeRoute[];
  showLayers?: boolean;
  drillingPath?: DrillingPathOverlayProps;
  suggestedTarget?: { x: number; y: number };
  selectedObject?: 'well' | 'reservoir' | null;
  drillTargets?: Reservoir[];
  onMapClick?: (point: { x: number; y: number }) => void;
  onSelectObject?: (object: 'well' | 'reservoir') => void;
  onSelectDrillTarget?: (target: Reservoir) => void;
}

function mapPoint(event: MouseEvent<SVGSVGElement>, onMapClick: UndergroundMapProps['onMapClick']) {
  if (!onMapClick) return;
  const svg = event.currentTarget;
  const transform = svg.getScreenCTM?.();
  if (transform) {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
    onMapClick({ x: Math.max(0, Math.min(100, point.x)), y: Math.max(0, Math.min(100, point.y)) });
    return;
  }
  const rect = svg.getBoundingClientRect();
  onMapClick({ x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 });
}

export function UndergroundMap({ reservoirs, wells, pipes, showLayers = true, drillingPath, suggestedTarget, selectedObject, drillTargets = [], onMapClick, onSelectObject, onSelectDrillTarget }: UndergroundMapProps) {
  const playerPath = drillingPath?.points.map((point) => `${point.x},${point.y}`).join(' ');
  const selectObject = (event: MouseEvent<SVGGElement>, object: 'well' | 'reservoir') => {
    event.preventDefault();
    event.stopPropagation();
    onSelectObject?.(object);
  };
  return <section className={`tf-map-panel ${selectedObject ? 'tf-map-panel--focused' : ''}`} aria-labelledby="map-heading">
    <div className="tf-map-heading"><div><span className="tf-kicker">Morrow Basin 03 · Side-on cutaway</span><h2 id="map-heading">{drillingPath ? 'Draw one well' : 'Underground operations'}</h2></div><div className="tf-map-tools"><span className="tf-map-depth-label">{drillingPath ? 'Tap the map to extend your well' : onSelectObject ? 'Tap the outlined field or W-01' : 'Surface → deep formation'}</span></div></div>
    <div className="tf-map-viewport"><svg className="tf-underground-map" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" onClick={(event) => mapPoint(event, onMapClick)} aria-label="Side-on underground cutaway showing the player's well and thermal reservoirs">
      <defs><linearGradient id="tf-surface" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#d08a58" /><stop offset="1" stopColor="#8b5544" /></linearGradient><linearGradient id="tf-ash" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#694d4a" /><stop offset="1" stopColor="#463b43" /></linearGradient><linearGradient id="tf-basalt" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#303740" /><stop offset="1" stopColor="#222a34" /></linearGradient><radialGradient id="tf-reservoir"><stop offset="0" stopColor="#ffbd68" stopOpacity=".9" /><stop offset=".46" stopColor="#e46d50" stopOpacity=".65" /><stop offset="1" stopColor="#2e9bb2" stopOpacity=".05" /></radialGradient><pattern id="tf-strata" width="12" height="6" patternUnits="userSpaceOnUse"><path d="M0 2 Q3 0 6 2 T12 2" fill="none" stroke="#d78c68" strokeOpacity=".08" strokeWidth=".35" /></pattern></defs>
      <rect width="100" height="100" fill="#1c2833" /><rect y="0" width="100" height="19" fill="url(#tf-surface)" /><path d="M0 19 C15 16 29 22 42 18 S71 15 100 20 L100 39 C79 35 65 42 47 36 S16 39 0 34Z" fill="url(#tf-ash)" /><path d="M0 35 C18 39 30 32 47 37 S79 34 100 39 L100 69 C75 63 64 74 47 66 S19 74 0 67Z" fill="url(#tf-basalt)" /><path d="M0 66 C15 72 29 62 46 68 S75 62 100 69 L100 100 H0Z" fill="#17212b" /><rect y="20" width="100" height="80" fill="url(#tf-strata)" />
      {showLayers && <g className="tf-map-labels"><text x="4" y="29">SOFT ASHSTONE</text><text x="4" y="51">BASALT SHELL</text><text x="4" y="84">DEEP FORMATION</text></g>}<path className="tf-fracture" d="M17 25 Q29 34 22 45 T37 62 M70 22 Q63 36 76 48 T68 76 M91 39 Q80 53 89 66" />
      {suggestedTarget && drillingPath && <circle className="tf-drill-target" cx={suggestedTarget.x} cy={suggestedTarget.y} r="4" />}
      {drillTargets.map((target) => <g className={`tf-drill-target-node ${drillingPath?.points.at(-1)?.x === target.x && drillingPath?.points.at(-1)?.y === target.y ? 'is-selected' : ''}`} key={`target-${target.id}`} role="button" aria-label={`${target.label}, select drilling target`} onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onSelectDrillTarget?.(target); }}><circle className="tf-drill-target-hit" cx={target.x} cy={target.y} r={Math.max(target.rx, target.ry) + 3} /><circle className="tf-drill-target-ring" cx={target.x} cy={target.y} r={Math.max(target.rx, target.ry) + 1} /><circle className="tf-drill-target-core" cx={target.x} cy={target.y} r="1.7" /><text x={target.x + target.rx + 2} y={target.y}>{target.label.toUpperCase()}</text></g>)}
      {reservoirs.map((reservoir) => <g className={`tf-reservoir tf-reservoir-${reservoir.status} ${selectedObject === 'reservoir' ? 'is-selected' : ''}`} key={reservoir.id} role={onSelectObject ? 'button' : undefined} aria-label={onSelectObject ? `${reservoir.label}, select reservoir` : undefined} onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={(event) => selectObject(event, 'reservoir')}><ellipse cx={reservoir.x} cy={reservoir.y} rx={reservoir.rx} ry={reservoir.ry} fill="url(#tf-reservoir)" /><circle className="tf-reservoir-hit" cx={reservoir.x} cy={reservoir.y} r={Math.max(reservoir.rx, reservoir.ry) + 2} /><text x={reservoir.x - reservoir.rx + 2} y={reservoir.y + reservoir.ry + 5}>{reservoir.label.toUpperCase()}</text></g>)}
      {drillingPath && <><polyline className="tf-drill-path" points={playerPath} />{drillingPath.points.map((point, index) => <circle className="tf-drill-waypoint" key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r={index === 0 ? 2.2 : 1.7} />)}</>}{pipes.map((pipe) => <polyline className={`tf-pipe tf-pipe-${pipe.kind} tf-pipe-${pipe.status}`} key={pipe.id} points={pipe.points} />)}
      {wells.map((well) => <g className={`tf-well tf-well-${well.status} ${selectedObject === 'well' ? 'is-selected' : ''}`} key={well.id} role={onSelectObject ? 'button' : undefined} aria-label={onSelectObject ? `${well.label}, select well` : undefined} onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={(event) => selectObject(event, 'well')}><circle cx={well.x} cy={well.y} r="2.7" /><circle className="tf-well-hit" cx={well.x} cy={well.y} r="5" /><text x={well.x + 3.2} y={well.y + 1.5}>{well.label}</text></g>)}<g className="tf-surface-assets"><rect x="18" y="11" width="8" height="4" rx=".7" /><path d="M22 11 V5 M19 8 H25" /><rect x="72" y="10" width="9" height="6" rx="1" /><text x="72" y="9">EXCHANGER</text><path d="M82 13 H94" /></g>
    </svg>{drillingPath && <DrillingPathOverlay {...drillingPath} />}</div><div className="tf-map-legend"><span><i className="legend-hot" /> Hot fluid</span><span><i className="legend-return" /> Return loop</span><span><i className="legend-reservoir" /> Thermal reservoir</span><span><i className="legend-drill" /> Your single well</span></div>
  </section>;
}
