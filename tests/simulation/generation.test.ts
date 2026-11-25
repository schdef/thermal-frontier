import { describe, expect, it } from 'vitest';
import { FROST_3_CONFIG, MAGMA_9_CONFIG, ZEPHYR_7_CONFIG } from '../../src/simulation/constants';
import { generateCaldera7Parcels, generatePlanetParcels } from '../../src/simulation/generation';
import { getPlanetConfig, isPlanetPlayable, listPlanets } from '../../src/simulation/planets';

describe('PlanetSystem and 6-parcel generation', () => {
  it('exposes Zephyr-7 as playable and preview planets as locked', () => {
    const planets = listPlanets();
    expect(planets.length).toBeGreaterThanOrEqual(3);
    expect(isPlanetPlayable('zephyr-7')).toBe(true);
    expect(isPlanetPlayable(FROST_3_CONFIG.id)).toBe(false);
    expect(isPlanetPlayable(MAGMA_9_CONFIG.id)).toBe(false);
    expect(getPlanetConfig('zephyr-7').id).toBe(ZEPHYR_7_CONFIG.id);
    expect(getPlanetConfig('unknown-id').id).toBe('zephyr-7');
  });

  it('generates six deterministic parcels from a planet config and seed', () => {
    const first = generatePlanetParcels(ZEPHYR_7_CONFIG, 42);
    const second = generatePlanetParcels(ZEPHYR_7_CONFIG, 42);

    expect(first).toHaveLength(6);
    expect(first).toEqual(second);
    expect(new Set(first.map((parcel) => parcel.id)).size).toBe(6);
    expect(first.every((parcel) => parcel.planetId === 'zephyr-7')).toBe(true);
    expect(first.every((parcel) => parcel.reservoirs.length >= 2)).toBe(true);
    expect(first.every((parcel) => (parcel.faults?.length ?? 0) >= 1)).toBe(true);
    expect(first.every((parcel) => parcel.surfaceFeatures !== undefined)).toBe(true);
  });

  it('keeps compatibility wrapper deterministic and changes layout with seed', () => {
    const legacy = generateCaldera7Parcels(42);
    const planetParcels = generatePlanetParcels(ZEPHYR_7_CONFIG, 42);
    expect(legacy).toHaveLength(6);
    expect(legacy[0].reservoirs).toHaveLength(planetParcels[0].reservoirs.length);
    expect(legacy[0].biome).toBe(planetParcels[0].biome);
    expect(generateCaldera7Parcels(42)).not.toEqual(generateCaldera7Parcels(43));
  });

  it('never leaks exact reservoir coordinates or heat inventory in publicClues', () => {
    const parcels = generatePlanetParcels(ZEPHYR_7_CONFIG, 99);
    for (const parcel of parcels) {
      const cluesRecord = parcel.publicClues as unknown as Record<string, unknown>;
      expect(cluesRecord.reservoirs).toBeUndefined();
      expect(cluesRecord.depthMeters).toBeUndefined();
      expect(cluesRecord.initialHeat).toBeUndefined();
      expect(parcel.publicClues.surfaceTemperature).toBeTypeOf('number');
      expect(parcel.publicClues.surfaceHeatSignal).toMatch(/low|moderate|high/);
    }
  });
});
