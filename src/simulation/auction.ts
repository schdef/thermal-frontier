import { RIVAL_COMPANIES, SIMULATION_DEFAULTS } from './constants';
import { randomBetween, seededRandom } from './random';
import type {
  AuctionBidEvent,
  AuctionState,
  BidderId,
  Parcel,
  RivalBidderInfo,
  RivalCompany,
  RivalCompanyTemplate,
} from './types';

export interface CreateAuctionOptions {
  playerCash: number;
  rivalBudgets?: [number, number] | number[];
  rivals?: Array<RivalCompanyTemplate | RivalCompany | RivalBidderInfo>;
  openingBid?: number;
  minimumIncrement?: number;
  durationSeconds?: number;
  bidStep?: number;
  seed?: number;
  antiSnipeExtensionSeconds?: number;
}

export interface CreateAuctionSetOptions extends CreateAuctionOptions {}

const VALID_BID_STEPS = [10, 25, 50, 100, 250] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deriveParcelSeed(baseSeed: number, parcelId: string, salt = 0): number {
  const idHash = hashString(parcelId);
  return (Math.imul(baseSeed ^ idHash, 2654435761) + Math.imul(salt + 1, 1013904223)) >>> 0;
}

function resolveRivalTemplates(options: CreateAuctionOptions): RivalCompanyTemplate[] {
  if (options.rivals && options.rivals.length > 0) {
    return options.rivals.map((rival, index) => {
      const template = RIVAL_COMPANIES[index % RIVAL_COMPANIES.length];
      if ('preferredBiomes' in rival) {
        return {
          ...rival,
          startingBudget: options.rivalBudgets?.[index] ?? rival.startingBudget,
        };
      }
      return {
        ...template,
        id: rival.id,
        name: rival.name,
        startingBudget: options.rivalBudgets?.[index] ?? rival.budget,
      };
    });
  }

  if (options.rivalBudgets && options.rivalBudgets.length > 0) {
    return options.rivalBudgets.map((budget, index) => {
      const template = RIVAL_COMPANIES[index % RIVAL_COMPANIES.length];
      return {
        ...template,
        id: `rival-${index + 1}`,
        startingBudget: budget,
      };
    });
  }

  return RIVAL_COMPANIES.slice(0, SIMULATION_DEFAULTS.rivalCount).map((template) => ({
    ...template,
    preferredBiomes: [...template.preferredBiomes],
  }));
}

/**
 * Computes a deterministic seeded rival valuation for a parcel using ONLY
 * `parcel.publicClues`, `parcel.biome`, and rival preferences/budget.
 * Never reads hidden underground reservoirs, aquifers, faults, or minerals.
 */
export function calculateRivalValuation(
  parcel: Parcel,
  rival: Pick<
    RivalCompanyTemplate,
    'id' | 'personality' | 'preferredBiomes' | 'riskTolerance' | 'maxSpendMultiplier'
  >,
  remainingBudget: number,
  options?: {
    openingBid?: number;
    minimumIncrement?: number;
    seed?: number;
  },
): number {
  const openingBid = options?.openingBid ?? SIMULATION_DEFAULTS.auctionOpeningBid;
  const minimumIncrement = options?.minimumIncrement ?? SIMULATION_DEFAULTS.auctionMinimumIncrement;
  const budget = Math.max(0, Math.floor(remainingBudget));

  if (budget < openingBid + minimumIncrement) {
    return budget;
  }

  const baseSeed = options?.seed ?? hashString(parcel.id);
  const rng = seededRandom(deriveParcelSeed(baseSeed, `${parcel.id}:${rival.id}`, 17));

  const clues = parcel.publicClues;
  const tempScore = clamp((clues.surfaceTemperature + 35) / 220, 0.3, 1.3);
  const marketScore = clamp((85 - clues.marketDistance) / 65, 0.5, 1.25);
  const purityScore = clamp((clues.estimatedThermalPurity ?? 0.82) / 0.85, 0.75, 1.2);
  const fissureScore = clamp(0.85 + clues.visibleFissures * 0.06, 0.85, 1.15);

  const heatSignalBonus =
    clues.surfaceHeatSignal === 'high'
      ? 0.12
      : clues.surfaceHeatSignal === 'moderate'
        ? 0.04
        : clues.surfaceHeatSignal === 'low'
          ? -0.06
          : 0;

  const stabilityBonus =
    clues.stabilityHint === 'stable'
      ? 0.08
      : clues.stabilityHint === 'unstable'
        ? -0.08
        : 0;

  const riskLevel =
    clues.riskFactor === 'extreme'
      ? 0.9
      : clues.riskFactor === 'high'
        ? 0.7
        : clues.riskFactor === 'moderate'
          ? 0.4
          : clues.riskFactor === 'low'
            ? 0.15
            : clamp(clues.visibleFissures * 0.18, 0.15, 0.85);

  const prefersBiome = parcel.biome ? rival.preferredBiomes.includes(parcel.biome) : false;
  const biomeMultiplier = prefersBiome ? 1.25 : 0.88;

  const riskMismatch = Math.max(0, riskLevel - rival.riskTolerance);
  const riskMultiplier =
    rival.personality === 'aggressive'
      ? 1 + riskLevel * 0.14 - riskMismatch * 0.35
      : 1 - riskMismatch * 0.55;

  const seededFactor = randomBetween(rng, 0.88, 1.14);

  const clueComposite =
    tempScore * 0.35 +
    marketScore * 0.25 +
    purityScore * 0.25 +
    fissureScore * 0.15 +
    heatSignalBonus +
    stabilityBonus;

  const desirability = clamp(clueComposite * biomeMultiplier * riskMultiplier * seededFactor, 0.35, 1.35);

  const maxSpendCeiling = Math.max(openingBid + minimumIncrement, budget * rival.maxSpendMultiplier);
  const rawValuation =
    openingBid + (maxSpendCeiling - openingBid) * clamp(desirability / 1.15, 0.12, 1.0);

  return clamp(Math.round(rawValuation), openingBid + minimumIncrement, budget);
}

