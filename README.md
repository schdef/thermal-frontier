# Thermal Frontier

**Dig. Harness. Prosper.**

Thermal Frontier is a playful, sci-fi geothermal energy management and subterranean exploration game built with React, TypeScript, and Vite. Players prospect alien worlds—starting on **Zephyr-7**—through a 6-stage loop: **Planet Introduction → Land Auction → Surface Survey → Manual Drilling → Geothermal Production → Round Report**.

---

## Project Structure

```text
thermal-frontier-repo/
├── index.html                  # App entry HTML & viewport/theme configuration
├── package.json                # Dependencies and npm scripts
├── src/
│   ├── App.tsx                 # Top-level game shell, HUD, and 6-stage screen router
│   ├── main.tsx                # Stylesheet imports and React root mount
│   ├── simulation/             # Pure, deterministic TypeScript simulation engine
│   │   ├── constants.ts        # Central balancing config, planet configs, rival profiles
│   │   ├── types.ts            # Shared simulation contracts (PlanetConfig, Parcel, WellRecord, PlantChainState, etc.)
│   │   ├── planets.ts          # Planet registry helpers (listPlanets, getPlanetConfig, isPlanetPlayable)
│   │   ├── random.ts           # Deterministic Mulberry32 PRNG
│   │   ├── generation.ts       # Seeded 6-parcel generation (layers, reservoirs, faults, minerals, 2D surface clues)
│   │   ├── auction.ts          # 6-parcel ascending auction, 3 rival AI companies, escrow & anti-sniping
│   │   ├── survey.ts           # 2D top-down surface scanning (never leaks hidden reservoirs)
│   │   ├── drilling.ts         # Segment-aware path validation, Snap-to-Layer, cost estimation, multi-well execution
│   │   ├── reservoir.ts        # Analytical finite thermal extraction & non-compounding temperature decline
│   │   ├── pipes.ts            # Geothermal circulation network (hot pipe, exchanger, return-fluid loop)
│   │   ├── market.ts           # Electricity export pricing & MWh/revenue math
│   │   ├── update.ts           # Frame-rate-independent updateSimulation(deltaTime, state) loop
│   │   ├── settlement.ts       # Real auditable round financial, resource depletion, & ROI settlement
│   │   └── index.ts            # Public simulation barrel exports
│   ├── game/                   # Session state reducer & browser persistence
│   │   ├── types.ts            # GameState, LedgerEntry, SaveSlotInfo, schema version contracts
│   │   ├── session.ts          # Phase transitions, escrow/ledger accounting, campaign progression
│   │   ├── storage.ts          # SaveSystem (localStorage persistence, v1→v2 migration, New/Continue/Reset)
│   │   └── index.ts
│   ├── components/             # Zero-scroll 100dvh React UI screens & compact HUD widgets
│   │   ├── PlanetSelectScreen.tsx
│   │   ├── LandAuctionScreen.tsx / AuctionBoard.tsx
│   │   ├── SurfaceSurveyScreen.tsx / SurveyPanel.tsx
│   │   ├── TurmoilDrillingScreen.tsx
│   │   ├── ProductionSetupScreen.tsx / EquipmentPanel.tsx / MarketStoragePanel.tsx
│   │   ├── RoundReportScreen.tsx
│   │   └── ResourceBar.tsx / PhaseRail.tsx / OperatingControls.tsx / NextActionCard.tsx
│   └── styles/                 # Modular CSS tokens, zero-scroll shell, and per-screen responsive styles
│       ├── tokens.css
│       ├── shell.css
│       ├── planet-report.css
│       ├── auction.css
│       ├── survey.css
│       ├── drilling.css
│       └── production.css
└── tests/
    ├── simulation/             # Deterministic unit tests for every simulation module
    ├── game/                   # Session reducer, campaign progression, ops loop, and SaveSystem tests
    └── *.test.tsx              # UI screen & app integration tests
```

---

## Setup, Development & Verification

```bash
# Install dependencies
npm install

# Start Vite development server
npm run dev

# Run TypeScript typechecking
npm run typecheck

# Run full Vitest test suite
npm test

# Run quick UI smoke test
npm run test:smoke

# Typecheck and build production bundle (dist/)
npm run build
```

---

## Gameplay Systems

### 1. PlanetSystem (`src/simulation/planets.ts`, `constants.ts`)
- Data-driven `PlanetConfig` definitions control planet palettes, default geological layers, thermal/mineral potential ranges, fault frequency, ground stability, rival competition, starting cash, and round duration.
- **Zephyr-7** (`ZEPHYR_7_CONFIG`) is unlocked and playable; **Frost-3** (`FROST_3_CONFIG`) and **Magma-9** (`MAGMA_9_CONFIG`) are configured as locked preview worlds.

