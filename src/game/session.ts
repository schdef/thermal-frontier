import {
  adjustBidStep,
  advanceAuction,
  createAuctionSet,
  getAvailableCash,
  placeBidInAuctionSet,
  settleAuction,
  tickAuctions,
  withdrawBidFromAuctionSet,
} from '../simulation/auction';
import {
  DRILL_UPGRADE_TIERS,
  RIVAL_COMPANIES,
  SIMULATION_DEFAULTS,
  ZEPHYR_7_CONFIG,
} from '../simulation/constants';
import {
  addWaypoint,
  clearWaypoints,
  executeWellDrilling,
  getDrillSpeedTier,
  performUndergroundEchoScan,
  summarizeParcelWells,
  undoWaypoint,
  validateDrillingPath,
} from '../simulation/drilling';
import { generatePlanetParcels } from '../simulation/generation';
import { calculateThermMarketValue, DEFAULT_MARKET_PRICE_PER_MWH } from '../simulation/market';
import type { PipeType } from '../simulation/pipes';
import { getPlanetConfig } from '../simulation/planets';
import { computePlantTelemetry, deriveReservoirTemperature } from '../simulation/reservoir';
import { settleGameState, type SettlementResult } from '../simulation/settlement';
import { performSurfaceScan, performSurvey } from '../simulation/survey';
import type {
  AuctionState,
  Parcel,
  PipeTypeId,
  PlanetConfig,
  PlantChainState,
  PlantTelemetry,
  Point,
  Reservoir,
  ResourceDepletion,
  RoverScanResult,
  SurveyResult,
  SurveyScanRecord,
  WellRecord,
} from '../simulation/types';
import { createInitialPlantChainState, updateSimulation } from '../simulation/update';
import {
  GAME_SESSION_SCHEMA_VERSION,
  type GameState,
  type LedgerCategory,
  type LedgerEntry,
  type RoundCosts,
  type RoundPhase,
  type RoundSpeed,
  type RoundSummary,
  type SessionOptions,
} from './types';

export type { RoundCosts, RoundPhase, RoundSpeed, RoundSummary, SessionOptions };
export type RoundSession = GameState;

const DEFAULT_CASH = SIMULATION_DEFAULTS.startingBudget;
const DEFAULT_STORAGE = SIMULATION_DEFAULTS.storageCapacityTH;

export const DEFAULT_TELEMETRY: PlantTelemetry = {
  temperatureC: 320,
  powerMW: 120,
  heatExchangerEfficiency: SIMULATION_DEFAULTS.exchangerBaseEfficiency,
  storageTankLevelTH: 0,
  storageTankCapacityTH: DEFAULT_STORAGE,
  exportRateMW: 114,
  gridExportPrice: DEFAULT_MARKET_PRICE_PER_MWH,
  returnFluidLoopFlow: 8.5,
  returnFluidTemperature: 72,
  closedLoopPressureBar: 52,
  totalEnergyExportedMWh: 0,
  roundTimeRemainingSeconds: SIMULATION_DEFAULTS.roundDurationSeconds,
  thermalDepletionPercent: 0,
};

export const DEFAULT_DEPLETION: ResourceDepletion = {
  thermalDepletionPercent: 0,
  thermalRemainingPercent: 100,
  mineralsDepletionPercent: 0,
  stableGroundDepletionPercent: 0,
  stableGroundRemainingPercent: 100,
};

export const ZERO_DEPLETION: ResourceDepletion = DEFAULT_DEPLETION;

function resolvePlanet(options?: SessionOptions): PlanetConfig {
  if (options?.planetId) {
    return getPlanetConfig(options.planetId);
  }
  if (options?.planet && 'palette' in options.planet) {
    return options.planet;
  }
  if (options?.planet?.id) {
    return getPlanetConfig(options.planet.id);
  }
  return ZEPHYR_7_CONFIG;
}

function appendLedger(
  ledger: LedgerEntry[],
  kind: 'cost' | 'revenue',
  category: LedgerCategory,
  amount: number,
  balanceAfter: number,
  detail: string,
  timestampSeconds?: number,
): LedgerEntry[] {
  if (amount <= 0) return ledger;
  return [
    ...ledger,
    {
      kind,
      category,
      amount: Math.round(amount * 100) / 100,
      balanceAfter: Math.round(balanceAfter * 100) / 100,
      detail,
      timestampSeconds,
    },
  ];
}

function computeParcelStabilityBaseline(parcel?: Parcel): number {
  if (!parcel) return 100;
  const zones = parcel.surfaceFeatures?.stableZones ?? parcel.stableGround ?? [];
  if (zones.length === 0) return 100;
  return Math.round(zones.reduce((sum, z) => sum + z.stabilityScore, 0) / zones.length);
}

export function createRoundSession(
  seed = 42,
  cash?: number,
  options?: SessionOptions,
): RoundSession {
  const planet = resolvePlanet(options);
  const startingCash = cash ?? options?.startingBudget ?? planet.startingCash ?? DEFAULT_CASH;
  const parcels = generatePlanetParcels(planet, seed);
  const initialPhase: RoundPhase =
    options?.initialPhase ?? (options?.startAtPlanet ? 'planet' : 'auction');

  const auctions = createAuctionSet(parcels, {
    playerCash: startingCash,
    rivals: planet.competition?.rivals ?? RIVAL_COMPANIES,
    seed,
  });

  const selectedParcelId = parcels[0]?.id ?? null;
  const initialAuction = selectedParcelId ? auctions[selectedParcelId] : Object.values(auctions)[0];
  const roundDurationSeconds = planet.roundDurationSeconds ?? SIMULATION_DEFAULTS.roundDurationSeconds;
  const storageCapacity = options?.storageCapacityTH ?? DEFAULT_STORAGE;

  const plant = createInitialPlantChainState({
    pipeType: 'basic',
    networkLength: 0,
    storageCapacityTH: storageCapacity,
    exportCapacityMW: SIMULATION_DEFAULTS.exportCapacityMW,
    marketPricePerMWh: DEFAULT_MARKET_PRICE_PER_MWH,
    exchangerEfficiency: SIMULATION_DEFAULTS.exchangerBaseEfficiency,
    returnLoopActive: true,
    roundDurationSeconds,
  });

  return {
    schemaVersion: GAME_SESSION_SCHEMA_VERSION,
    seed,
    planetId: planet.id,
    planet,
    phase: initialPhase,
    cash: startingCash,
    startingCash,
    ledger: [],
    parcels,
    auctions,
    auction: initialAuction,
    selectedParcelId,
    ownedParcelIds: [],
    ownedParcelId: undefined,
    surveys: [],
    echoScans: [],
    surveyResults: [],
    roverScans: [],
    wells: [],
    drillPath: [],
    drillSnapToLayer: false,
    drillSpeedLevel: 1,
    discoveredReservoirIds: [],
    activeReservoir: undefined,
    startingHeat: 0,
    remainingHeat: 0,
    plant,
    plantTelemetry: {
      ...DEFAULT_TELEMETRY,
      temperatureC: 0,
      powerMW: 0,
      exportRateMW: 0,
      returnFluidLoopFlow: 0,
      closedLoopPressureBar: 0,
      storageTankCapacityTH: storageCapacity,
      roundTimeRemainingSeconds: roundDurationSeconds,
    },
    resourceDepletion: { ...ZERO_DEPLETION },
    storageTherm: 0,
    storageCapacity,
    pipeType: 'basic',
    networkLength: 0,
    pipeFlow: 0,
    pipeHeatLoss: 0,
    pipeOutletTemperature: 0,
    upgrades: { drill: 0, pipes: 0, exchanger: 0 },
    returnFluidLoopActive: true,
    lastOutput: 0,
    speed: 1,
    isPaused: false,
    elapsedSeconds: 0,
    roundDurationSeconds,
    currentPrice: DEFAULT_MARKET_PRICE_PER_MWH,
    salesRevenue: 0,
    costs: { land: 0, survey: 0, drilling: 0, pipes: 0, upgrades: 0, operating: 0 },
    powerGeneratedMWh: 0,
    settlement: undefined,
    campaignRound: options?.campaignRound ?? 1,
    totalCampaignProfit: options?.totalCampaignProfit ?? 0,
    careerRevenue: 0,
    roundHistory: [],
    notice:
      initialPhase === 'planet'
        ? `${planet.name} orbit established. Review planetary stats and launch round.`
        : 'Review the public clues and rival bids across all 6 parcels.',
  };
}

