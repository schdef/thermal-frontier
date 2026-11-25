import {
  BASE_DRILL_SPEED_UNITS_PER_SEC,
  DRILL_UPGRADE_TIERS,
  GEOLOGY_HARDNESS,
  MAX_DRILL_DEPTH_METERS,
  SIMULATION_DEFAULTS,
} from './constants';
import { randomBetween, seededRandom } from './random';
import type {
  Aquifer,
  DrillHeadState,
  DrillSpeedTier,
  EchoPing,
  EchoScanRecord,
  FaultObstacle,
  GeologyLayer,
  MineralDeposit,
  Parcel,
  PathValidationResult,
  Point,
  Reservoir,
  StableGroundZone,
  WellRecord,
  WellStatus,
} from './types';

export const DEFAULT_SURFACE_MAX_Y = 22;
export const DEFAULT_MIN_TURN_ANGLE_DEG = 30;
export const DEFAULT_MIN_SEGMENT_LENGTH = 0.5;
export const DEFAULT_MIN_TOTAL_LENGTH = 3;
export const DEFAULT_MINERAL_HIT_RADIUS = 6;
export const TURN_BEND_THRESHOLD_DEG = 5;
export const TURN_BEND_COST = 15;
export const DEPTH_SURCHARGE_AT_MAX_DEPTH = 30;

export interface RectZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DrillingOptions {
  snapToLayer?: boolean;
  snapEnabled?: boolean;
  snapThreshold?: number;
  gridStepX?: number;
  gridStepY?: number;
  surfaceMaxY?: number;
  minTurnAngleDeg?: number;
  minSegmentLength?: number;
  minTotalLength?: number;
  maxWaypoints?: number;
  maxDepthMeters?: number;
  availableCash?: number;
  mineralHitRadius?: number;
  drillUpgradeLevel?: number;
  allowSevereFault?: boolean;
  existingWells?: WellRecord[];
}

export interface DrillEstimate {
  distance: number;
  cost: number;
  crossedLayers: string[];
  aquiferCollisions: Aquifer[];
  faultCollisions: FaultObstacle[];
  mineralHits: MineralDeposit[];
  turnCount: number;
  reachesMagma: boolean;
  depthMeters: number;
  maxDepthMeters: number;
}

export interface DrillResult extends DrillEstimate {
  revealedReservoirIds: string[];
  discoveredMineralIds: string[];
  path: Point[];
  aquiferBreached: boolean;
  lavaTapped: boolean;
  hitReservoir?: Reservoir;
  validation: PathValidationResult;
}

export interface WellExecutionResult extends WellRecord {
  discoveredMineralIds: string[];
  discoveredMinerals: MineralDeposit[];
  tappedReservoirs: Reservoir[];
  aquiferBreached: boolean;
  validation: PathValidationResult;
}

export interface MultiWellSummary {
  wellCount: number;
  activeWellCount: number;
  dryWellCount: number;
  blockedWellCount: number;
  totalLength: number;
  totalCost: number;
  totalFlowContribution: number;
  weightedWellheadTempC: number;
  tappedReservoirIds: string[];
  intersectedFaultIds: string[];
  intersectedAquiferIds: string[];
}

export function depthInMeters(y: number): number {
  return Math.round(Math.max(0, y) * 5);
}

export function depthFromMeters(meters: number): number {
  return Math.max(0, Math.min(100, meters / 5));
}

export function snapToLayer(
  parcel: Parcel,
  point: Point,
  threshold = 5,
  snapEnabled = true,
): Point {
  if (!snapEnabled) {
    return { x: point.x, y: point.y };
  }

  const boundaries: number[] = [];
  for (const layer of parcel.layers) {
    boundaries.push(layer.top);
    boundaries.push(layer.bottom);
  }

  let closestBoundary = point.y;
  let minDiff = Infinity;

  for (const b of boundaries) {
    const diff = Math.abs(point.y - b);
    if (diff < minDiff && diff <= threshold) {
      minDiff = diff;
      closestBoundary = b;
    }
  }

  return { x: point.x, y: closestBoundary };
}

export function snapDrillPoint(
  parcel: Parcel,
  point: Point,
  options?: {
    snapEnabled?: boolean;
    snapToLayer?: boolean;
    threshold?: number;
    gridStepX?: number;
    gridStepY?: number;
  },
): Point {
  const enabled = options?.snapEnabled ?? options?.snapToLayer ?? true;
  if (!enabled) {
    return { x: point.x, y: point.y };
  }

  const threshold = options?.threshold ?? 5;
  const layerSnapped = snapToLayer(parcel, point, threshold, true);

  const snappedX =
    options?.gridStepX && options.gridStepX > 0
      ? Math.round(point.x / options.gridStepX) * options.gridStepX
      : point.x;

  const didSnapToLayer = layerSnapped.y !== point.y;
  const snappedY =
    !didSnapToLayer && options?.gridStepY && options.gridStepY > 0
      ? Math.round(point.y / options.gridStepY) * options.gridStepY
      : layerSnapped.y;

  return { x: snappedX, y: snappedY };
}

export function segmentDistance(first: Point, second: Point): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return segmentDistance(point, start);
  const projection = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
  );
  return segmentDistance(point, {
    x: start.x + projection * dx,
    y: start.y + projection * dy,
  });
}