### 2. Seeded 6-Parcel Geology (`src/simulation/generation.ts`)
- `generatePlanetParcels(planet, seed)` deterministically generates 6 distinct biome parcels (`volcanic`, `ice`, `forest`, `crystal`, `desert`, `basalt`) using Mulberry32 (`seededRandom`).
- Each parcel includes multi-strata `layers` (`0–500m`), **at least 2 finite thermal reservoirs** (`initialTemperature`, `initialHeat`, `flowPotential`, `maxExtractionRate`), `FaultObstacle[]` hazards, `Aquifer[]` zones, `MineralDeposit[]` veins, and correlated 2D top-down `surfaceFeatures` (`0..100` map space).
- `publicClues` expose only surface-observable indicators (surface temperature, market distance, visible fissures, risk/stability hints) without leaking hidden reservoir positions or heat inventory.

### 3. Live Multi-Parcel Land Auction (`src/simulation/auction.ts`)
- Simultaneous ascending auctions across all 6 parcels against **3 seeded rival companies** (`RIVAL_COMPANIES`):
  - **Caelum Dynamics** (`analytical`, $620 starting budget, prefers `crystal`/`forest`/`ice`)
  - **Vanguard Thermal** (`aggressive`, $760 starting budget, prefers `volcanic`/`basalt`)
  - **Helios GeoCorp** (`opportunist`, $540 starting budget, prefers `desert`/`volcanic`/`crystal`)
- **Escrow & Validation**: `committedByBidder` tracks active bids across all 6 lots so outbid funds are immediately returned to available cash and only winning bidders pay `finalPrice` on close.
- **Anti-Sniping**: Valid bids placed at or below `antiSnipeThresholdSeconds` (`5s`) extend the parcel clock by `antiSnipeExtensionSeconds` (`5s`), up to `maxAuctionExtensions` (`6`) times.

### 4. 2D Surface Survey (`src/simulation/survey.ts`)
- `performSurfaceScan` scans a circular radius (`roverScanRadius = 22`) in `0..100` top-down coordinates for `$30` per ping, revealing nearby thermal hotspots, mineral deposits, fault markers, stable ground zones, approximate thermal bands, and cumulative coverage `%`.
- Hidden underground reservoirs remain strictly concealed until intersected by drilling.

### 5. Multi-Well Manual Drilling (`src/simulation/drilling.ts`)
- Interactive mouse and touch pointer-event path drawing from the surface rig down through geological strata (`0–500m`).
- **Snap to Layer** (`snapDrillPoint` / `snapToLayer`) toggles snapping waypoints to strata boundaries vs. freeform directional steering.
- **Validation & Cost**: `validateDrillingPath` checks surface entry, parcel bounds, minimum segment/turn angles (`>= 30°`), blocking critical faults, and cash affordability. `estimateDrillCost` prices segment lengths weighted by crossed rock hardness (`GEOLOGY_HARDNESS`), depth surcharge, turn bends, and aquifer/fault penalties.
- **Multi-Well Execution**: `executeWellDrilling` creates `WellRecord` entries (`'active' | 'dry' | 'blocked'`) so players can drill multiple wells per parcel (e.g., to recover from a dry hole or tap a second reservoir).

### 6. Geothermal Circulation & `updateSimulation` (`src/simulation/update.ts`, `reservoir.ts`, `pipes.ts`, `market.ts`)
- Models the complete closed-loop chain:
  **Production Well(s) → Orange Hot-Fluid Pipe → Heat Exchanger → Thermal Storage Tank → Yellow Electricity Export + Blue Return-Fluid Reinjection Pipe**.
- `updateSimulation(deltaTime, state)` is deterministic and frame-rate independent:
  - Respects `isPaused` and simulation speed multipliers (`0 | 1 | 2 | 3`).
  - Uses analytical integration (`produceFromReservoir`) and non-compounding `deriveReservoirTemperature` so depletion cools reservoirs consistently regardless of tick step size.
  - Throttles continuous flow (`0.15x`) and exchanger efficiency (`0.65x`) if the blue return-fluid pipe is disconnected.
  - Buffers excess thermal units up to `storageCapacityTH`, exports electricity up to `exportCapacityMW` at `marketPricePerMWh`, accrues operating costs, counts down `roundTimeRemainingSeconds` (`240s`), and handles finite depletion / round-end states.