export function startNewGame(
  seed = 42,
  options?: SessionOptions,
): RoundSession {
  return createRoundSession(seed, options?.startingBudget, {
    ...options,
    initialPhase: options?.initialPhase ?? 'planet',
  });
}

export function continueGame(savedSession: RoundSession): RoundSession {
  return {
    ...savedSession,
    notice: `Resumed ${savedSession.planet.name} · Round ${savedSession.campaignRound}.`,
  };
}

export function resetGame(seed = 42, options?: SessionOptions): RoundSession {
  return startNewGame(seed, options);
}

export function launchPlanetSession(session: RoundSession): RoundSession {
  if (session.phase !== 'planet') return session;
  return {
    ...session,
    phase: 'auction',
    notice: 'Descent complete. Review the 6 parcel biomes and place your opening bid.',
  };
}

export function startRound(session: RoundSession): RoundSession {
  return session.phase === 'planet' ? launchPlanetSession(session) : session;
}

export function selectParcel(session: RoundSession, parcelId: string): RoundSession {
  if (session.phase !== 'auction') return session;
  const parcel = session.parcels.find((candidate) => candidate.id === parcelId);
  if (!parcel) return { ...session, notice: 'That parcel is not available.' };

  const auction = session.auctions[parcelId] ?? session.auction;
  return {
    ...session,
    selectedParcelId: parcelId,
    auction,
    notice: `${parcel.name ?? parcel.id} selected. Public clues guide value; hidden geology waits below.`,
  };
}

export function setAuctionBidStep(session: RoundSession, delta: number): RoundSession {
  if (session.phase !== 'auction') return session;
  const targetId = session.auction.parcelId;
  const updated = adjustBidStep(session.auction, delta);
  return {
    ...session,
    auction: updated,
    auctions: {
      ...session.auctions,
      [targetId]: updated,
    },
  };
}

export function advanceAuctionTime(session: RoundSession, elapsedSeconds: number): RoundSession {
  if (session.phase !== 'auction') return session;

  // Detect if caller manually mutated session.auction directly (compat with unit tests)
  const selectedId = session.selectedParcelId ?? session.auction.parcelId;
  let workingAuctions = session.auctions;
  if (session.auction && workingAuctions[selectedId] !== session.auction) {
    workingAuctions = {
      ...workingAuctions,
      [selectedId]: session.auction,
    };
  }

  const nextAuctions = tickAuctions(workingAuctions, elapsedSeconds, session.seed);
  const nextSelected = nextAuctions[selectedId] ?? advanceAuction(session.auction, elapsedSeconds, session.seed);

  return resolveAuctions({
    ...session,
    auctions: nextAuctions,
    auction: nextSelected,
  });
}

export function submitBid(
  session: RoundSession,
  amount: number,
  parcelId?: string,
): RoundSession {
  if (session.phase !== 'auction') return session;
  const targetId = parcelId ?? session.selectedParcelId ?? session.auction.parcelId;

  // Sync any direct mutation on session.auction into auctions map
  let workingAuctions = session.auctions;
  if (session.auction && session.auction.parcelId === targetId && workingAuctions[targetId] !== session.auction) {
    workingAuctions = { ...workingAuctions, [targetId]: session.auction };
  }

  const currentTarget = workingAuctions[targetId];
  if (!currentTarget) return session;

  // Compat: if auction already ended with player winning, resolve immediately
  if (currentTarget.status === 'ended' && (currentTarget.winnerId ?? currentTarget.highBidder) === 'player') {
    return resolveAuctions({ ...session, auctions: workingAuctions, auction: currentTarget });
  }

  // Enforce total cash escrow across all 6 parcels
  const availableCash = getAvailableCash(workingAuctions, session.cash, 'player');
  const ownCommittedOnTarget = currentTarget.committedByBidder?.player ?? 0;
  if (amount > availableCash + ownCommittedOnTarget) {
    return {
      ...session,
      notice: 'That bid exceeds your uncommitted cash across active auctions.',
    };
  }

  const nextAuctions = placeBidInAuctionSet(workingAuctions, targetId, 'player', amount);
  const nextTarget = nextAuctions[targetId];
  if (nextAuctions === workingAuctions || nextTarget === currentTarget) {
    return {
      ...session,
      notice: 'That bid is below the next minimum or outside your budget.',
    };
  }

  const nextSelectedId = session.selectedParcelId ?? targetId;
  return resolveAuctions({
    ...session,
    selectedParcelId: nextSelectedId,
    auctions: nextAuctions,
    auction: nextAuctions[nextSelectedId] ?? nextTarget,
    notice: `You are leading on ${targetId} at $${amount}.`,
  });
}

export const placeBidOnParcel = submitBid;

export function withdrawFromAuction(session: RoundSession, parcelId?: string): RoundSession {
  if (session.phase !== 'auction') return session;
  const targetId = parcelId ?? session.selectedParcelId ?? session.auction.parcelId;
  const nextAuctions = withdrawBidFromAuctionSet(session.auctions, targetId, 'player');
  const nextTarget = nextAuctions[targetId];
  if (!nextTarget || nextTarget === session.auctions[targetId]) {
    return {
      ...session,
      notice:
        session.auction.highBidder === 'player'
          ? 'You hold the leading bid and cannot withdraw until outbid.'
          : 'Unable to withdraw from this parcel auction.',
    };
  }

  const selectedId = session.selectedParcelId ?? targetId;
  return resolveAuctions({
    ...session,
    auctions: nextAuctions,
    auction: nextAuctions[selectedId] ?? nextTarget,
    notice:
      nextTarget.status === 'ended'
        ? 'You withdrew. Another operator secured the parcel.'
        : 'You withdrew from this parcel auction.',
  });
}

