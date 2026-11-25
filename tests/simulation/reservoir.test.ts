import { describe, expect, it } from 'vitest';
import { generateCaldera7Parcels } from '../../src/simulation/generation';
import {
  computePlantTelemetry,
  deriveReservoirTemperature,
  produceFromReservoir,
} from '../../src/simulation/reservoir';
import type { Reservoir } from '../../src/simulation/types';

describe('finite reservoirs & deterministic temperature curve', () => {
  it('consumes thermal inventory and lowers output as the reservoir depletes', () => {
    const reservoir = generateCaldera7Parcels(6)[0].reservoirs[0];
    const first = produceFromReservoir(reservoir, { flowRate: 10, seconds: 60 });
    const second = produceFromReservoir(first.reservoir, { flowRate: 10, seconds: 60 });

    expect(first.thermalOutput).toBeGreaterThan(0);
    expect(second.thermalOutput).toBeGreaterThan(0);
    expect(first.reservoir.remainingHeat).toBeLessThan(reservoir.remainingHeat);
    expect(second.thermalOutput).toBeLessThan(first.thermalOutput);
    expect(first.temperature).toBeCloseTo(
      deriveReservoirTemperature(reservoir, first.reservoir.remainingHeat),
      8,
    );
  });

  it('produces identical remainingHeat and temperature across 1x60s vs 60x1s ticks (no exponential compounding bug)', () => {
    const base = generateCaldera7Parcels(12)[0].reservoirs[0];
    const singleStep = produceFromReservoir(base, { flowRate: 8, seconds: 60 });

    let stepped = base;
    let totalExtracted = 0;
    for (let i = 0; i < 60; i++) {
      const res = produceFromReservoir(stepped, { flowRate: 8, seconds: 1 });
      stepped = res.reservoir;
      totalExtracted += res.thermalOutput;
    }

    expect(stepped.remainingHeat).toBeCloseTo(singleStep.reservoir.remainingHeat, 6);
    expect(stepped.temperature).toBeCloseTo(singleStep.temperature, 6);
    expect(totalExtracted).toBeCloseTo(singleStep.thermalOutput, 6);
  });

  it('never replenishes, never goes negative, and stops automatically when depleted', () => {
    const reservoir = generateCaldera7Parcels(7)[0].reservoirs[0];
    const result = produceFromReservoir(reservoir, { flowRate: 1_000_000, seconds: 1_000_000 });

    expect(result.reservoir.remainingHeat).toBe(0);
    expect(result.thermalOutput).toBeCloseTo(reservoir.remainingHeat, 8);
    expect(result.depleted).toBe(true);

    const afterDepletion = produceFromReservoir(result.reservoir, { flowRate: 10, seconds: 30 });
    expect(afterDepletion.thermalOutput).toBe(0);
    expect(afterDepletion.fluidFlow).toBe(0);
    expect(afterDepletion.depleted).toBe(true);
    expect(afterDepletion.reservoir.remainingHeat).toBe(0);

    const telemetry = computePlantTelemetry(afterDepletion.reservoir, { flowRate: 10 });
    expect(telemetry.powerMW).toBe(0);
    expect(telemetry.exportRateMW).toBe(0);
    expect(telemetry.returnFluidLoopFlow).toBe(0);
    expect(telemetry.thermalDepletionPercent).toBe(100);
  });

  it('enforces maxExtractionRate when lower than flowPotential', () => {
    const base: Reservoir = {
      id: 'res-capped',
      center: { x: 50, y: 70 },
      radius: 10,
      initialTemperature: 300,
      temperature: 300,
      pressure: 80,
      flowPotential: 12,
      maxExtractionRate: 4,
      initialHeat: 1_000,
      remainingHeat: 1_000,
    };
    const capped = produceFromReservoir(base, { flowRate: 12, seconds: 10 });
    const uncapped = produceFromReservoir({ ...base, maxExtractionRate: 12 }, { flowRate: 12, seconds: 10 });

    expect(capped.fluidFlow).toBe(4);
    expect(capped.thermalOutput).toBeLessThan(uncapped.thermalOutput);
  });
});
