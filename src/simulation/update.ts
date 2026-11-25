import type { GameState } from '../game/types';
import { SIMULATION_DEFAULTS } from './constants';
import { calculateElectricityExport, DEFAULT_MARKET_PRICE_PER_MWH } from './market';
import { evaluateCirculationNetwork } from './pipes';
import { deriveReservoirTemperature, produceFromReservoir } from './reservoir';
import { settleGameState } from './settlement';
import type {
  Parcel,
  PipeTypeId,
  PlantChainState,
  PlantOperatingState,
  PlantTelemetry,
  Reservoir,
  ResourceDepletion,
  WellRecord,
} from './types';

export const MW_PER_TH_PER_SEC = 18;
export const BASE_OPERATING_COST_PER_SECOND = 0.35;
export const RETURN_LOOP_OPERATING_COST_PER_SECOND = 0.1;

export interface CreateInitialPlantChainOptions {
  pipeType?: PipeTypeId;
  networkLength?: number;
  storageCapacityTH?: number;
  exportCapacityMW?: number;
  marketPricePerMWh?: number;
  exchangerEfficiency?: number;
  exchangerUpgradeLevel?: number;
  returnLoopActive?: boolean;
  roundDurationSeconds?: number;
  exportActive?: boolean;
}

export function createInitialPlantChainState(
  options?: CreateInitialPlantChainOptions,
): PlantChainState {
  const roundDuration = options?.roundDurationSeconds ?? SIMULATION_DEFAULTS.roundDurationSeconds;
  const returnActive = options?.returnLoopActive ?? true;
  const pipeType = options?.pipeType ?? 'basic';
  const networkLength = options?.networkLength ?? 0;

  return {
    wellFlow: 0,
    hotPipe: {
      type: pipeType,
      length: networkLength,
      flow: 0,
      inletTempC: 0,
      outletTempC: 0,
      heatLoss: 0,
      pressureDropBar: 0,
    },
    heatExchanger: {
      efficiency: options?.exchangerEfficiency ?? SIMULATION_DEFAULTS.exchangerBaseEfficiency,
      thermalInputTH: 0,
      electricalOutputMW: 0,
      steamOutputRatio: 0,
      upgradeLevel: options?.exchangerUpgradeLevel ?? 0,
    },
    storageTankTH: 0,
    storageCapacityTH: options?.storageCapacityTH ?? SIMULATION_DEFAULTS.storageCapacityTH,
    exportCapacityMW: options?.exportCapacityMW ?? SIMULATION_DEFAULTS.exportCapacityMW,
    exportRateMW: 0,
    exportActive: options?.exportActive ?? true,
    marketPricePerMWh: options?.marketPricePerMWh ?? DEFAULT_MARKET_PRICE_PER_MWH,
    totalExportedMWh: 0,
    totalExportRevenue: 0,
    returnFluidLoop: {
      active: returnActive,
      flow: 0,
      returnTempC: 25,
      pressureBar: 0,
      reinjectionEfficiency: returnActive ? 1 : 0,
    },
    operatingState: 'idle',
    roundTimeRemainingSeconds: roundDuration,
    roundDurationSeconds: roundDuration,
  };
}

export function isDepletionStopCondition(state: GameState): boolean {
  return state.plant?.operatingState === 'depleted';
}

export function isRoundEnded(state: GameState): boolean {
  return (
    state.plant?.operatingState === 'completed' ||
    (state.plant?.roundTimeRemainingSeconds ?? 0) <= 0
  );
}

interface TappedReservoirRef {
  parcelIndex: number;
  reservoirIndex: number;
  reservoir: Reservoir;
  requestedFlow: number;
}