function getRivalIndex(state: AuctionState, bidder: BidderId): number {
  if (state.rivals && state.rivals.length > 0) {
    const idx = state.rivals.findIndex((rival) => rival.id === bidder);
    if (idx !== -1) return idx;
  }
  const match = /^rival-(\d+)$/.exec(bidder);
  if (!match) return -1;
  const idx = Number(match[1]) - 1;
  return idx >= 0 && idx < state.rivalBudgets.length ? idx : -1;
}

function syncRivalObjects(
  rivals: AuctionState['rivals'],
  rivalBudgets: number[],
): RivalCompany[] | RivalBidderInfo[] | undefined {
  if (!rivals) return undefined;
  return rivals.map((rival, index) => ({
    ...rival,
    budget: rivalBudgets[index] ?? rival.budget,
  })) as RivalCompany[] | RivalBidderInfo[];
}

export function settleAuction(state: AuctionState): AuctionState {
  if (state.status === 'ended') {
    return {
      ...state,
      winnerId: state.winnerId !== undefined ? state.winnerId : state.highBidder,
      finalPrice:
        state.finalPrice !== undefined
          ? state.finalPrice
          : state.highBidder
            ? state.currentBid
            : null,
    };
  }

  const winnerId = state.highBidder ?? null;
  const finalPrice = winnerId ? state.currentBid : null;

  return {
    ...state,
    status: 'ended',
    winnerId,
    finalPrice,
  };
}

export function createAuction(parcel: Parcel, options: CreateAuctionOptions): AuctionState {
  const openingBid = options.openingBid ?? SIMULATION_DEFAULTS.auctionOpeningBid;
  const minimumIncrement = options.minimumIncrement ?? SIMULATION_DEFAULTS.auctionMinimumIncrement;
  const bidStep = options.bidStep ?? SIMULATION_DEFAULTS.auctionDefaultBidStep;
  const durationSeconds = options.durationSeconds ?? SIMULATION_DEFAULTS.auctionDurationSeconds;
  const antiSnipeExtensionSeconds =
    options.antiSnipeExtensionSeconds ?? SIMULATION_DEFAULTS.antiSnipeExtensionSeconds;
  const seed = options.seed ?? hashString(parcel.id);

  const templates = resolveRivalTemplates(options);
  const rivalBudgets = templates.map((t) => Math.max(0, Math.floor(t.startingBudget)));

  const rivalMaxBids = templates.map((template, index) =>
    calculateRivalValuation(parcel, template, rivalBudgets[index], {
      openingBid,
      minimumIncrement,
      seed,
    }),
  );

  const rivals: RivalCompany[] = templates.map((template, index) => ({
    id: template.id,
    name: template.name,
    color: template.color,
    emblem: template.emblem,
    personality: template.personality,
    startingBudget: rivalBudgets[index],
    budget: rivalBudgets[index],
    maxBid: rivalMaxBids[index],
    aggressiveness: template.riskTolerance,
    preferredBiomes: [...template.preferredBiomes],
    riskTolerance: template.riskTolerance,
    maxSpendMultiplier: template.maxSpendMultiplier,
  }));

  const activeBidders: BidderId[] = ['player', ...rivals.map((r) => r.id)];
  const committedByBidder: Record<BidderId, number> = { player: 0 };
  for (const rival of rivals) {
    committedByBidder[rival.id] = 0;
  }

  return {
    parcelId: parcel.id,
    status: 'open',
    openingBid,
    minimumIncrement,
    currentBid: openingBid,
    highBidder: null,
    nextMinimumBid: openingBid + minimumIncrement,
    bidStep,
    committedByBidder,
    timeRemainingSeconds: durationSeconds,
    extensionCount: 0,
    antiSnipeExtensionSeconds,
    activeBidders,
    withdrawnBidders: [],
    playerBudget: Math.max(0, options.playerCash),
    rivalBudgets,
    rivalMaxBids,
    rivals,
    winnerId: null,
    finalPrice: null,
    bidHistory: [],
  };
}

