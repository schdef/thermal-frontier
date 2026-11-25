import { describe, expect, it } from 'vitest';
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
  detectCrossedLayers,
  drillPath,
  estimateDrillCost,
  executeWellDrilling,
  getDrillHeadStateAtProgress,
  getDrillSpeedTier,
  performUndergroundEchoScan,
  segmentIntersectsCircle,
  segmentIntersectsEllipse,
  segmentIntersectsRect,
  snapDrillPoint,
  snapToLayer,
  summarizeParcelWells,
  undoWaypoint,
  validateDrillingPath,
} from '../../src/simulation/drilling';
import { generateCaldera7Parcels } from '../../src/simulation/generation';
import type { Parcel } from '../../src/simulation/types';

function makeDeterministicTestParcel(): Parcel {
  const base = generateCaldera7Parcels(4)[0];
  return {
    ...base,
    layers: [
      { type: 'ashstone', top: 0, bottom: 25, hardness: 0.7 },
      { type: 'fracture', top: 25, bottom: 55, hardness: 0.5 },
      { type: 'obsidian', top: 55, bottom: 100, hardness: 1.6 },
    ],
    reservoirs: [
      {
        id: 'res-primary',
        center: { x: 60, y: 75 },
        radius: 10,
        initialTemperature: 310,
        temperature: 310,
        pressure: 90,
        flowPotential: 12,
        maxExtractionRate: 14,
        remainingHeat: 1200,
        initialHeat: 1200,
      },
      {
        id: 'res-secondary',
        center: { x: 25, y: 65 },
        radius: 8,
        initialTemperature: 245,
        temperature: 245,
        pressure: 65,
        flowPotential: 8,
        maxExtractionRate: 10,
        remainingHeat: 700,
        initialHeat: 700,
      },
    ],
    aquifers: [
      {
        id: 'aq-1',
        center: { x: 35, y: 40 },
        radiusX: 14,
        radiusY: 5,
        depthMeters: 200,
        waterVolume: 800,
        hazardLevel: 'moderate',
      },
    ],
    faults: [
      {
        id: 'fault-minor',
        start: { x: 70, y: 35 },
        end: { x: 82, y: 45 },
        thickness: 2,
        depthMeters: 175,
        severity: 'minor',
        costPenalty: 30,
        blocksDrilling: false,
        label: 'Minor Slip Seam',
      },
      {
        id: 'fault-critical',
        start: { x: 42, y: 50 },
        end: { x: 54, y: 50 },
        thickness: 4,
        depthMeters: 250,
        severity: 'critical',
        costPenalty: 90,
        blocksDrilling: true,
        label: 'Impenetrable Shear Fault',
      },
    ],
    minerals: [
      {
        id: 'min-1',
        type: 'quartz',
        name: 'High-Purity Quartz',
        position: { x: 60, y: 45 },
        depthMeters: 225,
        abundance: 60,
        value: 180,
      },
    ],
  };
}

