import type { GeologyLayerType, ParcelBiome } from './constants';

export interface Point {
  x: number;
  y: number;
}

export type PipeTypeId = 'basic' | 'insulated' | 'highPressure' | 'return';

export interface GeologyLayer {
  type: GeologyLayerType;
  top: number;
  bottom: number;
  hardness: number;
  name?: string;
  depthStartMeters?: number;
  depthEndMeters?: number;
  color?: string;
  thermalConductivity?: number;
}

export interface Aquifer {
  id: string;
  center: Point;
  radiusX: number;
  radiusY: number;
  depthMeters: number;
  waterVolume: number;
  hazardLevel: 'low' | 'moderate' | 'high';
}

export type FaultSeverity = 'minor' | 'major' | 'critical';

/** Subsurface fault line or rock obstacle encountered during directional drilling. */
export interface FaultObstacle {
  id: string;
  start: Point;
  end: Point;
  thickness: number;
  depthMeters: number;
  severity: FaultSeverity;
  costPenalty: number;
  blocksDrilling: boolean;
  label: string;
  revealed?: boolean;
}

/** Approximate surface-level fault marker discoverable during Surface Survey. */
export interface FaultHint {
  id: string;
  faultId: string;
  position: Point;
  severity: FaultSeverity;
  label: string;
}

export interface MineralDeposit {
  id: string;
  type: 'lithium' | 'quartz' | 'silica' | 'rare-earth' | 'copper';
  name: string;
  /** Subsurface position (x: 0..100, y: 0..100 depth axis). */
  position: Point;
  /** Top-down surface coordinates (x: 0..100, y: 0..100) for surface survey scans. */
  surfacePosition?: Point;
  depthMeters: number;
  abundance: number;
  value: number;
  depletedAmount?: number;
}

export interface StableGroundZone {
  id: string;
  x: number;
  y?: number;
  width: number;
  height?: number;
  stabilityScore: number;
  label: string;
}

export interface ThermalHotspot {
  id: string;
  position: Point;
  surfaceTemperature: number;
  intensity: number;
  type: 'vent' | 'fumarole' | 'thermal-anomaly';
}

export interface WaterPoolFeature {
  id: string;
  position: Point;
  radius: number;
  depthHintMeters: number;
}

/** Approximate thermal anomaly hint revealed by surface survey without exposing hidden reservoirs. */
export interface ThermalZoneHint {
  id: string;
  center: Point;
  radius: number;
  intensityLabel: 'low' | 'medium' | 'high';
  approxTempRangeC: [number, number];
}

export interface ParcelSurfaceFeatures {
  hotspots: ThermalHotspot[];
  mineralHints: MineralDeposit[];
  faultMarkers: FaultHint[];
  stableZones: StableGroundZone[];
  waterPools: WaterPoolFeature[];
}

export interface RoverScanResult {
  scanPosition: Point;
  radius: number;
  hotspotsFound: ThermalHotspot[];
  mineralsFound: MineralDeposit[];
  stableGroundFound: StableGroundZone[];
  faultHintsFound?: FaultHint[];
  timestamp: number;
}

/** Surface survey scan record; never exposes exact hidden Reservoir coordinates or heat inventory. */
export interface SurveyScanRecord {
  id: string;
  parcelId: string;
  center: Point;
  radius: number;
  cost: number;
  timestamp: number;
  revealedHotspots: ThermalHotspot[];
  revealedMinerals: MineralDeposit[];
  revealedFaultHints: FaultHint[];
  revealedStableZones: StableGroundZone[];
  approximateThermalZones: ThermalZoneHint[];
  coveragePercent: number;
}

export interface Reservoir {
  id: string;
  center: Point;
  radius: number;
  /** Baseline temperature when untapped; used to compute depletion cooling without dt compounding. */
  initialTemperature?: number;
  temperature: number;
  pressure: number;
  flowPotential: number;
  maxExtractionRate?: number;
  remainingHeat: number;
  initialHeat: number;
  name?: string;
  type?: 'magma' | 'hydrothermal' | 'deep-mantle';
  depthMeters?: number;
}

export interface ParcelPublicClues {
  surfaceTemperature: number;
  marketDistance: number;
  visibleFissures: number;
  estimatedThermalPurity?: number;
  subsurfaceDescription?: string;
  riskFactor?: 'low' | 'moderate' | 'high' | 'extreme';
  surfaceHeatSignal?: 'low' | 'moderate' | 'high';
  mineralHint?: string;
  stabilityHint?: 'unstable' | 'moderate' | 'stable';
}