export const withdrawFromParcelAuction = withdrawFromAuction;

/** Proceed manually from auction to survey once the player owns at least one parcel. */
export function proceedToSurvey(session: RoundSession): RoundSession {
  if (session.phase !== 'auction') return session;
  const settled = resolveAuctions(session);
  if (settled.phase === 'survey') return settled;

  const ownedId = settled.ownedParcelId ?? settled.ownedParcelIds[0];
  if (!ownedId) {
    return {
      ...settled,
      notice: 'Win at least one parcel in the auction before starting the surface survey.',
    };
  }

  // Close remaining open auctions cleanly when advancing early
  const closedAuctions: Record<string, AuctionState> = {};
  for (const [id, auc] of Object.entries(settled.auctions)) {
    closedAuctions[id] = auc.status === 'open' ? settleAuction(auc) : auc;
  }

  const parcel = settled.parcels.find((p) => p.id === ownedId);
  const stability = computeParcelStabilityBaseline(parcel);

  return {
    ...settled,
    phase: 'survey',
    selectedParcelId: ownedId,
    ownedParcelId: ownedId,
    auctions: closedAuctions,
    auction: closedAuctions[ownedId] ?? settled.auction,
    resourceDepletion: {
      ...settled.resourceDepletion,
      stableGroundRemainingPercent: stability,
      stableGroundDepletionPercent: Math.max(0, 100 - stability),
    },
    notice: `${parcel?.name ?? ownedId} secured. Scan the surface before drilling.`,
  };
}

/** Retry the auction phase with fresh timers if the player won 0 parcels across all 6 lots. */
export function retryAuction(session: RoundSession): RoundSession {
  if (session.phase !== 'auction' || session.ownedParcelIds.length > 0) return session;
  const freshAuctions = createAuctionSet(session.parcels, {
    playerCash: session.cash,
    rivals: session.planet.competition?.rivals ?? RIVAL_COMPANIES,
    seed: session.seed + 17,
  });
  const firstId = session.parcels[0]?.id ?? session.selectedParcelId;
  return {
    ...session,
    auctions: freshAuctions,
    auction: firstId ? freshAuctions[firstId] : session.auction,
    selectedParcelId: firstId,
    notice: 'New auction round opened across all 6 parcels.',
  };
}

function resolveAuctions(session: RoundSession): RoundSession {
  let cash = session.cash;
  let ledger = session.ledger;
  let landCost = session.costs.land;
  const ownedParcelIds = [...session.ownedParcelIds];
  let ownedParcelId = session.ownedParcelId;

  const updatedAuctions: Record<string, AuctionState> = { ...session.auctions };
  const newlyWonNames: string[] = [];

  for (const [parcelId, auc] of Object.entries(updatedAuctions)) {
    if (auc.status !== 'ended') continue;
    const settled = settleAuction(auc);
    updatedAuctions[parcelId] = settled;

    const winner = settled.winnerId ?? settled.highBidder;
    if (winner === 'player' && !ownedParcelIds.includes(parcelId)) {
      const price = settled.finalPrice ?? settled.currentBid;
      if (price <= cash) {
        cash -= price;
        landCost += price;
        ownedParcelIds.push(parcelId);
        if (!ownedParcelId) {
          ownedParcelId = parcelId;
        }
        const parcel = session.parcels.find((p) => p.id === parcelId);
        const label = parcel?.name ?? parcelId;
        newlyWonNames.push(label);
        ledger = appendLedger(
          ledger,
          'cost',
          'land',
          price,
          cash,
          `Won land rights for ${label}`,
          session.elapsedSeconds,
        );
      }
    }
  }

  // Sync playerBudget across remaining open auctions after deducting won parcel price
  if (newlyWonNames.length > 0) {
    const available = getAvailableCash(updatedAuctions, cash, 'player');
    for (const [id, auc] of Object.entries(updatedAuctions)) {
      if (auc.status === 'open') {
        updatedAuctions[id] = { ...auc, playerBudget: available };
      }
    }
  }

  const allClosed = Object.values(updatedAuctions).every((auc) => auc.status === 'ended');
  const selectedId = session.selectedParcelId ?? session.auction.parcelId;
  const selectedEnded = updatedAuctions[selectedId]?.status === 'ended';

  let nextPhase: RoundPhase = session.phase;
  let notice = session.notice;

  if (allClosed) {
    if (ownedParcelIds.length > 0) {
      nextPhase = 'survey';
      const primaryId = ownedParcelId ?? ownedParcelIds[0];
      const primaryParcel = session.parcels.find((p) => p.id === primaryId);
      const stability = computeParcelStabilityBaseline(primaryParcel);
      return {
        ...session,
        phase: nextPhase,
        cash,
        ledger,
        auctions: updatedAuctions,
        auction: updatedAuctions[primaryId] ?? session.auction,
        selectedParcelId: primaryId,
        ownedParcelIds,
        ownedParcelId: primaryId,
        costs: { ...session.costs, land: landCost },
        resourceDepletion: {
          ...session.resourceDepletion,
          stableGroundRemainingPercent: stability,
          stableGroundDepletionPercent: Math.max(0, 100 - stability),
        },
        notice: `${primaryParcel?.name ?? primaryId} secured. Deploy your surface survey before drilling.`,
      };
    }

    notice = 'All 6 parcel auctions ended with rivals winning. Retry the auction to acquire land.';
  } else if (newlyWonNames.length > 0) {
    // Compatibility: if only the selected parcel was explicitly completed in single-parcel flow
    const anyOtherActivePlayerBid = Object.values(updatedAuctions).some(
      (auc) => auc.status === 'open' && auc.highBidder === 'player',
    );
    if (selectedEnded && !anyOtherActivePlayerBid && Object.values(updatedAuctions).filter((a) => a.status === 'ended').length === 1) {
      const primaryId = ownedParcelId ?? ownedParcelIds[0];
      const primaryParcel = session.parcels.find((p) => p.id === primaryId);
      const stability = computeParcelStabilityBaseline(primaryParcel);
      return {
        ...session,
        phase: 'survey',
        cash,
        ledger,
        auctions: updatedAuctions,
        auction: updatedAuctions[primaryId] ?? session.auction,
        selectedParcelId: primaryId,
        ownedParcelIds,
        ownedParcelId: primaryId,
        costs: { ...session.costs, land: landCost },
        resourceDepletion: {
          ...session.resourceDepletion,
          stableGroundRemainingPercent: stability,
          stableGroundDepletionPercent: Math.max(0, 100 - stability),
        },
        notice: `${newlyWonNames.join(', ')} secured! Proceed to Surface Survey or keep bidding.`,
      };
    }
    notice = `${newlyWonNames.join(', ')} secured! Remaining auctions still active.`;
  }

  return {
    ...session,
    phase: nextPhase,
    cash,
    ledger,
    auctions: updatedAuctions,
    auction: updatedAuctions[selectedId] ?? session.auction,
    ownedParcelIds,
    ownedParcelId,
    costs: { ...session.costs, land: landCost },
    notice,
  };
}

