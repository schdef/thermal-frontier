import { SIMULATION_DEFAULTS } from './constants';
import type { PlantTelemetry, Reservoir } from './types';

export const EXTRACTION_HEAT_DIVISOR = 450;
export const MIN_RESERVOIR_TEMP_FRACTION = 0.55;

export interface ProductionRequest {
  flowRate: number;
  seconds: number;
}

export interface ProductionResult {
  reservoir: Reservoir;
  fluidFlow: number;
  thermalOutput: number;
  temperature: number;
  depleted: boolean;
}

/**
 * Deterministically derive current reservoir temperature from its baseline
 * `initialTemperature` and current depletion (`remainingHeat / initialHeat`).
 * Never compounds `temperature *= ...` across ticks.
 */
export function deriveReservoirTemperature(
  reservoir: Pick<Reservoir, 'temperature' | 'initialTemperature' | 'initialHeat' | 'remainingHeat'>,
  remainingHeatOverride?: number,
): number {
  const baseTemp = Math.max(0, reservoir.initialTemperature ?? reservoir.temperature);
  const initialHeat = Math.max(0, reservoir.initialHeat);
  if (initialHeat <= 0) {
    return baseTemp * MIN_RESERVOIR_TEMP_FRACTION;
  }
  const remaining = Math.max(
    0,
    Math.min(initialHeat, remainingHeatOverride ?? reservoir.remainingHeat),
  );
  const depletion = 1 - remaining / initialHeat;
  return Math.max(0, baseTemp * (1 - depletion * (1 - MIN_RESERVOIR_TEMP_FRACTION)));
}

export function isReservoirDepleted(reservoir: Pick<Reservoir, 'remainingHeat'>): boolean {
  return reservoir.remainingHeat <= 0;
}

/**
 * Extract thermal energy from a finite reservoir using exact analytical ODE
 * integration of `dH/dt = -(flow / EXTRACTION_HEAT_DIVISOR) * T(H)`, ensuring
 * frame-rate-independent remainingHeat, temperature, and thermalOutput.
 */
export function produceFromReservoir(
  reservoir: Reservoir,
  request: ProductionRequest,
): ProductionResult {
  const baseTemp = Math.max(0, reservoir.initialTemperature ?? reservoir.temperature);
  const initialHeat = Math.max(0, reservoir.initialHeat);
  const startRemaining = Math.max(0, reservoir.remainingHeat);
  const maxRate =
    reservoir.maxExtractionRate !== undefined
      ? Math.min(reservoir.flowPotential, reservoir.maxExtractionRate)
      : reservoir.flowPotential;
  const flow = Math.max(0, Math.min(request.flowRate, maxRate));
  const seconds = Math.max(0, request.seconds);

  if (startRemaining <= 0 || initialHeat <= 0 || baseTemp <= 0 || flow <= 0 || seconds <= 0) {
    const temperature = deriveReservoirTemperature(
      { ...reservoir, initialTemperature: baseTemp },
      startRemaining,
    );
    return {
      reservoir: {
        ...reservoir,
        initialTemperature: baseTemp,
        remainingHeat: startRemaining,
        temperature,
      },
      fluidFlow: 0,
      thermalOutput: 0,
      temperature,
      depleted: startRemaining <= 0,
    };
  }

  // Linear temperature curve T(H) = a + b * H
  const a = baseTemp * MIN_RESERVOIR_TEMP_FRACTION;
  const b = (baseTemp * (1 - MIN_RESERVOIR_TEMP_FRACTION)) / initialHeat;
  const c = flow / EXTRACTION_HEAT_DIVISOR;

  const startLinear = a + b * startRemaining;
  const decay = Math.exp(-c * b * seconds);
  const rawEndRemaining = (startLinear * decay - a) / b;

  let endRemaining: number;
  let fluidFlow: number;

  if (rawEndRemaining <= 0) {
    endRemaining = 0;
    const timeToDeplete = c * b > 0 ? Math.log(startLinear / a) / (c * b) : seconds;
    const activeFraction = Math.min(1, Math.max(0, timeToDeplete / seconds));
    fluidFlow = flow * activeFraction;
  } else {
    endRemaining = Math.min(startRemaining, rawEndRemaining);
    fluidFlow = flow;
  }

  const extractedHeat = Math.max(0, startRemaining - endRemaining);
  const nextTemperature = deriveReservoirTemperature(
    { ...reservoir, initialTemperature: baseTemp },
    endRemaining,
  );

  return {
    reservoir: {
      ...reservoir,
      initialTemperature: baseTemp,
      remainingHeat: endRemaining,
      temperature: nextTemperature,
    },
    fluidFlow,
    thermalOutput: extractedHeat,
    temperature: nextTemperature,
    depleted: endRemaining <= 0,
  };
}

