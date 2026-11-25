import { describe, expect, it } from 'vitest';
import { ZEPHYR_7_CONFIG } from '../../src/simulation/constants';
import { generatePlanetParcels } from '../../src/simulation/generation';
import { performRoverScan, performSurfaceScan, performSurvey } from '../../src/simulation/survey';

describe('2D surface survey', () => {
  it('scans 2D top-down surface clues within radius and computes coverage without exposing reservoirs', () => {
    const parcel = generatePlanetParcels(ZEPHYR_7_CONFIG, 12)[0];
    const targetHotspot = parcel.surfaceFeatures!.hotspots[0];

    const scan = performSurfaceScan(parcel, targetHotspot.position, 22, 30);
    expect(scan.cost).toBe(30);
    expect(scan.revealedHotspots.some((h) => h.id === targetHotspot.id)).toBe(true);
    expect(scan.coveragePercent).toBeGreaterThan(0);
    expect((scan as unknown as Record<string, unknown>).reservoirs).toBeUndefined();

    // Far away scan should not find out-of-range hotspots
    const farPoint = {
      x: targetHotspot.position.x > 50 ? 5 : 95,
      y: targetHotspot.position.y > 50 ? 5 : 95,
    };
    const farScan = performSurfaceScan(parcel, farPoint, 10, 30, [scan]);
    expect(farScan.revealedHotspots.some((h) => h.id === targetHotspot.id)).toBe(false);
    expect(farScan.coveragePercent).toBeGreaterThanOrEqual(scan.coveragePercent);
  });

  it('returns a cheap broad hint without exposing exact reservoir inventory', () => {
    const parcel = generatePlanetParcels(ZEPHYR_7_CONFIG, 3)[0];
    const result = performSurvey(parcel, 'surface-scanner');

    expect(result.cost).toBeGreaterThan(0);
    expect(result.revealed).toContain('surface temperature anomaly');
    expect(result.exactReservoirInventory).toBeUndefined();
  });

  it('returns approximate gradient bands without leaking exact hidden reservoir temperature or coordinates', () => {
    const parcel = generatePlanetParcels(ZEPHYR_7_CONFIG, 3)[0];
    const probePoint = { x: 50, y: 70 };
    const result = performSurvey(parcel, 'deep-probe', probePoint);

    expect(result.cost).toBeGreaterThan(0);
    expect(result.temperatureRange).toBeDefined();
    expect(result.pressureRange).toBeDefined();
    expect(result.coordinates).toEqual(probePoint);
    expect(result.exactReservoirInventory).toBeUndefined();
  });

  it('uses consistent 2D distance for rover scans', () => {
    const parcel = generatePlanetParcels(ZEPHYR_7_CONFIG, 7)[0];
    const mineral = parcel.minerals![0];
    const surfacePos = mineral.surfacePosition ?? mineral.position;

    const hit = performRoverScan(parcel, surfacePos, 15);
    expect(hit.mineralsFound.some((m) => m.id === mineral.id)).toBe(true);

    const missPos = { x: surfacePos.x, y: surfacePos.y > 50 ? 5 : 95 };
    const miss = performRoverScan(parcel, missPos, 15);
    expect(miss.mineralsFound.some((m) => m.id === mineral.id)).toBe(false);
  });
});