/** Perform a 2D surface survey scan on the owned parcel without revealing hidden reservoirs. */
export function performSurfaceScanAt(
  session: RoundSession,
  target: Point,
  parcelId?: string,
  radius: number = SIMULATION_DEFAULTS.roverScanRadius,
): RoundSession {
  const activeParcelId = parcelId ?? session.ownedParcelId ?? session.ownedParcelIds[0];
  if (session.phase !== 'survey' || !activeParcelId) return session;

  const parcel = session.parcels.find((candidate) => candidate.id === activeParcelId);
  if (!parcel) return session;

  const cost = SIMULATION_DEFAULTS.roverScanCost;
  if (cost > session.cash) {
    return { ...session, notice: 'The surface scan cannot be purchased with the remaining budget.' };
  }

  const parcelScans = session.surveys.filter((s) => s.parcelId === parcel.id);
  const scanRecord: SurveyScanRecord = performSurfaceScan(
    parcel,
    target,
    radius,
    cost,
    parcelScans,
  );
  const compatResult = performSurvey(parcel, 'rover-scan', target);
  const compatRover: RoverScanResult = {
    scanPosition: scanRecord.center,
    radius: scanRecord.radius,
    hotspotsFound: scanRecord.revealedHotspots,
    mineralsFound: scanRecord.revealedMinerals,
    stableGroundFound: scanRecord.revealedStableZones,
    faultHintsFound: scanRecord.revealedFaultHints,
    timestamp: scanRecord.timestamp,
  };

  const nextCash = session.cash - cost;
  const ledger = appendLedger(
    session.ledger,
    'cost',
    'survey',
    cost,
    nextCash,
    `Surface scan at (${scanRecord.center.x}, ${scanRecord.center.y})`,
    session.elapsedSeconds,
  );

  return {
    ...session,
    cash: nextCash,
    ledger,
    surveys: [...session.surveys, scanRecord],
    surveyResults: [...session.surveyResults, compatResult],
    roverScans: [...session.roverScans, compatRover],
    costs: { ...session.costs, survey: session.costs.survey + cost },
    notice: `Surface scan complete (${scanRecord.coveragePercent}% coverage): ${scanRecord.revealedHotspots.length} hotspot(s), ${scanRecord.revealedMinerals.length} mineral(s), ${scanRecord.revealedFaultHints.length} fault trace(s).`,
  };
}

export function purchaseSurvey(
  session: RoundSession,
  type: SurveyResult['type'],
  target?: Point,
): RoundSession {
  const activeParcelId = session.ownedParcelId ?? session.ownedParcelIds[0];
  if (session.phase !== 'survey' || !activeParcelId) return session;
  const parcel = session.parcels.find((candidate) => candidate.id === activeParcelId);
  if (!parcel) return session;

  if (type === 'rover-scan') {
    return performSurfaceScanAt(session, target ?? { x: 50, y: 50 }, activeParcelId);
  }

  const result = performSurvey(parcel, type, target);
  if (result.cost > session.cash) {
    return { ...session, notice: 'The survey cannot be purchased with the remaining budget.' };
  }

  const nextCash = session.cash - result.cost;
  const ledger = appendLedger(
    session.ledger,
    'cost',
    'survey',
    result.cost,
    nextCash,
    `Purchased ${type}`,
    session.elapsedSeconds,
  );

  return {
    ...session,
    cash: nextCash,
    ledger,
    surveyResults: [...session.surveyResults, result],
    costs: { ...session.costs, survey: session.costs.survey + result.cost },
    notice:
      type === 'surface-scanner'
        ? 'Surface scanner complete. Surface temperature anomalies and fissures mapped.'
        : 'Gradient probe complete. Approximate subsurface profile mapped.',
  };
}

export function startRoverScan(session: RoundSession, target: Point): RoundSession {
  return performSurfaceScanAt(session, target);
}

export function selectOwnedParcel(session: RoundSession, parcelId: string): RoundSession {
  if (!session.ownedParcelIds.includes(parcelId)) return session;
  return {
    ...session,
    ownedParcelId: parcelId,
    selectedParcelId: parcelId,
  };
}

export function startDrilling(session: RoundSession): RoundSession {
  const activeParcelId = session.ownedParcelId ?? session.ownedParcelIds[0];
  if ((session.phase !== 'survey' && session.phase !== 'operate' && session.phase !== 'production') || !activeParcelId) {
    return session;
  }
  return {
    ...session,
    phase: 'drill',
    ownedParcelId: activeParcelId,
    drillPath: [{ ...SIMULATION_DEFAULTS.wellHeadStartPoint }],
    notice: 'Draw directional borehole path from surface down into underground thermal zones.',
  };
}

export const startNewWell = startDrilling;

export function toggleDrillSnapToLayer(session: RoundSession): RoundSession {
  return {
    ...session,
    drillSnapToLayer: !session.drillSnapToLayer,
    notice: !session.drillSnapToLayer
      ? 'Snap-to-layer enabled. Waypoints lock to strata boundaries.'
      : 'Snap-to-layer disabled. Freeform directional drilling active.',
  };
}

export function addDrillWaypoint(session: RoundSession, point: Point): RoundSession {
  if (session.phase !== 'drill') return session;
  const activeParcelId = session.ownedParcelId ?? session.ownedParcelIds[0];
  const parcel = session.parcels.find((p) => p.id === activeParcelId);
  if (!parcel) return session;
  const newPath = addWaypoint(session.drillPath, point, {
    snapEnabled: session.drillSnapToLayer,
    parcel,
  });
  return { ...session, drillPath: newPath };
}

export function undoDrillWaypoint(session: RoundSession): RoundSession {
  if (session.phase !== 'drill') return session;
  return { ...session, drillPath: undoWaypoint(session.drillPath) };
}

export function clearDrillWaypoints(session: RoundSession): RoundSession {
  if (session.phase !== 'drill') return session;
  return { ...session, drillPath: clearWaypoints({ ...SIMULATION_DEFAULTS.wellHeadStartPoint }) };
}

/**
 * Deploy the drilling-scene underground Echo Scan Car at surface `scanX` (0..100).
 * Debits cash, updates survey cost & ledger, and stores approximate EchoPing clues.
 */