export function computePlantTelemetry(
  reservoir: Reservoir,
  options: {
    flowRate: number;
    heatExchangerEfficiency?: number;
    returnFluidLoop?: boolean;
    storageLevelTH?: number;
    storageCapacityTH?: number;
    gridExportPrice?: number;
    totalExportedMWh?: number;
    roundTimeRemainingSeconds?: number;
  },
): PlantTelemetry {
  const exchangerEff = options.heatExchangerEfficiency ?? SIMULATION_DEFAULTS.exchangerBaseEfficiency;
  const returnLoopActive = options.returnFluidLoop ?? true;
  const depleted = isReservoirDepleted(reservoir);
  const currentTemp = Math.round(deriveReservoirTemperature(reservoir));

  const nominalFlow = Math.max(1, reservoir.flowPotential);
  const maxRate =
    reservoir.maxExtractionRate !== undefined
      ? Math.min(nominalFlow, reservoir.maxExtractionRate)
      : nominalFlow;
  const effectiveFlow = depleted
    ? 0
    : Math.max(0, Math.min(options.flowRate, maxRate)) * (returnLoopActive ? 1 : 0.15);

  // Power in Megawatts (MW): scaled to reference ~120 MW at ~320°C and nominal flow
  const flowRatio = effectiveFlow / 10;
  const tempRatio = currentTemp / 320;
  const baseMW = depleted ? 0 : 120 * flowRatio * tempRatio * exchangerEff * (returnLoopActive ? 1 : 0.65);
  const powerMW = Math.max(0, Math.round(baseMW * 10) / 10);

  const returnFluidLoopFlow =
    returnLoopActive && !depleted ? Math.round(effectiveFlow * 0.92 * 10) / 10 : 0;
  const returnFluidTemperature =
    returnLoopActive && !depleted ? Math.round(60 + Math.max(0, currentTemp - 160) * 0.08) : 25;
  const closedLoopPressureBar = Math.round(reservoir.pressure * (returnLoopActive ? 0.72 : 0.25));

  const exportRateMW = Math.min(
    SIMULATION_DEFAULTS.exportCapacityMW,
    Math.round(powerMW * (returnLoopActive ? 0.96 : 0.8) * 10) / 10,
  );

  const thermalDepletionPercent =
    reservoir.initialHeat > 0
      ? Math.min(100, Math.max(0, Math.round((1 - reservoir.remainingHeat / reservoir.initialHeat) * 100)))
      : 100;

  return {
    temperatureC: currentTemp,
    powerMW,
    heatExchangerEfficiency: exchangerEff,
    storageTankLevelTH: options.storageLevelTH ?? 0,
    storageTankCapacityTH: options.storageCapacityTH ?? SIMULATION_DEFAULTS.storageCapacityTH,
    exportRateMW,
    gridExportPrice: options.gridExportPrice ?? 120,
    returnFluidLoopFlow,
    returnFluidTemperature,
    closedLoopPressureBar,
    totalEnergyExportedMWh: options.totalExportedMWh ?? 0,
    roundTimeRemainingSeconds: options.roundTimeRemainingSeconds,
    thermalDepletionPercent,
  };
}
