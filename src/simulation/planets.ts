import { PLANET_CONFIGS, PLANET_CONFIG_MAP, ZEPHYR_7_CONFIG } from './constants';
import type { PlanetConfig } from './types';

/** Return all configured planets in display order (playable and locked previews). */
export function listPlanets(): PlanetConfig[] {
  return PLANET_CONFIGS.map((planet) => ({ ...planet }));
}

/** Look up a planet configuration by id, falling back to Zephyr-7 when unknown. */
export function getPlanetConfig(id?: string | null): PlanetConfig {
  if (!id) return ZEPHYR_7_CONFIG;
  return PLANET_CONFIG_MAP[id] ?? ZEPHYR_7_CONFIG;
}

/** Return true only if the planet exists, is unlocked, and is marked playable. */
export function isPlanetPlayable(id?: string | null): boolean {
  if (!id) return false;
  const planet = PLANET_CONFIG_MAP[id];
  return Boolean(planet && planet.unlocked && planet.playable);
}