export function segmentIntersectsCircle(
  start: Point,
  end: Point,
  center: Point,
  radius: number,
): boolean {
  if (radius < 0) return false;
  return distanceToSegment(center, start, end) <= radius;
}

export function segmentIntersectsEllipse(
  start: Point,
  end: Point,
  center: Point,
  radiusX: number,
  radiusY: number,
): boolean {
  if (radiusX <= 0 || radiusY <= 0) return false;

  const u = (start.x - center.x) / radiusX;
  const v = (start.y - center.y) / radiusY;
  const du = (end.x - start.x) / radiusX;
  const dv = (end.y - start.y) / radiusY;

  const a = du * du + dv * dv;
  const b = 2 * (u * du + v * dv);
  const c = u * u + v * v;

  const t = a === 0 ? 0 : Math.max(0, Math.min(1, -b / (2 * a)));
  const minDistSq = a * t * t + b * t + c;
  return minDistSq <= 1.0 + 1e-9;
}

export function segmentIntersectsRect(start: Point, end: Point, rect: RectZone): boolean {
  if (rect.width < 0 || rect.height < 0) return false;
  const minX = rect.x;
  const maxX = rect.x + rect.width;
  const minY = rect.y;
  const maxY = rect.y + rect.height;

  const dx = end.x - start.x;
  const dy = end.y - start.y;

  let t0 = 0;
  let t1 = 1;

  const p = [-dx, dx, -dy, dy];
  const q = [start.x - minX, maxX - start.x, start.y - minY, maxY - start.y];

  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-12) {
      if (q[i] < 0) return false;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }

  return t0 <= t1;
}

export function segmentIntersectsSegment(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point,
): boolean {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && pointOnSegment(b1, a1, a2)) return true;
  if (o2 === 0 && pointOnSegment(b2, a1, a2)) return true;
  if (o3 === 0 && pointOnSegment(a1, b1, b2)) return true;
  if (o4 === 0 && pointOnSegment(a2, b1, b2)) return true;

  return false;
}

export function distanceBetweenSegments(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point,
): number {
  if (segmentIntersectsSegment(a1, a2, b1, b2)) return 0;
  return Math.min(
    distanceToSegment(a1, b1, b2),
    distanceToSegment(a2, b1, b2),
    distanceToSegment(b1, a1, a2),
    distanceToSegment(b2, a1, a2),
  );
}

export function getSegmentLayerOverlaps(
  parcel: Parcel,
  start: Point,
  end: Point,
): Array<{ layer: GeologyLayer; length: number }> {
  const len = segmentDistance(start, end);
  if (len === 0) return [];

  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const dy = maxY - minY;

  if (dy < 1e-9) {
    const exactMatch =
      parcel.layers.find(
        (layer) =>
          start.y >= layer.top &&
          (start.y < layer.bottom || (start.y === layer.bottom && layer.bottom === 100)),
      ) ?? parcel.layers.find((layer) => start.y >= layer.top && start.y <= layer.bottom);
    return exactMatch ? [{ layer: exactMatch, length: len }] : [];
  }

  const overlaps: Array<{ layer: GeologyLayer; length: number }> = [];
  for (const layer of parcel.layers) {
    const overlapY = Math.min(maxY, layer.bottom) - Math.max(minY, layer.top);
    if (overlapY > 1e-9) {
      overlaps.push({ layer, length: len * (overlapY / dy) });
    }
  }
  return overlaps;
}

export function detectCrossedLayers(parcel: Parcel, path: Point[]): string[] {
  if (path.length === 0) return [];

  const crossedSet = new Set<string>();
  if (path.length === 1) {
    const y = path[0].y;
    for (const layer of parcel.layers) {
      if (y >= layer.top && y <= layer.bottom) {
        crossedSet.add(layer.type);
      }
    }
    return Array.from(crossedSet);
  }

  for (let i = 1; i < path.length; i++) {
    const overlaps = getSegmentLayerOverlaps(parcel, path[i - 1], path[i]);
    for (const { layer } of overlaps) {
      crossedSet.add(layer.type);
    }
  }

  // Preserve geological strata order
  const ordered: string[] = [];
  for (const layer of parcel.layers) {
    if (crossedSet.has(layer.type) && !ordered.includes(layer.type)) {
      ordered.push(layer.type);
    }
  }
  for (const type of crossedSet) {
    if (!ordered.includes(type)) ordered.push(type);
  }
  return ordered;
}

export function checkAquiferCollisions(parcel: Parcel, path: Point[]): Aquifer[] {
  if (!parcel.aquifers || parcel.aquifers.length === 0 || path.length < 2) return [];

  return parcel.aquifers.filter((aquifer) =>
    path.slice(1).some((point, index) =>
      segmentIntersectsEllipse(path[index], point, aquifer.center, aquifer.radiusX, aquifer.radiusY),
    ),
  );
}

export function checkFaultCollisions(parcel: Parcel, path: Point[]): FaultObstacle[] {
  if (!parcel.faults || parcel.faults.length === 0 || path.length < 2) return [];

  return parcel.faults.filter((fault) => {
    const halfThickness = Math.max(0.5, fault.thickness / 2);
    return path.slice(1).some(
      (point, index) =>
        distanceBetweenSegments(path[index], point, fault.start, fault.end) <= halfThickness,
    );
  });
}