export interface Parcel {
  id: string;
  name?: string;
  planetId?: string;
  biome?: ParcelBiome;
  publicClues: ParcelPublicClues;
  surfaceFeatures?: ParcelSurfaceFeatures;
  layers: GeologyLayer[];
  reservoirs: Reservoir[];
  aquifers?: Aquifer[];
  faults?: FaultObstacle[];
  minerals?: MineralDeposit[];
  stableGround?: StableGroundZone[];
  hotspots?: ThermalHotspot[];
  roverScans?: RoverScanResult[];
}

export type BidderId = 'player' | 'rival-1' | 'rival-2' | 'rival-3' | string;

export type RivalPersonality = 'aggressive' | 'analytical' | 'opportunist';

export interface RivalBidderInfo {
  id: BidderId;
  name: string;
  budget: number;
  maxBid: number;
  aggressiveness: number;
}

export interface RivalCompany extends RivalBidderInfo {
  color: string;
  emblem: string;
  personality: RivalPersonality;
  startingBudget: number;
  preferredBiomes: ParcelBiome[];
  riskTolerance: number;
  maxSpendMultiplier: number;
}

export interface AuctionBidEvent {
  bidderId: BidderId;
  amount: number;
  timeRemainingSeconds: number;
}

export interface AuctionState {
  parcelId: string;
  status: 'open' | 'won' | 'lost' | 'ended';
  openingBid: number;
  minimumIncrement: number;
  currentBid: number;
  highBidder: BidderId | null;
  nextMinimumBid: number;
  bidStep?: number;
  /** Escrow/committed bid amount per bidder so outbid amounts are refunded cleanly. */
  committedByBidder?: Record<BidderId, number>;
  timeRemainingSeconds: number;
  extensionCount?: number;
  antiSnipeExtensionSeconds?: number;
  lastBidTimeRemaining?: number;
  activeBidders: BidderId[];
  withdrawnBidders: BidderId[];
  playerBudget: number;
  rivalBudgets: number[];
  rivalMaxBids: number[];
  rivals?: RivalCompany[] | RivalBidderInfo[];
  winnerId?: BidderId | null;
  finalPrice?: number | null;
  bidHistory?: AuctionBidEvent[];
}

export interface SurveyResult {
  type: 'surface-scanner' | 'deep-probe' | 'rover-scan';
  cost: number;
  revealed: string[];
  uncertainty: number;
  temperatureRange?: [number, number];
  pressureRange?: [number, number];
  exactReservoirInventory?: number;
  hotspots?: ThermalHotspot[];
  minerals?: MineralDeposit[];
  stableGround?: StableGroundZone[];
  faultHints?: FaultHint[];
  approximateThermalZones?: ThermalZoneHint[];
  coordinates?: Point;
  strataHint?: string;
  aquiferHazard?: string;
}

export type WellStatus = 'planned' | 'drilling' | 'active' | 'dry' | 'depleted' | 'blocked';

export type EchoPingKind = 'thermal' | 'mineral' | 'fault';

/** Approximate subsurface echo ping returned by the drilling-scene Scan Car (never leaks exact reservoir coords/IDs). */
export interface EchoPing {
  id: string;
  kind: EchoPingKind;
  approxX: number;
  approxY: number;
  radius: number;
  strength: number;
  tempBand?: string;
  label?: string;
}

export interface EchoScanRecord {
  id: string;
  parcelId: string;
  scanX: number;
  radiusX: number;
  cost: number;
  timestamp: number;
  pings: EchoPing[];
}

export interface DrillSpeedTier {
  level: number;
  name: string;
  speedMultiplier: number;
  upgradeCost: number;
  description: string;
}

export interface DrillHeadState {
  position: Point;
  angleDeg: number;
  depthMeters: number;
  currentLayerName: string;
  completedPoints: Point[];
  progress01: number;
}

export interface WellRecord {
  id: string;
  name: string;
  parcelId: string;
  path: Point[];
  totalLength: number;
  maxDepth: number;
  cost: number;
  crossedLayers: string[];
  intersectedFaults: string[];
  intersectedAquifers: string[];
  tappedReservoirIds: string[];
  flowContribution: number;
  wellheadTempC: number;
  status: WellStatus;
}

export interface PathValidationResult {
  valid: boolean;
  reasons: string[];
  outOfBounds: boolean;
  hitsBlockingFault: boolean;
  tooShort: boolean;
  unaffordable: boolean;
  totalLength: number;
  maxDepthMeters: number;
  estimatedCost: number;
  crossedLayers: string[];
  intersectedFaults: FaultObstacle[];
  intersectedAquifers: Aquifer[];
}