function collectTappedReservoirs(state: GameState): {
  refs: TappedReservoirRef[];
  activeWellCount: number;
} {
  const ownedIds = new Set<string>(state.ownedParcelIds ?? []);
  if (state.ownedParcelId) {
    ownedIds.add(state.ownedParcelId);
  }

  const flowByReservoirId = new Map<string, number>();
  let activeWellCount = 0;

  for (const well of state.wells ?? []) {
    if (well.status === 'active' || well.status === 'drilling') {
      const tapped = well.tappedReservoirIds ?? [];
      if (tapped.length > 0) {
        activeWellCount += 1;
        const perReservoirFlow =
          well.flowContribution > 0 ? well.flowContribution / tapped.length : Infinity;
        for (const resId of tapped) {
          flowByReservoirId.set(resId, (flowByReservoirId.get(resId) ?? 0) + perReservoirFlow);
        }
      }
    }
  }

  // Fallback for legacy single-well state without WellRecord entries
  if (flowByReservoirId.size === 0) {
    const fallbackIds = new Set<string>(state.discoveredReservoirIds ?? []);
    if (state.activeReservoir) {
      fallbackIds.add(state.activeReservoir.id);
    }
    if (fallbackIds.size > 0) {
      activeWellCount = 1;
      for (const id of fallbackIds) {
        flowByReservoirId.set(id, Infinity);
      }
    }
  }

  const refs: TappedReservoirRef[] = [];
  state.parcels.forEach((parcel, parcelIndex) => {
    if (ownedIds.size > 0 && !ownedIds.has(parcel.id)) return;
    parcel.reservoirs.forEach((reservoir, reservoirIndex) => {
      if (flowByReservoirId.has(reservoir.id)) {
        // Prefer activeReservoir copy if parcels copy wasn't synced yet
        const latestReservoir =
          state.activeReservoir && state.activeReservoir.id === reservoir.id
            ? state.activeReservoir
            : reservoir;
        const requested = flowByReservoirId.get(reservoir.id) ?? latestReservoir.flowPotential;
        const cappedRequested = Number.isFinite(requested)
          ? requested
          : latestReservoir.flowPotential;
        refs.push({
          parcelIndex,
          reservoirIndex,
          reservoir: latestReservoir,
          requestedFlow: Math.max(0, Math.min(cappedRequested, latestReservoir.flowPotential)),
        });
      }
    });
  });

  // Fallback if activeReservoir is detached from parcels
  if (refs.length === 0 && state.activeReservoir) {
    refs.push({
      parcelIndex: -1,
      reservoirIndex: -1,
      reservoir: state.activeReservoir,
      requestedFlow: state.activeReservoir.flowPotential,
    });
  }

  return { refs, activeWellCount };
}

/**
 * Deterministic, frame-rate-independent simulation step for Geothermal Power Plant Ops.
 * Advances: well extraction -> hot pipe -> heat exchanger -> storage buffer -> electricity export + return pipe.
 */
