import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEPTH_MARKERS,
  DRILL_UPGRADE_TIERS,
  MAX_DRILL_DEPTH_METERS,
  SIMULATION_DEFAULTS,
  ZEPHYR_7_CONFIG,
  type PlanetInfo,
} from '../simulation/constants';
import {
  addWaypoint,
  calculateDrillDurationSeconds,
  checkAquiferCollisions,
  checkFaultCollisions,
  checkMineralCollisions,
  checkReservoirCollisions,
  clearWaypoints,
  depthFromMeters,
  depthInMeters,
  estimateDrillCost,
  executeWellDrilling,
  getDrillHeadStateAtProgress,
  getDrillSpeedTier,
  performUndergroundEchoScan,
  resolveDrillingPath,
  segmentDistance,
  snapDrillPoint,
  summarizeParcelWells,
  undoWaypoint,
  validateDrillingPath,
  type DrillingOptions,
  type WellExecutionResult,
} from '../simulation/drilling';
import { generateCaldera7Parcels } from '../simulation/generation';
import type {
  DrillHeadState,
  EchoScanRecord,
  GeologyLayer,
  Parcel,
  PlanetConfig,
  Point,
  RoverScanResult,
  SurveyScanRecord,
  WellRecord,
} from '../simulation/types';

export interface TurmoilDrillingScreenProps {
  cash: number;
  initialPath?: Point[];
  snapToLayer?: boolean;
  snapEnabled?: boolean;
  parcel?: Parcel;
  planet?: PlanetInfo | PlanetConfig;
  wells?: WellRecord[];
  discoveredReservoirIds?: string[];
  surveyScans?: SurveyScanRecord[];
  roverScans?: RoverScanResult[];
  echoScans?: EchoScanRecord[];
  drillSpeedLevel?: number;
  drillUpgradeLevel?: number;
  onToggleSnapToLayer?: () => void;
  onToggleSnap?: () => void;
  onConfirmDrillPath?: (path: Point[]) => void;
  onConfirmWell?: (well: WellExecutionResult) => void;
  onDeployEchoScanCar?: (scanX: number) => void;
  onUpgradeDrillSpeed?: () => void;
  onDrillingComplete?: () => void;
  onProceedToProduction?: () => void;
}

const SURFACE_Y = SIMULATION_DEFAULTS.wellHeadStartPoint.y;
const SURFACE_PADS = [
  { id: 'pad-west', label: 'West Pad', x: 24 },
  { id: 'pad-center', label: 'Center Pad', x: 50 },
  { id: 'pad-east', label: 'East Pad', x: 76 },
] as const;

const SCAN_SWEEP_STOPS = [50, 22, 78] as const;

const DEFAULT_LAYER_COLORS: Record<string, string> = {
  ashstone: '#5c4938',
  fracture: '#3d3342',
  obsidian: '#221c2b',
  basalt: '#2f3542',
  crystal: '#4b3f72',
  granite: '#27303f',
  sandstone: '#7c5d3f',
  shale: '#3e4a59',
  permafrost: '#3b5875',
  insulating: '#2d3748',
};

const TIER_ACCENT_COLORS: Record<number, string> = {
  1: '#94a3b8',
  2: '#38bdf8',
  3: '#f97316',
  4: '#c084fc',
};

interface DragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  isDragging: boolean;
}

interface DiscoveryBanner {
  id: string;
  tone: 'positive' | 'warning' | 'danger' | 'neutral';
  title: string;
  detail: string;
}

interface ScanCarAnimation {
  active: boolean;
  fromX: number;
  targetX: number;
  currentX: number;
  pulseProgress: number;
}

function clampPoint(pt: Point): Point {
  const maxY = Math.min(99, depthFromMeters(MAX_DRILL_DEPTH_METERS));
  return {
    x: Math.round(Math.max(4, Math.min(96, pt.x)) * 10) / 10,
    y: Math.round(Math.max(SURFACE_Y, Math.min(maxY, pt.y)) * 10) / 10,
  };
}

function clientToSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const ctm = typeof svg.getScreenCTM === 'function' ? svg.getScreenCTM() : null;
  if (ctm && typeof svg.createSVGPoint === 'function') {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const transformed = pt.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  }
  const rect = svg.getBoundingClientRect();
  const width = rect.width || 111;
  const height = rect.height || 102;
  return {
    x: ((clientX - rect.left) / width) * 111 - 9,
    y: ((clientY - rect.top) / height) * 102,
  };
}

function layerFillColor(layer: GeologyLayer): string {
  return layer.color ?? DEFAULT_LAYER_COLORS[layer.type] ?? '#28384e';
}

