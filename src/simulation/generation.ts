import {
  GEOLOGY_HARDNESS,
  SIMULATION_DEFAULTS,
  ZEPHYR_7_CONFIG,
  type GeologyLayerType,
  type ParcelBiome,
} from './constants';
import { randomBetween, seededRandom } from './random';
import type {
  Aquifer,
  FaultHint,
  FaultObstacle,
  FaultSeverity,
  GeologyLayer,
  MineralDeposit,
  Parcel,
  ParcelPublicClues,
  ParcelSurfaceFeatures,
  PlanetConfig,
  Reservoir,
  StableGroundZone,
  ThermalHotspot,
  WaterPoolFeature,
} from './types';

const BIOME_NAMES: Record<ParcelBiome, string> = {
  volcanic: 'Ignis Caldera (Volcanic)',
  ice: 'Glacial Rift (Ice)',
  forest: 'Sylvan Canopy Fissure (Forest)',
  crystal: 'Prismatic Quartz Shallows (Crystal)',
  desert: 'Dune Caldera Basin (Desert)',
  basalt: 'Obsidian Basalt Monolith (Basalt)',
};

const BIOME_DESCRIPTIONS: Record<ParcelBiome, string> = {
  volcanic: 'Hyperactive magmatic plume beneath porous ashstone and basalt crust. Extreme surface heat.',
  ice: 'Glacial permafrost cap over fractured sedimentary strata and pressurized meltwater zones.',
  forest: 'Stable tectonic bedrock with temperate surface fissures and mineralized shallow crust.',
  crystal: 'Crystalline quartz bedrock with strong piezoelectric readings and mineral veins.',
  desert: 'Arid sandstone dunes over saline sediment and deep insulating basaltic rock.',
  basalt: 'Dense columnar basalt with high structural stability and deep heat retention.',
};

interface LayerBlueprint {
  type: GeologyLayerType;
  top: number;
  bottom: number;
  name: string;
  color: string;
}

/**
 * Generate deterministic parcels for any PlanetConfig using Mulberry32 PRNG.
 * Produces underground geology (>=2 reservoirs, layers, aquifers, faults, minerals)
 * and correlated 2D top-down surfaceFeatures without leaking reservoir data in publicClues.
 */
