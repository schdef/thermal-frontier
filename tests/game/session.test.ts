import { describe, expect, it } from 'vitest';
import {
  advanceAuctionTime,
  advanceOperation,
  completeSession,
  confirmDrillPath,
  continueGame,
  createRoundSession,
  deployEchoScanCar,
  performSurfaceScanAt,
  proceedToSurvey,
  purchaseDrillSpeedUpgrade,
  purchaseSurvey,
  resetGame,
  retryAuction,
  selectParcel,
  sellStoredTherm,
  settleSession,
  startNewGame,
  startOperation,
  submitBid,
} from '../../src/game/session';

describe('playable round session', () => {
  it('creates six deterministic parcels with 3 rival companies and switches selected auction', () => {
    const session = createRoundSession(42);
    expect(session.parcels).toHaveLength(6);
    expect(Object.keys(session.auctions)).toHaveLength(6);
    expect(session.auction.rivals).toHaveLength(3);

    const next = selectParcel(session, session.parcels[2].id);
    expect(next.auction.parcelId).toBe(session.parcels[2].id);
    expect(next.selectedParcelId).toBe(session.parcels[2].id);
  });

  it('tracks multi-parcel escrow, awards won parcel, charges surveys, and guards unaffordable purchases', () => {
    let session = createRoundSession(42, 1_000);
    session = submitBid(session, session.auction.nextMinimumBid);
    expect(session.auction.committedByBidder?.player).toBe(60);

    // Force player win on selected parcel
    session = {
      ...session,
      auction: {
        ...session.auction,
        activeBidders: ['player'],
        status: 'ended',
        highBidder: 'player',
        winnerId: 'player',
        finalPrice: session.auction.currentBid,
      },
    };
    session = submitBid(session, session.auction.currentBid);
    expect(session.phase).toBe('survey');
    expect(session.ownedParcelIds).toContain(session.parcels[0].id);
    expect(session.costs.land).toBe(60);
    expect(session.ledger.some((e) => e.category === 'land' && e.amount === 60)).toBe(true);

    const scanned = performSurfaceScanAt(session, { x: 40, y: 40 });
    expect(scanned.costs.survey).toBe(30);
    expect(scanned.surveys).toHaveLength(1);

    const scanner = purchaseSurvey(scanned, 'surface-scanner');
    expect(scanner.costs.survey).toBe(70);
    expect(purchaseSurvey({ ...scanner, cash: 0 }, 'deep-probe').notice).toContain('budget');
  });

  it('handles all 6 auctions closing without a player win and allows retrying', () => {
    let session = createRoundSession(42, 1_000);
    session = advanceAuctionTime(session, 35);
    expect(session.phase).toBe('auction');
    expect(session.ownedParcelIds).toHaveLength(0);
    expect(session.notice).toContain('Retry');

    const retried = retryAuction(session);
    expect(Object.values(retried.auctions).every((a) => a.status === 'open')).toBe(true);
  });

  it('drills into a finite reservoir, updates buffer/export, reconciles ledger, and settles', () => {
    let session = createRoundSession(42, 10_000);
    const parcel = session.parcels[0];
    session = {
      ...session,
      phase: 'drill',
      ownedParcelId: parcel.id,
      ownedParcelIds: [parcel.id],
      cash: 10_000,
    };
    const path = [{ x: parcel.reservoirs[0].center.x, y: 18 }, parcel.reservoirs[0].center];
    session = confirmDrillPath(session, path);
    expect(session.phase).toBe('operate');

    session = startOperation(session);
    const operated = advanceOperation(session, 60, 1);
    expect(operated.remainingHeat).toBeLessThan(operated.startingHeat);
    expect(operated.powerGeneratedMWh).toBeGreaterThan(0);

    // Test manual buffer sale if any storage remains
    const withBuffer = { ...operated, storageTherm: 50, plant: { ...operated.plant, storageTankTH: 50 } };
    const sold = sellStoredTherm(withBuffer, 50);
    expect(sold.salesRevenue).toBeGreaterThan(operated.salesRevenue);
    expect(settleSession(sold).profit).toBeTypeOf('number');

    const completed = completeSession(sold);
    expect(completed.phase).toBe('settled');
    expect(completed.ledger.some((e) => e.category === 'sale')).toBe(true);
  });

  it('supports startNewGame, continueGame, resetGame, and proceedToSurvey', () => {
    const fresh = startNewGame(77);
    expect(fresh.phase).toBe('planet');
    expect(fresh.planetId).toBe('zephyr-7');

    const resumed = continueGame({ ...fresh, phase: 'survey', ownedParcelId: fresh.parcels[0].id, ownedParcelIds: [fresh.parcels[0].id] });
    expect(resumed.notice).toContain('Resumed Zephyr-7');

    const reset = resetGame(88);
    expect(reset.seed).toBe(88);
    expect(reset.phase).toBe('planet');

    const blockedSurvey = proceedToSurvey(createRoundSession(42, 1_000));
    expect(blockedSurvey.phase).toBe('auction');
  });

  it('deploys Scan Car echo scan and purchases drill speed upgrades with exact ledger & settlement totals', () => {
    let session = createRoundSession(42, 1_000);
    const parcel = session.parcels[0];
    session = {
      ...session,
      phase: 'drill',
      ownedParcelId: parcel.id,
      ownedParcelIds: [parcel.id],
      cash: 600,
    };

    session = deployEchoScanCar(session, parcel.reservoirs[0].center.x);
    expect(session.echoScans).toHaveLength(1);
    expect(session.cash).toBe(565);
    expect(session.costs.survey).toBe(35);
    expect(session.ledger.at(-1)?.category).toBe('survey');

    session = purchaseDrillSpeedUpgrade(session); // Lv 2 ($80)
    expect(session.drillSpeedLevel).toBe(2);
    expect(session.cash).toBe(485);
    expect(session.costs.upgrades).toBe(80);
    expect(session.ledger.at(-1)?.category).toBe('upgrades');

    session = purchaseDrillSpeedUpgrade(session); // Lv 3 ($160)
    expect(session.drillSpeedLevel).toBe(3);
    expect(session.cash).toBe(325);
    expect(session.costs.upgrades).toBe(240);

    // Lv 4 costs $260 -> succeeds ($65 left)
    session = purchaseDrillSpeedUpgrade(session);
    expect(session.drillSpeedLevel).toBe(4);
    expect(session.cash).toBe(65);
    expect(session.costs.upgrades).toBe(500);

    // Already max tier -> no charge
    const maxed = purchaseDrillSpeedUpgrade(session);
    expect(maxed.cash).toBe(65);

    const settled = settleSession(maxed);
    expect(settled.costs.survey).toBe(35);
    expect(settled.costs.upgrades).toBe(500);
    expect(settled.totalCosts).toBe(535);
  });
});
