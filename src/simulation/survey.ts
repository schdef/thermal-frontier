import { SIMULATION_DEFAULTS } from './constants';
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
} from './types';

/**
 * Perform a 2D top-down surface scan over a parcel in 0..100 coordinate space.
 * Reveals approximate surface clues (hotspots, mineral hints, fault markers, stable zones)
 * while keeping hidden underground Reservoir locations, temperatures, and heat sealed.
 */
export function performSurfaceScan(
  parcel: Parcel,
  center: Point,
  radius: number = SIMULATION_DEFAULTS.roverScanRadius,
  cost: number = SIMULATION_DEFAULTS.roverScanCost,
  existingScans: SurveyScanRecord[] = [],
  timestamp = Date.now(),
): SurveyScanRecord {
  const hotspotsSource = parcel.surfaceFeatures?.hotspots ?? parcel.hotspots ?? [];
  const mineralsSource = parcel.surfaceFeatures?.mineralHints ?? parcel.minerals ?? [];
  const faultHintsSource = parcel.surfaceFeatures?.faultMarkers ?? [];
  const stableSource = parcel.surfaceFeatures?.stableZones ?? parcel.stableGround ?? [];

  const revealedHotspots: ThermalHotspot[] = hotspotsSource.filter(
    (hotspot) => distance(hotspot.position, center) <= radius,
  );

  const revealedMinerals: MineralDeposit[] = mineralsSource.filter((mineral) => {
    const surfacePos = mineral.surfacePosition ?? mineral.position;
    return distance(surfacePos, center) <= radius;
  });

  const revealedFaultHints: FaultHint[] = faultHintsSource.filter(
    (hint) => distance(hint.position, center) <= radius,
  );

  const revealedStableZones: StableGroundZone[] = stableSource.filter((zone) =>
    circleIntersectsRect(center, radius, zone),
  );

  const approximateThermalZones: ThermalZoneHint[] = revealedHotspots.map((hotspot) => {
    const lowBand = Math.max(80, Math.round((hotspot.surfaceTemperature * 1.4) / 25) * 25);
    const highBand = lowBand + 75;
    return {
      id: `thermal-hint-${hotspot.id}`,
      center: { ...hotspot.position },
      radius: Math.max(10, Math.round(radius * 0.65)),
      intensityLabel: hotspot.intensity >= 75 ? 'high' : hotspot.intensity >= 50 ? 'medium' : 'low',
      approxTempRangeC: [lowBand, highBand],
    };
  });

  const allCircles = [
    ...existingScans.map((scan) => ({ center: scan.center, radius: scan.radius })),
    { center, radius },
  ];

  const coveragePercent = computeScanCoveragePercent(allCircles);

  return {
    id: `scan-${parcel.id}-${existingScans.length + 1}`,
    parcelId: parcel.id,
    center: { x: Math.round(center.x), y: Math.round(center.y) },
    radius,
    cost,
    timestamp,
    revealedHotspots,
    revealedMinerals,
    revealedFaultHints,
    revealedStableZones,
    approximateThermalZones,
    coveragePercent,
  };
}

/**
 * Legacy-compatible survey entry point; never leaks exact hidden underground Reservoir data.
 */