export function generatePlanetParcels(
  planet: PlanetConfig,
  seed: number,
  count = SIMULATION_DEFAULTS.parcelCount,
  options?: { idPrefix?: string },
): Parcel[] {
  const random = seededRandom(seed);
  const templates = planet.biomeTemplates.length > 0 ? planet.biomeTemplates : ZEPHYR_7_CONFIG.biomeTemplates;
  const [minThermalC, maxThermalC] = planet.thermalPotentialRange;
  const [minMineralVal, maxMineralVal] = planet.mineralPotentialRange;
  const [minStability, maxStability] = planet.groundStabilityRange;
  const idPrefix = options?.idPrefix ?? planet.id;

  return Array.from({ length: count }, (_, parcelIndex) => {
    const biome = templates[parcelIndex % templates.length];
    const name = BIOME_NAMES[biome];
    const parcelId = `${idPrefix}-parcel-${parcelIndex + 1}`;

    const layerBlueprints = getBiomeLayers(biome, planet, random);
    const layers: GeologyLayer[] = layerBlueprints.map((blueprint) => ({
      type: blueprint.type,
      top: blueprint.top,
      bottom: blueprint.bottom,
      hardness: GEOLOGY_HARDNESS[blueprint.type],
      name: blueprint.name,
      depthStartMeters: Math.round(blueprint.top * 5),
      depthEndMeters: Math.round(blueprint.bottom * 5),
      color: blueprint.color,
      thermalConductivity: blueprint.type === 'insulating' ? 0.7 : blueprint.type === 'obsidian' ? 1.25 : 1.0,
    }));

    // Primary and secondary subterranean reservoirs (>= 2 per parcel)
    const primaryY = randomBetween(random, 62, 86);
    const primaryX = randomBetween(random, 22, 78);
    const primaryTemp = Math.round(clamp(getBiomeReservoirTemp(biome, random), minThermalC, maxThermalC));
    const primaryInitialHeat = Math.round(randomBetween(random, 850, 1_450));
    const primaryFlow = Math.round(randomBetween(random, 8, 14));

    const secondarySideRight = primaryX < 50;
    const secondaryX = secondarySideRight
      ? randomBetween(random, 58, 84)
      : randomBetween(random, 16, 42);
    const secondaryY = randomBetween(random, 48, 72);
    const secondaryTemp = Math.round(
      clamp(primaryTemp * randomBetween(random, 0.72, 0.88), minThermalC * 0.8, maxThermalC),
    );
    const secondaryInitialHeat = Math.round(randomBetween(random, 480, 820));
    const secondaryFlow = Math.round(randomBetween(random, 5, 10));

    const isMagmaBiome = biome === 'volcanic' || biome === 'desert' || biome === 'basalt';
    const reservoirs: Reservoir[] = [
      {
        id: `${parcelId}-reservoir-1`,
        center: { x: Math.round(primaryX), y: Math.round(primaryY) },
        radius: Math.round(randomBetween(random, 9, 14)),
        initialTemperature: primaryTemp,
        temperature: primaryTemp,
        pressure: Math.round(randomBetween(random, 70, 110)),
        flowPotential: primaryFlow,
        maxExtractionRate: primaryFlow + 2,
        remainingHeat: primaryInitialHeat,
        initialHeat: primaryInitialHeat,
        name: isMagmaBiome ? 'Primary Magma Chamber' : 'Primary Hydrothermal Reservoir',
        type: isMagmaBiome ? 'magma' : 'hydrothermal',
        depthMeters: Math.round(primaryY * 5),
      },
      {
        id: `${parcelId}-reservoir-2`,
        center: { x: Math.round(secondaryX), y: Math.round(secondaryY) },
        radius: Math.round(randomBetween(random, 7, 11)),
        initialTemperature: secondaryTemp,
        temperature: secondaryTemp,
        pressure: Math.round(randomBetween(random, 48, 82)),
        flowPotential: secondaryFlow,
        maxExtractionRate: secondaryFlow + 2,
        remainingHeat: secondaryInitialHeat,
        initialHeat: secondaryInitialHeat,
        name: 'Secondary Thermal Pocket',
        type: biome === 'crystal' ? 'deep-mantle' : 'hydrothermal',
        depthMeters: Math.round(secondaryY * 5),
      },
    ];

    // Subterranean Aquifer
    const aquiferY = randomBetween(random, 28, 48);
    const aquiferX = randomBetween(random, 20, 80);
    const aquifer: Aquifer = {
      id: `${parcelId}-aquifer-1`,
      center: { x: Math.round(aquiferX), y: Math.round(aquiferY) },
      radiusX: Math.round(randomBetween(random, 13, 20)),
      radiusY: Math.round(randomBetween(random, 5, 9)),
      depthMeters: Math.round(aquiferY * 5),
      waterVolume: Math.round(randomBetween(random, 500, 1_200)),
      hazardLevel: biome === 'ice' || biome === 'desert' ? 'high' : 'moderate',
    };

    // Subterranean Faults / Rock Obstacles scaled by planet.faultFrequency
    const faultCount = random() < planet.faultFrequency ? 2 : 1;
    const faults: FaultObstacle[] = Array.from({ length: faultCount }, (_, fIdx) => {
      const startX = Math.round(randomBetween(random, 18, 76));
      const startY = Math.round(randomBetween(random, 30 + fIdx * 16, 48 + fIdx * 18));
      const deltaX = Math.round(randomBetween(random, -14, 14));
      const deltaY = Math.round(randomBetween(random, 8, 16));
      const severityRoll = random();
      const severity: FaultSeverity =
        severityRoll > 0.78 ? 'critical' : severityRoll > 0.4 ? 'major' : 'minor';
      return {
        id: `${parcelId}-fault-${fIdx + 1}`,
        start: { x: clamp(startX, 10, 90), y: clamp(startY, 24, 82) },
        end: { x: clamp(startX + deltaX, 10, 90), y: clamp(startY + deltaY, 30, 92) },
        thickness: severity === 'critical' ? 4 : severity === 'major' ? 3 : 2,
        depthMeters: Math.round(startY * 5),
        severity,
        costPenalty: severity === 'critical' ? 90 : severity === 'major' ? SIMULATION_DEFAULTS.faultPenaltyCost : 30,
        blocksDrilling: severity === 'critical',
        label:
          severity === 'critical'
            ? 'Impenetrable Shear Fault'
            : severity === 'major'
              ? 'Dense Basalt Fracture'
              : 'Minor Slip Seam',
        revealed: false,
      };
    });

    // Mineral Deposits (with both subsurface position and 2D top-down surfacePosition)
    const minerals: MineralDeposit[] = [
      {
        id: `mineral-${parcelIndex}-1`,
        type: biome === 'crystal' ? 'quartz' : biome === 'ice' ? 'lithium' : 'rare-earth',
        name:
          biome === 'crystal'
            ? 'High-Purity Quartz'
            : biome === 'ice'
              ? 'Lithium Brine'
              : 'Rare-Earth Silicates',
        position: { x: Math.round(randomBetween(random, 16, 46)), y: Math.round(randomBetween(random, 30, 65)) },
        surfacePosition: { x: Math.round(randomBetween(random, 16, 46)), y: Math.round(randomBetween(random, 18, 82)) },
        depthMeters: Math.round(randomBetween(random, 150, 320)),
        abundance: Math.round(randomBetween(random, 35, 78)),
        value: Math.round(randomBetween(random, minMineralVal, maxMineralVal)),
        depletedAmount: 0,
      },
      {
        id: `mineral-${parcelIndex}-2`,
        type: biome === 'desert' ? 'copper' : 'silica',
        name: biome === 'desert' ? 'Native Copper Vein' : 'Silica Matrix',
        position: { x: Math.round(randomBetween(random, 54, 84)), y: Math.round(randomBetween(random, 40, 75)) },
        surfacePosition: { x: Math.round(randomBetween(random, 54, 84)), y: Math.round(randomBetween(random, 18, 82)) },
        depthMeters: Math.round(randomBetween(random, 200, 380)),
        abundance: Math.round(randomBetween(random, 25, 65)),
        value: Math.round(randomBetween(random, minMineralVal * 0.8, maxMineralVal * 0.85)),
        depletedAmount: 0,
      },
    ];

    // 2D Top-Down Stable Ground Zones
    const stableGround: StableGroundZone[] = [
      {
        id: `stable-zone-${parcelIndex}-1`,
        x: Math.round(randomBetween(random, 12, 40)),
        y: Math.round(randomBetween(random, 16, 52)),
        width: Math.round(randomBetween(random, 24, 34)),
        height: Math.round(randomBetween(random, 22, 32)),
        stabilityScore: Math.round(randomBetween(random, minStability + 6, maxStability)),
        label: 'Primary Bedrock Ridge',
      },
      {
        id: `stable-zone-${parcelIndex}-2`,
        x: Math.round(randomBetween(random, 54, 72)),
        y: Math.round(randomBetween(random, 46, 70)),
        width: Math.round(randomBetween(random, 18, 26)),
        height: Math.round(randomBetween(random, 18, 26)),
        stabilityScore: Math.round(randomBetween(random, minStability, maxStability - 4)),
        label: 'Secondary Foundation Shelf',
      },
    ];

    // Correlated 2D Top-Down Surface Features (x, y in 0..100)
    const surfaceTemp = Math.round(getBiomeSurfaceTemp(biome, random));
    const hotspots: ThermalHotspot[] = [
      {
        id: `hotspot-${parcelIndex}-1`,
        position: {
          x: clamp(Math.round(primaryX + randomBetween(random, -8, 8)), 12, 88),
          y: Math.round(randomBetween(random, 18, 78)),
        },
        surfaceTemperature: Math.round(surfaceTemp + randomBetween(random, 20, 45)),
        intensity: Math.round(randomBetween(random, 65, 95)),
        type: biome === 'volcanic' ? 'fumarole' : 'vent',
      },
      {
        id: `hotspot-${parcelIndex}-2`,
        position: {
          x: clamp(Math.round(secondaryX + randomBetween(random, -10, 10)), 12, 88),
          y: Math.round(randomBetween(random, 20, 82)),
        },
        surfaceTemperature: Math.round(surfaceTemp + randomBetween(random, 10, 30)),
        intensity: Math.round(randomBetween(random, 45, 78)),
        type: 'thermal-anomaly',
      },
    ];

    const faultMarkers: FaultHint[] = faults.map((fault, fIdx) => {
      const midX = Math.round((fault.start.x + fault.end.x) / 2);
      return {
        id: `${parcelId}-fault-hint-${fIdx + 1}`,
        faultId: fault.id,
        position: {
          x: clamp(midX, 12, 88),
          y: Math.round(randomBetween(random, 18, 82)),
        },
        severity: fault.severity,
        label: fault.severity === 'critical' ? 'Major Surface Crack' : 'Seismic Fracture Trace',
      };
    });

    const waterPools: WaterPoolFeature[] = [
      {
        id: `${parcelId}-pool-1`,
        position: {
          x: clamp(Math.round(aquifer.center.x + randomBetween(random, -6, 6)), 14, 86),
          y: Math.round(randomBetween(random, 20, 80)),
        },
        radius: Math.round(randomBetween(random, 8, 13)),
        depthHintMeters: aquifer.depthMeters,
      },
    ];

    const surfaceFeatures: ParcelSurfaceFeatures = {
      hotspots,
      mineralHints: minerals,
      faultMarkers,
      stableZones: stableGround,
      waterPools,
    };

    const avgStability =
      stableGround.reduce((sum, z) => sum + z.stabilityScore, 0) / Math.max(1, stableGround.length);

    // Public clues: strictly surface-observable signals, NEVER exact reservoir coords/temp/heat
    const publicClues: ParcelPublicClues = {
      surfaceTemperature: surfaceTemp,
      marketDistance: Math.round(randomBetween(random, 12, 68)),
      visibleFissures: Math.floor(randomBetween(random, 1, 5)),
      estimatedThermalPurity: Math.round(randomBetween(random, 70, 95)) / 100,
      subsurfaceDescription: BIOME_DESCRIPTIONS[biome],
      riskFactor:
        faults.some((f) => f.severity === 'critical') || biome === 'volcanic'
          ? 'high'
          : biome === 'desert' || biome === 'ice'
            ? 'moderate'
            : 'low',
      surfaceHeatSignal: surfaceTemp >= 85 ? 'high' : surfaceTemp >= 35 ? 'moderate' : 'low',
      mineralHint: minerals[0]?.name,
      stabilityHint: avgStability >= 76 ? 'stable' : avgStability >= 62 ? 'moderate' : 'unstable',
    };

    return {
      id: parcelId,
      name,
      planetId: planet.id,
      biome,
      publicClues,
      surfaceFeatures,
      layers,
      reservoirs,
      aquifers: [aquifer],
      faults,
      minerals,
      stableGround,
      hotspots,
    };
  });
}