export function checkReservoirCollisions(parcel: Parcel, path: Point[]): Reservoir[] {
  if (path.length < 2) return [];

  return parcel.reservoirs.filter((reservoir) =>
    path.slice(1).some((point, index) =>
      segmentIntersectsCircle(path[index], point, reservoir.center, reservoir.radius),
    ),
  );
}

export function checkMineralCollisions(
  parcel: Parcel,
  path: Point[],
  hitRadius = DEFAULT_MINERAL_HIT_RADIUS,
): MineralDeposit[] {
  if (!parcel.minerals || parcel.minerals.length === 0 || path.length < 2) return [];

  return parcel.minerals.filter((mineral) =>
    path.slice(1).some((point, index) =>
      segmentIntersectsCircle(path[index], point, mineral.position, hitRadius),
    ),
  );
}

export function checkStableZoneCollisions(parcel: Parcel, path: Point[]): StableGroundZone[] {
  if (!parcel.stableGround || parcel.stableGround.length === 0 || path.length < 2) return [];

  return parcel.stableGround.filter((zone) => {
    const rect: RectZone = {
      x: zone.x,
      y: zone.y ?? 0,
      width: zone.width,
      height: zone.height ?? SIMULATION_DEFAULTS.parcelDepth,
    };
    return path.slice(1).some((point, index) =>
      segmentIntersectsRect(path[index], point, rect),
    );
  });
}

export function resolveDrillingPath(
  parcel: Parcel,
  path: Point[],
  options?: DrillingOptions,
): Point[] {
  const snap = Boolean(options?.snapEnabled ?? options?.snapToLayer);
  if (!snap) {
    return path.map((pt) => ({ x: pt.x, y: pt.y }));
  }

  return path.map((pt, index) =>
    index === 0
      ? { x: pt.x, y: pt.y }
      : snapDrillPoint(parcel, pt, {
          snapEnabled: true,
          threshold: options?.snapThreshold,
          gridStepX: options?.gridStepX,
          gridStepY: options?.gridStepY,
        }),
  );
}

export function estimateDrillCost(
  parcel: Parcel,
  path: Point[],
  options?: DrillingOptions,
): DrillEstimate {
  if (path.length === 0) {
    return {
      distance: 0,
      cost: 0,
      crossedLayers: [],
      aquiferCollisions: [],
      faultCollisions: [],
      mineralHits: [],
      turnCount: 0,
      reachesMagma: false,
      depthMeters: 0,
      maxDepthMeters: 0,
    };
  }

  const processedPath = resolveDrillingPath(parcel, path, options);

  let distance = 0;
  let hardnessWeightedDistance = 0;

  for (let i = 1; i < processedPath.length; i++) {
    const segLen = segmentDistance(processedPath[i - 1], processedPath[i]);
    distance += segLen;

    const overlaps = getSegmentLayerOverlaps(parcel, processedPath[i - 1], processedPath[i]);
    if (overlaps.length === 0) {
      hardnessWeightedDistance += segLen;
    } else {
      let coveredLength = 0;
      for (const { layer, length } of overlaps) {
        const layerHardness =
          layer.hardness ?? GEOLOGY_HARDNESS[layer.type] ?? 1;
        hardnessWeightedDistance += length * layerHardness;
        coveredLength += length;
      }
      if (segLen > coveredLength + 1e-6) {
        hardnessWeightedDistance += segLen - coveredLength;
      }
    }
  }

  const crossedLayers = detectCrossedLayers(parcel, processedPath);
  const aquiferCollisions = checkAquiferCollisions(parcel, processedPath);
  const faultCollisions = checkFaultCollisions(parcel, processedPath);
  const mineralHits = checkMineralCollisions(
    parcel,
    processedPath,
    options?.mineralHitRadius ?? DEFAULT_MINERAL_HIT_RADIUS,
  );
  const turnAnalysis = analyzePathTurns(
    processedPath,
    options?.minTurnAngleDeg ?? DEFAULT_MIN_TURN_ANGLE_DEG,
  );

  const maxY = Math.max(0, ...processedPath.map((point) => point.y));
  const maxDepthMeters = depthInMeters(maxY);
  const finalPoint = processedPath[processedPath.length - 1];
  const depthMeters = finalPoint ? depthInMeters(finalPoint.y) : 0;

  const drillDiscount = Math.min(0.4, Math.max(0, options?.drillUpgradeLevel ?? 0) * 0.1);
  const drillingBaseCost =
    (hardnessWeightedDistance * SIMULATION_DEFAULTS.drillCostPerDistance +
      (maxDepthMeters / MAX_DRILL_DEPTH_METERS) * DEPTH_SURCHARGE_AT_MAX_DEPTH +
      turnAnalysis.turnCount * TURN_BEND_COST) *
    (1 - drillDiscount);

  const aquiferPenalty = aquiferCollisions.length * SIMULATION_DEFAULTS.aquiferPenaltyCost;
  const faultPenalty = faultCollisions.reduce(
    (sum, fault) => sum + (fault.costPenalty ?? SIMULATION_DEFAULTS.faultPenaltyCost),
    0,
  );

  const cost =
    processedPath.length < 2
      ? 0
      : Math.round(drillingBaseCost + aquiferPenalty + faultPenalty);

  const hitReservoirs = checkReservoirCollisions(parcel, processedPath);

  return {
    distance,
    cost,
    crossedLayers,
    aquiferCollisions,
    faultCollisions,
    mineralHits,
    turnCount: turnAnalysis.turnCount,
    reachesMagma: hitReservoirs.length > 0,
    depthMeters,
    maxDepthMeters,
  };
}

