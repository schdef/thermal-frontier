import { describe, expect, it } from 'vitest';
import { ZEPHYR_7_CONFIG } from '../../src/simulation/constants';
import { generatePlanetParcels } from '../../src/simulation/generation';
import {
  calculateElectricityExport,
  DEFAULT_MARKET_PRICE_PER_MWH,
  getMarketPricePerMWh,
  marketPriceAt,
} from '../../src/simulation/market';
import {
  createInitialPlantChainState,
  isDepletionStopCondition,
  isRoundEnded,
  updateSimulation,
} from '../../src/simulation/update';
import type { GameState } from '../../src/game/types';

function makeOperateState(overrides?: Partial<GameState>): GameState {
  const parcels = generatePlanetParcels(ZEPHYR_7_CONFIG, 42);
  const ownedParcel = parcels[0];
  const primaryRes = ownedParcel.reservoirs[0];
  const plant = createInitialPlantChainState({
    pipeType: 'insulated',
    networkLength: 35,
    storageCapacityTH: 500,
    exportCapacityMW: 150,
    marketPricePerMWh: 120,
    roundDurationSeconds: 240,
  });

  return {
    schemaVersion: 2,
    seed: 42,
    planetId: ZEPHYR_7_CONFIG.id,
    planet: ZEPHYR_7_CONFIG,
    phase: 'operate',
    cash: 500,
    startingCash: 1000,
    ledger: [],
    parcels,
    auctions: {},
    auction: {
      parcelId: ownedParcel.id,
      status: 'ended',
      openingBid: 50,
      minimumIncrement: 10,
      currentBid: 200,
      highBidder: 'player',
      nextMinimumBid: 210,
      timeRemainingSeconds: 0,
      activeBidders: ['player'],
      withdrawnBidders: [],
      playerBudget: 800,
      rivalBudgets: [600, 700, 500],
      rivalMaxBids: [400, 450, 350],
    },
    selectedParcelId: ownedParcel.id,
    ownedParcelIds: [ownedParcel.id],
    ownedParcelId: ownedParcel.id,
    surveys: [],
    surveyResults: [],
    roverScans: [],
    wells: [
      {
        id: 'well-1',
        name: 'Well Alpha',
        parcelId: ownedParcel.id,
        path: [{ x: 50, y: 18 }, primaryRes.center],
        totalLength: 60,
        maxDepth: primaryRes.depthMeters ?? 350,
        cost: 150,
        crossedLayers: ['ashstone', 'fracture', 'obsidian'],
        intersectedFaults: [],
        intersectedAquifers: [],
        tappedReservoirIds: [primaryRes.id],
        flowContribution: primaryRes.flowPotential,
        wellheadTempC: primaryRes.temperature,
        status: 'active',
      },
    ],
    drillPath: [{ x: 50, y: 18 }, primaryRes.center],
    drillSnapToLayer: false,
    discoveredReservoirIds: [primaryRes.id],
    activeReservoir: primaryRes,
    startingHeat: primaryRes.initialHeat,
    remainingHeat: primaryRes.remainingHeat,
    plant,
    plantTelemetry: {
      temperatureC: primaryRes.temperature,
      powerMW: 0,
      heatExchangerEfficiency: 0.94,
      storageTankLevelTH: 0,
      storageTankCapacityTH: 500,
      exportRateMW: 0,
      gridExportPrice: 120,
      returnFluidLoopFlow: 0,
      returnFluidTemperature: 25,
      closedLoopPressureBar: 60,
      totalEnergyExportedMWh: 0,
    },
    resourceDepletion: {
      thermalDepletionPercent: 0,
      thermalRemainingPercent: 100,
      mineralsDepletionPercent: 0,
      stableGroundDepletionPercent: 0,
      stableGroundRemainingPercent: 100,
    },
    storageTherm: 0,
    storageCapacity: 500,
    pipeType: 'insulated',
    networkLength: 35,
    pipeFlow: 0,
    pipeHeatLoss: 0,
    pipeOutletTemperature: 0,
    upgrades: { drill: 0, pipes: 0, exchanger: 0 },
    returnFluidLoopActive: true,
    lastOutput: 0,
    speed: 1,
    isPaused: false,
    elapsedSeconds: 0,
    roundDurationSeconds: 240,
    currentPrice: 120,
    salesRevenue: 0,
    costs: { land: 200, survey: 30, drilling: 150, pipes: 40, upgrades: 0, operating: 0 },
    powerGeneratedMWh: 0,
    campaignRound: 1,
    totalCampaignProfit: 0,
    careerRevenue: 0,
    roundHistory: [],
    notice: 'Ready',
    ...overrides,
  };
}

