import type { DrillSpeedTier, PlanetConfig, RivalCompanyTemplate } from './types';

export const PARCEL_BIOMES = ['volcanic', 'ice', 'forest', 'crystal', 'desert', 'basalt'] as const;
export type ParcelBiome = typeof PARCEL_BIOMES[number];

export const DEPTH_MARKERS = [0, 250, 500] as const;
export const MAX_DRILL_DEPTH_METERS = 500;
export const BASE_DRILL_SPEED_UNITS_PER_SEC = 9.0;

export const DRILL_UPGRADE_TIERS: readonly DrillSpeedTier[] = [
  {
    level: 1,
    name: 'Mk I Standard Auger',
    speedMultiplier: 1.0,
    upgradeCost: 0,
    description: 'Baseline rotary auger bit',
  },
  {
    level: 2,
    name: 'Mk II Carbide Tricone',
    speedMultiplier: 1.7,
    upgradeCost: 80,
    description: 'Tungsten-carbide teeth drill 1.7x faster',
  },
  {
    level: 3,
    name: 'Mk III Plasma-Tipped',
    speedMultiplier: 2.6,
    upgradeCost: 160,
    description: 'Superheated plasma cutter drills 2.6x faster',
  },
  {
    level: 4,
    name: 'Mk IV Quantum Bore',
    speedMultiplier: 3.8,
    upgradeCost: 260,
    description: 'Resonance bore head penetrates at 3.8x speed',
  },
] as const;

export const SIMULATION_DEFAULTS = {
  parcelCount: 6,
  parcelWidth: 100,
  parcelDepth: 100,
  maxDepthMeters: 500,
  startingBudget: 1_000,
  roundDurationSeconds: 240,
  auctionOpeningBid: 50,
  auctionMinimumIncrement: 10,
  auctionDefaultBidStep: 25,
  auctionDurationSeconds: 30,
  antiSnipeThresholdSeconds: 5,
  antiSnipeExtensionSeconds: 5,
  maxAuctionExtensions: 6,
  rivalCount: 3,
  surveyCosts: { 'surface-scanner': 40, 'deep-probe': 100, 'rover-scan': 30 },
  roverScanRadius: 22,
  roverScanCost: 30,
  echoScanCost: 35,
  echoScanRadiusX: 28,
  drillCostPerDistance: 1.5,
  starterDrillHardnessMultiplier: 1,
  aquiferPenaltyCost: 40,
  faultPenaltyCost: 60,
  wellHeadStartPoint: { x: 50, y: 18 },
  maxWaypointsPerWell: 10,
  storageCapacityTH: 500,
  exchangerBaseEfficiency: 0.94,
  exportCapacityMW: 150,
  baseMarketPrice: 100,
  marketAmplitude: 45,
  marketPeriodSeconds: 240,
  marketTrendPerSecond: 0.02,
  marketMinimumPrice: 20,
  marketMaximumPrice: 200,
  pipe: {
    basic: { capacity: 8, heatLossPerDistance: 0.003, pressureLossPerDistance: 0.01 },
    insulated: { capacity: 8, heatLossPerDistance: 0.001, pressureLossPerDistance: 0.01 },
    highPressure: { capacity: 14, heatLossPerDistance: 0.003, pressureLossPerDistance: 0.006 },
    return: { capacity: 10, heatLossPerDistance: 0.002, pressureLossPerDistance: 0.008 },
  },
} as const;

export const GEOLOGY_HARDNESS: Record<GeologyLayerType, number> = {
  ashstone: 0.7,
  basalt: 1.5,
  crystal: 1.2,
  fracture: 0.5,
  insulating: 1.1,
  granite: 1.8,
  sandstone: 0.8,
  shale: 0.9,
  permafrost: 0.6,
  obsidian: 1.6,
};

export type GeologyLayerType =
  | 'ashstone'
  | 'basalt'
  | 'crystal'
  | 'fracture'
  | 'insulating'
  | 'granite'
  | 'sandstone'
  | 'shale'
  | 'permafrost'
  | 'obsidian';

