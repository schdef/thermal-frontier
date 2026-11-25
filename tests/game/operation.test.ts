import { describe, expect, it } from 'vitest';
import {
  advanceOperation,
  confirmDrillPath,
  createRoundSession,
  purchaseUpgrade,
  setExtractionRate,
  setSimulationSpeed,
  tickSession,
  toggleSimulationPause,
} from '../../src/game/session';

describe('networked operation & simulation loop', () => {
  it('routes produced heat through the closed circulation network and updates PlantChainState', () => {
    let session = createRoundSession(42, 10_000);
    const parcel = session.parcels[0];
    const reservoir = parcel.reservoirs[0];
    session = {
      ...session,
      phase: 'drill',
      ownedParcelId: parcel.id,
      ownedParcelIds: [parcel.id],
    };
    session = confirmDrillPath(session, [{ x: reservoir.center.x, y: 18 }, reservoir.center]);

    const operated = advanceOperation(session, 30);

    expect(operated.pipeFlow).toBeGreaterThan(0);
    expect(operated.pipeHeatLoss).toBeGreaterThanOrEqual(0);
    expect(operated.powerGeneratedMWh).toBeGreaterThan(0);
    expect(operated.salesRevenue).toBeGreaterThan(0);
    expect(operated.plant.roundTimeRemainingSeconds).toBe(210);
  });

  it('respects pause and speed multipliers via tickSession and completes at 240s', () => {
    let session = createRoundSession(42, 10_000);
    const parcel = session.parcels[0];
    const reservoir = parcel.reservoirs[0];
    session = {
      ...session,
      phase: 'drill',
      ownedParcelId: parcel.id,
      ownedParcelIds: [parcel.id],
    };
    session = confirmDrillPath(session, [{ x: reservoir.center.x, y: 18 }, reservoir.center]);

    session = toggleSimulationPause(session);
    const pausedTick = tickSession(session, 10);
    expect(pausedTick.elapsedSeconds).toBe(0);
    expect(pausedTick.plant.operatingState).toBe('paused');

    session = toggleSimulationPause(pausedTick);
    session = setSimulationSpeed(session, 3);
    const fastTick = tickSession(session, 10);
    expect(fastTick.elapsedSeconds).toBe(30);
    expect(fastTick.plant.roundTimeRemainingSeconds).toBe(210);

    const endTick = tickSession(fastTick, 100);
    expect(endTick.plant.operatingState).toBe('completed');
    expect(endTick.plant.roundTimeRemainingSeconds).toBe(0);
    expect(endTick.settlement).toBeDefined();
  });

  it('applies the three upgrades and updates ledger & PlantChainState', () => {
    const session = createRoundSession(42, 10_000);
    const upgraded = purchaseUpgrade(
      purchaseUpgrade(purchaseUpgrade(session, 'drill'), 'pipes'),
      'exchanger',
    );

    expect(upgraded.upgrades).toEqual({ drill: 1, pipes: 1, exchanger: 1 });
    expect(upgraded.costs.upgrades).toBe(420);
    expect(upgraded.pipeType).toBe('insulated');
    expect(upgraded.plant.hotPipe.type).toBe('insulated');
    expect(upgraded.plant.heatExchanger.upgradeLevel).toBe(1);
    expect(upgraded.ledger).toHaveLength(3);
  });

  it('adjusts extraction rate across active wells and updates plant flow & output', () => {
    let session = createRoundSession(42, 10_000);
    const parcel = session.parcels[0];
    const reservoir = parcel.reservoirs[0];
    session = {
      ...session,
      phase: 'drill',
      ownedParcelId: parcel.id,
      ownedParcelIds: [parcel.id],
    };
    session = confirmDrillPath(session, [{ x: reservoir.center.x, y: 18 }, reservoir.center]);

    const lowFlow = setExtractionRate(session, 3);
    expect(lowFlow.plant.wellFlow).toBe(3);
    const lowTick = tickSession(lowFlow, 10);

    const highFlow = setExtractionRate(session, 8);
    expect(highFlow.plant.wellFlow).toBe(8);
    const highTick = tickSession(highFlow, 10);

    expect(highTick.powerGeneratedMWh).toBeGreaterThan(lowTick.powerGeneratedMWh);
  });
});
