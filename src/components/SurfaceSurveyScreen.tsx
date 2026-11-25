import { useMemo, useRef, useState, type MouseEvent } from 'react';
import { SIMULATION_DEFAULTS, type ParcelBiome } from '../simulation/constants';
import { generateCaldera7Parcels } from '../simulation/generation';
import { performSurfaceScan } from '../simulation/survey';
import type {
  FaultHint,
  MineralDeposit,
  Parcel,
  Point,
  RoverScanResult,
  StableGroundZone,
  SurveyResult,
  SurveyScanRecord,
  ThermalHotspot,
  ThermalZoneHint,
  WaterPoolFeature,
} from '../simulation/types';
import type { SurveyTool } from '../ui/types';
import { SurveyPanel } from './SurveyPanel';

export interface SurfaceSurveyScreenProps {
  cash: number;
  tools: SurveyTool[];
  selectedToolId?: string;
  isAvailable?: boolean;
  roverScans: RoverScanResult[];
  onSelectTool: (tool: SurveyTool) => void;
  onPurchase: (tool: SurveyTool, target?: Point) => void;
  onProceedToDrilling: () => void;
  // Optional rich props from GameState / RoundSession
  parcel?: Parcel;
  scans?: SurveyScanRecord[];
  surveyResults?: SurveyResult[];
  scanCost?: number;
  scanRadius?: number;
  onScanAt?: (target: Point) => void;
}

const SVG_WIDTH = 520;
const SVG_HEIGHT = 360;

interface BiomeArtTheme {
  label: string;
  bgStart: string;
  bgEnd: string;
  ridgeFill: string;
  plateauFill: string;
  plateauStroke: string;
  craterRim: string;
  craterCore: string;
  hexStroke: string;
  rockFill: string;
  rockEdge: string;
  floraPrimary: string;
  floraSecondary: string;
  accentGlow: string;
}

const BIOME_THEMES: Record<ParcelBiome, BiomeArtTheme> = {
  volcanic: {
    label: 'Volcanic Caldera',
    bgStart: '#3a1a12',
    bgEnd: '#1c1014',
    ridgeFill: '#5c2614',
    plateauFill: '#7c2d12',
    plateauStroke: '#f97316',
    craterRim: '#9a3412',
    craterCore: '#1c0b09',
    hexStroke: 'rgba(251, 146, 60, 0.2)',
    rockFill: '#292524',
    rockEdge: '#57534e',
    floraPrimary: '#fb923c',
    floraSecondary: '#fbbf24',
    accentGlow: '#f97316',
  },
  ice: {
    label: 'Cryo Glacial Shelf',
    bgStart: '#122c4a',
    bgEnd: '#0b192e',
    ridgeFill: '#1e4268',
    plateauFill: '#1d4ed8',
    plateauStroke: '#38bdf8',
    craterRim: '#38bdf8',
    craterCore: '#082038',
    hexStroke: 'rgba(56, 189, 248, 0.22)',
    rockFill: '#1e293b',
    rockEdge: '#64748b',
    floraPrimary: '#7dd3fc',
    floraSecondary: '#c4b5fd',
    accentGlow: '#38bdf8',
  },
  forest: {
    label: 'Canopy Basin',
    bgStart: '#113328',
    bgEnd: '#0a1e1a',
    ridgeFill: '#1a4938',
    plateauFill: '#15803d',
    plateauStroke: '#34d399',
    craterRim: '#166534',
    craterCore: '#071a14',
    hexStroke: 'rgba(52, 211, 153, 0.2)',
    rockFill: '#1f2937',
    rockEdge: '#4b5563',
    floraPrimary: '#4ade80',
    floraSecondary: '#2dd4bf',
    accentGlow: '#34d399',
  },
  crystal: {
    label: 'Prismatic Plateau',
    bgStart: '#261848',
    bgEnd: '#120d29',
    ridgeFill: '#3b246e',
    plateauFill: '#6d28d9',
    plateauStroke: '#a855f7',
    craterRim: '#818cf8',
    craterCore: '#171033',
    hexStroke: 'rgba(168, 85, 247, 0.22)',
    rockFill: '#1e1b4b',
    rockEdge: '#6366f1',
    floraPrimary: '#c084fc',
    floraSecondary: '#818cf8',
    accentGlow: '#a855f7',
  },
  desert: {
    label: 'Dune Mesa',
    bgStart: '#452a14',
    bgEnd: '#24160d',
    ridgeFill: '#693f1a',
    plateauFill: '#b45309',
    plateauStroke: '#fbbf24',
    craterRim: '#92400e',
    craterCore: '#261408',
    hexStroke: 'rgba(251, 191, 36, 0.2)',
    rockFill: '#292524',
    rockEdge: '#78716c',
    floraPrimary: '#f59e0b',
    floraSecondary: '#34d399',
    accentGlow: '#fbbf24',
  },
  basalt: {
    label: 'Basalt Monolith',
    bgStart: '#1f2438',
    bgEnd: '#0e1322',
    ridgeFill: '#2e3652',
    plateauFill: '#334155',
    plateauStroke: '#818cf8',
    craterRim: '#475569',
    craterCore: '#090e1a',
    hexStroke: 'rgba(129, 140, 248, 0.2)',
    rockFill: '#0f172a',
    rockEdge: '#475569',
    floraPrimary: '#f97316',
    floraSecondary: '#818cf8',
    accentGlow: '#818cf8',
  },
};