export const RIVAL_COMPANIES: RivalCompanyTemplate[] = [
  {
    id: 'rival-1',
    name: 'Caelum Dynamics',
    color: '#38bdf8',
    emblem: '◈',
    personality: 'analytical',
    startingBudget: 620,
    preferredBiomes: ['crystal', 'forest', 'ice'],
    riskTolerance: 0.45,
    maxSpendMultiplier: 0.55,
  },
  {
    id: 'rival-2',
    name: 'Vanguard Thermal',
    color: '#f97316',
    emblem: '▲',
    personality: 'aggressive',
    startingBudget: 760,
    preferredBiomes: ['volcanic', 'basalt'],
    riskTolerance: 0.82,
    maxSpendMultiplier: 0.75,
  },
  {
    id: 'rival-3',
    name: 'Helios GeoCorp',
    color: '#a855f7',
    emblem: '✦',
    personality: 'opportunist',
    startingBudget: 540,
    preferredBiomes: ['desert', 'volcanic', 'crystal'],
    riskTolerance: 0.6,
    maxSpendMultiplier: 0.62,
  },
];

export interface PlanetInfo {
  id: string;
  name: string;
  sector: string;
  description: string;
  gravity: number;
  surfaceTemp: string;
  atmosphericPressure: number;
  geothermalIndex: number;
  volcanicActivity: string;
  primaryRisk: string;
}

export const ZEPHYR_7_PLANET: PlanetInfo = {
  id: 'zephyr-7',
  name: 'Zephyr-7',
  sector: 'Morrow Basin / Caldera Zone',
  description:
    'A geologically hyperactive planet rich with subterranean magma chambers, pressurized aquifers, and crystalline rock strata.',
  gravity: 0.88,
  surfaceTemp: '−45°C to +185°C',
  atmosphericPressure: 1.35,
  geothermalIndex: 9.6,
  volcanicActivity: 'Hyperactive Plumes',
  primaryRisk: 'Subsurface Aquifers & High-Pressure Magma Chambers',
};

export const ZEPHYR_7_CONFIG: PlanetConfig = {
  ...ZEPHYR_7_PLANET,
  subtitle: 'Caldera Rim · Playable Sector',
  unlocked: true,
  playable: true,
  thermalPotential: 'High',
  thermalPotentialRange: [160, 360],
  mineralPotential: 'Rich',
  mineralPotentialRange: [90, 280],
  terrainProfile: 'Varied',
  faultFrequency: 0.65,
  groundStabilityRange: [60, 92],
  roundDurationSeconds: SIMULATION_DEFAULTS.roundDurationSeconds,
  startingCash: SIMULATION_DEFAULTS.startingBudget,
  palette: {
    skyTop: '#081426',
    skyBottom: '#132a4a',
    surfaceAccent: '#f59e0b',
    terrainBase: '#28384e',
    thermalGlow: '#f97316',
    mineralAccent: '#818cf8',
    returnFluid: '#38bdf8',
    faultAccent: '#ef4444',
    cardAccent: '#fbbf24',
  },
  defaultLayers: [
    { type: 'ashstone', name: 'Porous Ashstone Crust', top: 0, bottom: 25, hardness: 0.7, color: '#4a3f35', thermalConductivity: 0.85 },
    { type: 'fracture', name: 'Fissured Fracture Zone', top: 25, bottom: 55, hardness: 0.5, color: '#3b2f2f', thermalConductivity: 1.05 },
    { type: 'obsidian', name: 'Deep Vitreous Obsidian', top: 55, bottom: 100, hardness: 1.6, color: '#1f1b24', thermalConductivity: 1.2 },
  ],
  biomeTemplates: [...PARCEL_BIOMES],
  competition: {
    rivalCount: 3,
    rivals: RIVAL_COMPANIES,
  },
};

