import { SIMULATION_DEFAULTS } from './constants';
import type { PipeTypeId } from './types';

export type PipeType = keyof typeof SIMULATION_DEFAULTS.pipe;

export interface PipeRequest {
  length: number;
  requestedFlow: number;
  inletTemperature: number;
}

export interface PipeResult {
  capacity: number;
  flow: number;
  outletTemperature: number;
  heatLoss: number;
  pressureLoss: number;
}

export const RETURN_DISCONNECTED_FLOW_FACTOR = 0.15;
export const RETURN_DISCONNECTED_EXCHANGER_FACTOR = 0.65;

export interface CirculationNetworkInput {
  wellFlow: number;
  wellheadTempC: number;
  hotPipeType: PipeTypeId;
  hotPipeLength: number;
  exchangerBaseEfficiency?: number;
  exchangerUpgradeLevel?: number;
  returnLoopActive: boolean;
  returnPipeLength?: number;
  reservoirPressureBar?: number;
}

export interface CirculationNetworkResult {
  effectiveWellFlow: number;
  hotPipe: {
    type: PipeTypeId;
    length: number;
    flow: number;
    inletTempC: number;
    outletTempC: number;
    heatLoss: number;
    pressureDropBar: number;
  };
  heatExchanger: {
    efficiency: number;
    thermalInputRateTHPerSec: number;
    steamOutputRatio: number;
    upgradeLevel: number;
  };
  returnFluidLoop: {
    active: boolean;
    flow: number;
    returnTempC: number;
    pressureBar: number;
    reinjectionEfficiency: number;
  };
}

export function evaluatePipe(request: PipeRequest, pipe: { type: PipeType }): PipeResult {
  const specification = SIMULATION_DEFAULTS.pipe[pipe.type] ?? SIMULATION_DEFAULTS.pipe.basic;
  const safeLength = Math.max(0, request.length);
  const flow = Math.max(0, Math.min(request.requestedFlow, specification.capacity));
  const heatLoss =
    request.inletTemperature * (1 - Math.exp(-specification.heatLossPerDistance * safeLength));
  return {
    capacity: specification.capacity,
    flow,
    outletTemperature: Math.max(0, request.inletTemperature - heatLoss),
    heatLoss,
    pressureLoss: specification.pressureLossPerDistance * safeLength * flow,
  };
}

/**
 * Evaluate the closed-loop geothermal circulation path:
 * well -> hot-fluid pipe -> heat exchanger -> blue return-fluid pipe.
 * Disconnecting the return-fluid pipe heavily throttles continuous flow and reduces
 * heat exchanger transfer efficiency due to lost reinjection pressure.
 */
export function evaluateCirculationNetwork(
  input: CirculationNetworkInput,
): CirculationNetworkResult {
  const circulationFactor = input.returnLoopActive ? 1 : RETURN_DISCONNECTED_FLOW_FACTOR;
  const effectiveWellFlow = Math.max(0, input.wellFlow) * circulationFactor;
  const safeLength = Math.max(0, input.hotPipeLength);
  const inletTempC = Math.max(0, input.wellheadTempC);

  const hotPipeEval = evaluatePipe(
    {
      length: safeLength,
      requestedFlow: effectiveWellFlow,
      inletTemperature: inletTempC,
    },
    { type: input.hotPipeType },
  );

  const upgradeLevel = Math.max(0, input.exchangerUpgradeLevel ?? 0);
  const baseEff = input.exchangerBaseEfficiency ?? SIMULATION_DEFAULTS.exchangerBaseEfficiency;
  const upgradedEff = Math.min(0.99, baseEff + upgradeLevel * 0.03);
  const effectiveEfficiency = input.returnLoopActive
    ? upgradedEff
    : upgradedEff * RETURN_DISCONNECTED_EXCHANGER_FACTOR;

  const returnSpec = SIMULATION_DEFAULTS.pipe.return;
  const returnLength = Math.max(0, input.returnPipeLength ?? safeLength);
  const basePressure = Math.max(0, input.reservoirPressureBar ?? 75);

  const returnFlow =
    input.returnLoopActive && hotPipeEval.flow > 0
      ? Math.min(hotPipeEval.flow, returnSpec.capacity)
      : 0;
  const returnTempC =
    input.returnLoopActive && hotPipeEval.flow > 0
      ? Math.max(
          25,
          hotPipeEval.outletTemperature * 0.25 * Math.exp(-returnSpec.heatLossPerDistance * returnLength),
        )
      : 25;
  const returnPressureDrop = returnSpec.pressureLossPerDistance * returnLength * returnFlow;
  const returnPressureBar = input.returnLoopActive
    ? Math.max(15, basePressure * 0.75 - returnPressureDrop)
    : Math.max(5, basePressure * 0.2);
  const reinjectionEfficiency =
    input.returnLoopActive && hotPipeEval.flow > 0
      ? Math.min(1, returnFlow / hotPipeEval.flow)
      : 0;

  const steamOutputRatio =
    hotPipeEval.outletTemperature <= 0
      ? 0
      : Math.min(1, Math.max(0, (hotPipeEval.outletTemperature - 80) / 240)) *
        effectiveEfficiency;

  return {
    effectiveWellFlow,
    hotPipe: {
      type: input.hotPipeType,
      length: safeLength,
      flow: hotPipeEval.flow,
      inletTempC,
      outletTempC: hotPipeEval.outletTemperature,
      heatLoss: hotPipeEval.heatLoss,
      pressureDropBar: hotPipeEval.pressureLoss,
    },
    heatExchanger: {
      efficiency: effectiveEfficiency,
      thermalInputRateTHPerSec: (hotPipeEval.flow * hotPipeEval.outletTemperature) / 450,
      steamOutputRatio,
      upgradeLevel,
    },
    returnFluidLoop: {
      active: input.returnLoopActive,
      flow: returnFlow,
      returnTempC,
      pressureBar: returnPressureBar,
      reinjectionEfficiency,
    },
  };
}