export function updateSimulation(deltaTime: number, state: GameState): GameState {
  if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
    return state;
  }

  if (state.phase !== 'operate' && state.phase !== 'production') {
    return state;
  }

  const currentPlant = state.plant ?? createInitialPlantChainState({
    pipeType: state.pipeType,
    networkLength: state.networkLength,
    storageCapacityTH: state.storageCapacity,
    returnLoopActive: state.returnFluidLoopActive,
    roundDurationSeconds: state.roundDurationSeconds,
  });

  if (currentPlant.operatingState === 'completed' || currentPlant.roundTimeRemainingSeconds <= 0) {
    return state;
  }

  if (state.isPaused || state.speed === 0) {
    if (currentPlant.operatingState === 'paused' || currentPlant.operatingState === 'depleted') {
      return state;
    }
    return {
      ...state,
      plant: {
        ...currentPlant,
        operatingState: 'paused',
      },
    };
  }

  const speedMultiplier = state.speed;
  const rawDt = deltaTime * speedMultiplier;
  const dt = Math.min(rawDt, Math.max(0, currentPlant.roundTimeRemainingSeconds));
  if (dt <= 0) {
    return state;
  }

  const returnLoopActive = state.returnFluidLoopActive ?? currentPlant.returnFluidLoop.active;
  const circulationFactor = returnLoopActive ? 1 : 0.15;

  const { refs, activeWellCount } = collectTappedReservoirs(state);
  const updatedReservoirsById = new Map<string, Reservoir>();

  let totalRawWellFlow = 0;
  let totalFluidFlow = 0;
  let totalThermalOutput = 0;
  let weightedTempSum = 0;
  let weightedPressureSum = 0;
  let totalStartingHeat = 0;
  let totalRemainingHeat = 0;

  for (const ref of refs) {
    totalStartingHeat += ref.reservoir.initialHeat;
    const requestedForStep = ref.requestedFlow * circulationFactor;
    const prod = produceFromReservoir(ref.reservoir, {
      flowRate: requestedForStep,
      seconds: dt,
    });
    updatedReservoirsById.set(ref.reservoir.id, prod.reservoir);
    totalRemainingHeat += prod.reservoir.remainingHeat;

    totalRawWellFlow += ref.reservoir.remainingHeat > 0 || prod.thermalOutput > 0 ? ref.requestedFlow : 0;
    totalFluidFlow += prod.fluidFlow;
    totalThermalOutput += prod.thermalOutput;
    weightedTempSum += prod.temperature * Math.max(prod.fluidFlow, ref.reservoir.remainingHeat > 0 ? 0.001 : 0);
    weightedPressureSum +=
      ref.reservoir.pressure * Math.max(prod.fluidFlow, ref.reservoir.remainingHeat > 0 ? 0.001 : 0);
  }

  const weightDenom = refs.reduce((sum, ref) => {
    const res = updatedReservoirsById.get(ref.reservoir.id) ?? ref.reservoir;
    const flowUsed = res.remainingHeat > 0 ? Math.max(0.001, ref.requestedFlow * circulationFactor) : 0;
    return sum + flowUsed;
  }, 0);

  const avgWellTempC =
    totalFluidFlow > 0
      ? refs.reduce((sum, ref) => {
          const res = updatedReservoirsById.get(ref.reservoir.id) ?? ref.reservoir;
          return sum + deriveReservoirTemperature(res) * ref.requestedFlow * circulationFactor;
        }, 0) / Math.max(0.001, weightDenom)
      : refs.length > 0
        ? refs.reduce(
            (sum, ref) =>
              sum + deriveReservoirTemperature(updatedReservoirsById.get(ref.reservoir.id) ?? ref.reservoir),
            0,
          ) / refs.length
        : 0;

  const avgPressureBar =
    weightDenom > 0
      ? refs.reduce((sum, ref) => {
          const res = updatedReservoirsById.get(ref.reservoir.id) ?? ref.reservoir;
          return sum + res.pressure * (res.remainingHeat > 0 ? Math.max(0.001, ref.requestedFlow * circulationFactor) : 0);
        }, 0) / weightDenom
      : refs[0]?.reservoir.pressure ?? 60;

  const pipeType = currentPlant.hotPipe.type ?? state.pipeType ?? 'basic';
  const pipeLength = currentPlant.hotPipe.length || state.networkLength || 0;
  const exchangerUpgradeLevel = state.upgrades?.exchanger ?? currentPlant.heatExchanger.upgradeLevel ?? 0;

  const network = evaluateCirculationNetwork({
    wellFlow: totalRawWellFlow,
    wellheadTempC: avgWellTempC,
    hotPipeType: pipeType,
    hotPipeLength: pipeLength,
    exchangerBaseEfficiency: SIMULATION_DEFAULTS.exchangerBaseEfficiency,
    exchangerUpgradeLevel,
    returnLoopActive,
    reservoirPressureBar: avgPressureBar,
  });

  // Effective thermal energy delivered into storage buffer over dt
  const flowRetention = totalFluidFlow <= 0 ? 0 : Math.min(1, network.hotPipe.flow / totalFluidFlow);
  const tempRetention =
    avgWellTempC <= 0 ? 0 : Math.min(1, network.hotPipe.outletTempC / avgWellTempC);
  const exchangerOutputTH =
    totalThermalOutput * flowRetention * tempRetention * network.heatExchanger.efficiency;

  const storageCapacityTH = currentPlant.storageCapacityTH || state.storageCapacity || SIMULATION_DEFAULTS.storageCapacityTH;
  const currentTankTH = Math.max(0, currentPlant.storageTankTH ?? state.storageTherm ?? 0);
  const availableTankTH = currentTankTH + exchangerOutputTH;

  const exportCapacityMW = currentPlant.exportCapacityMW || SIMULATION_DEFAULTS.exportCapacityMW;
  const maxExportTHForDt = (exportCapacityMW / MW_PER_TH_PER_SEC) * dt;
  const exportedTH = currentPlant.exportActive
    ? Math.min(availableTankTH, maxExportTHForDt)
    : 0;

  const overflowTH = Math.max(0, availableTankTH - exportedTH - storageCapacityTH);
  const nextStorageTankTH = Math.min(storageCapacityTH, Math.max(0, availableTankTH - exportedTH));

  const electricalOutputMW = (exchangerOutputTH * MW_PER_TH_PER_SEC) / dt;
  const exportRateMW = (exportedTH * MW_PER_TH_PER_SEC) / dt;

  const marketPricePerMWh = currentPlant.marketPricePerMWh || state.currentPrice || DEFAULT_MARKET_PRICE_PER_MWH;
  const { mwhExported, revenue: revenueDelta } = calculateElectricityExport(
    exportRateMW,
    dt,
    marketPricePerMWh,
  );

  // Operating & maintenance cost only accrues while wells or export are active
  const allReservoirsDepleted = refs.length > 0 && totalRemainingHeat <= 0;
  const plantWasActiveThisStep = totalThermalOutput > 0 || exportedTH > 0;
  const operatingCostPerSecond =
    plantWasActiveThisStep && activeWellCount > 0
      ? activeWellCount * BASE_OPERATING_COST_PER_SECOND +
        (returnLoopActive ? RETURN_LOOP_OPERATING_COST_PER_SECOND : 0.05)
      : 0;
  const operatingCostDelta = operatingCostPerSecond * dt;

  const nextRoundTimeRemaining = Math.max(0, currentPlant.roundTimeRemainingSeconds - dt);
  const isDepletedStop = allReservoirsDepleted && nextStorageTankTH <= 0;

  let nextOperatingState: PlantOperatingState = 'running';
  if (nextRoundTimeRemaining <= 0) {
    nextOperatingState = 'completed';
  } else if (isDepletedStop || (refs.length === 0 && nextStorageTankTH <= 0)) {
    nextOperatingState = 'depleted';
  }

  // Immutably sync updated reservoirs into parcels and wells
  const nextParcels: Parcel[] = state.parcels.map((parcel) => {
    let changed = false;
    const nextReservoirs = parcel.reservoirs.map((res) => {
      const updated = updatedReservoirsById.get(res.id);
      if (updated) {
        changed = true;
        return updated;
      }
      return res;
    });
    return changed ? { ...parcel, reservoirs: nextReservoirs } : parcel;
  });

  const nextWells: WellRecord[] = (state.wells ?? []).map((well) => {
    if (well.status !== 'active' || (well.tappedReservoirIds?.length ?? 0) === 0) {
      return well;
    }
    const wellReservoirs = well.tappedReservoirIds
      .map((id) => updatedReservoirsById.get(id))
      .filter((r): r is Reservoir => Boolean(r));
    if (wellReservoirs.length === 0) return well;
    const allWellResDepleted = wellReservoirs.every((r) => r.remainingHeat <= 0);
    const avgWellResTemp =
      wellReservoirs.reduce((s, r) => s + r.temperature, 0) / wellReservoirs.length;
    return {
      ...well,
      wellheadTempC: Math.round(avgWellResTemp),
      status: allWellResDepleted ? 'depleted' : 'active',
    };
  });

  const nextActiveReservoir = state.activeReservoir
    ? updatedReservoirsById.get(state.activeReservoir.id) ?? state.activeReservoir
    : undefined;

  const nextTotalExportedMWh = (currentPlant.totalExportedMWh ?? state.powerGeneratedMWh ?? 0) + mwhExported;
  const nextTotalRevenue = (currentPlant.totalExportRevenue ?? state.salesRevenue ?? 0) + revenueDelta;

  const thermalDepletionPercent =
    totalStartingHeat > 0
      ? Math.min(100, Math.max(0, Math.round((1 - totalRemainingHeat / totalStartingHeat) * 100)))
      : state.resourceDepletion?.thermalDepletionPercent ?? 0;

  const nextResourceDepletion: ResourceDepletion = {
    ...(state.resourceDepletion ?? {
      thermalDepletionPercent: 0,
      thermalRemainingPercent: 100,
      mineralsDepletionPercent: 0,
      stableGroundDepletionPercent: 0,
      stableGroundRemainingPercent: 100,
    }),
    thermalDepletionPercent,
    thermalRemainingPercent: 100 - thermalDepletionPercent,
  };

  const nextPlant: PlantChainState = {
    wellFlow: network.effectiveWellFlow,
    hotPipe: network.hotPipe,
    heatExchanger: {
      efficiency: network.heatExchanger.efficiency,
      thermalInputTH: exchangerOutputTH,
      electricalOutputMW: Math.round(electricalOutputMW * 10) / 10,
      steamOutputRatio: network.heatExchanger.steamOutputRatio,
      upgradeLevel: exchangerUpgradeLevel,
    },
    storageTankTH: nextStorageTankTH,
    storageCapacityTH,
    exportCapacityMW,
    exportRateMW: Math.round(exportRateMW * 10) / 10,
    exportActive: currentPlant.exportActive,
    marketPricePerMWh,
    totalExportedMWh: nextTotalExportedMWh,
    totalExportRevenue: nextTotalRevenue,
    returnFluidLoop: network.returnFluidLoop,
    operatingState: nextOperatingState,
    roundTimeRemainingSeconds: nextRoundTimeRemaining,
    roundDurationSeconds: currentPlant.roundDurationSeconds,
  };

  const nextTelemetry: PlantTelemetry = {
    temperatureC: Math.round(network.hotPipe.outletTempC),
    powerMW: nextPlant.heatExchanger.electricalOutputMW,
    heatExchangerEfficiency: Math.round(network.heatExchanger.efficiency * 1000) / 1000,
    storageTankLevelTH: Math.round(nextStorageTankTH * 10) / 10,
    storageTankCapacityTH: storageCapacityTH,
    exportRateMW: nextPlant.exportRateMW,
    gridExportPrice: marketPricePerMWh,
    returnFluidLoopFlow: Math.round(network.returnFluidLoop.flow * 10) / 10,
    returnFluidTemperature: Math.round(network.returnFluidLoop.returnTempC),
    closedLoopPressureBar: Math.round(network.returnFluidLoop.pressureBar),
    totalEnergyExportedMWh: Math.round(nextTotalExportedMWh * 1000) / 1000,
    roundTimeRemainingSeconds: nextRoundTimeRemaining,
    thermalDepletionPercent,
  };

  let notice = state.notice;
  if (nextOperatingState === 'completed') {
    notice = 'Round time elapsed. Ready for round settlement.';
  } else if (nextOperatingState === 'depleted') {
    notice = 'All tapped thermal reservoirs depleted. Extraction stopped.';
  } else if (!returnLoopActive) {
    notice = 'Return fluid pipe disconnected: continuous circulation heavily throttled.';
  } else if (overflowTH > 0) {
    notice = 'Thermal buffer full; exporting at grid capacity.';
  } else {
    notice = `${nextTelemetry.temperatureC}°C · ${nextPlant.exportRateMW} MW export · Closed loop active.`;
  }

  const nextState: GameState = {
    ...state,
    parcels: nextParcels,
    wells: nextWells,
    activeReservoir: nextActiveReservoir,
    startingHeat: totalStartingHeat || state.startingHeat,
    remainingHeat: refs.length > 0 ? totalRemainingHeat : state.remainingHeat,
    plant: nextPlant,
    plantTelemetry: nextTelemetry,
    resourceDepletion: nextResourceDepletion,
    storageTherm: nextStorageTankTH,
    pipeFlow: network.hotPipe.flow,
    pipeHeatLoss: network.hotPipe.heatLoss,
    pipeOutletTemperature: network.hotPipe.outletTempC,
    lastOutput: exchangerOutputTH,
    elapsedSeconds: state.elapsedSeconds + dt,
    currentPrice: marketPricePerMWh,
    salesRevenue: nextTotalRevenue,
    cash: state.cash + revenueDelta - operatingCostDelta,
    costs: {
      ...state.costs,
      operating: state.costs.operating + operatingCostDelta,
    },
    powerGeneratedMWh: nextTotalExportedMWh,
    notice,
  };

  if (nextOperatingState === 'completed') {
    return {
      ...nextState,
      settlement: settleGameState(nextState),
    };
  }

  return nextState;
}