describe('electricity market & unified updateSimulation', () => {
  it('provides stable configurable marketPricePerMWh for MVP and deterministic dynamic curve', () => {
    expect(getMarketPricePerMWh()).toBe(DEFAULT_MARKET_PRICE_PER_MWH);
    expect(getMarketPricePerMWh({ marketPricePerMWh: 145 })).toBe(145);
    expect(getMarketPricePerMWh({ marketPricePerMWh: 999 })).toBe(200);

    expect(marketPriceAt(30)).toBe(marketPriceAt(30));
    expect(marketPriceAt(30)).not.toBe(marketPriceAt(90));
    for (const time of [0, 30, 120, 300, 600]) {
      const price = marketPriceAt(time);
      expect(price).toBeGreaterThan(0);
      expect(price).toBeLessThanOrEqual(200);
    }

    const exported = calculateElectricityExport(100, 3600, 120);
    expect(exported.mwhExported).toBeCloseTo(100, 8);
    expect(exported.revenue).toBeCloseTo(12_000, 8);
  });

  it('is frame-rate independent (1x30s matches 60x0.5s) and respects pause/speed', () => {
    const initial = makeOperateState();

    const paused = updateSimulation(10, { ...initial, isPaused: true });
    expect(paused.elapsedSeconds).toBe(0);
    expect(paused.plant.operatingState).toBe('paused');
    expect(paused.remainingHeat).toBe(initial.remainingHeat);

    const speedZero = updateSimulation(10, { ...initial, speed: 0 });
    expect(speedZero.elapsedSeconds).toBe(0);
    expect(speedZero.plant.operatingState).toBe('paused');

    const single = updateSimulation(30, initial);
    let stepped = initial;
    for (let i = 0; i < 60; i++) {
      stepped = updateSimulation(0.5, stepped);
    }

    expect(stepped.elapsedSeconds).toBeCloseTo(single.elapsedSeconds, 6);
    expect(stepped.remainingHeat).toBeCloseTo(single.remainingHeat, 6);
    expect(stepped.salesRevenue).toBeCloseTo(single.salesRevenue, 6);
    expect(stepped.powerGeneratedMWh).toBeCloseTo(single.powerGeneratedMWh, 6);
    expect(stepped.costs.operating).toBeCloseTo(single.costs.operating, 6);

    const fast = updateSimulation(10, { ...initial, speed: 3 });
    expect(fast.elapsedSeconds).toBeCloseTo(30, 6);
    expect(fast.salesRevenue).toBeCloseTo(single.salesRevenue, 6);
  });

  it('buffers excess thermal energy up to storageCapacityTH and caps export at exportCapacityMW', () => {
    const initial = makeOperateState();
    const bufferedState = updateSimulation(20, {
      ...initial,
      plant: { ...initial.plant, exportActive: false },
    });

    expect(bufferedState.plant.storageTankTH).toBeGreaterThan(0);
    expect(bufferedState.plant.storageTankTH).toBeLessThanOrEqual(bufferedState.plant.storageCapacityTH);
    expect(bufferedState.plant.totalExportedMWh).toBe(0);

    // Turning export back on discharges the buffer up to exportCapacityMW
    const exporting = updateSimulation(10, {
      ...bufferedState,
      plant: { ...bufferedState.plant, exportActive: true },
    });
    expect(exporting.plant.exportRateMW).toBeLessThanOrEqual(exporting.plant.exportCapacityMW + 0.1);
    expect(exporting.plant.totalExportedMWh).toBeGreaterThan(0);
    expect(exporting.salesRevenue).toBeGreaterThan(0);
  });

  it('flags reservoir depletion stop condition and round-end completion at 240s', () => {
    const initial = makeOperateState();
    const tinyReservoir = {
      ...initial.parcels[0].reservoirs[0],
      initialHeat: 20,
      remainingHeat: 20,
    };
    const tinyParcels = initial.parcels.map((p, idx) =>
      idx === 0 ? { ...p, reservoirs: [tinyReservoir, p.reservoirs[1]] } : p,
    );

    const depleted = updateSimulation(30, {
      ...initial,
      parcels: tinyParcels,
      activeReservoir: tinyReservoir,
      startingHeat: 20,
      remainingHeat: 20,
    });
    expect(isDepletionStopCondition(depleted)).toBe(true);
    expect(depleted.plant.operatingState).toBe('depleted');
    expect(depleted.remainingHeat).toBe(0);

    const ended = updateSimulation(240, initial);
    expect(isRoundEnded(ended)).toBe(true);
    expect(ended.plant.operatingState).toBe('completed');
    expect(ended.plant.roundTimeRemainingSeconds).toBe(0);
    expect(ended.settlement).toBeDefined();
  });
});