export function createAuctionSet(
  parcels: Parcel[],
  options: CreateAuctionSetOptions,
): Record<string, AuctionState> {
  const baseSeed = options.seed ?? 42;
  const auctions: Record<string, AuctionState> = {};

  parcels.forEach((parcel, index) => {
    const parcelSeed = deriveParcelSeed(baseSeed, parcel.id, index);
    auctions[parcel.id] = createAuction(parcel, {
      ...options,
      seed: parcelSeed,
    });
  });

  return auctions;
}

export function createMultiParcelAuctions(
  parcels: Parcel[],
  options: {
    playerCash: number;
    rivalBudgets?: [number, number] | number[];
    seed?: number;
  },
): Record<string, AuctionState> {
  return createAuctionSet(parcels, options);
}

export function adjustBidStep(state: AuctionState, delta: number): AuctionState {
  const currentStep = state.bidStep ?? SIMULATION_DEFAULTS.auctionDefaultBidStep;
  const currentIndex = VALID_BID_STEPS.indexOf(currentStep as (typeof VALID_BID_STEPS)[number]);
  let nextIndex: number;
  if (currentIndex === -1) {
    nextIndex = delta > 0 ? 1 : 0;
  } else {
    nextIndex = Math.max(
      0,
      Math.min(VALID_BID_STEPS.length - 1, currentIndex + (delta > 0 ? 1 : -1)),
    );
  }
  return { ...state, bidStep: VALID_BID_STEPS[nextIndex] };
}

export function getSteppedBid(state: AuctionState, steps = 1): number {
  const step = state.bidStep ?? state.minimumIncrement;
  const target = state.currentBid + step * steps;
  return Math.max(state.nextMinimumBid, target);
}

