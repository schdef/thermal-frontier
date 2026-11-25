import type { GameState } from '../game/types';
import type { FaultObstacle, Parcel, ResourceDepletion, RoundSettlement } from './types';

export interface RoundCosts {
  land: number;
  survey: number;
  drilling: number;
  pipes: number;
  upgrades: number;
  operating: number;
}

export interface SettlementInput {
  revenue: number;
  costs: RoundCosts;
  remainingHeat: number;
  startingHeat: number;
  unsoldTH: number;
  closingPrice: number;
  mineralsDepletedPercent?: number;
  discoveredMineralsCount?: number;
  totalMineralsCount?: number;
  stableGroundScore?: number;
  powerGeneratedMWh?: number;
  avgOutputMW?: number;
  peakOutputMW?: number;
  exportCapacityMW?: number;
  elapsedOperatingSeconds?: number;
  wellsDrilled?: number;
  reservoirsTapped?: number;
  thermalExtractedTH?: number;
}

export interface SettlementResult extends RoundSettlement {
  constructionCost: number;
  thermalExtractedTH: number;
  discoveredMineralsCount: number;
  totalMineralsCount: number;
  groundStabilityScore: number;
  avgOutputMW: number;
  peakOutputMW: number;
  utilizationPercent: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function settleRound(input: SettlementInput): SettlementResult {
  const safeCosts: RoundCosts = {
    land: Math.max(0, input.costs.land),
    survey: Math.max(0, input.costs.survey),
    drilling: Math.max(0, input.costs.drilling),
    pipes: Math.max(0, input.costs.pipes),
    upgrades: Math.max(0, input.costs.upgrades),
    operating: Math.max(0, input.costs.operating),
  };

  const constructionCost = safeCosts.pipes + safeCosts.upgrades;
  const totalCosts =
    safeCosts.land +
    safeCosts.survey +
    safeCosts.drilling +
    safeCosts.pipes +
    safeCosts.upgrades +
    safeCosts.operating;
  const revenue = Math.max(0, input.revenue);
  const profit = revenue - totalCosts;

  const profitPercentage =
    totalCosts > 0
      ? Math.round((profit / totalCosts) * 100)
      : revenue > 0
        ? 100
        : 0;

  const roiPercent =
    totalCosts > 0
      ? roundToOneDecimal((profit / totalCosts) * 100)
      : revenue > 0
        ? 100
        : 0;

  const startingHeat = Math.max(0, input.startingHeat);
  const remainingHeat = clamp(input.remainingHeat, 0, startingHeat || Number.MAX_SAFE_INTEGER);
  const thermalExtractedTH =
    input.thermalExtractedTH ?? (startingHeat > 0 ? Math.max(0, startingHeat - remainingHeat) : 0);

  const depletionFraction =
    startingHeat <= 0 ? 0 : clamp(1 - remainingHeat / startingHeat, 0, 1);

  const thermalDepletionPercent = clamp(Math.round(depletionFraction * 100), 0, 100);
  const thermalRemainingPercent = 100 - thermalDepletionPercent;

  const discoveredMineralsCount = Math.max(0, input.discoveredMineralsCount ?? 0);
  const totalMineralsCount = Math.max(0, input.totalMineralsCount ?? 0);

  const mineralsDepletionPercent = clamp(
    Math.round(
      input.mineralsDepletedPercent ??
        (totalMineralsCount > 0 ? (discoveredMineralsCount / totalMineralsCount) * 100 : 0),
    ),
    0,
    100,
  );

  const groundStabilityScore = clamp(
    Math.round(input.stableGroundScore ?? 100),
    0,
    100,
  );
  const stableGroundDepletionPercent = 100 - groundStabilityScore;

  const depletion: ResourceDepletion = {
    thermalDepletionPercent,
    thermalRemainingPercent,
    mineralsDepletionPercent,
    stableGroundDepletionPercent,
    stableGroundRemainingPercent: groundStabilityScore,
  };

  const powerGeneratedMWh = Math.max(0, input.powerGeneratedMWh ?? 0);
  const activeHours = Math.max(0, input.elapsedOperatingSeconds ?? 0) / 3600;
  const computedAvgMW = activeHours > 0 ? powerGeneratedMWh / activeHours : 0;
  const avgOutputMW = roundToOneDecimal(Math.max(0, input.avgOutputMW ?? computedAvgMW));
  const peakOutputMW = roundToOneDecimal(Math.max(avgOutputMW, input.peakOutputMW ?? avgOutputMW));
  const exportCapacityMW = Math.max(0, input.exportCapacityMW ?? 0);
  const utilizationPercent =
    exportCapacityMW > 0
      ? roundToOneDecimal(clamp((avgOutputMW / exportCapacityMW) * 100, 0, 100))
      : 0;

  return {
    totalCosts,
    constructionCost,
    revenue,
    profit,
    profitPercentage,
    roiPercent,
    depletionFraction,
    thermalExtractedTH: roundToOneDecimal(thermalExtractedTH),
    unsoldValue: Math.max(0, input.unsoldTH) * Math.max(0, input.closingPrice),
    costs: safeCosts,
    depletion,
    discoveredMineralsCount,
    totalMineralsCount,
    groundStabilityScore,
    avgOutputMW,
    peakOutputMW,
    utilizationPercent,
    powerGeneratedMWh: roundToOneDecimal(powerGeneratedMWh),
    wellsDrilled: Math.max(0, input.wellsDrilled ?? 0),
    reservoirsTapped: Math.max(0, input.reservoirsTapped ?? 0),
  };
}

function getOwnedParcels(state: GameState): Parcel[] {
  const ownedIds = new Set<string>(state.ownedParcelIds ?? []);
  if (state.ownedParcelId) {
    ownedIds.add(state.ownedParcelId);
  }
  return state.parcels.filter((p) => ownedIds.has(p.id));
}

function computeDiscoveredMinerals(state: GameState, ownedParcels: Parcel[]): {
  discoveredCount: number;
  totalCount: number;
  depletedPercent: number;
} {
  const allMinerals = ownedParcels.flatMap((p) => p.minerals ?? []);
  const discoveredIds = new Set<string>();

  for (const scan of state.surveys ?? []) {
    for (const mineral of scan.revealedMinerals ?? []) {
      discoveredIds.add(mineral.id);
    }
  }
  for (const scan of state.roverScans ?? []) {
    for (const mineral of scan.mineralsFound ?? []) {
      discoveredIds.add(mineral.id);
    }
  }
  for (const result of state.surveyResults ?? []) {
    for (const mineral of result.minerals ?? []) {
      discoveredIds.add(mineral.id);
    }
  }

  // Also count mineral deposits intersected or closely passed by drilled wells
  for (const well of state.wells ?? []) {
    for (const mineral of allMinerals) {
      for (const pt of well.path) {
        if (Math.hypot(pt.x - mineral.position.x, pt.y - mineral.position.y) <= 10) {
          discoveredIds.add(mineral.id);
        }
      }
    }
  }

  const totalCount = allMinerals.length;
  const discoveredCount = discoveredIds.size;

  const avgDepletedAmount =
    totalCount > 0
      ? allMinerals.reduce((sum, m) => sum + (m.depletedAmount ?? 0), 0) / totalCount
      : 0;
  const depletedPercent =
    avgDepletedAmount > 0
      ? clamp(Math.round(avgDepletedAmount), 0, 100)
      : totalCount > 0
        ? Math.round((discoveredCount / totalCount) * 100)
        : 0;

  return { discoveredCount, totalCount, depletedPercent };
}

function computeGroundStabilityScore(state: GameState, ownedParcels: Parcel[]): number {
  const zones = ownedParcels.flatMap(
    (p) => p.surfaceFeatures?.stableZones ?? p.stableGround ?? [],
  );
  const baseStability =
    zones.length > 0
      ? zones.reduce((sum, z) => sum + z.stabilityScore, 0) / zones.length
      : 100;

  const faultMap = new Map<string, FaultObstacle>();
  for (const parcel of ownedParcels) {
    for (const fault of parcel.faults ?? []) {
      faultMap.set(fault.id, fault);
    }
  }

  let penalty = 0;
  for (const well of state.wells ?? []) {
    for (const faultId of well.intersectedFaults ?? []) {
      const fault = faultMap.get(faultId);
      if (!fault) {
        penalty += 8;
      } else if (fault.severity === 'critical') {
        penalty += 22;
      } else if (fault.severity === 'major') {
        penalty += 12;
      } else {
        penalty += 5;
      }
    }
    penalty += (well.intersectedAquifers?.length ?? 0) * 6;
  }

  return clamp(Math.round(baseStability - penalty), 0, 100);
}

/**
 * Compute an auditable RoundSettlement directly from real GameState metrics.
 */
export function settleGameState(state: GameState): SettlementResult {
  const ownedParcels = getOwnedParcels(state);

  const tappedReservoirIds = new Set<string>();
  for (const well of state.wells ?? []) {
    for (const id of well.tappedReservoirIds ?? []) {
      tappedReservoirIds.add(id);
    }
  }
  for (const id of state.discoveredReservoirIds ?? []) {
    tappedReservoirIds.add(id);
  }

  const tappedReservoirs = ownedParcels
    .flatMap((p) => p.reservoirs)
    .filter((r) => tappedReservoirIds.has(r.id));

  let startingHeat = state.startingHeat;
  let remainingHeat = state.remainingHeat;

  if (tappedReservoirs.length > 0) {
    startingHeat = tappedReservoirs.reduce((sum, r) => sum + r.initialHeat, 0);
    remainingHeat = tappedReservoirs.reduce((sum, r) => sum + r.remainingHeat, 0);
  } else if (state.activeReservoir) {
    startingHeat = state.activeReservoir.initialHeat;
    remainingHeat = state.activeReservoir.remainingHeat;
  }

  const { discoveredCount, totalCount, depletedPercent } = computeDiscoveredMinerals(
    state,
    ownedParcels,
  );
  const stabilityScore = computeGroundStabilityScore(state, ownedParcels);

  const revenue = state.plant?.totalExportRevenue ?? state.salesRevenue;
  const powerGeneratedMWh = state.plant?.totalExportedMWh ?? state.powerGeneratedMWh;
  const elapsedOperatingSeconds = state.elapsedSeconds;
  const activeHours = elapsedOperatingSeconds > 0 ? elapsedOperatingSeconds / 3600 : 0;
  const avgOutputMW = activeHours > 0 ? powerGeneratedMWh / activeHours : 0;
  const peakOutputMW = Math.max(
    avgOutputMW,
    state.plant?.exportRateMW ?? 0,
    state.plant?.heatExchanger?.electricalOutputMW ?? 0,
    state.plantTelemetry?.powerMW ?? 0,
  );

  const wellsDrilled =
    state.wells && state.wells.length > 0
      ? state.wells.length
      : state.drillPath && state.drillPath.length >= 2
        ? 1
        : 0;

  const ledgerUpgradeTotal = (state.ledger ?? [])
    .filter((entry) => entry.kind === 'cost' && entry.category === 'upgrades')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const ledgerSurveyTotal = (state.ledger ?? [])
    .filter((entry) => entry.kind === 'cost' && entry.category === 'survey')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const effectiveCosts: RoundCosts = {
    ...state.costs,
    upgrades: Math.max(state.costs.upgrades, ledgerUpgradeTotal),
    survey: Math.max(state.costs.survey, ledgerSurveyTotal),
  };

  return settleRound({
    revenue,
    costs: effectiveCosts,
    startingHeat,
    remainingHeat,
    unsoldTH: state.plant?.storageTankTH ?? state.storageTherm ?? 0,
    closingPrice: state.plant?.marketPricePerMWh ?? state.currentPrice ?? 0,
    mineralsDepletedPercent: depletedPercent,
    discoveredMineralsCount: discoveredCount,
    totalMineralsCount: totalCount,
    stableGroundScore: stabilityScore,
    powerGeneratedMWh,
    avgOutputMW,
    peakOutputMW,
    exportCapacityMW: state.plant?.exportCapacityMW ?? 150,
    elapsedOperatingSeconds,
    wellsDrilled,
    reservoirsTapped: tappedReservoirIds.size,
  });
}
