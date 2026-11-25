import type {
  AuctionState,
  EchoScanRecord,
  Parcel,
  PipeTypeId,
  PlanetConfig,
  PlantChainState,
  PlantTelemetry,
  Point,
  Reservoir,
  ResourceDepletion,
  RoundSettlement,
  RoverScanResult,
  SurveyResult,
  SurveyScanRecord,
  WellRecord,
} from '../simulation';
import type { PlanetInfo } from '../simulation/constants';
import type { PipeType } from '../simulation/pipes';
import type { SettlementResult } from '../simulation/settlement';

export type RoundPhase =
  | 'planet'
  | 'auction'
  | 'survey'
  | 'drill'
  | 'operate'
  | 'production'
  | 'report'
  | 'settled';

export type GamePhase = RoundPhase;

export type RoundSpeed = 0 | 1 | 2 | 3;

export const GAME_SESSION_SCHEMA_VERSION = 2;

export interface RoundCosts {
  land: number;
  survey: number;
  drilling: number;
  pipes: number;
  upgrades: number;
  operating: number;
}

export interface RoundSummary {
  round: number;
  parcelId: string;
  parcelName: string;
  biome: string;
  revenue: number;
  costs: number;
  profit: number;
  profitPercentage: number;
  roiPercent?: number;
  thermalDepletedPercent: number;
  mineralsDepletedPercent: number;
  stableGroundScore: number;
  powerGeneratedMWh: number;
}

export interface SessionOptions {
  startingBudget?: number;
  storageCapacityTH?: number;
  initialPhase?: RoundPhase;
  startAtPlanet?: boolean;
  planet?: PlanetInfo | PlanetConfig;
  planetId?: string;
  campaignRound?: number;
  totalCampaignProfit?: number;
}

export interface SurveyRecord {
  parcelId: string;
  result: SurveyResult;
}

export interface DrillRecord {
  parcelId: string;
  path: Point[];
  distance: number;
  cost: number;
  crossedLayers: string[];
  revealedReservoirIds: string[];
  aquiferBreached?: boolean;
  lavaTapped?: boolean;
}

export interface OperationState {
  reservoirId: string | null;
  flowRate: number;
  elapsedSeconds: number;
  storageTH: number;
  storageCapacityTH: number;
  totalProducedTH: number;
  wastedTH: number;
  totalSoldTH: number;
  revenue: number;
  marketPrice: number;
  startingHeat: number;
}

export type LedgerCategory =
  | 'land'
  | 'survey'
  | 'drilling'
  | 'pipes'
  | 'upgrades'
  | 'operating'
  | 'sale';

export interface LedgerEntry {
  kind: 'cost' | 'revenue';
  category: LedgerCategory;
  amount: number;
  balanceAfter: number;
  detail: string;
  timestampSeconds?: number;
}

/** Canonical GDD GameState / RoundSession contract for simulation, persistence, and UI. */
export interface GameState {
  schemaVersion: number;
  seed: number;
  planetId: string;
  planet: PlanetConfig;
  phase: RoundPhase;
  cash: number;
  startingCash: number;
  ledger: LedgerEntry[];
  parcels: Parcel[];
  auctions: Record<string, AuctionState>;
  auction: AuctionState;
  selectedParcelId: string | null;
  ownedParcelIds: string[];
  ownedParcelId?: string;
  surveys: SurveyScanRecord[];
  echoScans?: EchoScanRecord[];
  surveyResults: SurveyResult[];
  roverScans: RoverScanResult[];
  wells: WellRecord[];
  drillPath: Point[];
  drillSnapToLayer: boolean;
  drillSpeedLevel?: number;
  discoveredReservoirIds: string[];
  activeReservoir?: Reservoir;
  startingHeat: number;
  remainingHeat: number;
  plant: PlantChainState;
  plantTelemetry: PlantTelemetry;
  resourceDepletion: ResourceDepletion;
  storageTherm: number;
  storageCapacity: number;
  pipeType: PipeTypeId;
  networkLength: number;
  pipeFlow: number;
  pipeHeatLoss: number;
  pipeOutletTemperature: number;
  upgrades: { drill: number; pipes: number; exchanger: number };
  returnFluidLoopActive: boolean;
  lastOutput: number;
  speed: RoundSpeed;
  isPaused: boolean;
  elapsedSeconds: number;
  roundDurationSeconds: number;
  currentPrice: number;
  salesRevenue: number;
  costs: RoundCosts;
  powerGeneratedMWh: number;
  settlement?: RoundSettlement;
  campaignRound: number;
  totalCampaignProfit: number;
  careerRevenue: number;
  roundHistory: RoundSummary[];
  notice: string;
}

export interface SaveSlotInfo {
  hasSave: boolean;
  schemaVersion: number;
  planetId: string;
  campaignRound: number;
  phase: RoundPhase;
  cash: number;
  savedAt?: number;
}

export interface FirstRoundSession {
  schemaVersion: 1;
  seed: number;
  phase?: RoundPhase;
  elapsedSeconds: number;
  startingBudget: number;
  budget: number;
  parcels: Parcel[];
  auctions: Record<string, AuctionState>;
  selectedParcelId: string | null;
  ownedParcelId: string | null;
  surveys: SurveyRecord[];
  drill: DrillRecord | null;
  operation: OperationState;
  ledger: LedgerEntry[];
  settlement: SettlementResult | null;
  campaignRound?: number;
  totalCampaignProfit?: number;
  planet?: PlanetInfo;
  pipeType?: PipeType;
}

export interface CampaignSessionState {
  campaignRound: number;
  totalCampaignProfit: number;
  careerRevenue: number;
  roundHistory: RoundSummary[];
  planet: PlanetInfo;
  plantTelemetry: PlantTelemetry;
  resourceDepletion: ResourceDepletion;
}

export type SessionReservoir = Reservoir;