export function placeBid(state: AuctionState, bidder: BidderId, amount: number): AuctionState {
  const requiredMinimum = Math.max(
    state.nextMinimumBid,
    state.currentBid + state.minimumIncrement,
  );

  if (
    state.status !== 'open' ||
    state.timeRemainingSeconds <= 0 ||
    !state.activeBidders.includes(bidder) ||
    !Number.isFinite(amount) ||
    amount < requiredMinimum
  ) {
    return state;
  }

  const committedByBidder: Record<BidderId, number> = {
    ...(state.committedByBidder ?? {}),
  };
  const ownPrevCommitted = committedByBidder[bidder] ?? 0;

  let nextPlayerBudget = state.playerBudget;
  const nextRivalBudgets = [...state.rivalBudgets];

  if (bidder === 'player') {
    const availableWithRefund = nextPlayerBudget + ownPrevCommitted;
    if (amount > availableWithRefund) {
      return state;
    }
  } else {
    const rivalIndex = getRivalIndex(state, bidder);
    if (rivalIndex === -1) return state;
    const availableWithRefund = (nextRivalBudgets[rivalIndex] ?? 0) + ownPrevCommitted;
    if (amount > availableWithRefund) {
      return state;
    }
  }

  // Refund the previous high bidder if a different bidder is taking the lead
  if (state.highBidder && state.highBidder !== bidder) {
    const prevBidder = state.highBidder;
    const prevCommitted = committedByBidder[prevBidder] ?? 0;
    committedByBidder[prevBidder] = 0;

    if (prevBidder === 'player') {
      nextPlayerBudget += prevCommitted;
    } else {
      const prevIndex = getRivalIndex(state, prevBidder);
      if (prevIndex !== -1) {
        nextRivalBudgets[prevIndex] = (nextRivalBudgets[prevIndex] ?? 0) + prevCommitted;
      }
    }
  }

  // Commit the new bid amount from the bidder's available funds
  committedByBidder[bidder] = amount;
  if (bidder === 'player') {
    nextPlayerBudget = Math.max(0, nextPlayerBudget + ownPrevCommitted - amount);
  } else {
    const rivalIndex = getRivalIndex(state, bidder);
    if (rivalIndex !== -1) {
      nextRivalBudgets[rivalIndex] = Math.max(
        0,
        (nextRivalBudgets[rivalIndex] ?? 0) + ownPrevCommitted - amount,
      );
    }
  }

  // Anti-sniping late-bid timer extension
  const extensionThreshold = SIMULATION_DEFAULTS.antiSnipeThresholdSeconds;
  const extensionSeconds =
    state.antiSnipeExtensionSeconds ?? SIMULATION_DEFAULTS.antiSnipeExtensionSeconds;
  const currentExtensions = state.extensionCount ?? 0;
  const shouldExtend =
    state.timeRemainingSeconds <= extensionThreshold &&
    currentExtensions < SIMULATION_DEFAULTS.maxAuctionExtensions;

  const nextTimeRemaining = shouldExtend
    ? state.timeRemainingSeconds + extensionSeconds
    : state.timeRemainingSeconds;
  const nextExtensionCount = shouldExtend ? currentExtensions + 1 : currentExtensions;

  const bidEvent: AuctionBidEvent = {
    bidderId: bidder,
    amount,
    timeRemainingSeconds: nextTimeRemaining,
  };

  return {
    ...state,
    currentBid: amount,
    highBidder: bidder,
    nextMinimumBid: amount + state.minimumIncrement,
    committedByBidder,
    timeRemainingSeconds: nextTimeRemaining,
    extensionCount: nextExtensionCount,
    lastBidTimeRemaining: state.timeRemainingSeconds,
    playerBudget: nextPlayerBudget,
    rivalBudgets: nextRivalBudgets,
    rivals: syncRivalObjects(state.rivals, nextRivalBudgets),
    bidHistory: [...(state.bidHistory ?? []), bidEvent],
  };
}

export function withdrawBid(state: AuctionState, bidder: BidderId): AuctionState {
  if (state.status !== 'open' || !state.activeBidders.includes(bidder)) {
    return state;
  }
  // Current high bidder cannot abandon a committed leading bid
  if (state.highBidder === bidder) {
    return state;
  }

  const activeBidders = state.activeBidders.filter((active) => active !== bidder);
  const withdrawnBidders = state.withdrawnBidders.includes(bidder)
    ? state.withdrawnBidders
    : [...state.withdrawnBidders, bidder];

  const shouldClose =
    activeBidders.length === 0 ||
    (activeBidders.length === 1 && state.highBidder !== null && activeBidders[0] === state.highBidder);

  const next: AuctionState = {
    ...state,
    activeBidders,
    withdrawnBidders,
  };

  return shouldClose ? settleAuction(next) : next;
}