/** Compatibility wrapper generating 6 parcels for Zephyr-7 / Caldera-7. */
export function generateCaldera7Parcels(
  seed: number,
  count = SIMULATION_DEFAULTS.parcelCount,
): Parcel[] {
  return generatePlanetParcels(ZEPHYR_7_CONFIG, seed, count, { idPrefix: 'caldera-7' });
}

function getBiomeLayers(
  biome: ParcelBiome,
  planet: PlanetConfig,
  random: () => number,
): LayerBlueprint[] {
  const palette = planet.palette;
  switch (biome) {
    case 'volcanic':
      return [
        { type: 'ashstone', top: 0, bottom: 25, name: 'Porous Ashstone Crust', color: '#4a3f35' },
        { type: random() > 0.4 ? 'fracture' : 'basalt', top: 25, bottom: 55, name: 'Fissured Volcanic Fracture', color: '#3b2f2f' },
        { type: 'obsidian', top: 55, bottom: 100, name: 'Deep Vitreous Obsidian', color: '#1f1b24' },
      ];
    case 'ice':
      return [
        { type: 'permafrost', top: 0, bottom: 25, name: 'Glacial Permafrost & Cryo-Ice', color: '#3a506b' },
        { type: random() > 0.45 ? 'sandstone' : 'crystal', top: 25, bottom: 55, name: 'Glacial Silt & Sedimentary', color: '#486581' },
        { type: 'insulating', top: 55, bottom: 100, name: 'Thermal Insulating Shale', color: '#243b53' },
      ];
    case 'forest':
      return [
        { type: 'sandstone', top: 0, bottom: 25, name: 'Humic Sandstone Overburden', color: '#3d4035' },
        { type: 'fracture', top: 25, bottom: 55, name: 'Hydraulic Fracture Zone', color: '#2b3a32' },
        { type: 'granite', top: 55, bottom: 100, name: 'Dense Tectonic Granite', color: '#1c2826' },
      ];
    case 'crystal':
      return [
        { type: 'ashstone', top: 0, bottom: 25, name: 'Fine Silica Silt', color: '#5b5468' },
        { type: 'crystal', top: 25, bottom: 55, name: 'Prismatic Quartz Strata', color: palette.mineralAccent || '#7b68ee' },
        { type: 'fracture', top: 55, bottom: 100, name: 'Piezoelectric Fault Fracture', color: '#4b3f72' },
      ];
    case 'desert':
      return [
        { type: 'sandstone', top: 0, bottom: 25, name: 'Aeolian Sandstone Dunes', color: '#6e543c' },
        { type: random() > 0.5 ? 'shale' : 'basalt', top: 25, bottom: 55, name: 'Saline Mudstone & Shale', color: '#4a3b32' },
        { type: 'insulating', top: 55, bottom: 100, name: 'Deep Insulating Basaltic Bedrock', color: '#2b231d' },
      ];
    case 'basalt':
      return [
        { type: 'ashstone', top: 0, bottom: 25, name: 'Basaltic Weathered Crust', color: '#383838' },
        { type: 'basalt', top: 25, bottom: 55, name: 'Columnar Dense Basalt', color: '#262626' },
        { type: 'granite', top: 55, bottom: 100, name: 'Plutonic Foundation Granite', color: '#171717' },
      ];
    default:
      return planet.defaultLayers.map((layer) => ({
        type: layer.type,
        top: layer.top,
        bottom: layer.bottom,
        name: layer.name,
        color: layer.color,
      }));
  }
}

function getBiomeSurfaceTemp(biome: ParcelBiome, random: () => number): number {
  switch (biome) {
    case 'volcanic':
      return randomBetween(random, 120, 195);
    case 'ice':
      return randomBetween(random, -35, 10);
    case 'forest':
      return randomBetween(random, 20, 42);
    case 'crystal':
      return randomBetween(random, 35, 65);
    case 'desert':
      return randomBetween(random, 40, 75);
    case 'basalt':
      return randomBetween(random, 45, 85);
  }
}

function getBiomeReservoirTemp(biome: ParcelBiome, random: () => number): number {
  switch (biome) {
    case 'volcanic':
      return randomBetween(random, 280, 360);
    case 'ice':
      return randomBetween(random, 160, 225);
    case 'forest':
      return randomBetween(random, 170, 245);
    case 'crystal':
      return randomBetween(random, 215, 295);
    case 'desert':
      return randomBetween(random, 255, 335);
    case 'basalt':
      return randomBetween(random, 270, 350);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
