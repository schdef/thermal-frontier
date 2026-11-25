import { describe, expect, it } from 'vitest';
import { ZEPHYR_7_CONFIG } from '../../src/simulation/constants';
import { generatePlanetParcels } from '../../src/simulation/generation';
import { settleGameState, settleRound } from '../../src/simulation/settlement';
import { createInitialPlantChainState, updateSimulation } from '../../src/simulation/update';
import type { GameState } from '../../src/game/types';

describe('round settlement (real computed metrics, zero hardcoded placeholders)', () => {
  it('returns an auditable ledger, profit, and zeroed defaults when untouched', () => {
    const result = settleRound({
      revenue: 1_000,
      costs: { land: 180, survey: 40, drilling: 100, pipes: 60, upgrades: 50, operating: 20 },
      remainingHeat: 400,
      startingHeat: 1_000,
      unsoldTH: 10,
      closingPrice: 50,
    });

    expect(result.totalCosts).toBe(450);
    expect(result.constructionCost).toBe(110);
    expect(result.profit).toBe(550);
    expect(result.depletionFraction).toBeCloseTo(0.6);
    expect(result.depletion.thermalDepletionPercent).toBe(60);
    expect(result.depletion.thermalRemainingPercent).toBe(40);
    expect(result.depletion.mineralsDepletionPercent).toBe(0);
    expect(result.depletion.stableGroundRemainingPercent).toBe(100);
    expect(result.unsoldValue).toBe(500);
    expect(result.roiPercent).toBeCloseTo(122.2, 1);

    const zeroDepletion = settleRound({
      revenue: 0,
      costs: { land: 100, survey: 0, drilling: 0, pipes: 0, upgrades: 0, operating: 0 },
      remainingHeat: 1_000,
      startingHeat: 1_000,
      unsoldTH: 0,
      closingPrice: 120,
    });
    expect(zeroDepletion.depletion.thermalDepletionPercent).toBe(0);
    expect(zeroDepletion.depletion.thermalRemainingPercent).toBe(100);
    expect(zeroDepletion.depletion.mineralsDepletionPercent).toBe(0);
    expect(zeroDepletion.depletion.stableGroundRemainingPercent).toBe(100);
  });

  it('computes real settlement metrics from GameState including minerals, stability, MW, and ROI', () => {
    const parcels = generatePlanetParcels(ZEPHYR_7_CONFIG, 42);
    const parcel = parcels[0];
    const reservoir = parcel.reservoirs[0];
    const mineral = parcel.minerals![0];

    const state: GameState = {
      schemaVersion: 2,
      seed: 42,
      planetId: ZEPHYR_7_CONFIG.id,
      planet: ZEPHYR_7_CONFIG,
      phase: 'operate',
      cash: 600,
      startingCash: 1000,
      ledger: [],
      parcels,
      auctions: {},
      auction: {
        parcelId: parcel.id,
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
      selectedParcelId: parcel.id,
      ownedParcelIds: [parcel.id],
      ownedParcelId: parcel.id,
      surveys: [
        {
          id: 'scan-1',
          parcelId: parcel.id,
          center: mineral.surfacePosition ?? mineral.position,
          radius: 22,
          cost: 30,
          timestamp: 1,
          revealedHotspots: [],
          revealedMinerals: [mineral],
          revealedFaultHints: [],
          revealedStableZones: [],
          approximateThermalZones: [],
          coveragePercent: 18,
        },
      ],
      surveyResults: [],
      roverScans: [],
      wells: [
        {
          id: 'well-1',
          name: 'Well 1',
          parcelId: parcel.id,
          path: [{ x: 50, y: 18 }, reservoir.center],
          totalLength: 60,
          maxDepth: reservoir.depthMeters ?? 360,
          cost: 150,
          crossedLayers: ['ashstone', 'fracture', 'obsidian'],
          intersectedFaults: parcel.faults?.slice(0, 1).map((f) => f.id) ?? [],
          intersectedAquifers: [],
          tappedReservoirIds: [reservoir.id],
          flowContribution: reservoir.flowPotential,
          wellheadTempC: reservoir.temperature,
          status: 'active',
        },
      ],
      drillPath: [{ x: 50, y: 18 }, reservoir.center],
      drillSnapToLayer: false,
      discoveredReservoirIds: [reservoir.id],
      activeReservoir: reservoir,
      startingHeat: reservoir.initialHeat,
      remainingHeat: reservoir.remainingHeat,
      plant: createInitialPlantChainState({ pipeType: 'insulated', networkLength: 30 }),
      plantTelemetry: {
        temperatureC: reservoir.temperature,
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
      networkLength: 30,
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
      notice: '',
    };

    const run = updateSimulation(120, state);
    const settlement = settleGameState(run);

    expect(settlement.discoveredMineralsCount).toBeGreaterThanOrEqual(1);
    expect(settlement.totalMineralsCount).toBe(parcel.minerals!.length);
    expect(settlement.thermalExtractedTH).toBeGreaterThan(0);
    expect(settlement.depletion.thermalDepletionPercent).toBeGreaterThan(0);
    expect(settlement.powerGeneratedMWh).toBeGreaterThan(0);
    expect(settlement.avgOutputMW).toBeGreaterThan(0);
    expect(settlement.peakOutputMW).toBeGreaterThanOrEqual(settlement.avgOutputMW);
    expect(settlement.utilizationPercent).toBeGreaterThan(0);
    expect(settlement.wellsDrilled).toBe(1);
    expect(settlement.reservoirsTapped).toBe(1);
    expect(settlement.groundStabilityScore).toBeGreaterThanOrEqual(0);
    expect(settlement.groundStabilityScore).toBeLessThanOrEqual(100);
    expect(settlement.totalCosts).toBeCloseTo(run.costs.land + run.costs.survey + run.costs.drilling + run.costs.pipes + run.costs.upgrades + run.costs.operating, 6);
  });
});