export const FROST_3_CONFIG: PlanetConfig = {
  id: 'frost-3',
  name: 'Frost-3',
  sector: 'Cryo-Shelf / Boreal Trench',
  subtitle: 'Locked · Upcoming Cryo-Thermal World',
  description:
    'Thick glacial permafrost shielding deep hydrothermal vents. High drilling hardness with rich lithium brine deposits.',
  unlocked: false,
  playable: false,
  gravity: 1.05,
  surfaceTemp: '−110°C to −15°C',
  atmosphericPressure: 0.92,
  geothermalIndex: 6.4,
  volcanicActivity: 'Sub-Glacial Vents',
  primaryRisk: 'Cryo-Permafrost Fractures & Pressurized Brine Aquifers',
  thermalPotential: 'Medium',
  thermalPotentialRange: [130, 260],
  mineralPotential: 'Abundant',
  mineralPotentialRange: [140, 340],
  terrainProfile: 'Glacial',
  faultFrequency: 0.5,
  groundStabilityRange: [55, 85],
  roundDurationSeconds: 240,
  startingCash: 1_100,
  palette: {
    skyTop: '#07182c',
    skyBottom: '#163859',
    surfaceAccent: '#38bdf8',
    terrainBase: '#2a4560',
    thermalGlow: '#fb923c',
    mineralAccent: '#a78bfa',
    returnFluid: '#38bdf8',
    faultAccent: '#f43f5e',
    cardAccent: '#60a5fa',
  },
  defaultLayers: [
    { type: 'permafrost', name: 'Cryo-Permafrost Cap', top: 0, bottom: 30, hardness: 0.6, color: '#3a506b', thermalConductivity: 0.7 },
    { type: 'crystal', name: 'Glacial Quartz Shelf', top: 30, bottom: 65, hardness: 1.2, color: '#486581', thermalConductivity: 1.0 },
    { type: 'granite', name: 'Sub-Glacial Granite', top: 65, bottom: 100, hardness: 1.8, color: '#243b53', thermalConductivity: 1.15 },
  ],
  biomeTemplates: ['ice', 'crystal', 'basalt', 'forest', 'ice', 'crystal'],
  competition: {
    rivalCount: 3,
    rivals: RIVAL_COMPANIES,
  },
};

export const MAGMA_9_CONFIG: PlanetConfig = {
  id: 'magma-9',
  name: 'Magma-9',
  sector: 'Obsidian Belt / Core Rift',
  subtitle: 'Locked · Extreme Magmatic Frontier',
  description:
    'Volatile basaltic crust over superheated mantle plumes. Extreme energy yields balanced by dense seismic faults.',
  unlocked: false,
  playable: false,
  gravity: 1.18,
  surfaceTemp: '+80°C to +310°C',
  atmosphericPressure: 1.8,
  geothermalIndex: 9.9,
  volcanicActivity: 'Extreme Mantle Plumes',
  primaryRisk: 'Severe Seismic Faults & Superheated Blowouts',
  thermalPotential: 'Extreme',
  thermalPotentialRange: [240, 420],
  mineralPotential: 'Medium',
  mineralPotentialRange: [80, 220],
  terrainProfile: 'Volcanic',
  faultFrequency: 0.9,
  groundStabilityRange: [45, 78],
  roundDurationSeconds: 240,
  startingCash: 1_250,
  palette: {
    skyTop: '#160b1c',
    skyBottom: '#2d142c',
    surfaceAccent: '#f97316',
    terrainBase: '#3d2424',
    thermalGlow: '#ef4444',
    mineralAccent: '#818cf8',
    returnFluid: '#38bdf8',
    faultAccent: '#fbbf24',
    cardAccent: '#fb923c',
  },
  defaultLayers: [
    { type: 'basalt', name: 'Scorched Basalt Crust', top: 0, bottom: 25, hardness: 1.5, color: '#382a2a', thermalConductivity: 1.05 },
    { type: 'obsidian', name: 'Vitreous Mantle Glass', top: 25, bottom: 60, hardness: 1.6, color: '#24191e', thermalConductivity: 1.25 },
    { type: 'granite', name: 'Superheated Plutonic Base', top: 60, bottom: 100, hardness: 1.8, color: '#171114', thermalConductivity: 1.35 },
  ],
  biomeTemplates: ['volcanic', 'basalt', 'desert', 'volcanic', 'crystal', 'basalt'],
  competition: {
    rivalCount: 3,
    rivals: RIVAL_COMPANIES,
  },
};

export const PLANET_CONFIGS: PlanetConfig[] = [
  ZEPHYR_7_CONFIG,
  FROST_3_CONFIG,
  MAGMA_9_CONFIG,
];

export const PLANET_CONFIG_MAP: Record<string, PlanetConfig> = {
  [ZEPHYR_7_CONFIG.id]: ZEPHYR_7_CONFIG,
  [FROST_3_CONFIG.id]: FROST_3_CONFIG,
  [MAGMA_9_CONFIG.id]: MAGMA_9_CONFIG,
};