export function validateDrillingPath(
  points: Point[],
  parcel: Parcel,
  options?: DrillingOptions,
): PathValidationResult & { warnings: string[] } {
  const surfaceMaxY = options?.surfaceMaxY ?? DEFAULT_SURFACE_MAX_Y;
  const minTurnAngleDeg = options?.minTurnAngleDeg ?? DEFAULT_MIN_TURN_ANGLE_DEG;
  const minSegmentLength = options?.minSegmentLength ?? DEFAULT_MIN_SEGMENT_LENGTH;
  const minTotalLength = options?.minTotalLength ?? DEFAULT_MIN_TOTAL_LENGTH;
  const maxWaypoints = options?.maxWaypoints ?? SIMULATION_DEFAULTS.maxWaypointsPerWell;
  const maxDepthLimitMeters = options?.maxDepthMeters ?? MAX_DRILL_DEPTH_METERS;

  const reasons: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(points) || points.length === 0) {
    return {
      valid: false,
      reasons: ['Drilling path is empty; start at the surface wellhead.'],
      warnings,
      outOfBounds: false,
      hitsBlockingFault: false,
      tooShort: true,
      unaffordable: false,
      totalLength: 0,
      maxDepthMeters: 0,
      estimatedCost: 0,
      crossedLayers: [],
      intersectedFaults: [],
      intersectedAquifers: [],
    };
  }

  const hasInvalidCoord = points.some(
    (pt) => !pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y),
  );
  if (hasInvalidCoord) {
    return {
      valid: false,
      reasons: ['Drilling path contains disconnected or non-finite coordinates.'],
      warnings,
      outOfBounds: true,
      hitsBlockingFault: false,
      tooShort: points.length < 2,
      unaffordable: false,
      totalLength: 0,
      maxDepthMeters: 0,
      estimatedCost: 0,
      crossedLayers: [],
      intersectedFaults: [],
      intersectedAquifers: [],
    };
  }

  const processedPath = resolveDrillingPath(parcel, points, options);
  const estimate = estimateDrillCost(parcel, processedPath, options);

  const outOfBounds = processedPath.some(
    (pt) =>
      pt.x < 0 ||
      pt.x > SIMULATION_DEFAULTS.parcelWidth ||
      pt.y < 0 ||
      pt.y > SIMULATION_DEFAULTS.parcelDepth ||
      depthInMeters(pt.y) > maxDepthLimitMeters,
  );
  if (outOfBounds) {
    reasons.push(
      `Drilling path extends outside parcel boundaries (x: 0..${SIMULATION_DEFAULTS.parcelWidth}, depth: 0..${maxDepthLimitMeters}m).`,
    );
  }

  if (processedPath[0].y > surfaceMaxY) {
    reasons.push(
      `Wellhead must start at the surface entry zone (y <= ${surfaceMaxY}, got ${processedPath[0].y.toFixed(1)}).`,
    );
  }

  const hasZeroLengthSegment = processedPath
    .slice(1)
    .some((pt, idx) => segmentDistance(processedPath[idx], pt) < minSegmentLength);
  if (hasZeroLengthSegment) {
    reasons.push(
      `Path contains disconnected or degenerate segments shorter than ${minSegmentLength} units.`,
    );
  }

  const tooShort = processedPath.length < 2 || estimate.distance < minTotalLength;
  if (tooShort) {
    reasons.push(
      processedPath.length < 2
        ? 'Drilling path requires at least 2 waypoints from surface to target.'
        : `Drilling path is too short (${estimate.distance.toFixed(1)} < ${minTotalLength}).`,
    );
  }

  if (processedPath.length > maxWaypoints) {
    reasons.push(
      `Drilling path exceeds maximum allowed ${maxWaypoints} waypoints.`,
    );
  }

  const turnAnalysis = analyzePathTurns(processedPath, minTurnAngleDeg);
  if (turnAnalysis.violations.length > 0) {
    const worst = turnAnalysis.violations[0];
    reasons.push(
      `Turn at waypoint ${worst.vertexIndex} (${worst.interiorAngleDeg.toFixed(1)}°) is sharper than minimum ${minTurnAngleDeg}° turning angle (hairpin reversal).`,
    );
  }

  const blockingFaults = estimate.faultCollisions.filter((fault) => isBlockingFault(fault));
  const hitsBlockingFault = !options?.allowSevereFault && blockingFaults.length > 0;
  if (hitsBlockingFault) {
    reasons.push(
      `Path intersects blocking fault: ${blockingFaults.map((f) => `${f.label} (${f.severity})`).join(', ')}.`,
    );
  }

  for (const fault of estimate.faultCollisions) {
    if (!isBlockingFault(fault)) {
      warnings.push(
        `Fault hazard crossed: ${fault.label} (${fault.severity}, +$${fault.costPenalty} penalty).`,
      );
    }
  }
  for (const aquifer of estimate.aquiferCollisions) {
    warnings.push(
      `Pressurized aquifer breached (${aquifer.hazardLevel} hazard, +$${SIMULATION_DEFAULTS.aquiferPenaltyCost} sealing cost).`,
    );
  }

  const unaffordable =
    typeof options?.availableCash === 'number' && estimate.cost > options.availableCash;
  if (unaffordable) {
    reasons.push(
      `Estimated drilling cost ($${estimate.cost}) exceeds available cash ($${options.availableCash}).`,
    );
  }

  return {
    valid: reasons.length === 0,
    reasons,
    warnings,
    outOfBounds,
    hitsBlockingFault,
    tooShort,
    unaffordable,
    totalLength: estimate.distance,
    maxDepthMeters: estimate.maxDepthMeters,
    estimatedCost: estimate.cost,
    crossedLayers: estimate.crossedLayers,
    intersectedFaults: estimate.faultCollisions,
    intersectedAquifers: estimate.aquiferCollisions,
  };
}

