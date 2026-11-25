import { SIMULATION_DEFAULTS } from './constants';

export const DEFAULT_MARKET_PRICE_PER_MWH = 120;

export interface MarketPriceConfig {
  mode?: 'stable' | 'dynamic';
  marketPricePerMWh?: number;
}

export function marketPriceAt(seconds: number): number {
  const phase = (Math.max(0, seconds) / SIMULATION_DEFAULTS.marketPeriodSeconds) * Math.PI * 2;
  const raw =
    SIMULATION_DEFAULTS.baseMarketPrice +
    Math.sin(phase) * SIMULATION_DEFAULTS.marketAmplitude +
    Math.max(0, seconds) * SIMULATION_DEFAULTS.marketTrendPerSecond;
  return Math.min(
    SIMULATION_DEFAULTS.marketMaximumPrice,
    Math.max(SIMULATION_DEFAULTS.marketMinimumPrice, raw),
  );
}

/**
 * Return the active electricity market price ($/MWh).
 * MVP defaults to a stable configurable `marketPricePerMWh` (120 $/MWh)
 * unless `mode: 'dynamic'` is explicitly selected.
 */
export function getMarketPricePerMWh(
  config?: MarketPriceConfig,
  elapsedSeconds = 0,
): number {
  if (config?.mode === 'dynamic') {
    return marketPriceAt(elapsedSeconds);
  }
  const configured = config?.marketPricePerMWh ?? DEFAULT_MARKET_PRICE_PER_MWH;
  return Math.min(
    SIMULATION_DEFAULTS.marketMaximumPrice,
    Math.max(SIMULATION_DEFAULTS.marketMinimumPrice, configured),
  );
}

export function calculateThermMarketValue(therm: number, currentPrice: number): number {
  return (Math.max(0, therm) * Math.max(0, currentPrice)) / 100;
}

/** Unrounded electricity export calculation for frame-rate-independent simulation steps. */
export function calculateElectricityExport(
  megawatts: number,
  durationSeconds: number,
  pricePerMWh = DEFAULT_MARKET_PRICE_PER_MWH,
): { mwhExported: number; revenue: number } {
  const hours = Math.max(0, durationSeconds) / 3600;
  const mwhExported = Math.max(0, megawatts) * hours;
  const revenue = mwhExported * Math.max(0, pricePerMWh);
  return { mwhExported, revenue };
}

export function exportPowerToGrid(
  megawatts: number,
  durationSeconds: number,
  pricePerMWh = DEFAULT_MARKET_PRICE_PER_MWH,
): { mwhExported: number; revenue: number } {
  const { mwhExported, revenue } = calculateElectricityExport(
    megawatts,
    durationSeconds,
    pricePerMWh,
  );
  return {
    mwhExported,
    revenue: Math.round(revenue * 100) / 100,
  };
}