describe('manual drilling & segment-aware geometry', () => {
  it('detects ALL geological layers crossed by a single long segment (not vertex-only)', () => {
    const parcel = makeDeterministicTestParcel();
    // Only endpoints at y=10 (ashstone) and y=80 (obsidian) -> must still detect fracture (25..55)
    const path = [
      { x: 10, y: 10 },
      { x: 10, y: 80 },
    ];
    const layers = detectCrossedLayers(parcel, path);
    expect(layers).toEqual(['ashstone', 'fracture', 'obsidian']);

    const estimate = estimateDrillCost(parcel, path);
    expect(estimate.distance).toBe(70);
    expect(estimate.crossedLayers).toEqual(['ashstone', 'fracture', 'obsidian']);
    expect(estimate.maxDepthMeters).toBe(400);
  });

  it('performs accurate analytical segment-vs-circle, ellipse, and rect intersections', () => {
    // Segment passes straight through circle without either endpoint inside
    expect(segmentIntersectsCircle({ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 50, y: 50 }, 5)).toBe(true);
    expect(segmentIntersectsCircle({ x: 0, y: 60 }, { x: 100, y: 60 }, { x: 50, y: 50 }, 5)).toBe(false);

    // Thin ellipse missed by coarse point sampling (length 100, radiusY 2) is caught analytically
    expect(segmentIntersectsEllipse({ x: 50, y: 0 }, { x: 50, y: 100 }, { x: 50, y: 47 }, 10, 2)).toBe(true);
    expect(segmentIntersectsEllipse({ x: 0, y: 40 }, { x: 100, y: 40 }, { x: 50, y: 50 }, 10, 4)).toBe(false);

    // Rect slab intersection
    expect(
      segmentIntersectsRect({ x: 10, y: 50 }, { x: 90, y: 50 }, { x: 40, y: 40, width: 20, height: 20 }),
    ).toBe(true);
    expect(
      segmentIntersectsRect({ x: 10, y: 10 }, { x: 90, y: 30 }, { x: 40, y: 40, width: 20, height: 20 }),
    ).toBe(false);
  });

  it('detects Reservoir, Aquifer, MineralDeposit, and FaultObstacle intersections along segments', () => {
    const parcel = makeDeterministicTestParcel();

    // Passes through aq-1 (35,40) without ending inside it
    const aquiferPath = [
      { x: 35, y: 18 },
      { x: 35, y: 70 },
    ];
    expect(checkAquiferCollisions(parcel, aquiferPath).map((a) => a.id)).toContain('aq-1');

    // Passes through min-1 (60,45) and res-primary (60,75)
    const mineralAndReservoirPath = [
      { x: 60, y: 18 },
      { x: 60, y: 80 },
    ];
    expect(checkMineralCollisions(parcel, mineralAndReservoirPath).map((m) => m.id)).toContain('min-1');
    expect(checkReservoirCollisions(parcel, mineralAndReservoirPath).map((r) => r.id)).toContain('res-primary');

    // Crosses fault-minor (70,35 -> 82,45)
    const minorFaultPath = [
      { x: 76, y: 18 },
      { x: 76, y: 60 },
    ];
    expect(checkFaultCollisions(parcel, minorFaultPath).map((f) => f.id)).toContain('fault-minor');
  });

  it('validates surface start, parcel bounds, hairpin reversals, disconnected segments, and blocking faults', () => {
    const parcel = makeDeterministicTestParcel();

    // Valid straight route
    const validRes = validateDrillingPath(
      [
        { x: 60, y: 18 },
        { x: 60, y: 75 },
      ],
      parcel,
    );
    expect(validRes.valid).toBe(true);
    expect(validRes.reasons).toHaveLength(0);

    // Invalid: starts deep underground
    const undergroundStart = validateDrillingPath(
      [
        { x: 60, y: 35 },
        { x: 60, y: 75 },
      ],
      parcel,
    );
    expect(undergroundStart.valid).toBe(false);
    expect(undergroundStart.reasons.some((r) => r.toLowerCase().includes('surface'))).toBe(true);

    // Invalid: out of bounds (x > 100 or depth > 500m)
    const oob = validateDrillingPath(
      [
        { x: 50, y: 18 },
        { x: 105, y: 110 },
      ],
      parcel,
    );
    expect(oob.valid).toBe(false);
    expect(oob.outOfBounds).toBe(true);

    // Invalid: hairpin reversal (< 30 deg interior angle)
    const hairpin = validateDrillingPath(
      [
        { x: 50, y: 18 },
        { x: 50, y: 60 },
        { x: 52, y: 20 },
      ],
      parcel,
    );
    expect(hairpin.valid).toBe(false);
    expect(hairpin.reasons.some((r) => r.toLowerCase().includes('hairpin'))).toBe(true);

    // Invalid: degenerate / disconnected zero-length segment
    const degenerate = validateDrillingPath(
      [
        { x: 50, y: 18 },
        { x: 50, y: 18 },
        { x: 50, y: 60 },
      ],
      parcel,
    );
    expect(degenerate.valid).toBe(false);

    // Invalid: hits critical blocking fault (42,50 -> 54,50)
    const blocked = validateDrillingPath(
      [
        { x: 48, y: 18 },
        { x: 48, y: 75 },
      ],
      parcel,
    );
    expect(blocked.valid).toBe(false);
    expect(blocked.hitsBlockingFault).toBe(true);

    // Invalid: unaffordable
    const unaffordable = validateDrillingPath(
      [
        { x: 60, y: 18 },
        { x: 60, y: 75 },
      ],
      parcel,
      { availableCash: 10 },
    );
    expect(unaffordable.valid).toBe(false);
    expect(unaffordable.unaffordable).toBe(true);
  });

  it('preserves player intent when snapping is enabled and keeps raw coords when disabled', () => {
    const parcel = makeDeterministicTestParcel();

    // Near boundary y=25 -> snaps y to 25 while preserving x
    expect(snapToLayer(parcel, { x: 63.4, y: 24.2 }, 5, true)).toEqual({ x: 63.4, y: 25 });
    // Far from boundaries -> preserves player intent
    expect(snapToLayer(parcel, { x: 63.4, y: 40.5 }, 5, true)).toEqual({ x: 63.4, y: 40.5 });
    // Snap disabled -> exact raw pointer coords even near boundary
    expect(snapToLayer(parcel, { x: 63.4, y: 24.2 }, 5, false)).toEqual({ x: 63.4, y: 24.2 });
    expect(
      snapDrillPoint(parcel, { x: 63.4, y: 24.2 }, { snapEnabled: false }),
    ).toEqual({ x: 63.4, y: 24.2 });

    expect(depthInMeters(50)).toBe(250);
    expect(depthFromMeters(250)).toBe(50);
  });

  it('prices drilling using segment rock hardness, depth, turn bends, and aquifer/fault penalties', () => {
    const parcel = makeDeterministicTestParcel();

    const straight = estimateDrillCost(parcel, [
      { x: 60, y: 18 },
      { x: 60, y: 75 },
    ]);
    const bent = estimateDrillCost(parcel, [
      { x: 60, y: 18 },
      { x: 75, y: 45 },
      { x: 60, y: 75 },
    ]);
    expect(bent.turnCount).toBe(1);
    expect(bent.cost).toBeGreaterThan(straight.cost);

    // Crossing aquifer adds penalty
    const withAquifer = estimateDrillCost(parcel, [
      { x: 35, y: 18 },
      { x: 35, y: 70 },
    ]);
    const withoutAquifer = estimateDrillCost(parcel, [
      { x: 20, y: 18 },
      { x: 20, y: 70 },
    ]);
    expect(withAquifer.aquiferCollisions.length).toBe(1);
    expect(withAquifer.cost).toBeGreaterThan(withoutAquifer.cost);

    // Deeper segment through hard obsidian (1.6) costs more per unit than shallow soft ashstone (0.7)
    const shallow = estimateDrillCost(parcel, [
      { x: 10, y: 0 },
      { x: 10, y: 20 },
    ]);
    const deep = estimateDrillCost(parcel, [
      { x: 10, y: 18 },
      { x: 10, y: 95 },
    ]);
    expect(deep.cost / deep.distance).toBeGreaterThan(shallow.cost / shallow.distance);
  });

  it('executes multi-well drilling with active, dry, and blocked outcomes', () => {
    const parcel = makeDeterministicTestParcel();

    const well1 = executeWellDrilling(
      'well-1',
      'Primary Injector',
      [
        { x: 60, y: 18 },
        { x: 60, y: 75 },
      ],
      parcel,
    );
    expect(well1.status).toBe('active');
    expect(well1.tappedReservoirIds).toEqual(['res-primary']);
    expect(well1.discoveredMineralIds).toContain('min-1');
    expect(well1.flowContribution).toBe(12);
    expect(well1.wellheadTempC).toBe(310);

    const well2 = executeWellDrilling(
      'well-2',
      'Western Producer',
      [
        { x: 25, y: 18 },
        { x: 25, y: 65 },
      ],
      parcel,
      { existingWells: [well1] },
    );
    expect(well2.status).toBe('active');
    expect(well2.tappedReservoirIds).toEqual(['res-secondary']);
    expect(well2.flowContribution).toBe(8);

    const dryWell = executeWellDrilling(
      'well-3',
      'Dry Wildcat',
      [
        { x: 90, y: 18 },
        { x: 90, y: 80 },
      ],
      parcel,
    );
    expect(dryWell.status).toBe('dry');
    expect(dryWell.tappedReservoirIds).toEqual([]);
    expect(dryWell.flowContribution).toBe(0);
    expect(dryWell.cost).toBeGreaterThan(0);

    const blockedWell = executeWellDrilling(
      'well-4',
      'Faulted Borehole',
      [
        { x: 48, y: 18 },
        { x: 48, y: 75 },
      ],
      parcel,
    );
    expect(blockedWell.status).toBe('blocked');
    expect(blockedWell.intersectedFaults).toContain('fault-critical');
    expect(blockedWell.flowContribution).toBe(0);

    const summary = summarizeParcelWells([well1, well2, dryWell, blockedWell]);
    expect(summary.wellCount).toBe(4);
    expect(summary.activeWellCount).toBe(2);
    expect(summary.dryWellCount).toBe(1);
    expect(summary.blockedWellCount).toBe(1);
    expect(summary.totalFlowContribution).toBe(20);
    expect(summary.tappedReservoirIds).toEqual(['res-primary', 'res-secondary']);
  });

  it('maintains drillPath and waypoint helper compatibility', () => {
    const parcel = generateCaldera7Parcels(5)[0];
    const path = [
      { x: parcel.reservoirs[0].center.x, y: 0 },
      { x: parcel.reservoirs[0].center.x, y: parcel.reservoirs[0].center.y },
    ];
    const result = drillPath(parcel, path);
    expect(result.revealedReservoirIds).toContain(parcel.reservoirs[0].id);
    expect(result.cost).toBeGreaterThan(0);

    let waypoints = clearWaypoints({ x: 50, y: 18 });
    waypoints = addWaypoint(waypoints, { x: 50, y: 24 }, { parcel, snapEnabled: true });
    expect(waypoints[1]).toEqual({ x: 50, y: 25 });
    waypoints = undoWaypoint(waypoints);
    expect(waypoints).toHaveLength(1);
  });

  it('performs subsurface echo scan with jittered clues and no exact reservoir leaks', () => {
    const parcel = makeDeterministicTestParcel();
    const scan1 = performUndergroundEchoScan(parcel, 60, 35, 42, 1000);
    const scan2 = performUndergroundEchoScan(parcel, 60, 35, 42, 1000);

    expect(scan1).toEqual(scan2);
    expect(scan1.cost).toBe(35);

    const thermalPings = scan1.pings.filter((p) => p.kind === 'thermal');
    const mineralPings = scan1.pings.filter((p) => p.kind === 'mineral');
    const faultPings = scan1.pings.filter((p) => p.kind === 'fault');

    expect(thermalPings.length).toBe(1); // res-primary at x=60 is in range; res-secondary at x=25 is out of range (35 > 28)
    expect(mineralPings.length).toBe(1);
    expect(faultPings.length).toBeGreaterThanOrEqual(1);

    const primaryRes = parcel.reservoirs[0];
    expect(thermalPings[0].id).not.toContain(primaryRes.id);
    expect(thermalPings[0].tempBand).toMatch(/^\d+–\d+°C$/);
    expect(
      thermalPings[0].approxX !== primaryRes.center.x ||
        thermalPings[0].approxY !== primaryRes.center.y,
    ).toBe(true);
  });

  it('computes progressive drilling durations across upgrade tiers and interpolates drill head state', () => {
    const parcel = makeDeterministicTestParcel();
    const path = [
      { x: 50, y: 18 },
      { x: 55, y: 50 },
      { x: 60, y: 80 },
    ];

    expect(getDrillSpeedTier(1).speedMultiplier).toBe(1.0);
    expect(getDrillSpeedTier(4).speedMultiplier).toBe(3.8);
    expect(getDrillSpeedTier(99).level).toBe(4);

    const durMk1 = calculateDrillDurationSeconds(path, parcel, 1);
    const durMk2 = calculateDrillDurationSeconds(path, parcel, 2);
    const durMk4 = calculateDrillDurationSeconds(path, parcel, 4);

    expect(durMk1).toBeGreaterThan(5);
    expect(durMk1).toBeLessThan(20);
    expect(durMk2).toBeLessThan(durMk1);
    expect(durMk4).toBeLessThan(durMk2);

    const startState = getDrillHeadStateAtProgress(path, parcel, 0);
    expect(startState.position).toEqual({ x: 50, y: 18 });
    expect(startState.currentLayerName).toBe('ashstone');

    const midState = getDrillHeadStateAtProgress(path, parcel, 0.5);
    expect(midState.position.y).toBeGreaterThan(30);
    expect(midState.position.y).toBeLessThan(65);
    expect(midState.depthMeters).toBe(depthInMeters(midState.position.y));
    expect(midState.completedPoints.length).toBeGreaterThanOrEqual(2);

    const endState = getDrillHeadStateAtProgress(path, parcel, 1);
    expect(endState.position).toEqual({ x: 60, y: 80 });
    expect(endState.currentLayerName).toBe('obsidian');
    expect(endState.completedPoints).toEqual(path);
  });
});