export function drillPath(
  parcel: Parcel,
  path: Point[],
  options?: DrillingOptions,
): DrillResult {
  const processedPath = resolveDrillingPath(parcel, path, options);
  const validation = validateDrillingPath(processedPath, parcel, {
    ...options,
    snapEnabled: false,
    snapToLayer: false,
  });
  const estimate = estimateDrillCost(parcel, processedPath, {
    ...options,
    snapEnabled: false,
    snapToLayer: false,
  });

  const hitReservoirs = validation.valid
    ? checkReservoirCollisions(parcel, processedPath)
    : [];

  const revealedReservoirIds = hitReservoirs.map((reservoir) => reservoir.id);
  const discoveredMineralIds = validation.valid
    ? estimate.mineralHits.map((mineral) => mineral.id)
    : [];

  return {
    ...estimate,
    revealedReservoirIds,
    discoveredMineralIds,
    path: processedPath,
    aquiferBreached: estimate.aquiferCollisions.length > 0,
    lavaTapped: hitReservoirs.length > 0,
    hitReservoir: hitReservoirs[0],
    validation,
  };
}

export function executeWellDrilling(
  wellId: string,
  name: string,
  points: Point[],
  parcel: Parcel,
  options?: DrillingOptions,
): WellExecutionResult {
  const processedPath = resolveDrillingPath(parcel, points, options);
  const validation = validateDrillingPath(processedPath, parcel, {
    ...options,
    snapEnabled: false,
    snapToLayer: false,
  });
  const estimate = estimateDrillCost(parcel, processedPath, {
    ...options,
    snapEnabled: false,
    snapToLayer: false,
  });

  const intersectedFaultIds = estimate.faultCollisions.map((f) => f.id);
  const intersectedAquiferIds = estimate.aquiferCollisions.map((a) => a.id);
  const aquiferBreached = intersectedAquiferIds.length > 0;

  if (!validation.valid) {
    const cost = validation.hitsBlockingFault ? estimate.cost : 0;
    return {
      id: wellId,
      name,
      parcelId: parcel.id,
      path: processedPath,
      totalLength: estimate.distance,
      maxDepth: estimate.maxDepthMeters,
      cost,
      crossedLayers: estimate.crossedLayers,
      intersectedFaults: intersectedFaultIds,
      intersectedAquifers: intersectedAquiferIds,
      tappedReservoirIds: [],
      flowContribution: 0,
      wellheadTempC: 0,
      status: 'blocked',
      discoveredMineralIds: [],
      discoveredMinerals: [],
      tappedReservoirs: [],
      aquiferBreached,
      validation,
    };
  }

  const tappedReservoirs = checkReservoirCollisions(parcel, processedPath);
  const tappedReservoirIds = tappedReservoirs.map((r) => r.id);
  const discoveredMinerals = estimate.mineralHits;
  const discoveredMineralIds = discoveredMinerals.map((m) => m.id);

  if (tappedReservoirs.length === 0) {
    return {
      id: wellId,
      name,
      parcelId: parcel.id,
      path: processedPath,
      totalLength: estimate.distance,
      maxDepth: estimate.maxDepthMeters,
      cost: estimate.cost,
      crossedLayers: estimate.crossedLayers,
      intersectedFaults: intersectedFaultIds,
      intersectedAquifers: intersectedAquiferIds,
      tappedReservoirIds: [],
      flowContribution: 0,
      wellheadTempC: 0,
      status: 'dry',
      discoveredMineralIds,
      discoveredMinerals,
      tappedReservoirs: [],
      aquiferBreached,
      validation,
    };
  }

  const totalFlow = tappedReservoirs.reduce((sum, r) => sum + Math.max(0, r.flowPotential), 0);
  const weightedTemp =
    totalFlow > 0
      ? tappedReservoirs.reduce((sum, r) => sum + r.temperature * Math.max(0, r.flowPotential), 0) /
        totalFlow
      : tappedReservoirs.reduce((sum, r) => sum + r.temperature, 0) / tappedReservoirs.length;

  const aquiferCoolingFactor = aquiferBreached ? 0.95 : 1;
  const wellheadTempC = Math.round(weightedTemp * aquiferCoolingFactor * 10) / 10;
  const status: WellStatus = 'active';

  return {
    id: wellId,
    name,
    parcelId: parcel.id,
    path: processedPath,
    totalLength: estimate.distance,
    maxDepth: estimate.maxDepthMeters,
    cost: estimate.cost,
    crossedLayers: estimate.crossedLayers,
    intersectedFaults: intersectedFaultIds,
    intersectedAquifers: intersectedAquiferIds,
    tappedReservoirIds,
    flowContribution: totalFlow,
    wellheadTempC,
    status,
    discoveredMineralIds,
    discoveredMinerals,
    tappedReservoirs,
    aquiferBreached,
    validation,
  };
}

