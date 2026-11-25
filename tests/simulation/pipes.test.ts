import { describe, expect, it } from 'vitest';
import {
  evaluateCirculationNetwork,
  evaluatePipe,
  RETURN_DISCONNECTED_FLOW_FACTOR,
} from '../../src/simulation/pipes';

describe('pipe transport & closed-loop circulation', () => {
  it('throttles flow at capacity and applies heat loss by route length', () => {
    const result = evaluatePipe({ length: 100, requestedFlow: 20, inletTemperature: 180 }, { type: 'basic' });

    expect(result.flow).toBeLessThanOrEqual(result.capacity);
    expect(result.outletTemperature).toBeLessThan(180);
    expect(result.heatLoss).toBeGreaterThan(0);
  });

  it('insulated pipe retains more heat than basic pipe on the same route', () => {
    const basic = evaluatePipe({ length: 100, requestedFlow: 10, inletTemperature: 180 }, { type: 'basic' });
    const insulated = evaluatePipe({ length: 100, requestedFlow: 10, inletTemperature: 180 }, { type: 'insulated' });

    expect(insulated.outletTemperature).toBeGreaterThan(basic.outletTemperature);
  });

  it('requires active blue return-fluid pipe for continuous full-efficiency circulation', () => {
    const connected = evaluateCirculationNetwork({
      wellFlow: 10,
      wellheadTempC: 310,
      hotPipeType: 'insulated',
      hotPipeLength: 40,
      returnLoopActive: true,
    });

    const disconnected = evaluateCirculationNetwork({
      wellFlow: 10,
      wellheadTempC: 310,
      hotPipeType: 'insulated',
      hotPipeLength: 40,
      returnLoopActive: false,
    });

    expect(connected.returnFluidLoop.active).toBe(true);
    expect(connected.returnFluidLoop.flow).toBeGreaterThan(0);
    expect(connected.returnFluidLoop.reinjectionEfficiency).toBeCloseTo(1, 4);

    expect(disconnected.returnFluidLoop.active).toBe(false);
    expect(disconnected.returnFluidLoop.flow).toBe(0);
    expect(disconnected.returnFluidLoop.reinjectionEfficiency).toBe(0);
    expect(disconnected.effectiveWellFlow).toBeCloseTo(10 * RETURN_DISCONNECTED_FLOW_FACTOR, 6);
    expect(disconnected.hotPipe.flow).toBeLessThan(connected.hotPipe.flow * 0.25);
    expect(disconnected.heatExchanger.efficiency).toBeLessThan(connected.heatExchanger.efficiency);
  });
});