export function deployEchoScanCar(session: RoundSession, scanX = 50): RoundSession {
  const activeParcelId = session.ownedParcelId ?? session.ownedParcelIds[0];
  if (session.phase !== 'drill' || !activeParcelId) return session;

  const parcel = session.parcels.find((candidate) => candidate.id === activeParcelId);
  if (!parcel) return session;

  const cost = SIMULATION_DEFAULTS.echoScanCost;
  if (cost > session.cash) {
    return {
      ...session,
      notice: `Insufficient credits for Echo Scan Car ($${cost} required).`,
    };
  }

  const existingScans = session.echoScans ?? [];
  const scan = performUndergroundEchoScan(
    parcel,
    scanX,
    cost,
    session.seed + existingScans.length * 37,
  );
  const nextCash = session.cash - cost;
  const ledger = appendLedger(
    session.ledger,
    'cost',
    'survey',
    cost,
    nextCash,
    `Echo Scan Car sweep at X=${Math.round(scan.scanX)}`,
    session.elapsedSeconds,
  );

  const thermalCount = scan.pings.filter((p) => p.kind === 'thermal').length;
  const mineralCount = scan.pings.filter((p) => p.kind === 'mineral').length;
  const faultCount = scan.pings.filter((p) => p.kind === 'fault').length;

  return {
    ...session,
    cash: nextCash,
    ledger,
    echoScans: [...existingScans, scan],
    costs: {
      ...session.costs,
      survey: session.costs.survey + cost,
    },
    notice: `Echo scan complete at X=${Math.round(scan.scanX)}: ${thermalCount} thermal, ${mineralCount} mineral, ${faultCount} fault echoes.`,
  };
}

/**
 * Upgrade the rig's progressive drill bit speed tier (Levels 1 -> 4).
 * Logs upgrade spend to ledger and costs.upgrades for exact settlement accounting.
 */
export function purchaseDrillSpeedUpgrade(session: RoundSession): RoundSession {
  if (session.phase === 'settled' || session.phase === 'report') {
    return session;
  }

  const currentLevel = session.drillSpeedLevel ?? 1;
  const nextTier = DRILL_UPGRADE_TIERS.find((tier) => tier.level === currentLevel + 1);
  if (!nextTier) {
    const currentTier = getDrillSpeedTier(currentLevel);
    return {
      ...session,
      notice: `Drill rig already at maximum tier (${currentTier.name}).`,
    };
  }

  if (session.cash < nextTier.upgradeCost) {
    return {
      ...session,
      notice: `${nextTier.name} requires $${nextTier.upgradeCost} (outside remaining budget).`,
    };
  }

  const nextCash = session.cash - nextTier.upgradeCost;
  const ledger = appendLedger(
    session.ledger,
    'cost',
    'upgrades',
    nextTier.upgradeCost,
    nextCash,
    `Upgraded drill bit to ${nextTier.name} (Lv ${nextTier.level})`,
    session.elapsedSeconds,
  );

  return {
    ...session,
    cash: nextCash,
    ledger,
    drillSpeedLevel: nextTier.level,
    costs: {
      ...session.costs,
      upgrades: session.costs.upgrades + nextTier.upgradeCost,
    },
    notice: `Upgraded to ${nextTier.name} (${nextTier.speedMultiplier}x drill speed)!`,
  };
}

/**
 * Validate and execute a new directional well on the active owned parcel.
 * Supports multi-well architecture; keeps player in `'drill'` if dry/blocked with no active wells.
 */
export function drillWell(
  session: RoundSession,
  path: Point[],
  options?: { wellName?: string; parcelId?: string; proceedToOperate?: boolean },
): RoundSession {
  const activeParcelId = options?.parcelId ?? session.ownedParcelId ?? session.ownedParcelIds[0];
  if (session.phase !== 'drill' || !activeParcelId || path.length < 2) return session;

  const parcel = session.parcels.find((candidate) => candidate.id === activeParcelId);
  if (!parcel) return session;

  const validation = validateDrillingPath(path, parcel, {
    snapEnabled: session.drillSnapToLayer,
    availableCash: session.cash,
    drillUpgradeLevel: session.upgrades.drill,
    existingWells: session.wells,
  });

  if (!validation.valid && !validation.hitsBlockingFault) {
    return {
      ...session,
      notice: validation.reasons[0] ?? 'Invalid drilling path.',
    };
  }

  const wellIndex = session.wells.length + 1;
  const wellId = `well-${String(wellIndex).padStart(2, '0')}`;
  const wellName = options?.wellName ?? `W-${String(wellIndex).padStart(2, '0')}`;

  const execution = executeWellDrilling(wellId, wellName, path, parcel, {
    snapEnabled: session.drillSnapToLayer,
    availableCash: session.cash,
    drillUpgradeLevel: session.upgrades.drill,
    existingWells: session.wells,
  });

  if (execution.cost > session.cash) {
    return { ...session, notice: 'That route is outside the remaining drilling budget.' };
  }

  const wellRecord: WellRecord = {
    id: execution.id,
    name: execution.name,
    parcelId: execution.parcelId,
    path: execution.path,
    totalLength: execution.totalLength,
    maxDepth: execution.maxDepth,
    cost: execution.cost,
    crossedLayers: execution.crossedLayers,
    intersectedFaults: execution.intersectedFaults,
    intersectedAquifers: execution.intersectedAquifers,
    tappedReservoirIds: execution.tappedReservoirIds,
    flowContribution: execution.flowContribution,
    wellheadTempC: execution.wellheadTempC,
    status: execution.status,
  };

  let cash = session.cash - execution.cost;
  let ledger = appendLedger(
    session.ledger,
    'cost',
    'drilling',
    execution.cost,
    cash,
    `Drilled ${wellName} (${execution.status}, ${Math.round(execution.maxDepth)}m)`,
    session.elapsedSeconds,
  );

  // Surface piping connection cost proportional to well length (for active wells)
  const pipeInstallCost =
    execution.status === 'active' ? Math.round(execution.totalLength * 0.4 * 100) / 100 : 0;
  if (pipeInstallCost > 0 && pipeInstallCost <= cash) {
    cash -= pipeInstallCost;
    ledger = appendLedger(
      ledger,
      'cost',
      'pipes',
      pipeInstallCost,
      cash,
      `Hot-fluid surface pipe hookup for ${wellName}`,
      session.elapsedSeconds,
    );
  }

  const nextWells = [...session.wells, wellRecord];
  const wellSummary = summarizeParcelWells(nextWells);
  const discoveredReservoirIds = Array.from(
    new Set([...session.discoveredReservoirIds, ...wellSummary.tappedReservoirIds]),
  );

  // Mark intersected faults as revealed on parcel
  const updatedParcels = session.parcels.map((p) => {
    if (p.id !== parcel.id || !p.faults) return p;
    return {
      ...p,
      faults: p.faults.map((f) =>
        execution.intersectedFaults.includes(f.id) ? { ...f, revealed: true } : f,
      ),
    };
  });

  const tappedReservoirs = updatedParcels
    .filter((p) => p.id === parcel.id || session.ownedParcelIds.includes(p.id))
    .flatMap((p) => p.reservoirs)
    .filter((r) => discoveredReservoirIds.includes(r.id));

  const primaryReservoir = tappedReservoirs[0];
  const startingHeat = tappedReservoirs.reduce((sum, r) => sum + r.initialHeat, 0);
  const remainingHeat = tappedReservoirs.reduce((sum, r) => sum + r.remainingHeat, 0);
  const networkLength = nextWells
    .filter((w) => w.status === 'active')
    .reduce((sum, w) => sum + w.totalLength, 0);

  const shouldProceed =
    options?.proceedToOperate !== false &&
    (execution.status === 'active' || wellSummary.activeWellCount > 0);

  const nextPlant: PlantChainState = {
    ...session.plant,
    wellFlow: wellSummary.totalFlowContribution,
    hotPipe: {
      ...session.plant.hotPipe,
      type: session.pipeType,
      length: networkLength,
      inletTempC: wellSummary.weightedWellheadTempC,
      outletTempC: wellSummary.weightedWellheadTempC,
    },
    operatingState: shouldProceed ? 'running' : session.plant.operatingState,
  };

  const initialTelemetry = primaryReservoir
    ? computePlantTelemetry(primaryReservoir, {
        flowRate: wellSummary.totalFlowContribution,
        heatExchangerEfficiency:
          SIMULATION_DEFAULTS.exchangerBaseEfficiency + session.upgrades.exchanger * 0.03,
        returnFluidLoop: session.returnFluidLoopActive,
        storageLevelTH: session.storageTherm,
        storageCapacityTH: session.storageCapacity,
        gridExportPrice: session.currentPrice,
        totalExportedMWh: session.powerGeneratedMWh,
        roundTimeRemainingSeconds: nextPlant.roundTimeRemainingSeconds,
      })
    : session.plantTelemetry;

  let notice: string;
  if (execution.status === 'blocked') {
    notice = `${wellName} struck an impenetrable fault and was blocked! Drill a detour path.`;
  } else if (execution.status === 'active') {
    const tempDisplay = Math.round(deriveReservoirTemperature(primaryReservoir ?? { temperature: execution.wellheadTempC, initialHeat: 1, remainingHeat: 1 }));
    notice = `${wellName} tapped ${execution.tappedReservoirIds.length} reservoir(s) at ${execution.maxDepth}m (${tempDisplay}°C)! Geothermal loop ready.`;
  } else {
    notice =
      wellSummary.activeWellCount > 0
        ? `${wellName} missed all reservoirs (dry hole). Existing active wells remain online.`
        : `${wellName} missed all thermal reservoirs (dry hole). Drill another well to tap heat.`;
  }

  return {
    ...session,
    phase: shouldProceed ? 'operate' : 'drill',
    cash,
    ledger,
    parcels: updatedParcels,
    wells: nextWells,
    drillPath: execution.path,
    discoveredReservoirIds,
    activeReservoir: primaryReservoir,
    startingHeat,
    remainingHeat,
    networkLength,
    plant: nextPlant,
    plantTelemetry: initialTelemetry,
    costs: {
      ...session.costs,
      drilling: session.costs.drilling + execution.cost,
      pipes: session.costs.pipes + pipeInstallCost,
    },
    notice,
  };
}