export function summarizeParcelWells(wells: WellRecord[]): MultiWellSummary {
  const tappedSet = new Set<string>();
  const faultSet = new Set<string>();
  const aquiferSet = new Set<string>();

  let activeWellCount = 0;
  let dryWellCount = 0;
  let blockedWellCount = 0;
  let totalLength = 0;
  let totalCost = 0;
  let totalFlowContribution = 0;
  let weightedTempSum = 0;

  for (const well of wells) {
    totalLength += well.totalLength;
    totalCost += well.cost;
    for (const id of well.tappedReservoirIds) tappedSet.add(id);
    for (const id of well.intersectedFaults) faultSet.add(id);
    for (const id of well.intersectedAquifers) aquiferSet.add(id);

    if (well.status === 'active') {
      activeWellCount++;
      totalFlowContribution += well.flowContribution;
      weightedTempSum += well.wellheadTempC * well.flowContribution;
    } else if (well.status === 'dry') {
      dryWellCount++;
    } else if (well.status === 'blocked') {
      blockedWellCount++;
    }
  }

  return {
    wellCount: wells.length,
    activeWellCount,
    dryWellCount,
    blockedWellCount,
    totalLength,
    totalCost,
    totalFlowContribution,
    weightedWellheadTempC:
      totalFlowContribution > 0 ? Math.round((weightedTempSum / totalFlowContribution) * 10) / 10 : 0,
    tappedReservoirIds: Array.from(tappedSet),
    intersectedFaultIds: Array.from(faultSet),
    intersectedAquiferIds: Array.from(aquiferSet),
  };
}

export function addWaypoint(
  currentPath: Point[],
  newPoint: Point,
  options?: {
    snapToLayer?: boolean;
    snapEnabled?: boolean;
    parcel?: Parcel;
    maxWaypoints?: number;
  },
): Point[] {
  const max = options?.maxWaypoints ?? SIMULATION_DEFAULTS.maxWaypointsPerWell;
  if (currentPath.length >= max) return currentPath;

  const snap = Boolean(options?.snapEnabled ?? options?.snapToLayer);
  const targetPoint =
    snap && options?.parcel
      ? snapDrillPoint(options.parcel, newPoint, { snapEnabled: true })
      : { x: newPoint.x, y: newPoint.y };

  const last = currentPath[currentPath.length - 1];
  if (last && segmentDistance(last, targetPoint) < DEFAULT_MIN_SEGMENT_LENGTH) {
    return currentPath;
  }

  return [...currentPath, targetPoint];
}

export function undoWaypoint(currentPath: Point[]): Point[] {
  if (currentPath.length <= 1) return currentPath;
  return currentPath.slice(0, -1);
}

export function clearWaypoints(
  startingSurfacePoint: Point = SIMULATION_DEFAULTS.wellHeadStartPoint,
): Point[] {
  return [{ ...startingSurfacePoint }];
}

/**
 * Perform a subsurface echo scan from a surface scan-car position `scanX` (0..100).
 * Returns approximate jittered echoes for formations within horizontal sweep radius
 * without ever exposing exact reservoir coordinates, IDs, or heat inventory.
 */