export function advanceAuction(
  state: AuctionState,
  elapsedSeconds: number,
  seed = 42,
): AuctionState {
  if (state.status !== 'open') return state;

  const dt = Math.max(0, elapsedSeconds);
  const remaining = Math.max(0, state.timeRemainingSeconds - dt);

  let next: AuctionState = {
    ...state,
    timeRemainingSeconds: remaining,
  };

  if (remaining === 0) {
    return settleAuction(next);
  }

  const rivalIds =
    next.rivals && next.rivals.length > 0
      ? next.rivals.map((r) => r.id)
      : next.rivalBudgets.map((_, index) => `rival-${index + 1}`);

  const tickSignature = `${next.parcelId}:${Math.round(remaining * 10)}:${next.currentBid}:${next.bidHistory?.length ?? 0}:${next.rivalMaxBids.join(',')}`;
  const rng = seededRandom(deriveParcelSeed(seed, tickSignature, 31));

  // Deterministic Fisher-Yates shuffle so rival turn order varies fairly per tick
  const evalOrder = [...rivalIds];
  for (let i = evalOrder.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [evalOrder[i], evalOrder[j]] = [evalOrder[j], evalOrder[i]];
  }

  for (const bidder of evalOrder) {
    if (next.status !== 'open') break;
    if (!next.activeBidders.includes(bidder)) continue;
    if (next.highBidder === bidder) continue;

    const index = getRivalIndex(next, bidder);
    if (index === -1) continue;

    const maxValuation = next.rivalMaxBids[index] ?? 0;
    const availableBudget = next.rivalBudgets[index] ?? 0;
    const maxAllowed = Math.min(maxValuation, availableBudget);

    if (next.nextMinimumBid > maxAllowed) {
      next = withdrawBid(next, bidder);
      continue;
    }

    const rivalMeta = next.rivals?.[index];
    const personality =
      rivalMeta && 'personality' in rivalMeta ? rivalMeta.personality : 'analytical';

    const baseRate =
      personality === 'aggressive'
        ? 0.8
        : personality === 'opportunist'
          ? remaining <= 10
            ? 0.85
            : 0.45
          : 0.65;

    const triggerProb = 1 - Math.pow(1 - clamp(baseRate, 0.1, 0.95), Math.max(0.25, dt));
    if (rng() > triggerProb) {
      continue;
    }

    const headroom = maxAllowed - next.nextMinimumBid;
    const jumpBid =
      personality === 'aggressive' && headroom >= next.minimumIncrement * 2 && rng() < 0.25
        ? Math.min(maxAllowed, next.nextMinimumBid + next.minimumIncrement)
        : next.nextMinimumBid;

    next = placeBid(next, bidder, jumpBid);
  }

  if (next.timeRemainingSeconds <= 0 && next.status === 'open') {
    next = settleAuction(next);
  }

  return next;
}

function syncBudgetsAcrossAuctions(
  auctions: Record<string, AuctionState>,
  playerBudget: number,
  rivalBudgets: number[],
): Record<string, AuctionState> {
  const synced: Record<string, AuctionState> = {};
  for (const [id, state] of Object.entries(auctions)) {
    synced[id] = {
      ...state,
      playerBudget,
      rivalBudgets: [...rivalBudgets],
      rivals: syncRivalObjects(state.rivals, rivalBudgets),
    };
  }
  return synced;
}

export function placeBidInAuctionSet(
  auctions: Record<string, AuctionState>,
  parcelId: string,
  bidder: BidderId,
  amount: number,
): Record<string, AuctionState> {
  const target = auctions[parcelId];
  if (!target) return auctions;

  const updated = placeBid(target, bidder, amount);
  if (updated === target) return auctions;

  return syncBudgetsAcrossAuctions(
    { ...auctions, [parcelId]: updated },
    updated.playerBudget,
    updated.rivalBudgets,
  );
}

export function withdrawBidFromAuctionSet(
  auctions: Record<string, AuctionState>,
  parcelId: string,
  bidder: BidderId,
): Record<string, AuctionState> {
  const target = auctions[parcelId];
  if (!target) return auctions;

  const updated = withdrawBid(target, bidder);
  if (updated === target) return auctions;

  return {
    ...auctions,
    [parcelId]: updated,
  };
}

export function tickAuctions(
  auctions: Record<string, AuctionState>,
  elapsedSeconds: number,
  seed = 42,
): Record<string, AuctionState> {
  let working: Record<string, AuctionState> = { ...auctions };

  for (const parcelId of Object.keys(working)) {
    const current = working[parcelId];
    if (!current || current.status !== 'open') continue;

    const updated = advanceAuction(current, elapsedSeconds, seed);
    if (updated === current) continue;

    working[parcelId] = updated;
    if (
      updated.playerBudget !== current.playerBudget ||
      updated.rivalBudgets.some((b, i) => b !== current.rivalBudgets[i])
    ) {
      working = syncBudgetsAcrossAuctions(working, updated.playerBudget, updated.rivalBudgets);
    }
  }

  return working;
}

export const tickAllAuctions = tickAuctions;

export function getCommittedAmount(
  auctions: Record<string, AuctionState>,
  bidder: BidderId,
): number {
  let total = 0;
  for (const state of Object.values(auctions)) {
    total += state.committedByBidder?.[bidder] ?? 0;
  }
  return total;
}

export function getAvailableCash(
  auctions: Record<string, AuctionState>,
  totalBudget: number,
  bidder: BidderId = 'player',
): number {
  return Math.max(0, totalBudget - getCommittedAmount(auctions, bidder));
}