export function confirmDrillPath(session: RoundSession, path: Point[]): RoundSession {
  return drillWell(session, path);
}

export function startOperation(session: RoundSession): RoundSession {
  if (session.phase !== 'operate' && session.phase !== 'production') return session;
  return {
    ...session,
    phase: 'operate',
    isPaused: false,
    plant: {
      ...session.plant,
      operatingState: session.plant.operatingState === 'depleted' ? 'depleted' : 'running',
    },
    notice: 'Operating. Watch thermal circulation, storage buffer, and grid export.',
  };
}

export function setSimulationSpeed(session: RoundSession, speed: RoundSpeed): RoundSession {
  return {
    ...session,
    speed,
    isPaused: speed === 0,
    plant: {
      ...session.plant,
      operatingState:
        speed === 0
          ? session.plant.operatingState === 'completed' || session.plant.operatingState === 'depleted'
            ? session.plant.operatingState
            : 'paused'
          : session.plant.operatingState === 'paused' || session.plant.operatingState === 'idle'
            ? 'running'
            : session.plant.operatingState,
    },
  };
}

export function toggleSimulationPause(session: RoundSession): RoundSession {
  const nextPaused = !session.isPaused;
  return {
    ...session,
    isPaused: nextPaused,
    plant: {
      ...session.plant,
      operatingState: nextPaused
        ? session.plant.operatingState === 'completed' || session.plant.operatingState === 'depleted'
          ? session.plant.operatingState
          : 'paused'
        : session.plant.operatingState === 'paused' || session.plant.operatingState === 'idle'
          ? 'running'
          : session.plant.operatingState,
    },
  };
}

export function toggleReturnFluidLoop(session: RoundSession): RoundSession {
  const nextLoop = !session.returnFluidLoopActive;
  const telemetry = session.activeReservoir
    ? computePlantTelemetry(session.activeReservoir, {
        flowRate: session.plant.wellFlow || session.activeReservoir.flowPotential,
        heatExchangerEfficiency:
          SIMULATION_DEFAULTS.exchangerBaseEfficiency + session.upgrades.exchanger * 0.03,
        returnFluidLoop: nextLoop,
        storageLevelTH: session.storageTherm,
        storageCapacityTH: session.storageCapacity,
        gridExportPrice: session.currentPrice,
        totalExportedMWh: session.powerGeneratedMWh,
        roundTimeRemainingSeconds: session.plant.roundTimeRemainingSeconds,
      })
    : session.plantTelemetry;

  return {
    ...session,
    returnFluidLoopActive: nextLoop,
    plant: {
      ...session.plant,
      returnFluidLoop: {
        ...session.plant.returnFluidLoop,
        active: nextLoop,
      },
    },
    plantTelemetry: telemetry,
    notice: nextLoop
      ? 'Return fluid loop reinjection active. Closed loop circulation stabilized.'
      : 'Return fluid pipe disconnected: continuous circulation throttled to 15%.',
  };
}

export function toggleExportActive(session: RoundSession): RoundSession {
  const nextExport = !session.plant.exportActive;
  return {
    ...session,
    plant: {
      ...session.plant,
      exportActive: nextExport,
    },
    notice: nextExport
      ? 'Electricity export to grid enabled.'
      : 'Grid export paused; buffering heat into thermal storage tank.',
  };
}

export function setPipeType(session: RoundSession, pipeType: PipeTypeId): RoundSession {
  return {
    ...session,
    pipeType,
    plant: {
      ...session.plant,
      hotPipe: {
        ...session.plant.hotPipe,
        type: pipeType,
      },
    },
  };
}