export function performUndergroundEchoScan(
  parcel: Parcel,
  scanX: number,
  cost: number = SIMULATION_DEFAULTS.echoScanCost,
  seed = 42,
  timestamp = Date.now(),
): EchoScanRecord {
  const clampedX = Math.max(0, Math.min(100, scanX));
  const radiusX = SIMULATION_DEFAULTS.echoScanRadiusX;
  const rng = seededRandom((seed ^ Math.round(clampedX * 131) ^ 0x9e3779b9) >>> 0);
  const pings: EchoPing[] = [];

  (parcel.reservoirs ?? []).forEach((res, idx) => {
    const dx = Math.abs(res.center.x - clampedX);
    if (dx <= radiusX) {
      const jitterX = (rng() >= 0.5 ? 1 : -1) * randomBetween(rng, 3.5, 8.5);
      const jitterY = (rng() >= 0.5 ? 1 : -1) * randomBetween(rng, 4.0, 9.5);
      const approxX = Math.round(Math.max(4, Math.min(96, res.center.x + jitterX)) * 10) / 10;
      const approxY = Math.round(Math.max(24, Math.min(94, res.center.y + jitterY)) * 10) / 10;
      const strength = Math.round(Math.max(0.25, Math.min(1, 1 - dx / (radiusX + 4))) * 100) / 100;
      const lowBand = Math.max(100, Math.floor((res.temperature - 25) / 40) * 40);
      pings.push({
        id: `echo-thermal-${Math.round(clampedX)}-${idx + 1}`,
        kind: 'thermal',
        approxX,
        approxY,
        radius: Math.round(Math.max(10, res.radius * 1.45) * 10) / 10,
        strength,
        tempBand: `${lowBand}–${lowBand + 60}°C`,
        label: 'Thermal Anomaly Echo',
      });
    }
  });

  (parcel.minerals ?? []).forEach((mineral, idx) => {
    const dx = Math.abs(mineral.position.x - clampedX);
    if (dx <= radiusX) {
      const jitterX = (rng() >= 0.5 ? 1 : -1) * randomBetween(rng, 2.5, 6.5);
      const jitterY = (rng() >= 0.5 ? 1 : -1) * randomBetween(rng, 3.0, 7.5);
      const approxX = Math.round(Math.max(4, Math.min(96, mineral.position.x + jitterX)) * 10) / 10;
      const approxY = Math.round(Math.max(22, Math.min(92, mineral.position.y + jitterY)) * 10) / 10;
      const strength = Math.round(Math.max(0.25, Math.min(1, 1 - dx / (radiusX + 4))) * 100) / 100;
      pings.push({
        id: `echo-mineral-${Math.round(clampedX)}-${idx + 1}`,
        kind: 'mineral',
        approxX,
        approxY,
        radius: 9,
        strength,
        label: 'Mineral Vein Resonance',
      });
    }
  });

  (parcel.faults ?? []).forEach((fault, idx) => {
    const minX = Math.min(fault.start.x, fault.end.x);
    const maxX = Math.max(fault.start.x, fault.end.x);
    const dx =
      clampedX >= minX && clampedX <= maxX
        ? 0
        : Math.min(Math.abs(clampedX - minX), Math.abs(clampedX - maxX));
    if (dx <= radiusX) {
      const midX = (fault.start.x + fault.end.x) / 2;
      const midY = (fault.start.y + fault.end.y) / 2;
      const jitterX = (rng() >= 0.5 ? 1 : -1) * randomBetween(rng, 2.0, 5.5);
      const jitterY = (rng() >= 0.5 ? 1 : -1) * randomBetween(rng, 2.5, 6.0);
      const approxX = Math.round(Math.max(4, Math.min(96, midX + jitterX)) * 10) / 10;
      const approxY = Math.round(Math.max(22, Math.min(92, midY + jitterY)) * 10) / 10;
      const strength = Math.round(Math.max(0.3, Math.min(1, 1 - dx / (radiusX + 4))) * 100) / 100;
      pings.push({
        id: `echo-fault-${Math.round(clampedX)}-${idx + 1}`,
        kind: 'fault',
        approxX,
        approxY,
        radius: 10,
        strength,
        label: fault.severity === 'critical' ? 'Severe Shear Fault Echo' : 'Fault Seam Echo',
      });
    }
  });

  return {
    id: `echo-scan-${parcel.id}-${Math.round(clampedX)}-${timestamp}`,
    parcelId: parcel.id,
    scanX: Math.round(clampedX * 10) / 10,
    radiusX,
    cost,
    timestamp,
    pings,
  };
}

/** Return the DrillSpeedTier descriptor for a 1-based drill speed level. */
export function getDrillSpeedTier(level: number): DrillSpeedTier {
  const clamped = Math.max(
    1,
    Math.min(DRILL_UPGRADE_TIERS.length, Math.floor(Number.isFinite(level) ? level : 1)),
  );
  return DRILL_UPGRADE_TIERS[clamped - 1];
}

/**
 * Compute progressive drilling execution time (seconds) based on segment lengths,
 * crossed rock layer hardness, and active drill bit speed tier.
 */
export function calculateDrillDurationSeconds(
  points: Point[],
  parcel: Parcel,
  drillSpeedLevel = 1,
): number {
  if (!Array.isArray(points) || points.length < 2) return 0;

  let hardnessWeightedDistance = 0;
  for (let i = 1; i < points.length; i++) {
    const segLen = segmentDistance(points[i - 1], points[i]);
    if (segLen <= 0) continue;
    const overlaps = getSegmentLayerOverlaps(parcel, points[i - 1], points[i]);
    if (overlaps.length === 0) {
      hardnessWeightedDistance += segLen;
    } else {
      let covered = 0;
      for (const { layer, length } of overlaps) {
        const hardness = layer.hardness ?? GEOLOGY_HARDNESS[layer.type] ?? 1;
        hardnessWeightedDistance += length * hardness;
        covered += length;
      }
      if (segLen > covered + 1e-6) {
        hardnessWeightedDistance += segLen - covered;
      }
    }
  }

  const tier = getDrillSpeedTier(drillSpeedLevel);
  const effectiveSpeed = BASE_DRILL_SPEED_UNITS_PER_SEC * tier.speedMultiplier;
  return Math.round((hardnessWeightedDistance / Math.max(0.1, effectiveSpeed)) * 100) / 100;
}

/**
 * Interpolate drill head position, heading angle, depth, current geological layer,
 * and completed polyline vertices at normalized progress [0..1].
 */