### 7. Round Report, Credits Ledger & SaveSystem (`src/simulation/settlement.ts`, `src/game/session.ts`, `src/game/storage.ts`)
- Every credit inflow/outflow (`land`, `survey`, `drilling`, `pipes`, `upgrades`, `operating`, `sale`) is recorded in `state.ledger`.
- `settleGameState` / `settleRound` computes real profit, ROI %, thermal extraction & depletion %, discovered minerals %, ground stability score, average/peak MW, exported MWh, and utilization % with zero hardcoded placeholders.
- `SaveSystem` (`saveSession`, `loadSession`, `hasSavedSession`, `getSaveSlotInfo`, `clearSavedSession`) persists `GameState` (`schemaVersion = 2`) in `localStorage` with v1 migration and supports **New Game**, **Continue**, and **Reset Game**.

---

## Central Balancing Configuration (`src/simulation/constants.ts`)

| Constant | Default | Description |
| --- | --- | --- |
| `parcelCount` | `6` | Parcels auctioned per round |
| `startingBudget` | `$1,000` | Default starting capital on Zephyr-7 |
| `roundDurationSeconds` | `240` | Production round duration (4 minutes) |
| `auctionOpeningBid` / `auctionMinimumIncrement` | `$50` / `$10` | Starting lot price and min raise |
| `auctionDurationSeconds` | `30` | Base countdown per parcel auction |
| `antiSnipeThresholdSeconds` / `Extension` | `5s` / `+5s` (max `6`) | Late-bid extension rules |
| `rivalCount` | `3` | AI competitor companies per auction |
| `roverScanCost` / `roverScanRadius` | `$30` / `22` | 2D surface scan cost and radius |
| `drillCostPerDistance` | `1.5` | Base cost multiplier per unit distance × rock hardness |
| `aquiferPenaltyCost` / `faultPenaltyCost` | `$40` / `$60` | Subsurface hazard sealing/drilling surcharges |
| `storageCapacityTH` | `500 TH` | Thermal buffer capacity |
| `exchangerBaseEfficiency` | `0.94` | Base heat exchanger conversion efficiency |
| `exportCapacityMW` | `150 MW` | Grid export ceiling |
| `DEFAULT_MARKET_PRICE_PER_MWH` | `$120 / MWh` | Stable MVP electricity export tariff (`market.ts`) |

---

## Known Limitations (First Playable / MVP)
- **Single Playable Planet**: Only **Zephyr-7** is playable; **Frost-3** and **Magma-9** are previewed as locked planets.
- **Stable Electricity Tariff**: Production defaults to a stable `$120/MWh` tariff (`DEFAULT_MARKET_PRICE_PER_MWH`) rather than live fluctuating grid tariffs.
- **Local Persistence Only**: Progress is saved in browser `localStorage` (`thermal-frontier:round-session`) with no cloud sync or backend leaderboard.
- **Single Active Wellhead Rig Visual**: While multiple `WellRecord` boreholes can be drilled and produce simultaneously, surface plant schematics aggregate well output into a unified wellhead view.

## Phase 2 Roadmap
- Unlock **Frost-3** (cryo-permafrost & lithium brines) and **Magma-9** (extreme seismic mantle plumes) with distinct gameplay modifiers.
- Expanded R&D / Technology Tree (multi-tier drill rigs, directional stabilizers, automated cooling towers, and high-capacity thermal silos).
- Dynamic time-of-day electricity market pricing (`marketPriceAt`) with strategic storage charge/discharge timing.
- Narrative campaign milestones, corporate reputation contracts, and cross-round rival standings.

---

## Hosting on Samsung Galaxy S10+ (Termux)

Thermal Frontier can be hosted directly from a Samsung Galaxy S10+ running **Termux** on port `11667` (avoiding Feeda's `11666` port).

### Option A: Clone and run directly on the S10+ (Termux)

```bash
pkg update && pkg install -y git nodejs termux-api
git clone <your-repo-url> ~/thermal-frontier
cd ~/thermal-frontier
npm install
npm run build
./scripts/start_s10.sh
```

`start_s10.sh` acquires `termux-wake-lock` (releasing it on exit), serves the built `dist/` SPA with `index.html` fallback on `0.0.0.0:${TF_PORT:-11667}`, and prints both the LAN and `localhost:11667` URLs.

### Option B: Build locally and deploy over SSH (`8022`)

From your workstation (requires `sshd` running on Termux, default port `8022`):

```bash
./scripts/deploy_s10.sh <user>@<phone_ip> 8022
```

This runs `npm ci` / `npm install` + `npm run build`, packages `dist/`, `scripts/`, `package.json`, and `README.md`, transfers the archive via `scp -P 8022`, extracts it into `~/thermal-frontier` on the S10+, and restarts `./scripts/start_s10.sh`. Omit the host argument (`./scripts/deploy_s10.sh`) to build a local tarball without transferring.