/** Update requested extraction rate (TU/s) across active wells, capped by tapped reservoir potential. */
export function setExtractionRate(session: RoundSession, rate: number): RoundSession {
  if (!Number.isFinite(rate)) return session;
  const requestedTotal = Math.max(0.5, Math.min(24, rate));
  const reservoirMap = new Map<string, Reservoir>();
  for (const parcel of session.parcels) {
    for (const res of parcel.reservoirs) {
      reservoirMap.set(res.id, res);
    }
  }

  const activeWells = session.wells.filter((w) => w.status === 'active');
  let totalMaxPotential = 0;
  const wellCapacities = new Map<string, number>();

  for (const well of activeWells) {
    const cap = well.tappedReservoirIds.reduce(
      (sum, id) => sum + Math.max(0, reservoirMap.get(id)?.flowPotential ?? 0),
      0,
    );
    const effectiveCap = cap > 0 ? cap : Math.max(1, well.flowContribution || 10);
    wellCapacities.set(well.id, effectiveCap);
    totalMaxPotential += effectiveCap;
  }

  const fallbackCap = session.activeReservoir?.flowPotential ?? 12;
  const cappedTotal =
    activeWells.length > 0
      ? Math.min(requestedTotal, Math.max(0.5, totalMaxPotential))
      : Math.min(requestedTotal, Math.max(0.5, fallbackCap));

  const nextWells = session.wells.map((well) => {
    if (well.status !== 'active') return well;
    const cap = wellCapacities.get(well.id) ?? cappedTotal;
    const share = totalMaxPotential > 0 ? (cap / totalMaxPotential) * cappedTotal : cappedTotal / activeWells.length;
    return {
      ...well,
      flowContribution: Math.round(share * 100) / 100,
    };
  });

  const effectiveFlow = session.returnFluidLoopActive ? cappedTotal : Math.round(cappedTotal * 0.15 * 100) / 100;
  const primaryReservoir = session.activeReservoir;
  const nextTelemetry = primaryReservoir
    ? computePlantTelemetry(primaryReservoir, {
        flowRate: cappedTotal,
        heatExchangerEfficiency:
          SIMULATION_DEFAULTS.exchangerBaseEfficiency + session.upgrades.exchanger * 0.03,
        returnFluidLoop: session.returnFluidLoopActive,
        storageLevelTH: session.storageTherm,
        storageCapacityTH: session.storageCapacity,
        gridExportPrice: session.currentPrice,
        totalExportedMWh: session.powerGeneratedMWh,
        roundTimeRemainingSeconds: session.plant.roundTimeRemainingSeconds,
      })
    : session.plantTelemetry;

  return {
    ...session,
    wells: nextWells,
    plant: {
      ...session.plant,
      wellFlow: Math.round(effectiveFlow * 10) / 10,
    },
    plantTelemetry: nextTelemetry,
    notice: `Extraction rate set to ${cappedTotal.toFixed(1)} TU/s.`,
  };
}

/** Deterministic frame-rate-independent simulation tick across active phases. */
export function tickSession(session: RoundSession, deltaTime: number): RoundSession {
  if (session.phase === 'auction') {
    if (session.isPaused || session.speed === 0) return session;
    return advanceAuctionTime(session, deltaTime * session.speed);
  }
  if (session.phase === 'operate' || session.phase === 'production') {
    return updateSimulation(deltaTime, session);
  }
  return session;
}

export function advanceOperation(
  session: RoundSession,
  elapsedSeconds: number,
  speed?: number,
): RoundSession {
  if ((session.phase !== 'operate' && session.phase !== 'production') || elapsedSeconds <= 0) {
    return session;
  }

  if (typeof speed === 'number') {
    const validSpeed: RoundSpeed = speed <= 0 ? 0 : speed >= 3 ? 3 : speed >= 2 ? 2 : 1;
    const stepped = updateSimulation(elapsedSeconds, {
      ...session,
      speed: validSpeed,
      isPaused: validSpeed === 0,
    });
    return {
      ...stepped,
      speed: session.speed,
      isPaused: session.isPaused,
    };
  }

  return updateSimulation(elapsedSeconds, session);
}

export function purchaseUpgrade(
  session: RoundSession,
  upgrade: 'drill' | 'pipes' | 'exchanger',
): RoundSession {
  if (
    session.phase === 'settled' ||
    session.phase === 'report' ||
    session.upgrades[upgrade] > 0
  ) {
    return session;
  }

  const prices = { drill: 120, pipes: 160, exchanger: 140 } as const;
  const price = prices[upgrade];
  if (session.cash < price) {
    return { ...session, notice: 'That upgrade is outside the remaining budget.' };
  }

  const nextCash = session.cash - price;
  const nextPipeType: PipeType = upgrade === 'pipes' ? 'insulated' : (session.pipeType as PipeType);
  const nextExchangerLevel =
    upgrade === 'exchanger' ? session.upgrades.exchanger + 1 : session.upgrades.exchanger;
  const ledger = appendLedger(
    session.ledger,
    'cost',
    'upgrades',
    price,
    nextCash,
    `Installed ${upgrade} upgrade`,
    session.elapsedSeconds,
  );

  return {
    ...session,
    cash: nextCash,
    ledger,
    pipeType: nextPipeType,
    upgrades: { ...session.upgrades, [upgrade]: 1 },
    plant: {
      ...session.plant,
      hotPipe: {
        ...session.plant.hotPipe,
        type: nextPipeType,
      },
      heatExchanger: {
        ...session.plant.heatExchanger,
        upgradeLevel: nextExchangerLevel,
        efficiency: Math.min(
          0.99,
          SIMULATION_DEFAULTS.exchangerBaseEfficiency + nextExchangerLevel * 0.03,
        ),
      },
    },
    costs: { ...session.costs, upgrades: session.costs.upgrades + price },
    notice: `${upgrade[0].toUpperCase()}${upgrade.slice(1)} upgrade installed.`,
  };
}

export function sellStoredTherm(
  session: RoundSession,
  amount = session.storageTherm,
): RoundSession {
  const sold = Math.min(session.storageTherm, Math.max(0, amount));
  if (sold <= 0) return session;
  const revenue = calculateThermMarketValue(sold, session.currentPrice);
  const nextCash = session.cash + revenue;
  const nextStorage = session.storageTherm - sold;
  const nextRevenue = session.salesRevenue + revenue;

  const ledger = appendLedger(
    session.ledger,
    'revenue',
    'sale',
    revenue,
    nextCash,
    `Sold ${Math.round(sold)} TH buffer to market`,
    session.elapsedSeconds,
  );

  return {
    ...session,
    cash: nextCash,
    ledger,
    storageTherm: nextStorage,
    salesRevenue: nextRevenue,
    plant: {
      ...session.plant,
      storageTankTH: nextStorage,
      totalExportRevenue: nextRevenue,
    },
    notice: `${Math.round(sold)} TH sold for $${Math.round(revenue)}.`,
  };
}

export function settleSession(session: RoundSession): SettlementResult {
  const syncedSession =
    session.salesRevenue > (session.plant?.totalExportRevenue ?? 0) ||
    session.powerGeneratedMWh > (session.plant?.totalExportedMWh ?? 0)
      ? {
          ...session,
          plant: {
            ...session.plant,
            totalExportRevenue: Math.max(session.plant?.totalExportRevenue ?? 0, session.salesRevenue),
            totalExportedMWh: Math.max(session.plant?.totalExportedMWh ?? 0, session.powerGeneratedMWh),
          },
        }
      : session;
  return settleGameState(syncedSession);
}

