import { SIMULATION_DEFAULTS, ZEPHYR_7_CONFIG } from '../simulation/constants';
import { getPlanetConfig } from '../simulation/planets';
import { createInitialPlantChainState } from '../simulation/update';
import { createRoundSession, type RoundSession, ZERO_DEPLETION } from './session';
import { GAME_SESSION_SCHEMA_VERSION, type RoundPhase, type SaveSlotInfo } from './types';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const ROUND_SESSION_KEY = 'thermal-frontier:round-session';

const VALID_PHASES: RoundPhase[] = [
  'planet',
  'auction',
  'survey',
  'drill',
  'operate',
  'production',
  'report',
  'settled',
];

function browserStorage(): StorageLike | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage;
}

export function saveSession(
  session: RoundSession,
  storage: StorageLike | undefined = browserStorage(),
): void {
  if (!storage) return;
  const payload: RoundSession = {
    ...session,
    schemaVersion: GAME_SESSION_SCHEMA_VERSION,
  };
  storage.setItem(ROUND_SESSION_KEY, JSON.stringify(payload));
}

export function loadSession(
  storage: StorageLike | undefined = browserStorage(),
): RoundSession | undefined {
  if (!storage) return undefined;
  const serialized = storage.getItem(ROUND_SESSION_KEY);
  if (!serialized) return undefined;

  try {
    const raw = JSON.parse(serialized) as Partial<RoundSession> & { planet?: { id?: string } };
    if (
      !raw ||
      !Array.isArray(raw.parcels) ||
      !raw.auction ||
      !VALID_PHASES.includes((raw.phase ?? '') as RoundPhase)
    ) {
      return undefined;
    }

    const planetId = raw.planetId ?? raw.planet?.id ?? ZEPHYR_7_CONFIG.id;
    const planet = getPlanetConfig(planetId);
    const defaults = createRoundSession(raw.seed ?? 42, raw.cash ?? planet.startingCash, {
      planetId: planet.id,
    });

    const ownedParcelIds = Array.isArray(raw.ownedParcelIds)
      ? raw.ownedParcelIds
      : raw.ownedParcelId
        ? [raw.ownedParcelId]
        : [];

    const auctions =
      raw.auctions && Object.keys(raw.auctions).length > 0
        ? raw.auctions
        : {
            ...defaults.auctions,
            [raw.auction.parcelId]: raw.auction,
          };

    const roundDurationSeconds =
      raw.roundDurationSeconds ?? planet.roundDurationSeconds ?? SIMULATION_DEFAULTS.roundDurationSeconds;

    const plant = raw.plant
      ? {
          ...createInitialPlantChainState({
            pipeType: raw.pipeType ?? 'basic',
            networkLength: raw.networkLength ?? 0,
            storageCapacityTH: raw.storageCapacity ?? defaults.storageCapacity,
            roundDurationSeconds,
          }),
          ...raw.plant,
        }
      : createInitialPlantChainState({
          pipeType: raw.pipeType ?? 'basic',
          networkLength: raw.networkLength ?? 0,
          storageCapacityTH: raw.storageCapacity ?? defaults.storageCapacity,
          returnLoopActive: raw.returnFluidLoopActive ?? true,
          roundDurationSeconds,
        });

    return {
      ...defaults,
      ...raw,
      schemaVersion: GAME_SESSION_SCHEMA_VERSION,
      planetId: planet.id,
      planet,
      startingCash: raw.startingCash ?? raw.cash ?? defaults.startingCash,
      ledger: Array.isArray(raw.ledger) ? raw.ledger : [],
      auctions,
      selectedParcelId: raw.selectedParcelId ?? raw.auction.parcelId ?? defaults.selectedParcelId,
      ownedParcelIds,
      surveys: Array.isArray(raw.surveys) ? raw.surveys : [],
      echoScans: Array.isArray(raw.echoScans) ? raw.echoScans : [],
      surveyResults: Array.isArray(raw.surveyResults) ? raw.surveyResults : [],
      roverScans: Array.isArray(raw.roverScans) ? raw.roverScans : [],
      wells: Array.isArray(raw.wells) ? raw.wells : [],
      drillPath: Array.isArray(raw.drillPath) ? raw.drillPath : [],
      drillSnapToLayer: raw.drillSnapToLayer ?? false,
      drillSpeedLevel:
        typeof raw.drillSpeedLevel === 'number' && raw.drillSpeedLevel >= 1
          ? Math.floor(raw.drillSpeedLevel)
          : 1,
      discoveredReservoirIds: Array.isArray(raw.discoveredReservoirIds) ? raw.discoveredReservoirIds : [],
      costs: { ...defaults.costs, ...raw.costs },
      upgrades: { ...defaults.upgrades, ...raw.upgrades },
      plant,
      plantTelemetry: raw.plantTelemetry ?? defaults.plantTelemetry,
      resourceDepletion: raw.resourceDepletion ?? { ...ZERO_DEPLETION },
      returnFluidLoopActive: raw.returnFluidLoopActive ?? true,
      speed: raw.speed ?? 1,
      isPaused: raw.isPaused ?? false,
      roundDurationSeconds,
      campaignRound: raw.campaignRound ?? 1,
      totalCampaignProfit: raw.totalCampaignProfit ?? 0,
      careerRevenue: raw.careerRevenue ?? 0,
      roundHistory: Array.isArray(raw.roundHistory) ? raw.roundHistory : [],
      powerGeneratedMWh: raw.powerGeneratedMWh ?? 0,
    } as RoundSession;
  } catch {
    return undefined;
  }
}

export function hasSavedSession(
  storage: StorageLike | undefined = browserStorage(),
): boolean {
  return loadSession(storage) !== undefined;
}

export function getSaveSlotInfo(
  storage: StorageLike | undefined = browserStorage(),
): SaveSlotInfo {
  const session = loadSession(storage);
  if (!session) {
    return {
      hasSave: false,
      schemaVersion: GAME_SESSION_SCHEMA_VERSION,
      planetId: ZEPHYR_7_CONFIG.id,
      campaignRound: 1,
      phase: 'planet',
      cash: SIMULATION_DEFAULTS.startingBudget,
    };
  }
  return {
    hasSave: true,
    schemaVersion: session.schemaVersion,
    planetId: session.planetId,
    campaignRound: session.campaignRound,
    phase: session.phase,
    cash: session.cash,
  };
}

export function clearSavedSession(
  storage: StorageLike | undefined = browserStorage(),
): void {
  storage?.removeItem(ROUND_SESSION_KEY);
}

export const saveRoundSession = saveSession;
export const loadRoundSession = loadSession;
export const clearRoundSession = clearSavedSession;