export interface PlantTelemetry {
  temperatureC: number;
  powerMW: number;
  heatExchangerEfficiency: number;
  storageTankLevelTH: number;
  storageTankCapacityTH: number;
  exportRateMW: number;
  gridExportPrice: number;
  returnFluidLoopFlow: number;
  returnFluidTemperature: number;
  closedLoopPressureBar: number;
  totalEnergyExportedMWh: number;
  roundTimeRemainingSeconds?: number;
  thermalDepletionPercent?: number;
}

export type PlantOperatingState = 'idle' | 'running' | 'paused' | 'depleted' | 'completed';

/** Unified closed-loop production chain: well -> hot pipe -> exchanger -> tank -> export + return loop. */
export interface PlantChainState {
  wellFlow: number;
  hotPipe: {
    type: PipeTypeId;
    length: number;
    flow: number;
    inletTempC: number;
    outletTempC: number;
    heatLoss: number;
    pressureDropBar: number;
  };
  heatExchanger: {
    efficiency: number;
    thermalInputTH: number;
    electricalOutputMW: number;
    steamOutputRatio: number;
    upgradeLevel: number;
  };
  storageTankTH: number;
  storageCapacityTH: number;
  exportCapacityMW: number;
  exportRateMW: number;
  exportActive: boolean;
  marketPricePerMWh: number;
  totalExportedMWh: number;
  totalExportRevenue: number;
  returnFluidLoop: {
    active: boolean;
    flow: number;
    returnTempC: number;
    pressureBar: number;
    reinjectionEfficiency: number;
  };
  operatingState: PlantOperatingState;
  roundTimeRemainingSeconds: number;
  roundDurationSeconds: number;
}

export interface ProductionSnapshot {
  timestampSeconds: number;
  wellFlow: number;
  wellheadTempC: number;
  powerMW: number;
  storageTankTH: number;
  exportRateMW: number;
  marketPricePerMWh: number;
  revenueDelta: number;
  remainingHeatFraction: number;
}

export interface ResourceDepletion {
  thermalDepletionPercent: number;
  thermalRemainingPercent: number;
  mineralsDepletionPercent: number;
  stableGroundDepletionPercent: number;
  stableGroundRemainingPercent: number;
}

/** Real computed round settlement report (no hardcoded placeholder percentages). */
export interface RoundSettlement {
  totalCosts: number;
  revenue: number;
  profit: number;
  profitPercentage: number;
  roiPercent: number;
  depletionFraction: number;
  unsoldValue: number;
  costs: {
    land: number;
    survey: number;
    drilling: number;
    pipes: number;
    upgrades: number;
    operating: number;
  };
  depletion: ResourceDepletion;
  powerGeneratedMWh: number;
  wellsDrilled: number;
  reservoirsTapped: number;
}

export interface PlanetPalette {
  skyTop: string;
  skyBottom: string;
  surfaceAccent: string;
  terrainBase: string;
  thermalGlow: string;
  mineralAccent: string;
  returnFluid: string;
  faultAccent: string;
  cardAccent: string;
}

export interface PlanetLayerDefinition {
  type: GeologyLayerType;
  name: string;
  top: number;
  bottom: number;
  hardness: number;
  color: string;
  thermalConductivity?: number;
}

export interface RivalCompanyTemplate {
  id: BidderId;
  name: string;
  color: string;
  emblem: string;
  personality: RivalPersonality;
  startingBudget: number;
  preferredBiomes: ParcelBiome[];
  riskTolerance: number;
  maxSpendMultiplier: number;
}

export interface PlanetConfig {
  id: string;
  name: string;
  sector: string;
  subtitle: string;
  description: string;
  unlocked: boolean;
  playable: boolean;
  gravity: number;
  surfaceTemp: string;
  atmosphericPressure: number;
  geothermalIndex: number;
  volcanicActivity: string;
  primaryRisk: string;
  thermalPotential: 'Low' | 'Medium' | 'High' | 'Extreme';
  thermalPotentialRange: [number, number];
  mineralPotential: 'Low' | 'Medium' | 'Rich' | 'Abundant';
  mineralPotentialRange: [number, number];
  terrainProfile: string;
  faultFrequency: number;
  groundStabilityRange: [number, number];
  roundDurationSeconds: number;
  startingCash: number;
  palette: PlanetPalette;
  defaultLayers: PlanetLayerDefinition[];
  biomeTemplates: ParcelBiome[];
  competition: {
    rivalCount: number;
    rivals: RivalCompanyTemplate[];
  };
}