const toSvgX = (x: number) => (x / 100) * SVG_WIDTH;
const toSvgY = (y: number) => (y / 100) * SVG_HEIGHT;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hexPoints(cx: number, cy: number, radius: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`);
  }
  return pts.join(' ');
}

function computeCoverageFromCircles(circles: Array<{ center: Point; radius: number }>): number {
  if (circles.length === 0) return 0;
  const gridSteps = 20;
  let covered = 0;
  for (let gx = 0; gx < gridSteps; gx += 1) {
    const px = ((gx + 0.5) / gridSteps) * 100;
    for (let gy = 0; gy < gridSteps; gy += 1) {
      const py = ((gy + 0.5) / gridSteps) * 100;
      if (circles.some((c) => Math.hypot(px - c.center.x, py - c.center.y) <= c.radius)) {
        covered += 1;
      }
    }
  }
  return Math.round((covered / (gridSteps * gridSteps)) * 100);
}

export function SurfaceSurveyScreen({
  cash,
  tools,
  selectedToolId,
  isAvailable = true,
  roverScans,
  onSelectTool,
  onPurchase,
  onProceedToDrilling,
  parcel,
  scans = [],
  surveyResults = [],
  scanCost = SIMULATION_DEFAULTS.roverScanCost,
  scanRadius = SIMULATION_DEFAULTS.roverScanRadius,
  onScanAt,
}: SurfaceSurveyScreenProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [roverPos, setRoverPos] = useState<Point>({ x: 50, y: 50 });
  const [isScanning, setIsScanning] = useState(false);

  // Fallback parcel only when caller does not supply a selected parcel
  const activeParcel = useMemo<Parcel>(
    () => parcel ?? generateCaldera7Parcels(42)[0],
    [parcel],
  );

  const biome: ParcelBiome = activeParcel.biome ?? 'volcanic';
  const theme = BIOME_THEMES[biome] ?? BIOME_THEMES.volcanic;

  // Strictly read surface-only features (never hidden underground reservoirs or aquifers)
  const surfaceHotspots: ThermalHotspot[] =
    activeParcel.surfaceFeatures?.hotspots ?? activeParcel.hotspots ?? [];
  const surfaceMinerals: MineralDeposit[] =
    activeParcel.surfaceFeatures?.mineralHints ?? activeParcel.minerals ?? [];
  const surfaceFaults: FaultHint[] = activeParcel.surfaceFeatures?.faultMarkers ?? [];
  const surfaceStableZones: StableGroundZone[] =
    activeParcel.surfaceFeatures?.stableZones ?? activeParcel.stableGround ?? [];
  const surfaceWaterPools: WaterPoolFeature[] =
    activeParcel.surfaceFeatures?.waterPools ?? [];

  // Combine scan circles from SurveyScanRecord[] and RoverScanResult[]
  const scanCircles = useMemo(() => {
    const list: Array<{ id: string; center: Point; radius: number }> = [];
    scans.forEach((scan, idx) => {
      list.push({ id: scan.id || `scan-${idx}`, center: scan.center, radius: scan.radius });
    });
    roverScans.forEach((scan, idx) => {
      list.push({ id: `rover-${idx}`, center: scan.scanPosition, radius: scan.radius });
    });
    return list;
  }, [scans, roverScans]);

  const hasBroadScanner = surveyResults.some((res) => res.type === 'surface-scanner');

  // Revealed features accumulated across scans (or broad surface-scanner for hotspots/stable ground)
  const revealedData = useMemo(() => {
    const hotspotMap = new Map<string, ThermalHotspot>();
    const mineralMap = new Map<string, MineralDeposit>();
    const faultMap = new Map<string, FaultHint>();
    const stableMap = new Map<string, StableGroundZone>();
    const thermalHintMap = new Map<string, ThermalZoneHint>();

    for (const scan of scans) {
      scan.revealedHotspots.forEach((h) => hotspotMap.set(h.id, h));
      scan.revealedMinerals.forEach((m) => mineralMap.set(m.id, m));
      scan.revealedFaultHints.forEach((f) => faultMap.set(f.id, f));
      scan.revealedStableZones.forEach((z) => stableMap.set(z.id, z));
      scan.approximateThermalZones.forEach((t) => thermalHintMap.set(t.id, t));
    }

    for (const rScan of roverScans) {
      rScan.hotspotsFound.forEach((h) => hotspotMap.set(h.id, h));
      rScan.mineralsFound.forEach((m) => mineralMap.set(m.id, m));
      rScan.stableGroundFound.forEach((z) => stableMap.set(z.id, z));
      rScan.faultHintsFound?.forEach((f) => faultMap.set(f.id, f));

      // Compute approximate thermal band via performSurfaceScan helper
      const derived = performSurfaceScan(activeParcel, rScan.scanPosition, rScan.radius, scanCost);
      derived.revealedFaultHints.forEach((f) => faultMap.set(f.id, f));
      derived.approximateThermalZones.forEach((t) => thermalHintMap.set(t.id, t));
    }

    for (const res of surveyResults) {
      res.hotspots?.forEach((h) => hotspotMap.set(h.id, h));
      res.minerals?.forEach((m) => mineralMap.set(m.id, m));
      res.stableGround?.forEach((z) => stableMap.set(z.id, z));
      res.faultHints?.forEach((f) => faultMap.set(f.id, f));
      res.approximateThermalZones?.forEach((t) => thermalHintMap.set(t.id, t));
    }

    const latestCoverage =
      scans.length > 0
        ? scans[scans.length - 1].coveragePercent
        : computeCoverageFromCircles(scanCircles);

    return {
      hotspots: hasBroadScanner ? surfaceHotspots : Array.from(hotspotMap.values()),
      minerals: Array.from(mineralMap.values()),
      faults: Array.from(faultMap.values()),
      stableZones: hasBroadScanner ? surfaceStableZones : Array.from(stableMap.values()),
      thermalHints: Array.from(thermalHintMap.values()),
      coveragePercent: hasBroadScanner ? Math.max(latestCoverage, 35) : latestCoverage,
    };
  }, [
    activeParcel,
    hasBroadScanner,
    roverScans,
    scanCircles,
    scanCost,
    scans,
    surfaceHotspots,
    surfaceStableZones,
    surveyResults,
  ]);

  // Deterministic ambient terrain decorations (craters, dark rocks, alien flora) seeded from parcel id
  const terrainDecor = useMemo(() => {
    const seed = hashString(`${activeParcel.id}-${biome}`);
    const nextRand = (offset: number) => {
      const val = Math.sin(seed * 0.001 + offset * 12.9898) * 43758.5453;
      return val - Math.floor(val);
    };

    const craters = Array.from({ length: 4 }, (_, i) => ({
      id: `crater-${i}`,
      x: 12 + nextRand(i * 3 + 1) * 76,
      y: 14 + nextRand(i * 3 + 2) * 72,
      rx: 12 + nextRand(i * 3 + 3) * 14,
    }));

    const rocks = Array.from({ length: 7 }, (_, i) => ({
      id: `rock-${i}`,
      x: 8 + nextRand(20 + i * 2) * 84,
      y: 10 + nextRand(21 + i * 2) * 80,
      scale: 0.75 + nextRand(40 + i) * 0.65,
    }));

    const flora = Array.from({ length: 6 }, (_, i) => ({
      id: `flora-${i}`,
      x: 10 + nextRand(50 + i * 2) * 80,
      y: 12 + nextRand(51 + i * 2) * 76,
    }));

    return { craters, rocks, flora };
  }, [activeParcel.id, biome]);

  // Subtle hex grid backdrop cells
  const hexCells = useMemo(() => {
    const cells: Array<{ x: number; y: number }> = [];
    const r = 34;
    const dx = Math.sqrt(3) * r;
    const dy = 1.5 * r;
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 10; col += 1) {
        const cx = col * dx + (row % 2 === 1 ? dx / 2 : 0) + 12;
        const cy = row * dy + 14;
        if (cx >= -20 && cx <= SVG_WIDTH + 20 && cy >= -20 && cy <= SVG_HEIGHT + 20) {
          cells.push({ x: cx, y: cy });
        }
      }
    }
    return cells;
  }, []);

  // Candidate surface drill entry pads (default wellhead + revealed stable zone centers)
  const drillEntryPads = useMemo<Point[]>(() => {
    const pads: Point[] = [{ ...SIMULATION_DEFAULTS.wellHeadStartPoint }];
    for (const zone of revealedData.stableZones) {
      const zx = Math.round(zone.x + zone.width / 2);
      const zy = Math.round((zone.y ?? 20) + (zone.height ?? 20) / 2);
      if (Math.hypot(zx - pads[0].x, zy - pads[0].y) > 12) {
        pads.push({ x: zx, y: zy });
      }
    }
    return pads;
  }, [revealedData.stableZones]);

  const handleMapClick = (e: MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const scale = Math.min(rect.width / SVG_WIDTH, rect.height / SVG_HEIGHT);
    const renderedW = SVG_WIDTH * scale;
    const renderedH = SVG_HEIGHT * scale;
    const offsetX = (rect.width - renderedW) / 2;
    const offsetY = (rect.height - renderedH) / 2;

    const px = ((e.clientX - rect.left - offsetX) / renderedW) * 100;
    const py = ((e.clientY - rect.top - offsetY) / renderedH) * 100;

    setRoverPos({
      x: Math.round(clamp(px, 5, 95)),
      y: Math.round(clamp(py, 5, 95)),
    });
  };

  const canAffordScan = cash >= scanCost;

  const handleScanAction = () => {
    if (!isAvailable || isScanning || !canAffordScan) return;
    setIsScanning(true);

    if (onScanAt) {
      onScanAt(roverPos);
    } else {
      const roverTool: SurveyTool =
        tools.find((t) => t.id === 'rover' || t.id === 'thermal') ?? {
          id: 'rover',
          name: 'Rover Scan',
          description: '2D surface radar sweep',
          cost: `$${scanCost}`,
          reveal: 'Surface features',
          icon: '📡',
        };
      onPurchase(roverTool, roverPos);
    }

    window.setTimeout(() => {
      setIsScanning(false);
    }, 900);
  };

  const roverSvgX = toSvgX(roverPos.x);
  const roverSvgY = toSvgY(roverPos.y);
  const ringRx = (scanRadius / 100) * SVG_WIDTH;
  const ringRy = (scanRadius / 100) * SVG_HEIGHT;

  // Angle headlight toward parcel center or right
  const lookAngleDeg = Math.round(
    (Math.atan2(50 - roverPos.y, 50 - roverPos.x) * 180) / Math.PI,
  );

  return (
    <section className="tf-surface-survey-screen" aria-labelledby="survey-heading">
      {/* Compact Header Capsule */}
      <header className="tf-survey-header">
        <div className="tf-capsule-badge">
          <span className="tf-capsule-icon" aria-hidden="true">🎯</span>
          <div>
            <h1 id="survey-heading" className="tf-capsule-title">Surface Survey</h1>
            <span className="tf-capsule-subtitle">
              Explore the planet and find the best underground resources!
            </span>
          </div>
        </div>

        <div className="tf-capsule-meta">
          <span className="tf-pill tf-pill--parcel">
            🗺 {activeParcel.name ?? theme.label}
          </span>
          <span className="tf-pill tf-pill--power">
            📡 {revealedData.coveragePercent}%
          </span>
          <div className="tf-pill tf-pill--cash">
            <span aria-hidden="true">⭐</span>
            <strong>${cash.toLocaleString()}</strong>
          </div>
        </div>
      </header>

      {/* Main Zero-Scroll Survey Stage */}
      <div className="tf-survey-main-layout">
        {/* Left / Center: Colorful Interactive 2D Top-Down Terrain Map */}
        <div className="tf-surface-map-viewport">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
            className="tf-survey-hex-svg"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label={`2D surface survey map for ${activeParcel.name ?? theme.label}`}
            onClick={handleMapClick}
          >
            <defs>
              <linearGradient id="terrainBiomeGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={theme.bgStart} />
                <stop offset="100%" stopColor={theme.bgEnd} />
              </linearGradient>

              <radialGradient id="headlightGlow" cx="15%" cy="50%" r="85%">
                <stop offset="0%" stopColor="#fef08a" stopOpacity="0.85" />
                <stop offset="55%" stopColor="#fef08a" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#fef08a" stopOpacity="0" />
              </radialGradient>

              <radialGradient id="hotspotGlowGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fef08a" stopOpacity="0.95" />
                <stop offset="45%" stopColor="#f97316" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#ea580c" stopOpacity="0" />
              </radialGradient>

              <radialGradient id="radarPulse" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
                <stop offset="70%" stopColor="#38bdf8" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
              </radialGradient>

              <filter id="surveyFeatureGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Playful Biome Base Terrain */}
            <rect width={SVG_WIDTH} height={SVG_HEIGHT} fill="url(#terrainBiomeGrad)" rx="14" />

            {/* Topographic Ridges & Plateaus */}
            <path
              d="M -10 110 Q 110 40 230 95 T 530 65 L 530 0 L -10 0 Z"
              fill={theme.ridgeFill}
              opacity="0.42"
            />
            <path
              d="M -10 295 Q 150 235 310 290 T 530 250 L 530 370 L -10 370 Z"
              fill={theme.ridgeFill}
              opacity="0.48"
            />
            <path
              d="M 65 205 C 105 148, 200 155, 228 212 C 248 252, 165 282, 102 258 Z"
              fill={theme.plateauFill}
              stroke={theme.plateauStroke}
              strokeWidth="1.2"
              opacity="0.28"
            />
            <path
              d="M 310 110 C 350 70, 445 85, 468 142 C 482 182, 415 210, 345 186 Z"
              fill={theme.plateauFill}
              stroke={theme.plateauStroke}
              strokeWidth="1.2"
              opacity="0.24"
            />

            {/* Subtle Hexagonal Survey Grid */}
            <g opacity="0.55">
              {hexCells.map((cell, idx) => (
                <polygon
                  key={`hex-bg-${idx}`}
                  points={hexPoints(cell.x, cell.y, 33)}
                  fill="none"
                  stroke={theme.hexStroke}
                  strokeWidth="1"
                />
              ))}
            </g>

            {/* Craters */}
            {terrainDecor.craters.map((crater) => {
              const cx = toSvgX(crater.x);
              const cy = toSvgY(crater.y);
              return (
                <g key={crater.id} transform={`translate(${cx}, ${cy})`}>
                  <ellipse
                    cx="0"
                    cy="0"
                    rx={crater.rx}
                    ry={crater.rx * 0.62}
                    fill={theme.craterCore}
                    stroke={theme.craterRim}
                    strokeWidth="1.6"
                    opacity="0.65"
                  />
                  <ellipse
                    cx="-2"
                    cy="-1"
                    rx={crater.rx * 0.52}
                    ry={crater.rx * 0.3}
                    fill="#050d1a"
                    opacity="0.65"
                  />
                </g>
              );
            })}

            {/* Alien Flora / Crystal Outcrops */}
            {terrainDecor.flora.map((item) => {
              const fx = toSvgX(item.x);
              const fy = toSvgY(item.y);
              return (
                <g key={item.id} transform={`translate(${fx}, ${fy})`} opacity="0.72">
                  <path
                    d="M 0 4 Q -6 -4 -3 -10 Q 1 -5 0 4"
                    fill={theme.floraPrimary}
                  />
                  <path
                    d="M 0 4 Q 6 -3 4 -9 Q 0 -5 0 4"
                    fill={theme.floraSecondary}
                  />
                  <circle cx="0" cy="-9" r="2" fill="#fef08a" opacity="0.8" />
                </g>
              );
            })}

            {/* Dark Rock Outcrops */}
            {terrainDecor.rocks.map((rock) => {
              const rx = toSvgX(rock.x);
              const ry = toSvgY(rock.y);
              return (
                <g
                  key={rock.id}
                  transform={`translate(${rx}, ${ry}) scale(${rock.scale})`}
                  opacity="0.85"
                >
                  <polygon
                    points="-9,6 -5,-5 3,-7 10,3 6,8 -4,9"
                    fill={theme.rockFill}
                    stroke={theme.rockEdge}
                    strokeWidth="1.2"
                  />
                  <polygon points="-4,-3 2,-5 5,1 -2,2" fill={theme.rockEdge} opacity="0.35" />
                </g>
              );
            })}

            {/* Blue Water Pools (Surface-visible water features) */}
            {surfaceWaterPools.map((pool) => {
              const wx = toSvgX(pool.position.x);
              const wy = toSvgY(pool.position.y);
              const rx = Math.max(14, (pool.radius / 100) * SVG_WIDTH * 0.75);
              const ry = rx * 0.68;
              return (
                <g key={pool.id} transform={`translate(${wx}, ${wy})`}>
                  <ellipse
                    cx="0"
                    cy="0"
                    rx={rx}
                    ry={ry}
                    fill="#0284c7"
                    fillOpacity="0.6"
                    stroke="#38bdf8"
                    strokeWidth="1.6"
                  />
                  <ellipse
                    cx="-2"
                    cy="-1"
                    rx={rx * 0.62}
                    ry={ry * 0.56}
                    fill="#38bdf8"
                    fillOpacity="0.35"
                  />
                  <ellipse
                    cx="-3"
                    cy="-2"
                    rx={rx * 0.28}
                    ry={ry * 0.25}
                    fill="#bae6fd"
                    fillOpacity="0.5"
                  />
                </g>
              );
            })}

            {/* Previous Scanned Regions */}
            {scanCircles.map((scan) => (
              <ellipse
                key={scan.id}
                cx={toSvgX(scan.center.x)}
                cy={toSvgY(scan.center.y)}
                rx={(scan.radius / 100) * SVG_WIDTH}
                ry={(scan.radius / 100) * SVG_HEIGHT}
                fill="rgba(56, 189, 248, 0.08)"
                stroke="rgba(56, 189, 248, 0.45)"
                strokeWidth="1.4"
                strokeDasharray="5 4"
              />
            ))}

            {/* Revealed Green Hexagon Stable Ground Zones */}
            {revealedData.stableZones.map((zone) => {
              const zx = toSvgX(zone.x + zone.width / 2);
              const zy = toSvgY((zone.y ?? 30) + (zone.height ?? 20) / 2);
              const zw = toSvgX(zone.width);
              const zh = toSvgY(zone.height ?? 20);
              return (
                <g key={zone.id}>
                  <rect
                    x={toSvgX(zone.x)}
                    y={toSvgY(zone.y ?? 30)}
                    width={zw}
                    height={zh}
                    rx="12"
                    fill="rgba(34, 197, 94, 0.16)"
                    stroke="#34d399"
                    strokeWidth="1.6"
                    strokeDasharray="4 3"
                  />
                  <g transform={`translate(${zx}, ${zy})`} filter="url(#surveyFeatureGlow)">
                    <polygon
                      points={hexPoints(0, 0, 13)}
                      fill="#166534"
                      stroke="#4ade80"
                      strokeWidth="1.8"
                    />
                    <text
                      x="0"
                      y="3.5"
                      textAnchor="middle"
                      fill="#dcfce7"
                      fontSize="8.5"
                      fontWeight="900"
                    >
                      {zone.stabilityScore}%
                    </text>
                  </g>
                </g>
              );
            })}

            {/* Potential Surface Drilling Entry Pads */}
            {drillEntryPads.map((pad, idx) => {
              const px = toSvgX(pad.x);
              const py = toSvgY(pad.y);
              return (
                <g key={`entry-${idx}`} transform={`translate(${px}, ${py})`}>
                  <circle
                    cx="0"
                    cy="0"
                    r="11"
                    fill="rgba(251, 191, 36, 0.12)"
                    stroke="#fbbf24"
                    strokeWidth="1.5"
                    strokeDasharray="3 2"
                  />
                  <polygon points="-4,4 0,-6 4,4" fill="#fbbf24" />
                  <text
                    x="0"
                    y="19"
                    textAnchor="middle"
                    fill="#fde68a"
                    fontSize="7.5"
                    fontWeight="800"
                  >
                    ENTRY
                  </text>
                </g>
              );
            })}

            {/* Revealed Orange Glowing Thermal Hotspots (Never hidden reservoirs) */}
            {revealedData.hotspots.map((hotspot) => {
              const hx = toSvgX(hotspot.position.x);
              const hy = toSvgY(hotspot.position.y);
              return (
                <g
                  key={hotspot.id}
                  transform={`translate(${hx}, ${hy})`}
                  filter="url(#surveyFeatureGlow)"
                >
                  <circle cx="0" cy="0" r="22" fill="url(#hotspotGlowGrad)" />
                  <circle cx="0" cy="0" r="9" fill="#ea580c" stroke="#fef08a" strokeWidth="1.5" />
                  <path
                    d="M -4 4 Q -6 -3 -2 -8 Q 0 -4 -1 4"
                    fill="#ffedd5"
                    stroke="#f97316"
                    strokeWidth="1"
                  />
                  <path
                    d="M 1 5 Q -2 -4 2 -11 Q 6 -4 1 5"
                    fill="#fef08a"
                    stroke="#ea580c"
                    strokeWidth="1.2"
                  />
                </g>
              );
            })}

            {/* Revealed Blue/Purple Crystal Mineral Deposits */}
            {revealedData.minerals.map((mineral) => {
              const pos = mineral.surfacePosition ?? mineral.position;
              const mx = toSvgX(pos.x);
              const my = toSvgY(pos.y);
              return (
                <g
                  key={mineral.id}
                  transform={`translate(${mx}, ${my})`}
                  filter="url(#surveyFeatureGlow)"
                >
                  <circle cx="0" cy="0" r="15" fill="rgba(168, 85, 247, 0.25)" />
                  <polygon points="-8,6 -4,-7 1,6" fill="#a855f7" stroke="#e9d5ff" strokeWidth="1" />
                  <polygon points="-1,7 4,-11 9,7" fill="#818cf8" stroke="#c7d2fe" strokeWidth="1" />
                  <polygon points="-4,8 0,-2 4,8" fill="#c084fc" stroke="#f3e8ff" strokeWidth="0.9" />
                </g>
              );
            })}

            {/* Revealed Red/Orange Fissure / Fault Markers */}
            {revealedData.faults.map((fault) => {
              const fx = toSvgX(fault.position.x);
              const fy = toSvgY(fault.position.y);
              return (
                <g key={fault.id} transform={`translate(${fx}, ${fy})`}>
                  <path
                    d="M -11 -5 L -3 -1 L -6 4 L 4 8 L 11 2"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M -11 -5 L -3 -1 L -6 4 L 4 8 L 11 2"
                    fill="none"
                    stroke="#fb923c"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                  <polygon
                    points="0,-13 6,-3 -6,-3"
                    fill="#ef4444"
                    stroke="#fecaca"
                    strokeWidth="1"
                  />
                </g>
              );
            })}

            {/* Aimed Scanning Radius Ring (matches roverScanRadius in 0..100 coords) */}
            <g transform={`translate(${roverSvgX}, ${roverSvgY})`} pointerEvents="none">
              <ellipse
                cx="0"
                cy="0"
                rx={ringRx}
                ry={ringRy}
                fill="rgba(56, 189, 248, 0.08)"
                stroke="#38bdf8"
                strokeWidth="2"
                strokeDasharray="7 5"
                className="tf-scan-radius-ring"
              />

              {/* Subtle Radar Pulse Animation */}
              <ellipse
                cx="0"
                cy="0"
                rx={ringRx * 0.92}
                ry={ringRy * 0.92}
                fill="url(#radarPulse)"
                stroke="#7dd3fc"
                strokeWidth="1.2"
                className="tf-radar-pulse-anim"
              />
            </g>

            {/* Survey Rover Vehicle with Headlight Light Cone */}
            <g
              className="tf-survey-rover"
              transform={`translate(${roverSvgX}, ${roverSvgY}) rotate(${lookAngleDeg})`}
              pointerEvents="none"
            >
              <polygon
                points="14,-4 115,-34 125,34 14,4"
                fill="url(#headlightGlow)"
                opacity="0.72"
              />
              <rect x="-15" y="-11" width="9" height="5" rx="2" fill="#0f172a" stroke="#64748b" strokeWidth="1" />
              <rect x="6" y="-11" width="9" height="5" rx="2" fill="#0f172a" stroke="#64748b" strokeWidth="1" />
              <rect x="-15" y="6" width="9" height="5" rx="2" fill="#0f172a" stroke="#64748b" strokeWidth="1" />
              <rect x="6" y="6" width="9" height="5" rx="2" fill="#0f172a" stroke="#64748b" strokeWidth="1" />
              <rect x="-13" y="-7" width="26" height="14" rx="4" fill="#f8fafc" stroke="#334155" strokeWidth="1.5" />
              <rect x="-3" y="-5" width="11" height="10" rx="2.5" fill="#38bdf8" opacity="0.9" />
              <circle cx="-6" cy="0" r="3.5" fill="#f59e0b" />
              <circle cx="13" cy="-3.5" r="2.2" fill="#fef08a" />
              <circle cx="13" cy="3.5" r="2.2" fill="#fef08a" />
            </g>
          </svg>

          {/* Aim Coordinate Indicator */}
          <div className="tf-map-aim-pill">
            <span>Aim ({roverPos.x}, {roverPos.y})</span>
            <span>· R={scanRadius}</span>
          </div>

          {/* Compact Geological Symbol Legend */}
          <div className="tf-floating-legend-card">
            <h3 className="tf-legend-heading">Find:</h3>
            <div className="tf-legend-items">
              <div className="tf-legend-item">
                <span className="tf-legend-dot tf-legend-dot--hotspot" aria-hidden="true" />
                <span>Thermal Hotspots</span>
              </div>
              <div className="tf-legend-item">
                <span className="tf-legend-dot tf-legend-dot--minerals" aria-hidden="true" />
                <span>Minerals</span>
              </div>
              <div className="tf-legend-item">
                <span className="tf-legend-dot tf-legend-dot--stable" aria-hidden="true" />
                <span>Stable Ground</span>
              </div>
              <div className="tf-legend-item">
                <span className="tf-legend-dot tf-legend-dot--fault" aria-hidden="true" />
                <span>Faults</span>
              </div>
              <div className="tf-legend-item">
                <span className="tf-legend-dot tf-legend-dot--water" aria-hidden="true" />
                <span>Water Pools</span>
              </div>
              <div className="tf-legend-item">
                <span className="tf-legend-dot tf-legend-dot--entry" aria-hidden="true" />
                <span>Drill Entry</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Controls Sidebar (Desktop) / Bottom Dock (Mobile) */}
        <SurveyPanel
          tools={tools}
          selectedToolId={selectedToolId}
          isAvailable={isAvailable}
          onSelectTool={onSelectTool}
          onPurchase={onPurchase}
          compact
          coveragePercent={revealedData.coveragePercent}
          scanCount={scanCircles.length}
          scanCost={scanCost}
          canAffordScan={canAffordScan}
          isScanning={isScanning}
          targetPoint={roverPos}
          summary={{
            hotspotsCount: revealedData.hotspots.length,
            mineralsCount: revealedData.minerals.length,
            faultsCount: revealedData.faults.length,
            stableZonesCount: revealedData.stableZones.length,
            waterPoolsCount: surfaceWaterPools.length,
            thermalHints: revealedData.thermalHints,
          }}
          onScanArea={handleScanAction}
          onProceedToDrilling={onProceedToDrilling}
        />
      </div>
    </section>
  );
}
