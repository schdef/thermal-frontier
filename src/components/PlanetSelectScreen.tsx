import { useState } from 'react';
import { PLANET_CONFIGS, type PlanetInfo } from '../simulation/constants';
import type { PlanetConfig } from '../simulation/types';

export interface PlanetSelectScreenProps {
  currentPlanet?: PlanetInfo | PlanetConfig;
  campaignRound: number;
  playerCash: number;
  hasSavedGame?: boolean;
  onStartRound: (planetId?: string) => void;
  onNewGame?: () => void;
  onContinue?: () => void;
  onResetGame?: () => void;
}

interface PlanetDisplayItem {
  id: string;
  name: string;
  playable: boolean;
  badge: string;
  thermalPotential: string;
  thermalDetail: string;
  mineralPotential: string;
  terrainProfile: string;
  geologicalDiversity: string;
  drillingDifficulty: string;
  description: string;
  accentColor: string;
  icon: string;
}

const PREVIEW_EXTRAS: PlanetDisplayItem[] = [
  {
    id: 'terra-nova',
    name: 'Terra-Nova',
    playable: false,
    badge: 'LOCKED SECTOR',
    thermalPotential: 'High',
    thermalDetail: '180–310°C',
    mineralPotential: 'Abundant',
    terrainProfile: 'Forest/Canopy',
    geologicalDiversity: '3 Strata · Bio-Crust',
    drillingDifficulty: 'Low',
    description: 'Temperate canopy biosphere above mineralized hydrothermal aquifers.',
    accentColor: '#34d399',
    icon: '🌿',
  },
  {
    id: 'basalt-prime',
    name: 'Basalt-Prime',
    playable: false,
    badge: 'LOCKED SECTOR',
    thermalPotential: 'Extreme',
    thermalDetail: '230–390°C',
    mineralPotential: 'Rich',
    terrainProfile: 'Basalt Crags',
    geologicalDiversity: '4 Strata · Columnar',
    drillingDifficulty: 'Hard',
    description: 'Columnar basalt monoliths with intense tectonic stress and superheated steam.',
    accentColor: '#a855f7',
    icon: '💎',
  },
];

function mapConfigToDisplay(config: PlanetConfig): PlanetDisplayItem {
  const icon =
    config.id === 'zephyr-7'
      ? '🌋'
      : config.id === 'frost-3'
        ? '❄️'
        : config.id === 'magma-9'
          ? '🔥'
          : '🪐';

  const difficulty =
    config.faultFrequency >= 0.8
      ? 'Extreme'
      : config.faultFrequency >= 0.6
        ? 'Moderate'
        : 'Standard';

  return {
    id: config.id,
    name: config.name,
    playable: config.playable,
    badge: config.playable ? 'ACTIVE SECTOR' : 'LOCKED SECTOR',
    thermalPotential: config.thermalPotential,
    thermalDetail: `${config.thermalPotentialRange[0]}–${config.thermalPotentialRange[1]}°C`,
    mineralPotential: config.mineralPotential,
    terrainProfile: config.terrainProfile,
    geologicalDiversity: `${config.defaultLayers.length} Strata · ${config.biomeTemplates.length} Biomes`,
    drillingDifficulty: difficulty,
    description: config.description,
    accentColor: config.palette.surfaceAccent,
    icon,
  };
}

const PLANET_ITEMS: PlanetDisplayItem[] = [
  ...PLANET_CONFIGS.map(mapConfigToDisplay),
  ...PREVIEW_EXTRAS,
];