export function TurmoilDrillingScreen({
  cash,
  initialPath = [{ x: 50, y: SURFACE_Y }],
  snapToLayer,
  snapEnabled,
  parcel,
  planet,
  wells,
  discoveredReservoirIds = [],
  surveyScans = [],
  roverScans = [],
  echoScans,
  drillSpeedLevel,
  drillUpgradeLevel = 0,
  onToggleSnapToLayer,
  onToggleSnap,
  onConfirmDrillPath,
  onConfirmWell,
  onDeployEchoScanCar,
  onUpgradeDrillSpeed,
  onDrillingComplete,
  onProceedToProduction,
}: TurmoilDrillingScreenProps) {
  const fallbackParcel = useMemo(() => generateCaldera7Parcels(42)[0], []);
  const activeParcel = parcel ?? fallbackParcel;

  const palette = useMemo(() => {
    if (planet && 'palette' in planet && planet.palette) {
      return planet.palette;
    }
    return ZEPHYR_7_CONFIG.palette;
  }, [planet]);

  const effectiveSnap = snapEnabled ?? snapToLayer ?? false;
  const handleSnapToggle = () => {
    if (onToggleSnap) {
      onToggleSnap();
    } else {
      onToggleSnapToLayer?.();
    }
  };

  const normalizedInitialPath = useMemo<Point[]>(() => {
    if (initialPath.length > 0) {
      return initialPath.map((pt, idx) =>
        idx === 0 ? { x: pt.x, y: Math.min(SURFACE_Y, pt.y) } : pt,
      );
    }
    return [{ x: 50, y: SURFACE_Y }];
  }, [initialPath]);

  const [pathPoints, setPathPoints] = useState<Point[]>(normalizedInitialPath);
  const [localWells, setLocalWells] = useState<WellRecord[]>([]);
  const [localEchoScans, setLocalEchoScans] = useState<EchoScanRecord[]>([]);
  const [localDrillSpeedLevel, setLocalDrillSpeedLevel] = useState<number>(1);
  const [selectedWellId, setSelectedWellId] = useState<string | null>(null);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [isDrillingActive, setIsDrillingActive] = useState(false);
  const [activeDrillPath, setActiveDrillPath] = useState<Point[] | null>(null);
  const [drillProgress, setDrillProgress] = useState(0);
  const [activeDrillDurationSec, setActiveDrillDurationSec] = useState(0);
  const [lavaEruption, setLavaEruption] = useState(false);
  const [discoveryBanner, setDiscoveryBanner] = useState<DiscoveryBanner | null>(null);
  const [localDiscoveredMinerals, setLocalDiscoveredMinerals] = useState<string[]>([]);
  const [nextScanStopIdx, setNextScanStopIdx] = useState<number>(0);
  const [scanCarAnim, setScanCarAnim] = useState<ScanCarAnimation>({
    active: false,
    fromX: 12,
    targetX: 50,
    currentX: 50,
    pulseProgress: 0,
  });

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const drillRafRef = useRef<number | null>(null);
  const scanRafRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (drillRafRef.current !== null) window.cancelAnimationFrame(drillRafRef.current);
      if (scanRafRef.current !== null) window.cancelAnimationFrame(scanRafRef.current);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const isWellsControlled = wells !== undefined || Boolean(onConfirmWell);
  const allWells = useMemo<WellRecord[]>(
    () => (wells !== undefined ? wells : localWells),
    [wells, localWells],
  );

  const effectiveEchoScans = useMemo<EchoScanRecord[]>(
    () => (echoScans !== undefined ? echoScans : localEchoScans),
    [echoScans, localEchoScans],
  );

  const effectiveDrillSpeedLevel = drillSpeedLevel ?? localDrillSpeedLevel;
  const currentSpeedTier = useMemo(
    () => getDrillSpeedTier(effectiveDrillSpeedLevel),
    [effectiveDrillSpeedLevel],
  );
  const nextSpeedTier = useMemo(
    () =>
      effectiveDrillSpeedLevel < DRILL_UPGRADE_TIERS.length
        ? DRILL_UPGRADE_TIERS[effectiveDrillSpeedLevel]
        : null,
    [effectiveDrillSpeedLevel],
  );

  const wellSummary = useMemo(() => summarizeParcelWells(allWells), [allWells]);
  const hasActiveWell =
    wellSummary.activeWellCount > 0 || discoveredReservoirIds.length > 0;

  // Progressive drill head state during execution
  const drillHeadState: DrillHeadState | null = useMemo(() => {
    if (!isDrillingActive || !activeDrillPath || activeDrillPath.length < 2) return null;
    return getDrillHeadStateAtProgress(activeDrillPath, activeParcel, drillProgress);
  }, [isDrillingActive, activeDrillPath, activeParcel, drillProgress]);

  // Fog-of-war revealed formations: ONLY what has been intersected by drilled wells (or reached by active drill bit)
  const revealedSets = useMemo(() => {
    const reservoirIds = new Set<string>(discoveredReservoirIds);
    const aquiferIds = new Set<string>();
    const faultIds = new Set<string>();
    const mineralIds = new Set<string>(localDiscoveredMinerals);

    for (const fault of activeParcel.faults ?? []) {
      if (fault.revealed) faultIds.add(fault.id);
    }

    const considerPath = (wellPath: Point[]) => {
      for (const r of checkReservoirCollisions(activeParcel, wellPath)) reservoirIds.add(r.id);
      for (const a of checkAquiferCollisions(activeParcel, wellPath)) aquiferIds.add(a.id);
      for (const f of checkFaultCollisions(activeParcel, wellPath)) faultIds.add(f.id);
      for (const m of checkMineralCollisions(activeParcel, wellPath)) mineralIds.add(m.id);
    };

    for (const well of allWells) {
      for (const id of well.tappedReservoirIds) reservoirIds.add(id);
      for (const id of well.intersectedAquifers) aquiferIds.add(id);
      for (const id of well.intersectedFaults) faultIds.add(id);
      considerPath(well.path);
    }

    if (drillHeadState && drillHeadState.completedPoints.length >= 2) {
      considerPath(drillHeadState.completedPoints);
    }

    return { reservoirIds, aquiferIds, faultIds, mineralIds };
  }, [
    activeParcel,
    allWells,
    discoveredReservoirIds,
    localDiscoveredMinerals,
    drillHeadState,
  ]);

  // Surface-projected clue markers from completed Surface Surveys (never exposing exact reservoir positions)
  const surfaceClues = useMemo(() => {
    const thermalX: Array<{ id: string; x: number; intensity: string }> = [];
    const faultX: Array<{ id: string; x: number; severity: string }> = [];
    const mineralX: Array<{ id: string; x: number; label: string }> = [];

    for (const scan of surveyScans) {
      for (const z of scan.approximateThermalZones ?? []) {
        thermalX.push({ id: z.id, x: z.center.x, intensity: z.intensityLabel });
      }
      for (const h of scan.revealedHotspots ?? []) {
        thermalX.push({
          id: h.id,
          x: h.position.x,
          intensity: h.intensity >= 75 ? 'high' : 'medium',
        });
      }
      for (const f of scan.revealedFaultHints ?? []) {
        faultX.push({ id: f.id, x: f.position.x, severity: f.severity });
      }
      for (const m of scan.revealedMinerals ?? []) {
        mineralX.push({ id: m.id, x: m.position.x, label: m.name });
      }
    }

    for (const scan of roverScans) {
      for (const h of scan.hotspotsFound ?? []) {
        thermalX.push({
          id: h.id,
          x: h.position.x,
          intensity: h.intensity >= 75 ? 'high' : 'medium',
        });
      }
      for (const f of scan.faultHintsFound ?? []) {
        faultX.push({ id: f.id, x: f.position.x, severity: f.severity });
      }
      for (const m of scan.mineralsFound ?? []) {
        mineralX.push({ id: m.id, x: m.position.x, label: m.name });
      }
    }

    const dedupe = <T extends { id: string }>(arr: T[]) =>
      Array.from(new Map(arr.map((item) => [item.id, item])).values());

    return {
      thermal: dedupe(thermalX),
      faults: dedupe(faultX),
      minerals: dedupe(mineralX),
    };
  }, [surveyScans, roverScans]);

  // Deduplicated fuzzy echo pings from all deployed Scan Car sweeps
  const visibleEchoPings = useMemo(() => {
    const map = new Map<string, EchoScanRecord['pings'][number]>();
    for (const scan of effectiveEchoScans) {
      for (const ping of scan.pings) {
        map.set(ping.id, ping);
      }
    }
    return Array.from(map.values());
  }, [effectiveEchoScans]);

  const drillOptions: DrillingOptions = useMemo(
    () => ({
      snapEnabled: effectiveSnap,
      snapToLayer: effectiveSnap,
      availableCash: cash,
      drillUpgradeLevel,
      existingWells: allWells,
    }),
    [effectiveSnap, cash, drillUpgradeLevel, allWells],
  );

  const resolvedPath = useMemo(
    () => resolveDrillingPath(activeParcel, pathPoints, drillOptions),
    [activeParcel, pathPoints, drillOptions],
  );

  const estimate = useMemo(
    () => estimateDrillCost(activeParcel, resolvedPath, drillOptions),
    [activeParcel, resolvedPath, drillOptions],
  );

  const estimatedDurationSec = useMemo(
    () =>
      resolvedPath.length >= 2
        ? calculateDrillDurationSeconds(resolvedPath, activeParcel, effectiveDrillSpeedLevel)
        : 0,
    [resolvedPath, activeParcel, effectiveDrillSpeedLevel],
  );

  const validation = useMemo(
    () => validateDrillingPath(resolvedPath, activeParcel, drillOptions),
    [resolvedPath, activeParcel, drillOptions],
  );

  const isAffordable = estimate.cost <= cash && !validation.unaffordable;
  const canConfirm =
    !isDrillingActive &&
    resolvedPath.length >= 2 &&
    validation.valid &&
    isAffordable;

  const canDeployScanCar =
    !isDrillingActive && cash >= SIMULATION_DEFAULTS.echoScanCost;
  const canUpgradeSpeed =
    !isDrillingActive &&
    nextSpeedTier !== null &&
    cash >= nextSpeedTier.upgradeCost;

  const snapBoundaries = useMemo(() => {
    const vals = new Set<number>();
    for (const layer of activeParcel.layers) {
      if (layer.top >= SURFACE_Y && layer.top <= 100) vals.add(layer.top);
      if (layer.bottom >= SURFACE_Y && layer.bottom <= 100) vals.add(layer.bottom);
    }
    return Array.from(vals).sort((a, b) => a - b);
  }, [activeParcel.layers]);

  const getProcessedPoint = (rawPt: Point): Point => {
    const clamped = clampPoint(rawPt);
    return effectiveSnap
      ? snapDrillPoint(activeParcel, clamped, { snapEnabled: true, threshold: 5 })
      : { x: Math.round(clamped.x), y: Math.round(clamped.y) };
  };

  const handleSelectSurfacePad = (padX: number) => {
    if (isDrillingActive) return;
    if (pathPoints.length <= 1) {
      setPathPoints([{ x: padX, y: SURFACE_Y }]);
    }
    const padStopIdx = SCAN_SWEEP_STOPS.findIndex((s) => Math.abs(s - padX) <= 4);
    if (padStopIdx >= 0) {
      setNextScanStopIdx(padStopIdx);
    }
  };

  const handleDeployScanCar = () => {
    if (!canDeployScanCar) return;
    const targetX = SCAN_SWEEP_STOPS[nextScanStopIdx % SCAN_SWEEP_STOPS.length];
    const nextIdx = (nextScanStopIdx + 1) % SCAN_SWEEP_STOPS.length;
    setNextScanStopIdx(nextIdx);

    let resultRecord: EchoScanRecord | null = null;
    if (onDeployEchoScanCar) {
      onDeployEchoScanCar(targetX);
      resultRecord = performUndergroundEchoScan(
        activeParcel,
        targetX,
        SIMULATION_DEFAULTS.echoScanCost,
        42 + effectiveEchoScans.length,
        Date.now(),
      );
    } else {
      resultRecord = performUndergroundEchoScan(
        activeParcel,
        targetX,
        SIMULATION_DEFAULTS.echoScanCost,
        42 + localEchoScans.length,
        Date.now(),
      );
      setLocalEchoScans((prev) => [...prev, resultRecord as EchoScanRecord]);
    }

    // Animate the surface Scan Car rolling into position & emitting sonar waves
    if (scanRafRef.current !== null) window.cancelAnimationFrame(scanRafRef.current);
    const startX = scanCarAnim.currentX;
    const startTime = performance.now();
    const animDurationMs = 1400;

    const tickScanCar = (now: number) => {
      const t = Math.min(1, (now - startTime) / animDurationMs);
      const driveT = Math.min(1, t / 0.45);
      const easedDrive = 1 - Math.pow(1 - driveT, 3);
      const curX = startX + (targetX - startX) * easedDrive;
      const pulseT = t > 0.3 ? (t - 0.3) / 0.7 : 0;

      setScanCarAnim({
        active: t < 1,
        fromX: startX,
        targetX,
        currentX: curX,
        pulseProgress: pulseT,
      });

      if (t < 1) {
        scanRafRef.current = window.requestAnimationFrame(tickScanCar);
      } else {
        scanRafRef.current = null;
      }
    };
    scanRafRef.current = window.requestAnimationFrame(tickScanCar);

    if (resultRecord) {
      const thermalCount = resultRecord.pings.filter((p) => p.kind === 'thermal').length;
      const mineralCount = resultRecord.pings.filter((p) => p.kind === 'mineral').length;
      const faultCount = resultRecord.pings.filter((p) => p.kind === 'fault').length;
      setDiscoveryBanner({
        id: resultRecord.id,
        tone: thermalCount > 0 ? 'positive' : 'neutral',
        title: `Echo scan complete at X=${Math.round(targetX)}`,
        detail:
          resultRecord.pings.length > 0
            ? `Detected ${thermalCount} thermal, ${mineralCount} mineral, ${faultCount} fault echoes.`
            : 'No subsurface anomalies detected in this sweep cone.',
      });
    }
  };

  const handleUpgradeSpeed = () => {
    if (!canUpgradeSpeed || !nextSpeedTier) return;
    if (onUpgradeDrillSpeed) {
      onUpgradeDrillSpeed();
    } else {
      setLocalDrillSpeedLevel(nextSpeedTier.level);
    }
    setDiscoveryBanner({
      id: `upgrade-${nextSpeedTier.level}`,
      tone: 'positive',
      title: `Upgraded to ${nextSpeedTier.name}`,
      detail: `Drilling speed is now ${nextSpeedTier.speedMultiplier}x baseline.`,
    });
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isDrillingActive) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const svg = svgRef.current;
    if (!svg) return;

    try {
      svg.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore in test environments without pointer capture support
    }

    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      isDragging: false,
    };

    const raw = clientToSvgPoint(svg, e.clientX, e.clientY);
    const processed = getProcessedPoint(raw);
    setHoverPoint(processed);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isDrillingActive) return;
    const svg = svgRef.current;
    if (!svg) return;

    const raw = clientToSvgPoint(svg, e.clientX, e.clientY);
    const processed = getProcessedPoint(raw);
    setHoverPoint(processed);

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const screenDist = Math.hypot(
      e.clientX - drag.startClientX,
      e.clientY - drag.startClientY,
    );
    if (!drag.isDragging && screenDist > 8) {
      drag.isDragging = true;
    }

    if (drag.isDragging) {
      setPathPoints((prev) => {
        if (prev.length >= SIMULATION_DEFAULTS.maxWaypointsPerWell) return prev;
        const last = prev[prev.length - 1];
        if (!last || segmentDistance(last, processed) < 8.5) return prev;

        // Smooth continuous drag: collapse nearly collinear intermediate vertices
        if (prev.length >= 2) {
          const prevPrev = prev[prev.length - 2];
          const v1x = last.x - prevPrev.x;
          const v1y = last.y - prevPrev.y;
          const v2x = processed.x - last.x;
          const v2y = processed.y - last.y;
          const len1 = Math.hypot(v1x, v1y);
          const len2 = Math.hypot(v2x, v2y);
          if (len1 > 1e-4 && len2 > 1e-4) {
            const dot = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (len1 * len2)));
            const angleDeg = (Math.acos(dot) * 180) / Math.PI;
            if (angleDeg < 8 && len1 + len2 < 24) {
              return [...prev.slice(0, -1), processed];
            }
          }
        }
        return [...prev, processed];
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;

    const svg = svgRef.current;
    try {
      svg?.releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignore in test environments
    }

    if (isDrillingActive || !svg) return;

    const raw = clientToSvgPoint(svg, e.clientX, e.clientY);
    const processed = getProcessedPoint(raw);

    if (!drag.isDragging) {
      // Tap/click near surface before plotting: reposition drilling rig along surface
      if (raw.y <= SURFACE_Y + 3 && pathPoints.length <= 1) {
        setPathPoints([{ x: Math.max(8, Math.min(92, Math.round(raw.x))), y: SURFACE_Y }]);
        return;
      }

      setPathPoints((prev) =>
        addWaypoint(prev, processed, {
          snapEnabled: effectiveSnap,
          parcel: activeParcel,
          maxWaypoints: SIMULATION_DEFAULTS.maxWaypointsPerWell,
        }),
      );
    } else {
      setPathPoints((prev) => {
        const last = prev[prev.length - 1];
        if (!last || segmentDistance(last, processed) < 2) return prev;
        return addWaypoint(prev, processed, {
          snapEnabled: effectiveSnap,
          parcel: activeParcel,
          maxWaypoints: SIMULATION_DEFAULTS.maxWaypointsPerWell,
        });
      });
    }
  };

  const handlePointerLeave = () => {
    setHoverPoint(null);
  };

  const handleUndo = () => {
    if (isDrillingActive) return;
    setPathPoints((prev) => undoWaypoint(prev));
  };

  const handleClear = () => {
    if (isDrillingActive) return;
    const startX = pathPoints[0]?.x ?? 50;
    setPathPoints(clearWaypoints({ x: startX, y: SURFACE_Y }));
  };

  const handleStartNewWell = () => {
    if (isDrillingActive) return;
    const padIndex = allWells.length % SURFACE_PADS.length;
    setPathPoints([{ x: SURFACE_PADS[padIndex].x, y: SURFACE_Y }]);
    setSelectedWellId(null);
    setLavaEruption(false);
  };

  const handleConfirm = () => {
    if (!canConfirm) return;

    const wellIndex = allWells.length + 1;
    const paddedIdx = String(wellIndex).padStart(2, '0');
    const wellId = `well-${paddedIdx}`;
    const wellName = `W-${paddedIdx}`;
    const execution = executeWellDrilling(wellId, wellName, resolvedPath, activeParcel, {
      ...drillOptions,
      snapEnabled: false,
      snapToLayer: false,
    });

    const durationSec = Math.max(
      0.8,
      calculateDrillDurationSeconds(execution.path, activeParcel, effectiveDrillSpeedLevel),
    );

    setIsDrillingActive(true);
    setActiveDrillPath(execution.path);
    setActiveDrillDurationSec(durationSec);
    setDrillProgress(0);
    setLavaEruption(false);
    setDiscoveryBanner(null);

    if (drillRafRef.current !== null) window.cancelAnimationFrame(drillRafRef.current);
    const startTime = performance.now();
    const durationMs = durationSec * 1000;

    const finishDrilling = () => {
      drillRafRef.current = null;
      setIsDrillingActive(false);
      setActiveDrillPath(null);
      if (!isWellsControlled) {
        setLocalWells((prev) => [...prev, execution]);
      }
      setSelectedWellId(execution.id);

      if (execution.discoveredMineralIds.length > 0) {
        setLocalDiscoveredMinerals((prev) =>
          Array.from(new Set([...prev, ...execution.discoveredMineralIds])),
        );
      }

      if (execution.status === 'active') {
        setLavaEruption(true);
        const tappedNames = execution.tappedReservoirs
          .map((r) => `${r.name ?? 'Thermal Reservoir'} (${Math.round(r.temperature)}°C)`)
          .join(', ');
        const extras: string[] = [];
        if (execution.discoveredMinerals.length > 0) {
          extras.push(`${execution.discoveredMinerals.length} mineral vein`);
        }
        if (execution.aquiferBreached) {
          extras.push('aquifer sealed');
        }
        setDiscoveryBanner({
          id: execution.id,
          tone: 'positive',
          title: `${wellName} tapped ${tappedNames}!`,
          detail:
            extras.length > 0
              ? `Flow +${execution.flowContribution} TH/s · ${extras.join(' · ')}`
              : `Flow +${execution.flowContribution} TH/s · Ready for production`,
        });
      } else if (execution.status === 'blocked') {
        setDiscoveryBanner({
          id: execution.id,
          tone: 'danger',
          title: `${wellName} blocked by fault!`,
          detail: 'Route around the revealed fault fracture or drill a new well.',
        });
      } else {
        const mineralNote =
          execution.discoveredMinerals.length > 0
            ? ` Discovered ${execution.discoveredMinerals.map((m) => m.name).join(', ')}.`
            : '';
        setDiscoveryBanner({
          id: execution.id,
          tone: 'warning',
          title: `${wellName} reached ${execution.maxDepth}m — dry borehole`,
          detail: `Missed thermal reservoirs.${mineralNote} Plot another well to tap heat.`,
        });
      }

      if (onConfirmWell) {
        onConfirmWell(execution);
      } else if (onConfirmDrillPath) {
        onConfirmDrillPath(execution.path);
      }

      const nextPad = SURFACE_PADS[wellIndex % SURFACE_PADS.length].x;
      setPathPoints([{ x: nextPad, y: SURFACE_Y }]);

      if (!onConfirmWell && !onProceedToProduction && onDrillingComplete) {
        timeoutRef.current = window.setTimeout(() => {
          onDrillingComplete();
        }, 900);
      }
    };

    const tickDrill = (now: number) => {
      const p = Math.min(1, (now - startTime) / durationMs);
      setDrillProgress(p);
      if (p < 1) {
        drillRafRef.current = window.requestAnimationFrame(tickDrill);
      } else {
        finishDrilling();
      }
    };
    drillRafRef.current = window.requestAnimationFrame(tickDrill);
  };

  const handleProceed = () => {
    if (!hasActiveWell || isDrillingActive) return;
    if (onProceedToProduction) {
      onProceedToProduction();
    } else {
      onDrillingComplete?.();
    }
  };

  const rigX =
    (isDrillingActive && activeDrillPath ? activeDrillPath[0]?.x : resolvedPath[0]?.x) ?? 50;
  const polylinePoints = resolvedPath.map((p) => `${p.x},${p.y}`).join(' ');
  const activePartialPoints = drillHeadState
    ? drillHeadState.completedPoints.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
    : '';
  const drillBitPos = drillHeadState?.position ?? null;
  const drillBitAngle = drillHeadState?.angleDeg ?? 90;
  const drillBitColor = TIER_ACCENT_COLORS[currentSpeedTier.level] ?? '#fbbf24';

  const depthTicks = useMemo(() => {
    const mid = Math.round(MAX_DRILL_DEPTH_METERS / 2);
    const set = new Set<number>([...DEPTH_MARKERS, 0, mid, MAX_DRILL_DEPTH_METERS]);
    return Array.from(set)
      .filter((m) => m <= MAX_DRILL_DEPTH_METERS)
      .sort((a, b) => a - b);
  }, []);

  const currentDepthMeters =
    drillHeadState?.depthMeters ??
    (resolvedPath.length > 1
      ? estimate.maxDepthMeters
      : depthInMeters(resolvedPath[0]?.y ?? SURFACE_Y));

  const primaryError =
    resolvedPath.length >= 2 && !validation.valid
      ? validation.reasons[0]
      : !isAffordable && resolvedPath.length >= 2
        ? `Insufficient cash ($${estimate.cost} > $${cash})`
        : null;
  const primaryWarning =
    !primaryError && validation.warnings.length > 0 ? validation.warnings[0] : null;

  const etaRemainingSec = Math.max(0, activeDrillDurationSec * (1 - drillProgress));
  const nextTierShortLabel = nextSpeedTier
    ? nextSpeedTier.name.split(' ').slice(0, 2).join(' ')
    : 'Max';
  const scanCarTargetX = SCAN_SWEEP_STOPS[nextScanStopIdx % SCAN_SWEEP_STOPS.length];

  return (
    <section
      className="tf-screen tf-screen--two-row tf-turmoil-drilling-screen"
      aria-labelledby="drilling-heading"
    >
      {/* Compact Header Capsule */}
      <header className="tf-drilling-header">
        <div className="tf-drilling-header-left">
          <span className="tf-drilling-badge-icon" aria-hidden="true">
            🔩
          </span>
          <div className="tf-drilling-title-copy">
            <h1 id="drilling-heading">Drilling</h1>
            <span>Draw your drilling path!</span>
          </div>
        </div>

        <div className="tf-drilling-header-actions">
          <span
            className="tf-pill tf-tier-pill"
            title={currentSpeedTier.description}
            aria-label={`Active drill bit ${currentSpeedTier.name}`}
          >
            ⚡ {currentSpeedTier.name.split(' ').slice(0, 2).join(' ')} ({currentSpeedTier.speedMultiplier}×)
          </span>

          <button
            type="button"
            className={`tf-snap-pill ${effectiveSnap ? 'is-active' : ''}`}
            onClick={handleSnapToggle}
            role="switch"
            aria-checked={effectiveSnap}
            aria-label="Toggle snap to layer"
          >
            <span className="tf-snap-label">Snap to Layer:</span>
            <strong>{effectiveSnap ? 'ON' : 'OFF'}</strong>
          </button>

          <div className="tf-pill tf-pill--cash" aria-label="Available cash">
            <span aria-hidden="true">⭐</span>
            <strong>${cash.toLocaleString()}</strong>
          </div>
        </div>
      </header>

      {/* Main Two-Column Zero-Scroll Workspace (Stage + Controls Dock) */}
      <div className="tf-drilling-workspace">
        {/* Subterranean 2D Cross-Section Stage */}
        <div className="tf-stage tf-subterranean-stage">
          {/* Live Progressive Drilling HUD Pill */}
          {isDrillingActive && drillHeadState && (
            <div className="tf-drill-progress-hud" role="status" aria-live="polite">
              <div className="tf-drill-progress-meta">
                <strong>
                  Drilling {drillHeadState.depthMeters}m · {drillHeadState.currentLayerName}
                </strong>
                <span>
                  {Math.round(drillProgress * 100)}% · ETA {etaRemainingSec.toFixed(1)}s
                </span>
              </div>
              <div className="tf-drill-progress-track">
                <div
                  className="tf-drill-progress-fill"
                  style={{ width: `${Math.round(drillProgress * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Discovery / Scan Notification Toast */}
          {!isDrillingActive && discoveryBanner && (
            <div
              className={`tf-drill-toast tf-drill-toast--${discoveryBanner.tone}`}
              role="status"
              aria-live="polite"
            >
              <div className="tf-drill-toast-copy">
                <strong>{discoveryBanner.title}</strong>
                <span>{discoveryBanner.detail}</span>
              </div>
              <button
                type="button"
                className="tf-drill-toast-close"
                onClick={() => setDiscoveryBanner(null)}
                aria-label="Dismiss notification"
              >
                ✕
              </button>
            </div>
          )}

          <svg
            ref={svgRef}
            viewBox="-9 0 111 102"
            preserveAspectRatio="xMidYMid meet"
            className="tf-stage-svg tf-turmoil-cutaway-svg"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label="2D underground geological cross-section for manual drilling"
          >
            <defs>
              <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={palette.skyTop} />
                <stop offset="65%" stopColor={palette.skyBottom} />
                <stop offset="100%" stopColor="#1e3a5f" />
              </linearGradient>

              <linearGradient id="surfaceCrustGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#1f4d3a" />
                <stop offset="50%" stopColor="#286149" />
                <stop offset="100%" stopColor="#1b4332" />
              </linearGradient>

              <radialGradient id="magmaGlow" cx="45%" cy="40%" r="65%">
                <stop offset="0%" stopColor="#fef08a" />
                <stop offset="30%" stopColor="#f97316" />
                <stop offset="75%" stopColor="#dc2626" />
                <stop offset="100%" stopColor="#7f1d1d" />
              </radialGradient>

              <radialGradient id="aquiferGlow" cx="40%" cy="40%" r="65%">
                <stop offset="0%" stopColor="#a5f3fc" />
                <stop offset="55%" stopColor="#0284c7" />
                <stop offset="100%" stopColor="#0c4a6e" />
              </radialGradient>

              <radialGradient id="echoThermalHalo" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fb923c" stopOpacity="0.45" />
                <stop offset="55%" stopColor="#f97316" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
              </radialGradient>

              <radialGradient id="echoMineralHalo" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#c084fc" stopOpacity="0.45" />
                <stop offset="55%" stopColor="#818cf8" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
              </radialGradient>

              <radialGradient id="echoFaultHalo" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.42" />
                <stop offset="55%" stopColor="#ef4444" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
              </radialGradient>

              <linearGradient id="crystalGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#c7d2fe" />
                <stop offset="50%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>

              <pattern id="fogGrid" width="8" height="8" patternUnits="userSpaceOnUse">
                <path
                  d="M 8 0 L 0 0 0 8"
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="0.14"
                  opacity="0.16"
                />
              </pattern>

              <filter id="lavaBloom" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2.2" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>

              <clipPath id="parcelClip">
                <rect x="0" y="0" width="100" height="100" />
              </clipPath>
            </defs>

            {/* Left Depth Axis Ruler (x: -9 to 0) */}
            <rect x="-9" y="0" width="9" height="101" fill="#071324" />
            <line x1="0" y1="0" x2="0" y2="100" stroke="#334155" strokeWidth="0.45" />
            {depthTicks.map((meters) => {
              const yPos =
                meters === 0
                  ? SURFACE_Y
                  : Math.max(SURFACE_Y, Math.min(99, (meters / MAX_DRILL_DEPTH_METERS) * 100));
              return (
                <g key={`depth-tick-${meters}`}>
                  <line x1="-1.8" y1={yPos} x2="0" y2={yPos} stroke="#64748b" strokeWidth="0.4" />
                  {meters > 0 && (
                    <line
                      x1="0"
                      y1={yPos}
                      x2="100"
                      y2={yPos}
                      stroke="#94a3b8"
                      strokeWidth="0.18"
                      strokeDasharray="1.5 2"
                      opacity="0.28"
                    />
                  )}
                  <text
                    x="-2.2"
                    y={yPos + 1}
                    textAnchor="end"
                    fill="#94a3b8"
                    fontSize="2.7"
                    fontWeight="700"
                    fontFamily="ui-monospace, monospace"
                  >
                    {meters}m
                  </text>
                </g>
              );
            })}

            <g clipPath="url(#parcelClip)">
              {/* SURFACE SKY & HORIZON (y: 0 to 18) */}
              <rect x="0" y="0" width="100" height="18" fill="url(#skyGrad)" />

              {/* Distant Alien Peaks & Geothermal Plumes */}
              <polygon points="4,16 17,5 30,16" fill="#1e3a5f" opacity="0.7" />
              <polygon points="24,16 42,3 59,16" fill="#162d4e" opacity="0.85" />
              <polygon points="62,16 79,5 96,16" fill="#1e3a5f" opacity="0.75" />
              <circle cx="42" cy="1.8" r="1.4" fill="#fb923c" opacity="0.35" />

              {/* Surface Crust */}
              <rect x="0" y="15.5" width="100" height="2.8" fill="url(#surfaceCrustGrad)" />
              <line
                x1="0"
                y1="18"
                x2="100"
                y2="18"
                stroke={palette.surfaceAccent}
                strokeWidth="0.45"
                opacity="0.75"
              />

              {/* Surface-Projected Survey Clues (only when surveyed; never exact reservoir coords!) */}
              {surfaceClues.thermal.map((clue) => (
                <g key={`clue-th-${clue.id}`}>
                  <line
                    x1={clue.x}
                    y1="15.5"
                    x2={clue.x}
                    y2="23"
                    stroke="#f97316"
                    strokeWidth="0.5"
                    strokeDasharray="1 1"
                    opacity="0.7"
                  />
                  <circle cx={clue.x} cy="15.5" r="1.3" fill="#fb923c" opacity="0.85" />
                </g>
              ))}
              {surfaceClues.minerals.map((clue) => (
                <polygon
                  key={`clue-min-${clue.id}`}
                  points={`${clue.x},13.4 ${clue.x + 1.1},15.2 ${clue.x - 1.1},15.2`}
                  fill="#818cf8"
                  opacity="0.85"
                />
              ))}
              {surfaceClues.faults.map((clue) => (
                <path
                  key={`clue-flt-${clue.id}`}
                  d={`M ${clue.x - 1} 15.5 L ${clue.x + 0.6} 17 L ${clue.x - 0.5} 18.2`}
                  stroke="#ef4444"
                  strokeWidth="0.5"
                  fill="none"
                />
              ))}

              {/* GEOLOGICAL STRATA LAYERS (from parcel.layers) */}
              {activeParcel.layers.map((layer, idx) => {
                const startY = Math.max(SURFACE_Y, layer.top);
                const endY = Math.max(startY, layer.bottom);
                const height = endY - startY;
                if (height <= 0) return null;

                const fill = layerFillColor(layer);
                const hardnessLabel = `${(layer.hardness ?? 1).toFixed(1)}×`;

                return (
                  <g key={`${layer.type}-${idx}`}>
                    <rect
                      x="0"
                      y={startY}
                      width="100"
                      height={height}
                      fill={fill}
                      opacity="0.96"
                    />
                    {idx > 0 && (
                      <path
                        d={`M 0 ${startY} Q 25 ${startY - 1}, 50 ${startY} T 100 ${startY}`}
                        fill="none"
                        stroke={effectiveSnap ? '#38bdf8' : '#94a3b8'}
                        strokeWidth={effectiveSnap ? '0.45' : '0.3'}
                        strokeDasharray={effectiveSnap ? '2 1.2' : 'none'}
                        opacity={effectiveSnap ? '0.85' : '0.45'}
                      />
                    )}
                    <text
                      x="98"
                      y={startY + Math.min(5.5, height * 0.45)}
                      textAnchor="end"
                      fill="#e2e8f0"
                      fontSize="2.3"
                      fontWeight="700"
                      opacity="0.58"
                    >
                      {layer.name ?? layer.type} · {hardnessLabel}
                    </text>
                  </g>
                );
              })}

              {/* Fog-of-war exploration grid */}
              <rect x="0" y={SURFACE_Y} width="100" height={100 - SURFACE_Y} fill="url(#fogGrid)" />

              {/* Scan Car Active Sweep Beam & Sonar Rings */}
              {scanCarAnim.active && scanCarAnim.pulseProgress > 0 && (
                <g className="tf-echo-sweep">
                  <polygon
                    points={`${scanCarAnim.currentX},${SURFACE_Y} ${Math.max(0, scanCarAnim.currentX - SIMULATION_DEFAULTS.echoScanRadiusX)},100 ${Math.min(100, scanCarAnim.currentX + SIMULATION_DEFAULTS.echoScanRadiusX)},100`}
                    fill="#38bdf8"
                    opacity={Math.max(0, 0.14 * (1 - scanCarAnim.pulseProgress))}
                  />
                  {[0, 0.3, 0.6].map((offset, idx) => {
                    const ringP = Math.max(0, scanCarAnim.pulseProgress - offset);
                    if (ringP <= 0) return null;
                    const rx = ringP * SIMULATION_DEFAULTS.echoScanRadiusX * 1.15;
                    const ry = ringP * 68;
                    return (
                      <ellipse
                        key={`sonar-ring-${idx}`}
                        cx={scanCarAnim.currentX}
                        cy={SURFACE_Y + 2}
                        rx={rx}
                        ry={ry}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="0.65"
                        opacity={Math.max(0, (1 - ringP) * 0.8)}
                      />
                    );
                  })}
                </g>
              )}

              {/* Fuzzy Echo Scan Ping Halos (Never leak exact reservoir boundaries!) */}
              {visibleEchoPings.map((ping) => {
                const haloFill =
                  ping.kind === 'thermal'
                    ? 'url(#echoThermalHalo)'
                    : ping.kind === 'mineral'
                      ? 'url(#echoMineralHalo)'
                      : 'url(#echoFaultHalo)';
                const strokeColor =
                  ping.kind === 'thermal'
                    ? '#fb923c'
                    : ping.kind === 'mineral'
                      ? '#c084fc'
                      : '#fbbf24';
                return (
                  <g
                    key={ping.id}
                    className={`tf-echo-ping tf-echo-ping--${ping.kind}`}
                    opacity={0.55 + ping.strength * 0.4}
                  >
                    <circle cx={ping.approxX} cy={ping.approxY} r={ping.radius} fill={haloFill} />
                    <circle
                      cx={ping.approxX}
                      cy={ping.approxY}
                      r={ping.radius * 0.68}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth="0.45"
                      strokeDasharray="1.4 1.4"
                      opacity="0.7"
                    />
                    <text
                      x={ping.approxX}
                      y={ping.approxY + 0.8}
                      textAnchor="middle"
                      fill={strokeColor}
                      fontSize="2.1"
                      fontWeight="800"
                    >
                      {ping.kind === 'thermal'
                        ? `~${ping.tempBand ?? 'Heat?'}`
                        : ping.kind === 'mineral'
                          ? '◆ Mineral?'
                          : '⚠ Fault?'}
                    </text>
                  </g>
                );
              })}

              {/* Snap-to-layer visual guides when toggle is ON */}
              {effectiveSnap &&
                snapBoundaries.map((boundary) => (
                  <line
                    key={`snap-guide-${boundary}`}
                    x1="0"
                    y1={boundary}
                    x2="100"
                    y2={boundary}
                    stroke="#38bdf8"
                    strokeWidth="0.35"
                    strokeDasharray="1.8 1.5"
                    opacity="0.6"
                  />
                ))}

              {/* FOG-OF-WAR REVEALED FORMATIONS ONLY */}
              {(activeParcel.aquifers ?? [])
                .filter((aquifer) => revealedSets.aquiferIds.has(aquifer.id))
                .map((aquifer) => (
                  <g key={aquifer.id} className="tf-aquifer-pocket" filter="url(#lavaBloom)">
                    <ellipse
                      cx={aquifer.center.x}
                      cy={aquifer.center.y}
                      rx={aquifer.radiusX}
                      ry={aquifer.radiusY}
                      fill="url(#aquiferGlow)"
                      stroke="#38bdf8"
                      strokeWidth="0.7"
                      opacity="0.92"
                    />
                    <text
                      x={aquifer.center.x}
                      y={aquifer.center.y + 1}
                      textAnchor="middle"
                      fill="#e0f2fe"
                      fontSize="2.4"
                      fontWeight="800"
                    >
                      AQUIFER ({aquifer.hazardLevel.toUpperCase()})
                    </text>
                  </g>
                ))}

              {(activeParcel.faults ?? [])
                .filter((fault) => revealedSets.faultIds.has(fault.id))
                .map((fault) => {
                  const midX = (fault.start.x + fault.end.x) / 2;
                  const midY = (fault.start.y + fault.end.y) / 2;
                  return (
                    <g key={fault.id} className="tf-fault-obstacle">
                      <line
                        x1={fault.start.x}
                        y1={fault.start.y}
                        x2={fault.end.x}
                        y2={fault.end.y}
                        stroke={fault.blocksDrilling ? '#ef4444' : '#fbbf24'}
                        strokeWidth={Math.max(1.2, fault.thickness * 0.55)}
                        strokeLinecap="round"
                        strokeDasharray={fault.blocksDrilling ? 'none' : '2 1'}
                      />
                      <text
                        x={midX}
                        y={midY - 2}
                        textAnchor="middle"
                        fill="#fecaca"
                        fontSize="2.2"
                        fontWeight="800"
                      >
                        ⚠ {fault.label}
                      </text>
                    </g>
                  );
                })}

              {activeParcel.reservoirs
                .filter((reservoir) => revealedSets.reservoirIds.has(reservoir.id))
                .map((reservoir) => (
                  <g key={reservoir.id} className="tf-magma-chamber" filter="url(#lavaBloom)">
                    <ellipse
                      cx={reservoir.center.x}
                      cy={reservoir.center.y}
                      rx={reservoir.radius}
                      ry={reservoir.radius * 0.72}
                      fill="url(#magmaGlow)"
                      stroke="#fbbf24"
                      strokeWidth="0.9"
                    />
                    <circle
                      cx={reservoir.center.x - reservoir.radius * 0.3}
                      cy={reservoir.center.y - reservoir.radius * 0.15}
                      r={Math.max(1.2, reservoir.radius * 0.16)}
                      fill="#fef08a"
                      opacity="0.9"
                    />
                    <circle
                      cx={reservoir.center.x + reservoir.radius * 0.28}
                      cy={reservoir.center.y + reservoir.radius * 0.18}
                      r={Math.max(1.4, reservoir.radius * 0.2)}
                      fill="#fed7aa"
                      opacity="0.85"
                    />
                    <text
                      x={reservoir.center.x}
                      y={reservoir.center.y + 1.1}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="2.4"
                      fontWeight="900"
                    >
                      {Math.round(reservoir.temperature)}°C
                    </text>
                  </g>
                ))}

              {(activeParcel.minerals ?? [])
                .filter((mineral) => revealedSets.mineralIds.has(mineral.id))
                .map((mineral) => (
                  <g key={mineral.id} className="tf-mineral-cluster">
                    <polygon
                      points={`${mineral.position.x},${mineral.position.y - 3.2} ${mineral.position.x + 2.4},${mineral.position.y + 0.5} ${mineral.position.x},${mineral.position.y + 3} ${mineral.position.x - 2.4},${mineral.position.y + 0.5}`}
                      fill="url(#crystalGrad)"
                      stroke="#e0e7ff"
                      strokeWidth="0.45"
                    />
                    <text
                      x={mineral.position.x}
                      y={mineral.position.y + 5.6}
                      textAnchor="middle"
                      fill="#c7d2fe"
                      fontSize="2.1"
                      fontWeight="700"
                    >
                      {mineral.name}
                    </text>
                  </g>
                ))}

              {/* Completed Drilled Wells */}
              {allWells.map((well) => {
                const isSelected = well.id === selectedWellId;
                const wellPts = well.path.map((p) => `${p.x},${p.y}`).join(' ');
                const strokeColor =
                  well.status === 'active'
                    ? '#fb923c'
                    : well.status === 'blocked'
                      ? '#ef4444'
                      : '#64748b';
                return (
                  <g
                    key={well.id}
                    className={isSelected ? 'tf-well-path is-selected' : 'tf-well-path'}
                  >
                    <polyline
                      points={wellPts}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={isSelected ? '2.2' : '1.45'}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={well.status === 'blocked' ? '2 1.2' : undefined}
                      opacity={isSelected ? 1 : 0.85}
                    />
                    {well.path[0] && (
                      <g>
                        <circle
                          cx={well.path[0].x}
                          cy={well.path[0].y}
                          r="1.9"
                          fill={strokeColor}
                          stroke="#081426"
                          strokeWidth="0.5"
                        />
                        <text
                          x={well.path[0].x}
                          y={well.path[0].y - 2.8}
                          textAnchor="middle"
                          fill="#f8fafc"
                          fontSize="2.2"
                          fontWeight="800"
                        >
                          {well.name}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Selectable Surface Entry Pads */}
              {SURFACE_PADS.map((pad) => {
                const isActivePad = Math.abs(rigX - pad.x) < 6;
                return (
                  <g
                    key={pad.id}
                    className={`tf-surface-pad ${isActivePad ? 'is-active' : ''}`}
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      handleSelectSurfacePad(pad.x);
                    }}
                  >
                    <rect
                      x={pad.x - 4}
                      y={SURFACE_Y - 1.2}
                      width="8"
                      height="2.2"
                      rx="0.6"
                      fill={isActivePad ? '#f59e0b' : '#334155'}
                      stroke={isActivePad ? '#fef08a' : '#64748b'}
                      strokeWidth="0.35"
                    />
                  </g>
                );
              })}

              {/* Surface Scan Car (visible when deployed or scanning) */}
              {(scanCarAnim.active || effectiveEchoScans.length > 0) && (
                <g
                  className="tf-surface-scan-car"
                  transform={`translate(${
                    (scanCarAnim.active
                      ? scanCarAnim.currentX
                      : effectiveEchoScans[effectiveEchoScans.length - 1]?.scanX ?? 50) - 5.5
                  }, 12)`}
                >
                  {/* Chassis */}
                  <rect
                    x="0.5"
                    y="2.2"
                    width="10"
                    height="3.2"
                    rx="1"
                    fill="#0284c7"
                    stroke="#bae6fd"
                    strokeWidth="0.35"
                  />
                  {/* Cabin Window */}
                  <rect x="6.5" y="1.1" width="3.2" height="2" rx="0.5" fill="#e0f2fe" />
                  {/* Sonar Dish */}
                  <path d="M 2.5 2.2 L 3.8 0.4 L 5.1 2.2" fill="none" stroke="#fbbf24" strokeWidth="0.45" />
                  <circle cx="3.8" cy="0.4" r="0.6" fill="#38bdf8" />
                  {/* Wheels */}
                  <circle cx="2.5" cy="5.7" r="0.9" fill="#0f172a" stroke="#94a3b8" strokeWidth="0.35" />
                  <circle cx="8.3" cy="5.7" r="0.9" fill="#0f172a" stroke="#94a3b8" strokeWidth="0.35" />
                </g>
              )}

              {/* Mobile Drilling Rig Derrick on Tracks (centered at rigX, y=18) */}
              <g className="tf-surface-rig" transform={`translate(${rigX - 8}, 3)`}>
                <polygon
                  points="8,15 4,0 12,0 8,15"
                  fill="#94a3b8"
                  stroke="#1e293b"
                  strokeWidth="0.4"
                />
                <line x1="5" y1="5" x2="11" y2="5" stroke="#1e293b" strokeWidth="0.4" />
                <line x1="6" y1="10" x2="10" y2="10" stroke="#1e293b" strokeWidth="0.4" />
                <line x1="5" y1="5" x2="10" y2="10" stroke="#1e293b" strokeWidth="0.3" />
                <line x1="11" y1="5" x2="6" y2="10" stroke="#1e293b" strokeWidth="0.3" />
                <rect
                  x="11"
                  y="7"
                  width="7.5"
                  height="6.5"
                  rx="0.8"
                  fill="#e2e8f0"
                  stroke="#334155"
                  strokeWidth="0.4"
                />
                <rect x="12.6" y="8.6" width="4" height="2.8" rx="0.4" fill="#38bdf8" />
                <rect
                  x="2"
                  y="13.5"
                  width="17"
                  height="2"
                  rx="0.8"
                  fill="#0f172a"
                  stroke="#334155"
                  strokeWidth="0.35"
                />
                <circle cx="4" cy="14.5" r="0.65" fill="#94a3b8" />
                <circle cx="8" cy="14.5" r="0.65" fill="#94a3b8" />
                <circle cx="13" cy="14.5" r="0.65" fill="#94a3b8" />
                <circle cx="17" cy="14.5" r="0.65" fill="#94a3b8" />
                <circle
                  cx="8"
                  cy="0"
                  r="0.85"
                  fill={isDrillingActive ? drillBitColor : '#ef4444'}
                />
              </g>

              {/* Aim Preview Segment */}
              {!isDrillingActive &&
                hoverPoint &&
                resolvedPath.length > 0 &&
                resolvedPath.length < SIMULATION_DEFAULTS.maxWaypointsPerWell && (
                  <g className="tf-aim-preview">
                    <line
                      x1={resolvedPath[resolvedPath.length - 1].x}
                      y1={resolvedPath[resolvedPath.length - 1].y}
                      x2={hoverPoint.x}
                      y2={hoverPoint.y}
                      stroke="#38bdf8"
                      strokeWidth="0.85"
                      strokeDasharray="1.8 1.5"
                      opacity="0.75"
                    />
                    <circle
                      cx={hoverPoint.x}
                      cy={hoverPoint.y}
                      r="1.3"
                      fill="#38bdf8"
                      opacity="0.65"
                    />
                  </g>
                )}

              {/* Active Draft Pipe Path Polyline */}
              <polyline
                points={polylinePoints}
                fill="none"
                stroke={
                  lavaEruption
                    ? '#f97316'
                    : resolvedPath.length >= 2 && (!validation.valid || !isAffordable)
                      ? '#ef4444'
                      : '#f8fafc'
                }
                strokeWidth={lavaEruption ? '2.2' : '1.5'}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={isDrillingActive ? '1.6 1.4' : undefined}
                opacity={isDrillingActive ? '0.35' : '0.96'}
                className={lavaEruption ? 'tf-pipe-erupting' : ''}
                filter={lavaEruption ? 'url(#lavaBloom)' : undefined}
              />

              {/* Animated Completed Borehole Casing Trail */}
              {isDrillingActive && activePartialPoints && (
                <g className="tf-completed-borehole">
                  <polyline
                    points={activePartialPoints}
                    fill="none"
                    stroke="#334155"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polyline
                    points={activePartialPoints}
                    fill="none"
                    stroke={drillBitColor}
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#lavaBloom)"
                  />
                </g>
              )}

              {/* Draft Path Waypoint Vertices */}
              {!isDrillingActive &&
                resolvedPath.map((pt, idx) => (
                  <circle
                    key={`pipe-pt-${idx}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={idx === 0 ? '2' : '1.45'}
                    fill={idx === 0 ? '#fbbf24' : '#f8fafc'}
                    stroke="#081426"
                    strokeWidth="0.55"
                  />
                ))}

              {/* Illustrated Rotating/Vibrating Drill Head */}
              {isDrillingActive && drillBitPos && (
                <g
                  className="tf-drill-head"
                  transform={`translate(${drillBitPos.x}, ${drillBitPos.y}) rotate(${drillBitAngle - 90})`}
                >
                  <circle
                    cx="0"
                    cy="0.6"
                    r="3.2"
                    fill={drillBitColor}
                    opacity="0.22"
                    filter="url(#lavaBloom)"
                  />
                  <g className="tf-drill-head-vibrate">
                    {/* Collar & Auger Cone */}
                    <rect
                      x="-1.6"
                      y="-2.4"
                      width="3.2"
                      height="1.6"
                      rx="0.4"
                      fill="#475569"
                      stroke="#0f172a"
                      strokeWidth="0.35"
                    />
                    <polygon
                      points="0,3.6 -1.9,-0.8 1.9,-0.8"
                      fill={drillBitColor}
                      stroke="#0f172a"
                      strokeWidth="0.4"
                    />
                    {/* Spiral Auger Teeth */}
                    <line x1="-1.3" y1="0.2" x2="1.2" y2="1.0" stroke="#fef08a" strokeWidth="0.45" />
                    <line x1="-0.8" y1="1.6" x2="0.7" y2="2.3" stroke="#fef08a" strokeWidth="0.45" />
                    {/* Rock Sparks */}
                    <circle className="tf-spark tf-spark-1" cx="-2.4" cy="2.1" r="0.6" fill="#fef08a" />
                    <circle className="tf-spark tf-spark-2" cx="2.3" cy="2.6" r="0.65" fill="#f97316" />
                  </g>
                </g>
              )}

              {/* Magma Eruption Surface Flare */}
              {lavaEruption && (
                <g className="tf-lava-rush-fx">
                  <circle cx={rigX} cy={SURFACE_Y} r="3.6" fill="#f97316" filter="url(#lavaBloom)" />
                  <circle cx={rigX} cy={SURFACE_Y - 3.5} r="2.4" fill="#fbbf24" filter="url(#lavaBloom)" />
                  <circle cx={rigX} cy={SURFACE_Y - 6.5} r="1.5" fill="#ffffff" filter="url(#lavaBloom)" />
                </g>
              )}
            </g>
          </svg>
        </div>

        {/* Controls, Telemetry, Validation, Upgrades & Multi-Well Sidebar / Mobile Dock */}
        <aside className="tf-panel-card tf-drilling-controls-column" aria-label="Drilling controls">
          {/* Telemetry + Live Cost & Drill Time */}
          <div className="tf-drill-telemetry-badge">
            <div className="tf-telemetry-row">
              <span className="tf-telemetry-label">Depth</span>
              <strong className="tf-telemetry-val">{currentDepthMeters}m</strong>
            </div>
            <div className="tf-telemetry-row">
              <span className="tf-telemetry-label">Drill Time</span>
              <strong className="tf-telemetry-val">
                {estimatedDurationSec > 0 ? `${estimatedDurationSec.toFixed(1)}s` : '—'}
              </strong>
            </div>
            <div className="tf-telemetry-row">
              <span className="tf-telemetry-label">Drill Cost</span>
              <strong
                className={`tf-telemetry-val ${!isAffordable ? 'tf-val--danger' : 'tf-val--cost'}`}
              >
                ${estimate.cost.toLocaleString()}
              </strong>
            </div>
          </div>

          {/* Real-Time Validation / Hazard Status */}
          <div
            className={`tf-drill-validation ${
              primaryError
                ? 'is-error'
                : primaryWarning
                  ? 'is-warning'
                  : resolvedPath.length >= 2
                    ? 'is-valid'
                    : 'is-idle'
            }`}
            role="status"
          >
            {primaryError ??
              primaryWarning ??
              (resolvedPath.length >= 2
                ? `Valid route (${estimate.crossedLayers.length} strata · ${resolvedPath.length}/${SIMULATION_DEFAULTS.maxWaypointsPerWell} pts)`
                : 'Click or drag down from the rig to plot a path.')}
          </div>

          {/* Scan Car Echo & Drill Speed Upgrade Row */}
          <div className="tf-drill-tech-row">
            <button
              type="button"
              className="tf-btn tf-btn-scan-car"
              onClick={handleDeployScanCar}
              disabled={!canDeployScanCar}
              title={`Deploy Scan Car echo sweep at X=${scanCarTargetX} ($${SIMULATION_DEFAULTS.echoScanCost})`}
            >
              🚗 Scan Car (${SIMULATION_DEFAULTS.echoScanCost})
            </button>

            <button
              type="button"
              className="tf-btn tf-btn-speed-upgrade"
              onClick={handleUpgradeSpeed}
              disabled={!canUpgradeSpeed}
              title={
                nextSpeedTier
                  ? `${nextSpeedTier.name}: ${nextSpeedTier.description}`
                  : 'Maximum drill speed tier unlocked'
              }
            >
              {nextSpeedTier
                ? `⚡ Speed ${nextTierShortLabel} ($${nextSpeedTier.upgradeCost})`
                : '⚡ Max Speed (Mk IV)'}
            </button>
          </div>

          {/* Readable Action Controls */}
          <div className="tf-drill-action-buttons">
            <button
              type="button"
              className="tf-btn tf-btn--quiet tf-btn-undo"
              onClick={handleUndo}
              disabled={pathPoints.length <= 1 || isDrillingActive}
              aria-label="Undo last waypoint"
            >
              ↩ Undo
            </button>

            <button
              type="button"
              className="tf-btn tf-btn--quiet tf-btn-clear"
              onClick={handleClear}
              disabled={pathPoints.length <= 1 || isDrillingActive}
              aria-label="Clear drilling path"
            >
              ✕ Clear
            </button>

            <button
              type="button"
              className="tf-btn tf-btn--positive tf-btn-confirm"
              onClick={handleConfirm}
              disabled={!canConfirm}
              aria-label="Confirm drilling path"
            >
              {isDrillingActive
                ? `Drilling (${Math.round(drillProgress * 100)}%)...`
                : '✔ Confirm Path'}
            </button>
          </div>

          {/* Multi-Well Manager + Proceed to Production */}
          <div className="tf-multiwell-box">
            <div className="tf-multiwell-head">
              <span>Wells ({allWells.length})</span>
              <button
                type="button"
                className="tf-well-new-btn"
                onClick={handleStartNewWell}
                disabled={isDrillingActive}
              >
                + New Well
              </button>
            </div>

            {allWells.length > 0 ? (
              <div className="tf-well-list">
                {allWells.map((well) => (
                  <button
                    key={well.id}
                    type="button"
                    className={`tf-well-chip tf-well-chip--${well.status} ${
                      selectedWellId === well.id ? 'is-selected' : ''
                    }`}
                    onClick={() => setSelectedWellId(well.id)}
                  >
                    <span>{well.name}</span>
                    <small>
                      {well.status === 'active'
                        ? `${Math.round(well.wellheadTempC)}°C`
                        : well.status}
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <p className="tf-well-empty">
                Subsurface hidden until drilled. Deploy Scan Car or drill to tap heat.
              </p>
            )}

            <button
              type="button"
              className="tf-btn tf-btn--cta tf-btn-proceed-prod"
              onClick={handleProceed}
              disabled={!hasActiveWell || isDrillingActive}
            >
              Proceed to Production ▶
            </button>
          </div>

          {/* Compact Subsurface Target Key */}
          <div className="tf-drill-legend" aria-label="Subsurface formation legend">
            <span className="tf-legend-chip tf-legend-chip--magma">
              <i /> MAGMA POOL
            </span>
            <span className="tf-legend-chip tf-legend-chip--aquifer">
              <i /> AQUIFER
            </span>
            <span className="tf-legend-chip tf-legend-chip--mineral">
              <i /> MINERALS
            </span>
            <span className="tf-legend-chip tf-legend-chip--fault">
              <i /> FAULT
            </span>
          </div>
        </aside>
      </div>
    </section>
  );
}