export function performSurvey(
  parcel: Parcel,
  type: SurveyResult['type'],
  target?: Point,
): SurveyResult {
  const cost = SIMULATION_DEFAULTS.surveyCosts[type] ?? 40;

  if (type === 'surface-scanner') {
    const hotspots = parcel.surfaceFeatures?.hotspots ?? parcel.hotspots ?? [];
    const stableGround = parcel.surfaceFeatures?.stableZones ?? parcel.stableGround ?? [];
    return {
      type,
      cost,
      revealed: [
        'surface temperature anomaly',
        'visible fissure locations',
        `${hotspots.length} broad thermal vent signature(s)`,
      ],
      uncertainty: 0.65,
      hotspots,
      stableGround,
    };
  }

  if (type === 'rover-scan') {
    const scanCenter = target ?? { x: 50, y: 50 };
    const scanRadius = SIMULATION_DEFAULTS.roverScanRadius;
    const scan = performSurfaceScan(parcel, scanCenter, scanRadius, cost);
    const revealed: string[] = [
      `Rover ping at (${Math.round(scanCenter.x)}, ${Math.round(scanCenter.y)})`,
      `${scan.revealedHotspots.length} thermal hotspot(s) detected`,
      `${scan.revealedMinerals.length} mineral deposit(s) localized`,
    ];
    if (scan.revealedFaultHints.length > 0) {
      revealed.push(`${scan.revealedFaultHints.length} fault fracture trace(s) flagged`);
    }
    if (scan.revealedStableZones.length > 0) {
      revealed.push(
        `Stable ground confirmed (${scan.revealedStableZones[0].stabilityScore}% stability)`,
      );
    }

    return {
      type,
      cost,
      revealed,
      uncertainty: 0.25,
      hotspots: scan.revealedHotspots,
      minerals: scan.revealedMinerals,
      stableGround: scan.revealedStableZones,
      faultHints: scan.revealedFaultHints,
      approximateThermalZones: scan.approximateThermalZones,
      coordinates: scanCenter,
    };
  }

  // Approximate gradient probe (broad uncertainty; never exposes exact reservoir inventory or coords)
  const scanCenter = target ?? { x: 50, y: 50 };
  const surfaceTemp = parcel.publicClues.surfaceTemperature;
  const approxLow = Math.max(100, Math.round((surfaceTemp + 110) / 20) * 20);
  const approxHigh = approxLow + 90;
  const waterPools = parcel.surfaceFeatures?.waterPools ?? [];
  const nearestPool = waterPools[0];

  return {
    type,
    cost,
    revealed: [
      'approximate thermal gradient band',
      'broad strata hardness profile',
      nearestPool
        ? `shallow water table signal near ${nearestPool.depthHintMeters}m`
        : 'no major shallow water table signal detected',
    ],
    uncertainty: 0.45,
    temperatureRange: [approxLow, approxHigh],
    pressureRange: [50, 100],
    strataHint: parcel.layers.map((l) => `${l.name ?? l.type} (${l.hardness}x)`).join(' → '),
    aquiferHazard: nearestPool ? `Potential water zone near ${nearestPool.depthHintMeters}m` : undefined,
    coordinates: scanCenter,
  };
}

/** 2D top-down rover scan wrapper returning RoverScanResult for existing callers. */
export function performRoverScan(
  parcel: Parcel,
  scanCenter: Point,
  scanRadius = SIMULATION_DEFAULTS.roverScanRadius,
): RoverScanResult {
  const scan = performSurfaceScan(parcel, scanCenter, scanRadius, SIMULATION_DEFAULTS.roverScanCost);
  return {
    scanPosition: scan.center,
    radius: scan.radius,
    hotspotsFound: scan.revealedHotspots,
    mineralsFound: scan.revealedMinerals,
    stableGroundFound: scan.revealedStableZones,
    faultHintsFound: scan.revealedFaultHints,
    timestamp: scan.timestamp,
  };
}

function computeScanCoveragePercent(circles: Array<{ center: Point; radius: number }>): number {
  const gridSteps = 20;
  let covered = 0;
  const total = gridSteps * gridSteps;
  for (let gx = 0; gx < gridSteps; gx++) {
    const px = ((gx + 0.5) / gridSteps) * 100;
    for (let gy = 0; gy < gridSteps; gy++) {
      const py = ((gy + 0.5) / gridSteps) * 100;
      if (circles.some((c) => Math.hypot(px - c.center.x, py - c.center.y) <= c.radius)) {
        covered += 1;
      }
    }
  }
  return Math.round((covered / total) * 100);
}

function circleIntersectsRect(circleCenter: Point, radius: number, zone: StableGroundZone): boolean {
  const topY = zone.y ?? 0;
  const height = zone.height ?? 100;
  const closestX = Math.max(zone.x, Math.min(circleCenter.x, zone.x + zone.width));
  const closestY = Math.max(topY, Math.min(circleCenter.y, topY + height));
  return Math.hypot(circleCenter.x - closestX, circleCenter.y - closestY) <= radius;
}

function distance(first: Point, second: Point): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