function reconcileLedgerForSettlement(
  session: RoundSession,
  settlement: SettlementResult,
): LedgerEntry[] {
  let ledger = [...session.ledger];
  const recordedSales = ledger
    .filter((entry) => entry.category === 'sale')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const unrecordedSales = Math.max(0, Math.round((settlement.revenue - recordedSales) * 100) / 100);
  if (unrecordedSales > 0) {
    ledger = appendLedger(
      ledger,
      'revenue',
      'sale',
      unrecordedSales,
      session.cash,
      'Grid electricity export revenue',
      session.elapsedSeconds,
    );
  }

  const recordedOperating = ledger
    .filter((entry) => entry.category === 'operating')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const unrecordedOperating = Math.max(
    0,
    Math.round((settlement.costs.operating - recordedOperating) * 100) / 100,
  );
  if (unrecordedOperating > 0) {
    ledger = appendLedger(
      ledger,
      'cost',
      'operating',
      unrecordedOperating,
      session.cash,
      'Geothermal plant operations & maintenance',
      session.elapsedSeconds,
    );
  }

  return ledger;
}

export function completeSession(session: RoundSession): RoundSession {
  const settlement = settleSession(session);
  const ledger = reconcileLedgerForSettlement(session, settlement);
  const sign = settlement.profit >= 0 ? '+' : '−';
  const roiSign = settlement.profitPercentage >= 0 ? '+' : '';

  return {
    ...session,
    phase: 'settled',
    ledger,
    settlement,
    resourceDepletion: settlement.depletion,
    plant: {
      ...session.plant,
      operatingState: 'completed',
    },
    notice: `Round ${session.campaignRound} settled (${sign}$${Math.abs(Math.round(settlement.profit))}, ${roiSign}${settlement.profitPercentage}% ROI). Review report before continuing.`,
  };
}

export const completeRound = completeSession;

export function advanceToNextRound(session: RoundSession): RoundSession {
  const settled = session.settlement ?? settleSession(session);
  const nextRoundNumber = session.campaignRound + 1;
  const roundProfit = settled.profit;
  const roundRevenue = settled.revenue;
  const nextTotalProfit = session.totalCampaignProfit + roundProfit;
  const nextCareerRevenue = session.careerRevenue + roundRevenue;

  const primaryParcelId = session.ownedParcelId ?? session.ownedParcelIds[0] ?? session.parcels[0]?.id ?? '';
  const currentParcel = session.parcels.find((p) => p.id === primaryParcelId);

  const roundSummary: RoundSummary = {
    round: session.campaignRound,
    parcelId: primaryParcelId,
    parcelName: currentParcel?.name ?? 'Geothermal Parcel',
    biome: currentParcel?.biome ?? 'volcanic',
    revenue: roundRevenue,
    costs: settled.totalCosts,
    profit: roundProfit,
    profitPercentage: settled.profitPercentage,
    roiPercent: settled.roiPercent,
    thermalDepletedPercent: settled.depletion.thermalDepletionPercent,
    mineralsDepletedPercent: settled.depletion.mineralsDepletionPercent,
    stableGroundScore: settled.depletion.stableGroundRemainingPercent,
    powerGeneratedMWh: settled.powerGeneratedMWh,
  };

  const nextHistory = [...session.roundHistory, roundSummary];
  const nextSeed = session.seed + session.campaignRound * 100;
  const nextParcels = generatePlanetParcels(session.planet, nextSeed);
  const nextCash = Math.max(500, session.cash);

  const baseRivals = session.planet.competition?.rivals ?? RIVAL_COMPANIES;
  const scaledRivals = baseRivals.map((rival, index) => ({
    ...rival,
    startingBudget: rival.startingBudget + session.campaignRound * (45 + index * 15),
  }));

  const nextAuctions = createAuctionSet(nextParcels, {
    playerCash: nextCash,
    rivals: scaledRivals,
    seed: nextSeed,
  });
  const firstParcelId = nextParcels[0]?.id ?? null;

  const freshPlant = createInitialPlantChainState({
    pipeType: session.pipeType,
    networkLength: 0,
    storageCapacityTH: session.storageCapacity,
    exportCapacityMW: SIMULATION_DEFAULTS.exportCapacityMW,
    marketPricePerMWh: DEFAULT_MARKET_PRICE_PER_MWH,
    exchangerEfficiency:
      SIMULATION_DEFAULTS.exchangerBaseEfficiency + session.upgrades.exchanger * 0.03,
    exchangerUpgradeLevel: session.upgrades.exchanger,
    returnLoopActive: true,
    roundDurationSeconds: session.roundDurationSeconds,
  });

  return {
    ...session,
    seed: nextSeed,
    phase: 'auction',
    cash: nextCash,
    startingCash: nextCash,
    ledger: [],
    parcels: nextParcels,
    auctions: nextAuctions,
    auction: firstParcelId ? nextAuctions[firstParcelId] : session.auction,
    selectedParcelId: firstParcelId,
    ownedParcelIds: [],
    ownedParcelId: undefined,
    surveys: [],
    echoScans: [],
    surveyResults: [],
    roverScans: [],
    wells: [],
    drillPath: [],
    drillSnapToLayer: false,
    drillSpeedLevel: session.drillSpeedLevel ?? 1,
    discoveredReservoirIds: [],
    activeReservoir: undefined,
    startingHeat: 0,
    remainingHeat: 0,
    plant: freshPlant,
    plantTelemetry: {
      ...DEFAULT_TELEMETRY,
      temperatureC: 0,
      powerMW: 0,
      exportRateMW: 0,
      returnFluidLoopFlow: 0,
      closedLoopPressureBar: 0,
      storageTankCapacityTH: session.storageCapacity,
      roundTimeRemainingSeconds: session.roundDurationSeconds,
    },
    resourceDepletion: { ...ZERO_DEPLETION },
    storageTherm: 0,
    networkLength: 0,
    pipeFlow: 0,
    pipeHeatLoss: 0,
    pipeOutletTemperature: 0,
    lastOutput: 0,
    elapsedSeconds: 0,
    salesRevenue: 0,
    costs: { land: 0, survey: 0, drilling: 0, pipes: 0, upgrades: 0, operating: 0 },
    powerGeneratedMWh: 0,
    settlement: undefined,
    campaignRound: nextRoundNumber,
    totalCampaignProfit: nextTotalProfit,
    careerRevenue: nextCareerRevenue,
    roundHistory: nextHistory,
    notice: `Round ${nextRoundNumber} initiated! 6 new ${session.planet.name} parcels open for bidding.`,
  };
}

export const SESSION_DEFAULTS = {
  cash: DEFAULT_CASH,
  storageCapacity: DEFAULT_STORAGE,
  pipeCostPerDistance: 0.4,
  roundDurationSeconds: SIMULATION_DEFAULTS.roundDurationSeconds,
} as const;