export function PlanetSelectScreen({
  currentPlanet,
  campaignRound,
  playerCash,
  hasSavedGame = false,
  onStartRound,
  onNewGame,
  onContinue,
  onResetGame,
}: PlanetSelectScreenProps) {
  const initialIndex = Math.max(
    0,
    PLANET_ITEMS.findIndex((item) => item.id === currentPlanet?.id),
  );
  const [selectedPlanetIndex, setSelectedPlanetIndex] = useState(initialIndex);
  const planet = PLANET_ITEMS[selectedPlanetIndex] ?? PLANET_ITEMS[0];

  return (
    <section
      className="tf-screen tf-planet-screen"
      aria-labelledby="planet-select-heading"
    >
      {/* Top Brand & Orbital Campaign Bar */}
      <header className="tf-planet-brand-bar">
        <div className="tf-brand-hero-inline">
          <div className="tf-logo-container">
            <span className="tf-logo-thermal">
              THERM<span className="tf-logo-peak">▲</span>L
            </span>
            <span className="tf-logo-frontier">FRONTIER</span>
          </div>
          <p className="tf-logo-subtitle">Dig. Harness. Prosper.</p>
        </div>

        <div className="tf-screen-meta-pills">
          <span id="planet-select-heading" className="tf-pill">
            🪐 Round {campaignRound}
          </span>
          <span className="tf-pill tf-pill--cash">
            <span>⭐</span>
            <strong>${playerCash.toLocaleString()}</strong>
          </span>
        </div>
      </header>

      {/* Main 3-Column Zero-Scroll Planet Stage */}
      <div className="tf-planet-stage">
        {/* Left Characteristics & Action Card */}
        <aside className="tf-planet-card">
          <div className="tf-planet-card-header">
            <div className="tf-planet-sector-row">
              <span
                className={`tf-card-sector-tag ${
                  planet.playable ? '' : 'is-locked'
                }`}
              >
                {planet.playable ? '● ' : '🔒 '}
                {planet.badge}
              </span>
            </div>
            <h2 className="tf-planet-card-name">{planet.name}</h2>
          </div>

          <div className="tf-planet-specs">
            <div className="tf-spec-row">
              <span className="tf-spec-label">🌡 Thermal Energy:</span>
              <strong className="tf-spec-value--thermal">
                {planet.thermalPotential}
              </strong>
            </div>

            <div className="tf-spec-row">
              <span className="tf-spec-label">💎 Resources:</span>
              <strong className="tf-spec-value--resources">
                {planet.mineralPotential}
              </strong>
            </div>

            <div className="tf-spec-row">
              <span className="tf-spec-label">⛰ Terrain:</span>
              <strong className="tf-spec-value--terrain">
                {planet.terrainProfile}
              </strong>
            </div>

            <div className="tf-spec-row">
              <span className="tf-spec-label">🪨 Geology:</span>
              <strong className="tf-spec-value--return">
                {planet.geologicalDiversity}
              </strong>
            </div>

            <div className="tf-spec-row">
              <span className="tf-spec-label">🔩 Drill Difficulty:</span>
              <strong className="tf-spec-value--difficulty">
                {planet.drillingDifficulty}
              </strong>
            </div>
          </div>

          <p className="tf-planet-card-desc">{planet.description}</p>

          <div className="tf-planet-card-actions">
            <button
              type="button"
              className="tf-btn-start-round"
              disabled={!planet.playable}
              onClick={() => onStartRound(planet.id)}
            >
              {planet.playable ? 'Start Round ▶' : `🔒 ${planet.name} Locked`}
            </button>

            {(onNewGame || onContinue || onResetGame) && (
              <div className="tf-planet-save-actions">
                {onContinue && hasSavedGame && (
                  <button
                    type="button"
                    className="tf-btn tf-btn--positive"
                    onClick={onContinue}
                  >
                    Continue
                  </button>
                )}
                {onNewGame && (
                  <button
                    type="button"
                    className="tf-btn tf-btn--quiet"
                    onClick={onNewGame}
                  >
                    New Game
                  </button>
                )}
                {onResetGame && (
                  <button
                    type="button"
                    className="tf-btn tf-btn--quiet"
                    onClick={onResetGame}
                  >
                    Reset
                  </button>
                )}
              </div>
            )}

            <div
              className="tf-pagination-dots"
              role="tablist"
              aria-label="Planet pagination"
            >
              {PLANET_ITEMS.map((choice, idx) => (
                <button
                  key={choice.id}
                  type="button"
                  className={`tf-dot ${
                    idx === selectedPlanetIndex ? 'is-active' : ''
                  }`}
                  onClick={() => setSelectedPlanetIndex(idx)}
                  aria-label={`Select ${choice.name}`}
                />
              ))}
            </div>
          </div>
        </aside>

        {/* Center Colorful 2D Illustrated Zephyr-7 Artwork */}
        <div className="tf-planet-visual-center">
          <div className="tf-planet-sphere-wrap">
            <svg
              className="tf-planet-svg"
              viewBox="0 0 400 360"
              preserveAspectRatio="xMidYMid meet"
              xmlns="http://www.w3.org/2000/svg"
              aria-label={`Illustrated planet ${planet.name}`}
            >
              <defs>
                <radialGradient id="zephyrBodyGrad" cx="38%" cy="32%" r="72%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="35%" stopColor="#1d4ed8" />
                  <stop offset="75%" stopColor="#0f213a" />
                  <stop offset="100%" stopColor="#081426" />
                </radialGradient>

                <linearGradient id="volcanoLava" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fef08a" />
                  <stop offset="35%" stopColor="#f97316" />
                  <stop offset="100%" stopColor="#dc2626" />
                </linearGradient>

                <linearGradient id="crystalGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e9d5ff" />
                  <stop offset="50%" stopColor="#a855f7" />
                  <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>

                <linearGradient id="stableValley" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#4ade80" />
                  <stop offset="55%" stopColor="#22c55e" />
                  <stop offset="100%" stopColor="#0d9488" />
                </linearGradient>

                <filter id="planetGlow" x="-25%" y="-25%" width="150%" height="150%">
                  <feGaussianBlur stdDeviation="7" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>

                <clipPath id="planetDiscClip">
                  <circle cx="200" cy="180" r="134" />
                </clipPath>
              </defs>

              {/* Starfield */}
              <circle cx="48" cy="48" r="2" fill="#f8fafc" opacity="0.85" />
              <circle cx="348" cy="54" r="2.5" fill="#fbbf24" opacity="0.9" />
              <circle cx="62" cy="296" r="1.8" fill="#38bdf8" opacity="0.8" />
              <circle cx="334" cy="290" r="2" fill="#c084fc" opacity="0.85" />
              <circle cx="290" cy="36" r="1.5" fill="#ffffff" opacity="0.7" />
              <circle cx="105" cy="38" r="1.5" fill="#34d399" opacity="0.7" />

              {/* Orbital Ring & Atmosphere Halo */}
              <ellipse
                cx="200"
                cy="185"
                rx="172"
                ry="42"
                transform="rotate(-14 200 185)"
                fill="none"
                stroke={planet.accentColor}
                strokeWidth="2.5"
                strokeDasharray="10 6"
                opacity="0.4"
              />
              <circle cx="200" cy="180" r="146" fill="#38bdf8" opacity="0.16" filter="url(#planetGlow)" />
              <circle cx="200" cy="180" r="138" fill="#f97316" opacity="0.08" />

              {/* Planet Sphere */}
              <circle
                cx="200"
                cy="180"
                r="134"
                fill="url(#zephyrBodyGrad)"
                stroke="#38bdf8"
                strokeWidth="2"
                strokeOpacity="0.45"
              />

              <g clipPath="url(#planetDiscClip)">
                {/* Green Stable Ground Valleys */}
                <path
                  d="M 85 190 C 125 148, 210 155, 255 195 C 280 220, 265 275, 200 292 C 130 290, 75 245, 85 190 Z"
                  fill="url(#stableValley)"
                  opacity="0.92"
                />

                {/* Blue Mineral Basins & Rivers */}
                <path
                  d="M 215 215 Q 258 205 298 228 Q 280 278 215 276 Q 230 245 215 215 Z"
                  fill="#0284c7"
                  opacity="0.78"
                />
                <polygon points="242,232 252,210 262,232" fill="#818cf8" />
                <polygon points="256,236 268,214 278,236" fill="#38bdf8" />

                {/* Purple Crystalline Plateaus */}
                <polygon points="104,172 118,126 134,172" fill="url(#crystalGrad)" />
                <polygon points="126,178 144,116 160,178" fill="url(#crystalGrad)" />
                <polygon points="146,182 158,142 172,182" fill="#818cf8" />

                {/* Orange Volcanic Range & Glowing Geothermal Fissures */}
                <g className="tf-volcano-feature">
                  <polygon points="164,186 202,102 242,186" fill="#9a3412" stroke="#f97316" strokeWidth="1.5" />
                  <polygon points="222,188 258,122 292,188" fill="#7c2d12" stroke="#fb923c" strokeWidth="1.2" />
                  <ellipse cx="202" cy="105" rx="14" ry="6" fill="url(#volcanoLava)" filter="url(#planetGlow)" />
                  <ellipse cx="258" cy="124" rx="9" ry="4" fill="url(#volcanoLava)" />

                  {/* Glowing Fissures */}
                  <path
                    d="M 202 111 Q 208 140 198 168 Q 190 194 206 218"
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <path
                    d="M 140 218 Q 168 206 196 226 Q 214 236 232 224"
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />

                  {/* Geothermal Steam Plumes */}
                  <circle cx="202" cy="88" r="7" fill="#fed7aa" opacity="0.7" />
                  <circle cx="212" cy="72" r="10" fill="#ffedd5" opacity="0.45" />
                  <circle cx="258" cy="108" r="5" fill="#fdba74" opacity="0.65" />
                </g>

                {/* Bright Atmospheric Clouds */}
                <path
                  d="M 88 118 Q 145 98 208 110"
                  fill="none"
                  stroke="#f8fafc"
                  strokeWidth="10"
                  strokeLinecap="round"
                  opacity="0.32"
                />
                <path
                  d="M 178 262 Q 240 274 298 248"
                  fill="none"
                  stroke="#e0f2fe"
                  strokeWidth="8"
                  strokeLinecap="round"
                  opacity="0.3"
                />
              </g>
            </svg>
          </div>

          {!planet.playable && (
            <div className="tf-locked-overlay-pill">
              🔒 Locked Preview — Select Zephyr-7 to Launch
            </div>
          )}
        </div>

        {/* Right Side (Desktop) / Horizontal Strip (Mobile): Planet Selector */}
        <aside
          className="tf-hexagon-selector-column"
          aria-label="Planet selection buttons"
        >
          <span className="tf-hex-column-label">SECTORS</span>
          {PLANET_ITEMS.map((choice, index) => {
            const isActive = index === selectedPlanetIndex;
            return (
              <button
                key={choice.id}
                type="button"
                className={`tf-hex-btn ${isActive ? 'is-active' : ''} ${
                  choice.playable ? '' : 'is-locked'
                }`}
                style={
                  { '--hex-accent': choice.accentColor } as React.CSSProperties
                }
                onClick={() => setSelectedPlanetIndex(index)}
                aria-pressed={isActive}
                title={choice.name}
              >
                <div className="tf-hex-shape" aria-hidden="true">
                  <span>{choice.icon}</span>
                </div>
                <div className="tf-hex-meta">
                  <span className="tf-hex-name">{choice.name}</span>
                  <span className="tf-hex-state">
                    {choice.playable ? 'Playable' : 'Locked'}
                  </span>
                </div>
              </button>
            );
          })}
        </aside>
      </div>

      {/* Slim Bottom Summary Strip */}
      <footer className="tf-planet-footer-strip">
        <span>
          🌋 Playable Sector: <strong>Zephyr-7</strong> · 6 seeded parcels · 3 rival bidders · 4-min ops window
        </span>
        <span>Target: Tap hidden magma reservoirs &amp; export clean MW</span>
      </footer>
    </section>
  );
}
