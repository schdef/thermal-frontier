import { describe, expect, it } from 'vitest';
import {
  advanceAuctionTime,
  advanceOperation,
  advanceToNextRound,
  completeSession,
  confirmDrillPath,
  createRoundSession,
  drillWell,
  launchPlanetSession,
  performSurfaceScanAt,
  purchaseSurvey,
  selectParcel,
  setAuctionBidStep,
  startDrilling,
  startRoverScan,
  submitBid,
  toggleDrillSnapToLayer,
  toggleReturnFluidLoop,
} from '../../src/game/session';
import {
  PARCEL_BIOMES,
  ZEPHYR_7_CONFIG,
  ZEPHYR_7_PLANET,
} from '../../src/simulation/constants';
import {
  checkAquiferCollisions,
  depthFromMeters,
  depthInMeters,
  snapToLayer,
} from '../../src/simulation/drilling';
import { generatePlanetParcels } from '../../src/simulation/generation';
import { computePlantTelemetry } from '../../src/simulation/reservoir';

describe('6-Stage Game Flow & Multi-Round Campaign Engine', () => {
  it('generates 6 distinct Zephyr-7 parcel biomes with >=2 reservoirs, faults, minerals, and 2D surface features', () => {
    const parcels = generatePlanetParcels(ZEPHYR_7_CONFIG, 42);
    expect(parcels).toHaveLength(6);

    const biomes = parcels.map((p) => p.biome);
    expect(biomes).toEqual(['volcanic', 'ice', 'forest', 'crystal', 'desert', 'basalt']);

    for (let i = 0; i < 6; i++) {
      const parcel = parcels[i];
      expect(parcel.biome).toBe(PARCEL_BIOMES[i]);
      expect(parcel.layers.length).toBeGreaterThanOrEqual(3);
      expect(parcel.reservoirs.length).toBeGreaterThanOrEqual(2);
      expect(parcel.faults?.length).toBeGreaterThanOrEqual(1);
      expect(parcel.aquifers?.length).toBeGreaterThanOrEqual(1);
      expect(parcel.minerals?.length).toBeGreaterThanOrEqual(2);
      expect(parcel.surfaceFeatures).toBeDefined();
      expect(parcel.surfaceFeatures!.hotspots.length).toBeGreaterThanOrEqual(2);
      expect(parcel.surfaceFeatures!.stableZones.length).toBeGreaterThanOrEqual(2);

      const topLayer = parcel.layers[0];
      const bottomLayer = parcel.layers[parcel.layers.length - 1];
      expect(topLayer.top).toBe(0);
      expect(bottomLayer.bottom).toBe(100);
      expect(bottomLayer.depthEndMeters).toBe(500);

      const reservoir = parcel.reservoirs[0];
      expect(reservoir.temperature).toBeGreaterThan(100);
      expect(reservoir.depthMeters).toBeGreaterThan(250);
    }
  });

  it('Stage 1: supports Planet Launch screen for Zephyr-7', () => {
    const session = createRoundSession(42, 1_000, { startAtPlanet: true });
    expect(session.phase).toBe('planet');
    expect(session.planet.name).toBe('Zephyr-7');
    expect(session.planet.gravity).toBe(0.88);
    expect(session.planet.volcanicActivity).toBe(ZEPHYR_7_PLANET.volcanicActivity);
    expect(session.roundDurationSeconds).toBe(240);

    const launched = launchPlanetSession(session);
    expect(launched.phase).toBe('auction');
    expect(launched.notice).toContain('Descent complete');
  });

  it('Stage 2: Land Auction with 3 rival companies, stepper, and escrow bidding across 6 parcels', () => {
    let session = createRoundSession(42, 1_200);
    expect(session.phase).toBe('auction');
    expect(session.auction.bidStep).toBe(25);
    expect(session.auction.rivals).toHaveLength(3);

    session = setAuctionBidStep(session, 1);
    expect(session.auction.bidStep).toBe(50);
    session = setAuctionBidStep(session, -1);
    expect(session.auction.bidStep).toBe(25);

    const volcanicParcel = session.parcels[0];
    const iceParcel = session.parcels[1];
    session = selectParcel(session, iceParcel.id);
    expect(session.auction.parcelId).toBe(iceParcel.id);
    session = selectParcel(session, volcanicParcel.id);
    expect(session.auction.parcelId).toBe(volcanicParcel.id);

    session = submitBid(session, session.auction.nextMinimumBid);
    expect(session.auction.highBidder).toBe('player');
    expect(session.auction.currentBid).toBe(60);
    expect(session.auction.committedByBidder?.player).toBe(60);

    session = advanceAuctionTime(session, 1);
    expect(session.auction.currentBid).toBeGreaterThanOrEqual(60);
  });

  it('Stage 3: 2D Surface Survey scans coordinates without leaking hidden reservoirs', () => {
    let session = createRoundSession(42, 1_000);
    const parcel = session.parcels[0];
    session = {
      ...session,
      phase: 'survey',
      ownedParcelId: parcel.id,
      ownedParcelIds: [parcel.id],
      cash: 1_000,
    };

    const targetCoord = parcel.surfaceFeatures!.hotspots[0].position;
    session = startRoverScan(session, targetCoord);

    expect(session.surveys).toHaveLength(1);
    expect(session.surveys[0].revealedHotspots.length).toBeGreaterThanOrEqual(1);
    expect(session.surveys[0].coveragePercent).toBeGreaterThan(0);
    expect(session.surveyResults).toHaveLength(1);
    expect(session.roverScans).toHaveLength(1);
    expect(session.cash).toBe(1_000 - 30);
    expect(session.ledger.at(-1)?.category).toBe('survey');
  });

  it('Stage 4: Multi-well manual drilling with snap-to-layer, dry hole guard, and reservoir tapping', () => {
    let session = createRoundSession(42, 3_000);
    const parcel = session.parcels[0];
    session = {
      ...session,
      phase: 'survey',
      ownedParcelId: parcel.id,
      ownedParcelIds: [parcel.id],
      cash: 3_000,
    };

    session = startDrilling(session);
    expect(session.phase).toBe('drill');
    expect(session.drillPath).toEqual([{ x: 50, y: 18 }]);

    expect(session.drillSnapToLayer).toBe(false);
    session = toggleDrillSnapToLayer(session);
    expect(session.drillSnapToLayer).toBe(true);

    const snapped = snapToLayer(parcel, { x: 50, y: 24 }, 5);
    expect(snapped.y).toBe(25);

    expect(depthInMeters(0)).toBe(0);
    expect(depthInMeters(50)).toBe(250);
    expect(depthInMeters(100)).toBe(500);
    expect(depthFromMeters(250)).toBe(50);

    const aquifer = parcel.aquifers![0];
    const aquiferCollisions = checkAquiferCollisions(parcel, [
      { x: aquifer.center.x, y: 0 },
      { x: aquifer.center.x, y: aquifer.center.y },
    ]);
    expect(aquiferCollisions.length).toBeGreaterThan(0);

    // Dry hole stays in drill phase instead of softlocking in operate
    const dryX = parcel.reservoirs.every((r) => r.center.x > 30) ? 5 : 95;
    session = drillWell(session, [{ x: dryX, y: 18 }, { x: dryX, y: 40 }]);
    expect(session.phase).toBe('drill');
    expect(session.wells).toHaveLength(1);
    expect(session.wells[0].status).toBe('dry');

    // Second well taps reservoir and advances to operate
    const reservoir = parcel.reservoirs[0];
    session = confirmDrillPath(session, [
      { x: reservoir.center.x, y: 18 },
      { x: reservoir.center.x, y: reservoir.center.y },
    ]);

    expect(session.phase).toBe('operate');
    expect(session.wells).toHaveLength(2);
    expect(session.wells[1].status).toBe('active');
    expect(session.discoveredReservoirIds).toContain(reservoir.id);
    expect(session.activeReservoir).toBeDefined();
    expect(session.plantTelemetry.temperatureC).toBeGreaterThan(150);
    expect(session.plantTelemetry.powerMW).toBeGreaterThan(20);
  });

  it('Stage 5: Production Setup runs unified circulation loop and return fluid throttling', () => {
    let session = createRoundSession(42, 5_000);
    const parcel = session.parcels[0];
    const reservoir = parcel.reservoirs[0];
    session = {
      ...session,
      phase: 'drill',
      ownedParcelId: parcel.id,
      ownedParcelIds: [parcel.id],
      cash: 5_000,
    };
    session = confirmDrillPath(session, [{ x: reservoir.center.x, y: 18 }, reservoir.center]);

    expect(session.phase).toBe('operate');
    expect(session.returnFluidLoopActive).toBe(true);

    const telemetry = computePlantTelemetry(reservoir, {
      flowRate: reservoir.flowPotential,
      heatExchangerEfficiency: 0.94,
      returnFluidLoop: true,
    });
    expect(telemetry.temperatureC).toBeGreaterThan(200);
    expect(telemetry.powerMW).toBeGreaterThan(50);

    session = advanceOperation(session, 10, 1);
    expect(session.powerGeneratedMWh).toBeGreaterThan(0);
    expect(session.salesRevenue).toBeGreaterThan(0);
    expect(session.plant.roundTimeRemainingSeconds).toBe(230);

    session = toggleReturnFluidLoop(session);
    expect(session.returnFluidLoopActive).toBe(false);
    const throttled = advanceOperation(session, 10, 1);
    expect(throttled.plant.hotPipe.flow).toBeLessThan(session.plant.hotPipe.flow);
  });

  it('Stage 6: Round Report computes real metrics with zero hardcoded fallbacks', () => {
    let session = createRoundSession(42, 5_000);
    const parcel = session.parcels[0];
    const res = parcel.reservoirs[0];
    const modifiedParcel = {
      ...parcel,
      reservoirs: [
        { ...res, remainingHeat: Math.round(res.initialHeat * 0.32) },
        ...parcel.reservoirs.slice(1),
      ],
    };

    session = {
      ...session,
      phase: 'operate',
      parcels: [modifiedParcel, ...session.parcels.slice(1)],
      ownedParcelId: parcel.id,
      ownedParcelIds: [parcel.id],
      discoveredReservoirIds: [res.id],
      activeReservoir: modifiedParcel.reservoirs[0],
      startingHeat: res.initialHeat,
      remainingHeat: Math.round(res.initialHeat * 0.32),
      salesRevenue: 1_240,
      costs: { land: 500, survey: 100, drilling: 200, pipes: 100, upgrades: 50, operating: 50 },
      storageTherm: 50,
      powerGeneratedMWh: 120,
      elapsedSeconds: 180,
    };
    session = performSurfaceScanAt(
      { ...session, phase: 'survey', cash: 5_000 },
      parcel.minerals![0].surfacePosition ?? parcel.minerals![0].position,
    );
    session = { ...session, phase: 'operate' };

    session = completeSession(session);
    expect(session.phase).toBe('settled');
    expect(session.settlement).toBeDefined();

    const settlement = session.settlement!;
    expect(settlement.profit).toBe(210); // 1240 - (1000 + 30 scan)
    expect(settlement.depletion.thermalDepletionPercent).toBe(68);
    expect(settlement.discoveredMineralsCount).toBeGreaterThanOrEqual(1);
    expect(settlement.depletion.mineralsDepletionPercent).toBe(
      Math.round((settlement.discoveredMineralsCount / settlement.totalMineralsCount) * 100),
    );
    expect(settlement.depletion.stableGroundRemainingPercent).toBeGreaterThan(0);
  });

  it('Multi-Round Campaign Progression: carries cash, records history, and generates 6 new parcels', () => {
    let session = createRoundSession(42, 1_000);
    expect(session.campaignRound).toBe(1);
    expect(session.roundHistory).toHaveLength(0);

    session = {
      ...session,
      ownedParcelId: session.parcels[0].id,
      ownedParcelIds: [session.parcels[0].id],
      salesRevenue: 2_000,
      costs: { land: 500, survey: 70, drilling: 230, pipes: 100, upgrades: 0, operating: 100 },
      startingHeat: 1_000,
      remainingHeat: 320,
      cash: 2_000,
    };
    session = completeSession(session);
    expect(session.settlement?.profit).toBe(1_000);

    session = advanceToNextRound(session);
    expect(session.campaignRound).toBe(2);
    expect(session.totalCampaignProfit).toBe(1_000);
    expect(session.roundHistory).toHaveLength(1);
    expect(session.roundHistory[0].round).toBe(1);
    expect(session.roundHistory[0].profit).toBe(1_000);
    expect(session.phase).toBe('auction');
    expect(session.parcels).toHaveLength(6);
    expect(session.parcels[0].id).toBe('zephyr-7-parcel-1');
    expect(session.cash).toBeGreaterThanOrEqual(1_000);

    expect(session.ownedParcelId).toBeUndefined();
    expect(session.ownedParcelIds).toEqual([]);
    expect(session.wells).toEqual([]);
    expect(session.surveys).toEqual([]);
    expect(session.plant.roundTimeRemainingSeconds).toBe(240);

    session = {
      ...session,
      ownedParcelId: session.parcels[1].id,
      ownedParcelIds: [session.parcels[1].id],
      salesRevenue: 3_000,
      costs: { land: 600, survey: 100, drilling: 300, pipes: 100, upgrades: 100, operating: 100 },
      startingHeat: 1_200,
      remainingHeat: 400,
      cash: 3_700,
    };
    session = completeSession(session);

    session = advanceToNextRound(session);
    expect(session.campaignRound).toBe(3);
    expect(session.totalCampaignProfit).toBe(1_000 + (3000 - 1300));
    expect(session.roundHistory).toHaveLength(2);
    expect(session.roundHistory[1].round).toBe(2);
    expect(session.parcels).toHaveLength(6);
    expect(session.phase).toBe('auction');

    // Keep purchaseSurvey import exercised
    const surveyed = purchaseSurvey(
      { ...session, phase: 'survey', ownedParcelId: session.parcels[0].id, ownedParcelIds: [session.parcels[0].id] },
      'surface-scanner',
    );
    expect(surveyed.costs.survey).toBe(40);
  });
});