export function getDrillHeadStateAtProgress(
  points: Point[],
  parcel: Parcel,
  progress01: number,
): DrillHeadState {
  const p = Math.max(0, Math.min(1, Number.isFinite(progress01) ? progress01 : 0));

  const layerNameAtY = (y: number): string => {
    const found = parcel.layers.find((layer) => y >= layer.top && y <= layer.bottom);
    return found?.name ?? found?.type ?? 'Surface Overburden';
  };

  if (!Array.isArray(points) || points.length === 0) {
    const start = { ...SIMULATION_DEFAULTS.wellHeadStartPoint };
    return {
      position: start,
      angleDeg: 90,
      depthMeters: depthInMeters(start.y),
      currentLayerName: layerNameAtY(start.y),
      completedPoints: [start],
      progress01: p,
    };
  }

  if (points.length === 1) {
    const pt = { x: points[0].x, y: points[0].y };
    return {
      position: pt,
      angleDeg: 90,
      depthMeters: depthInMeters(pt.y),
      currentLayerName: layerNameAtY(pt.y),
      completedPoints: [pt],
      progress01: p,
    };
  }

  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    const len = segmentDistance(points[i - 1], points[i]);
    segmentLengths.push(len);
    totalLength += len;
  }

  if (totalLength <= 1e-9) {
    const pt = { x: points[0].x, y: points[0].y };
    return {
      position: pt,
      angleDeg: 90,
      depthMeters: depthInMeters(pt.y),
      currentLayerName: layerNameAtY(pt.y),
      completedPoints: [pt],
      progress01: p,
    };
  }

  const targetDist = totalLength * p;
  let accumulated = 0;
  const completedPoints: Point[] = [{ x: points[0].x, y: points[0].y }];

  for (let i = 0; i < segmentLengths.length; i++) {
    const segLen = segmentLengths[i];
    const start = points[i];
    const end = points[i + 1];

    if (accumulated + segLen >= targetDist - 1e-9 || i === segmentLengths.length - 1) {
      const localDist = Math.max(0, Math.min(segLen, targetDist - accumulated));
      const t = segLen > 1e-9 ? localDist / segLen : 1;
      const position: Point = {
        x: Math.round((start.x + (end.x - start.x) * t) * 100) / 100,
        y: Math.round((start.y + (end.y - start.y) * t) * 100) / 100,
      };
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const angleDeg =
        Math.hypot(dx, dy) > 1e-9
          ? Math.round(((Math.atan2(dy, dx) * 180) / Math.PI) * 10) / 10
          : 90;

      const lastCompleted = completedPoints[completedPoints.length - 1];
      if (!lastCompleted || segmentDistance(lastCompleted, position) > 1e-6) {
        completedPoints.push(position);
      }

      return {
        position,
        angleDeg,
        depthMeters: depthInMeters(position.y),
        currentLayerName: layerNameAtY(position.y),
        completedPoints,
        progress01: p,
      };
    }

    accumulated += segLen;
    completedPoints.push({ x: end.x, y: end.y });
  }

  const last = points[points.length - 1];
  return {
    position: { x: last.x, y: last.y },
    angleDeg: 90,
    depthMeters: depthInMeters(last.y),
    currentLayerName: layerNameAtY(last.y),
    completedPoints: points.map((pt) => ({ x: pt.x, y: pt.y })),
    progress01: p,
  };
}

function isBlockingFault(fault: FaultObstacle): boolean {
  return (
    fault.blocksDrilling ||
    fault.severity === 'critical' ||
    (fault.severity as string) === 'severe'
  );
}

function analyzePathTurns(
  path: Point[],
  minTurnAngleDeg: number,
): {
  turnCount: number;
  violations: Array<{ vertexIndex: number; interiorAngleDeg: number }>;
} {
  let turnCount = 0;
  const violations: Array<{ vertexIndex: number; interiorAngleDeg: number }> = [];

  for (let i = 1; i < path.length - 1; i++) {
    const dx1 = path[i].x - path[i - 1].x;
    const dy1 = path[i].y - path[i - 1].y;
    const dx2 = path[i + 1].x - path[i].x;
    const dy2 = path[i + 1].y - path[i].y;

    const len1 = Math.hypot(dx1, dy1);
    const len2 = Math.hypot(dx2, dy2);
    if (len1 < 1e-9 || len2 < 1e-9) continue;

    const dot = Math.max(-1, Math.min(1, (dx1 * dx2 + dy1 * dy2) / (len1 * len2)));
    const deflectionDeg = (Math.acos(dot) * 180) / Math.PI;
    const interiorAngleDeg = 180 - deflectionDeg;

    if (deflectionDeg > TURN_BEND_THRESHOLD_DEG) {
      turnCount++;
    }
    if (interiorAngleDeg < minTurnAngleDeg - 1e-6) {
      violations.push({ vertexIndex: i, interiorAngleDeg });
    }
  }

  return { turnCount, violations };
}

function orientation(p: Point, q: Point, r: Point): number {
  const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (Math.abs(val) < 1e-9) return 0;
  return val > 0 ? 1 : 2;
}

function pointOnSegment(pt: Point, a: Point, b: Point): boolean {
  return (
    pt.x <= Math.max(a.x, b.x) + 1e-9 &&
    pt.x >= Math.min(a.x, b.x) - 1e-9 &&
    pt.y <= Math.max(a.y, b.y) + 1e-9 &&
    pt.y >= Math.min(a.y, b.y) - 1e-9
  );
}
