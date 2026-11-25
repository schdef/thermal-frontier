import { describe, expect, it } from 'vitest';
import {
  advanceAuction,
  calculateRivalValuation,
  createAuction,
  createAuctionSet,
  getAvailableCash,
  getCommittedAmount,
  placeBid,
  placeBidInAuctionSet,
  tickAllAuctions,
  tickAuctions,
  withdrawBid,
  withdrawBidFromAuctionSet,
} from '../../src/simulation/auction';
import { RIVAL_COMPANIES, SIMULATION_DEFAULTS } from '../../src/simulation/constants';
import { generateCaldera7Parcels } from '../../src/simulation/generation';

describe('live ascending multi-parcel auctions', () => {
  it('initializes all 6 parcels with all 3 rival companies and seeded valuations', () => {
    const parcels = generateCaldera7Parcels(42);
    const auctions = createAuctionSet(parcels, { playerCash: 1_000, seed: 42 });

    expect(Object.keys(auctions)).toHaveLength(6);
    for (const parcel of parcels) {
      const state = auctions[parcel.id];
      expect(state.status).toBe('open');
      expect(state.rivals).toHaveLength(3);
      expect(state.rivals?.map((r) => r.name)).toEqual(RIVAL_COMPANIES.map((c) => c.name));
      expect(state.activeBidders).toEqual(['player', 'rival-1', 'rival-2', 'rival-3']);
      expect(state.rivalBudgets).toEqual([620, 760, 540]);
      expect(state.committedByBidder).toEqual({
        player: 0,
        'rival-1': 0,
        'rival-2': 0,
        'rival-3': 0,
      });
    }
  });

  it('computes rival valuations strictly from publicClues, preferredBiomes, riskTolerance, and budget without leaking hidden reservoirs', () => {
    const parcel = generateCaldera7Parcels(7)[0];
    const tamperedParcel = {
      ...parcel,
      reservoirs: parcel.reservoirs.map((r) => ({
        ...r,
        temperature: 999,
        initialHeat: 99_999,
        remainingHeat: 99_999,
      })),
    };

    for (const rival of RIVAL_COMPANIES) {
      const baseVal = calculateRivalValuation(parcel, rival, rival.startingBudget, { seed: 99 });
      const tamperedVal = calculateRivalValuation(tamperedParcel, rival, rival.startingBudget, {
        seed: 99,
      });
      expect(tamperedVal).toBe(baseVal);
      expect(baseVal).toBeGreaterThanOrEqual(
        SIMULATION_DEFAULTS.auctionOpeningBid + SIMULATION_DEFAULTS.auctionMinimumIncrement,
      );
      expect(baseVal).toBeLessThanOrEqual(rival.startingBudget);
    }

    // Preferred biome boosts valuation vs non-preferred biome given identical clues
    const volcanicParcel = { ...parcel, biome: 'volcanic' as const };
    const iceParcel = { ...parcel, biome: 'ice' as const };
    const vanguard = RIVAL_COMPANIES[1]; // prefers volcanic & basalt
    expect(
      calculateRivalValuation(volcanicParcel, vanguard, vanguard.startingBudget, { seed: 12 }),
    ).toBeGreaterThan(
      calculateRivalValuation(iceParcel, vanguard, vanguard.startingBudget, { seed: 12 }),
    );
  });

  it('validates minimum increment and player affordability, and refunds outbid commitments via committedByBidder', () => {
    const parcels = generateCaldera7Parcels(10);
    const parcel = parcels[0];
    let state = createAuction(parcel, { playerCash: 200, seed: 10 });

    // Reject below nextMinimumBid
    const tooLow = placeBid(state, 'player', state.nextMinimumBid - 1);
    expect(tooLow).toBe(state);

    // Reject above playerCash
    const tooExpensive = placeBid(state, 'player', 201);
    expect(tooExpensive).toBe(state);

    // Player bids 60 -> committed 60, remaining available 140
    state = placeBid(state, 'player', 60);
    expect(state.currentBid).toBe(60);
    expect(state.highBidder).toBe('player');
    expect(state.committedByBidder?.player).toBe(60);
    expect(state.playerBudget).toBe(140);

    // Player raises own bid to 80 -> total committed 80, remaining available 120
    state = placeBid(state, 'player', 80);
    expect(state.committedByBidder?.player).toBe(80);
    expect(state.playerBudget).toBe(120);

    // Rival-1 outbids player at 90 -> player's 80 is refunded!
    state = placeBid(state, 'rival-1', 90);
    expect(state.highBidder).toBe('rival-1');
    expect(state.committedByBidder?.player).toBe(0);
    expect(state.playerBudget).toBe(200);
    expect(state.committedByBidder?.['rival-1']).toBe(90);
    expect(state.rivalBudgets[0]).toBe(RIVAL_COMPANIES[0].startingBudget - 90);
  });

  it('tracks committed escrow across all 6 parcels so outbid players regain uncommitted funds and only winners pay on close', () => {
    const parcels = generateCaldera7Parcels(11);
    let auctions = createAuctionSet(parcels, { playerCash: 300, seed: 11 });
    const p1 = parcels[0].id;
    const p2 = parcels[1].id;

    // Player bids 150 on p1 and 150 on p2 -> total committed 300, available 0
    auctions = placeBidInAuctionSet(auctions, p1, 'player', 150);
    auctions = placeBidInAuctionSet(auctions, p2, 'player', 150);
    expect(getCommittedAmount(auctions, 'player')).toBe(300);
    expect(getAvailableCash(auctions, 300, 'player')).toBe(0);

    // Cannot bid on p3 while 300 is committed across p1+p2
    const p3 = parcels[2].id;
    const rejected = placeBidInAuctionSet(auctions, p3, 'player', 60);
    expect(rejected).toBe(auctions);

    // Rival-2 outbids player on p1 -> player regains 150 uncommitted cash
    auctions = placeBidInAuctionSet(auctions, p1, 'rival-2', 160);
    expect(getCommittedAmount(auctions, 'player')).toBe(150);
    expect(getAvailableCash(auctions, 300, 'player')).toBe(150);
    expect(auctions[p2].playerBudget).toBe(150);

    // Expire p1 and p2 -> rival-2 wins p1 at 160, player wins p2 at 150
    auctions = {
      ...auctions,
      [p1]: advanceAuction(auctions[p1], auctions[p1].timeRemainingSeconds, 11),
      [p2]: advanceAuction(auctions[p2], auctions[p2].timeRemainingSeconds, 11),
    };
    expect(auctions[p1].status).toBe('ended');
    expect(auctions[p1].winnerId).toBe('rival-2');
    expect(auctions[p1].finalPrice).toBe(160);
    expect(auctions[p2].status).toBe('ended');
    expect(auctions[p2].winnerId).toBe('player');
    expect(auctions[p2].finalPrice).toBe(150);
    expect(getAvailableCash(auctions, 300, 'player')).toBe(150);
  });

  it('triggers anti-sniping extension when bid arrives within threshold, capped at maxAuctionExtensions', () => {
    const parcel = generateCaldera7Parcels(5)[0];
    let state = createAuction(parcel, {
      playerCash: 1_000,
      durationSeconds: SIMULATION_DEFAULTS.antiSnipeThresholdSeconds,
    });

    // Bid at exactly threshold (5s) extends by 5s -> 10s, extensionCount = 1
    state = placeBid(state, 'player', state.nextMinimumBid);
    expect(state.timeRemainingSeconds).toBe(10);
    expect(state.extensionCount).toBe(1);

    // Advance down to 3s and bid repeatedly up to maxAuctionExtensions (6)
    for (let ext = 2; ext <= SIMULATION_DEFAULTS.maxAuctionExtensions; ext += 1) {
      state = { ...state, timeRemainingSeconds: 3 };
      state = placeBid(state, 'rival-2', state.nextMinimumBid);
      expect(state.extensionCount).toBe(ext);
      expect(state.timeRemainingSeconds).toBe(3 + SIMULATION_DEFAULTS.antiSnipeExtensionSeconds);
      // Alternate high bidder so player can bid next
      state = { ...state, timeRemainingSeconds: 3 };
      if (ext < SIMULATION_DEFAULTS.maxAuctionExtensions) {
        ext += 1;
        state = placeBid(state, 'player', state.nextMinimumBid);
        expect(state.extensionCount).toBe(ext);
        expect(state.timeRemainingSeconds).toBe(3 + SIMULATION_DEFAULTS.antiSnipeExtensionSeconds);
      }
    }

    // One more late bid must NOT extend past maxAuctionExtensions
    state = { ...state, timeRemainingSeconds: 2 };
    state = placeBid(state, 'player', state.nextMinimumBid);
    expect(state.extensionCount).toBe(SIMULATION_DEFAULTS.maxAuctionExtensions);
    expect(state.timeRemainingSeconds).toBe(2);
  });

  it('produces identical deterministic rival bids for identical seeds and drops rivals exceeding budget/valuation', () => {
    const parcelsA = generateCaldera7Parcels(42);
    const parcelsB = generateCaldera7Parcels(42);

    let setA = createAuctionSet(parcelsA, { playerCash: 1_000, seed: 42 });
    let setB = createAuctionSet(parcelsB, { playerCash: 1_000, seed: 42 });

    for (let t = 0; t < 15; t += 1) {
      setA = tickAllAuctions(setA, 1, 42);
      setB = tickAllAuctions(setB, 1, 42);
    }

    for (const parcel of parcelsA) {
      expect(setA[parcel.id].currentBid).toBe(setB[parcel.id].currentBid);
      expect(setA[parcel.id].highBidder).toBe(setB[parcel.id].highBidder);
      expect(setA[parcel.id].bidHistory).toEqual(setB[parcel.id].bidHistory);
      expect(setA[parcel.id].withdrawnBidders).toEqual(setB[parcel.id].withdrawnBidders);
      expect(setA[parcel.id].rivalBudgets.every((b) => b >= 0)).toBe(true);
    }

    // Low rival budgets cause immediate withdrawal once player bids above them
    const lowParcel = parcelsA[0];
    let lowState = createAuction(lowParcel, {
      playerCash: 500,
      rivalBudgets: [20, 30, 40],
      seed: 1,
    });
    lowState = placeBid(lowState, 'player', lowState.nextMinimumBid);
    lowState = advanceAuction(lowState, 1, 1);
    expect(lowState.withdrawnBidders).toHaveLength(3);
    expect(lowState.withdrawnBidders).toEqual(
      expect.arrayContaining(['rival-1', 'rival-2', 'rival-3']),
    );
    expect(lowState.status).toBe('ended');
    expect(lowState.winnerId).toBe('player');
    expect(lowState.finalPrice).toBe(60);
  });

  it('settles all 6 auctions cleanly when countdown expires or all competitors withdraw', () => {
    const parcels = generateCaldera7Parcels(33);
    let auctions = createAuctionSet(parcels, { playerCash: 1_000, seed: 33 });

    // Withdraw player from parcel 0
    auctions = withdrawBidFromAuctionSet(auctions, parcels[0].id, 'player');
    expect(auctions[parcels[0].id].withdrawnBidders).toContain('player');
    expect(auctions[parcels[0].id].activeBidders).not.toContain('player');

    // Run ticks until all 6 auctions settle (either via countdown expiry or rival fold)
    for (let step = 0; step < 80; step += 1) {
      auctions = tickAuctions(auctions, 1, 33);
      if (Object.values(auctions).every((a) => a.status === 'ended')) break;
    }

    for (const parcel of parcels) {
      const finished = auctions[parcel.id];
      expect(finished.status).toBe('ended');
      if (finished.highBidder) {
        expect(finished.winnerId).toBe(finished.highBidder);
        expect(finished.finalPrice).toBe(finished.currentBid);
      } else {
        expect(finished.winnerId).toBeNull();
        expect(finished.finalPrice).toBeNull();
      }
      // Cannot withdraw once ended or place new bids
      expect(withdrawBid(finished, 'player')).toBe(finished);
      expect(placeBid(finished, 'player', finished.nextMinimumBid)).toBe(finished);
    }

    // Explicit countdown expiration test when multiple active bidders remain
    let timerState = createAuction(parcels[1], {
      playerCash: 1_000,
      durationSeconds: 10,
      seed: 33,
    });
    timerState = placeBid(timerState, 'player', 200);
    timerState = advanceAuction(timerState, 10, 33);
    expect(timerState.timeRemainingSeconds).toBe(0);
    expect(timerState.status).toBe('ended');
    expect(timerState.winnerId).toBe('player');
    expect(timerState.finalPrice).toBe(200);
  });
});
