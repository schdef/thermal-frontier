import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import { LandAuctionScreen } from '../src/components/LandAuctionScreen';
import { PlanetSelectScreen } from '../src/components/PlanetSelectScreen';
import { ProductionSetupScreen } from '../src/components/ProductionSetupScreen';
import { RoundReportScreen } from '../src/components/RoundReportScreen';
import { SurfaceSurveyScreen } from '../src/components/SurfaceSurveyScreen';
import { TurmoilDrillingScreen } from '../src/components/TurmoilDrillingScreen';
import { DEFAULT_TELEMETRY } from '../src/game/session';
import { surveyFixture } from '../src/ui/fixtures';

describe('6-Stage UI & Screen Experience Specifications', () => {
  it('Screen 1: Planet Select renders brand lockup, 2D Zephyr-7 art, sector buttons, specs, and Start Round', () => {
    const markup = renderToStaticMarkup(
      <PlanetSelectScreen
        campaignRound={1}
        playerCash={1000}
        hasSavedGame={true}
        onStartRound={() => undefined}
        onNewGame={() => undefined}
        onContinue={() => undefined}
        onResetGame={() => undefined}
      />,
    );

    expect(markup).toContain('THERM');
    expect(markup).toContain('FRONTIER');
    expect(markup).toContain('Dig. Harness. Prosper.');

    expect(markup).toContain('Zephyr-7');
    expect(markup).toContain('tf-planet-svg');
    expect(markup).toContain('tf-volcano-feature');

    expect(markup).toContain('Thermal Energy:');
    expect(markup).toContain('High');
    expect(markup).toContain('Resources:');
    expect(markup).toContain('Rich');
    expect(markup).toContain('Terrain:');
    expect(markup).toContain('Varied');

    expect(markup).toContain('Start Round ▶');
    expect(markup).toContain('Continue');
    expect(markup).toContain('New Game');
    expect(markup).toContain('Reset');
    expect(markup).toContain('tf-pagination-dots');

    expect(markup).toContain('Frost-3');
    expect(markup).toContain('Magma-9');
    expect(markup).toContain('Terra-Nova');
    expect(markup).toContain('Basalt-Prime');
  });

  it('Screen 2: Land Auction renders 2x3 grid of 6 isometric parcel cards, 3 rivals, timer capsule, stepper, and trophy banner', () => {
    const dummyParcels = [
      { id: 'p-1', name: 'Ignis Caldera', region: 'Zephyr-7', terrain: 'Volcanic vents', clue: 'clue', temperature: '140°C', depth: '3 fissures', potential: 'High', marketDistance: '12km', currentBid: 420, nextBid: 460, bidder: 'Rival', timeLeft: '42s', trend: 'rising' as const },
      { id: 'p-2', name: 'Glacial Rift', region: 'Zephyr-7', terrain: 'Ice permafrost', clue: 'clue', temperature: '20°C', depth: '2 fissures', potential: 'Medium', marketDistance: '8km', currentBid: 300, nextBid: 330, bidder: 'Rival', timeLeft: '42s', trend: 'steady' as const },
      { id: 'p-3', name: 'Sylvan Canopy', region: 'Zephyr-7', terrain: 'Forest bedrock', clue: 'clue', temperature: '55°C', depth: '2 fissures', potential: 'High', marketDistance: '15km', currentBid: 250, nextBid: 280, bidder: 'Rival', timeLeft: '42s', trend: 'steady' as const },
      { id: 'p-4', name: 'Prismatic Quartz', region: 'Zephyr-7', terrain: 'Crystal shards', clue: 'clue', temperature: '90°C', depth: '3 fissures', potential: 'High', marketDistance: '10km', currentBid: 380, nextBid: 410, bidder: 'Rival', timeLeft: '42s', trend: 'watched' as const },
      { id: 'p-5', name: 'Dune Basin', region: 'Zephyr-7', terrain: 'Desert sandstone', clue: 'clue', temperature: '110°C', depth: '2 fissures', potential: 'Medium', marketDistance: '20km', currentBid: 340, nextBid: 370, bidder: 'Rival', timeLeft: '42s', trend: 'steady' as const },
      { id: 'p-6', name: 'Obsidian Monolith', region: 'Zephyr-7', terrain: 'Basalt fissures', clue: 'clue', temperature: '150°C', depth: '4 fissures', potential: 'High', marketDistance: '18km', currentBid: 450, nextBid: 490, bidder: 'Rival', timeLeft: '42s', trend: 'rising' as const },
    ];

    const markup = renderToStaticMarkup(
      <LandAuctionScreen
        parcels={dummyParcels}
        budget={1200}
        selectedParcelId="p-1"
        currentBid={420}
        timeRemainingSeconds={42}
        isOpen={true}
        auctionEnded={false}
        playerWon={false}
        onSelectParcel={() => undefined}
        onBid={() => undefined}
        onWithdraw={() => undefined}
      />,
    );

    expect(markup).toContain('Land Auction');
    expect(markup).toContain('Bid for the best parcels!');
    expect(markup).toContain('00:00:42');

    expect(markup).toContain('tf-parcels-grid-2x3');
    expect(markup).toContain('#1');
    expect(markup).toContain('#6');
    expect(markup).toContain('tf-art-volcanic');
    expect(markup).toContain('tf-art-ice');
    expect(markup).toContain('tf-art-forest');
    expect(markup).toContain('tf-art-crystal');
    expect(markup).toContain('tf-art-desert');
    expect(markup).toContain('tf-art-basalt');

    expect(markup).toContain('Caelum');
    expect(markup).toContain('Vanguard');
    expect(markup).toContain('Helios');
    expect(markup).toContain('Current Bid');
    expect(markup).toContain('Your Bid');
    expect(markup).toContain('Place Bid');
    expect(markup).toContain('▲');
    expect(markup).toContain('▼');
    expect(markup).toContain('Highest Bidder Gets the Parcel!');
  });

  it('Screen 3: Surface Survey renders hexagonal map, rover with light cone, legend, and Scan Area', () => {
    const markup = renderToStaticMarkup(
      <SurfaceSurveyScreen
        cash={1000}
        tools={surveyFixture}
        roverScans={[]}
        onSelectTool={() => undefined}
        onPurchase={() => undefined}
        onProceedToDrilling={() => undefined}
      />,
    );

    expect(markup).toContain('Surface Survey');
    expect(markup).toContain('Explore the planet and find the best underground resources!');
    expect(markup).toContain('tf-survey-hex-svg');
    expect(markup).toContain('tf-survey-rover');
    expect(markup).toContain('headlightGlow');
    expect(markup).toContain('Find:');
    expect(markup).toContain('Thermal Hotspots');
    expect(markup).toContain('Minerals');
    expect(markup).toContain('Stable Ground');
    expect(markup).toContain('Scan Area');
    expect(markup).toContain('Surface scanner');
    expect(markup).toContain('Proceed to Drilling ▶');
  });

  it('Screen 4: Drilling renders derrick, strata, depth markers, and interactive drawing controls without leaking hidden reservoirs', () => {
    const markup = renderToStaticMarkup(
      <TurmoilDrillingScreen
        cash={1000}
        snapToLayer={false}
        onToggleSnapToLayer={() => undefined}
        onConfirmDrillPath={() => undefined}
        onDrillingComplete={() => undefined}
      />,
    );

    expect(markup).toContain('Drilling');
    expect(markup).toContain('Draw your drilling path!');
    expect(markup).toContain('Snap to Layer');
    expect(markup).toContain('0m');
    expect(markup).toContain('250m');
    expect(markup).toContain('500m');
    expect(markup).toContain('tf-surface-rig');
    expect(markup).toContain('skyGrad');
    expect(markup).toContain('Subsurface hidden until drilled');
    expect(markup).not.toContain('tf-magma-chamber');
    expect(markup).toContain('polyline');
    expect(markup).toContain('tf-btn-undo');
    expect(markup).toContain('tf-btn-clear');
    expect(markup).toContain('tf-btn-confirm');
    expect(markup).toContain('Scan Car ($35)');
    expect(markup).toContain('Speed Mk II ($80)');
    expect(markup).toContain('Mk I (1×)');

    const echoMarkup = renderToStaticMarkup(
      <TurmoilDrillingScreen
        cash={1000}
        snapToLayer={false}
        drillSpeedLevel={4}
        echoScans={[
          {
            id: 'echo-1',
            parcelId: 'p-1',
            scanX: 50,
            radiusX: 28,
            cost: 35,
            timestamp: 1,
            pings: [
              {
                id: 'ping-1',
                kind: 'thermal',
                approxX: 58,
                approxY: 74,
                radius: 10,
                strength: 0.85,
                tempBand: '240–290°C',
                label: 'Thermal Echo',
              },
            ],
          },
        ]}
        onToggleSnapToLayer={() => undefined}
        onConfirmDrillPath={() => undefined}
        onDrillingComplete={() => undefined}
      />,
    );

    expect(echoMarkup).toContain('tf-surface-scan-car');
    expect(echoMarkup).toContain('tf-echo-ping--thermal');
    expect(echoMarkup).toContain('240–290°C');
    expect(echoMarkup).toContain('Max Speed (Mk IV)');
    expect(echoMarkup).not.toContain('tf-magma-chamber');
  });

  it('Screen 5: Production Setup renders circulation loop, telemetry, storage, export, and return fluid loop', () => {
    const markup = renderToStaticMarkup(
      <ProductionSetupScreen
        cash={2500}
        storedTherm={240}
        storageCapacity={500}
        telemetry={DEFAULT_TELEMETRY}
        currentPrice={125}
        isPaused={false}
        speed={1}
        returnLoopActive={true}
        onTogglePause={() => undefined}
        onSetSpeed={() => undefined}
        onToggleReturnLoop={() => undefined}
        onExportToMarket={() => undefined}
        onSettleRound={() => undefined}
      />,
    );

    expect(markup).toContain('Production Setup');
    expect(markup).toContain('Turn the heat into profit!');
    expect(markup).toContain('320 °C');
    expect(markup).toContain('120 MW');
    expect(markup).toContain('WELLHEAD');
    expect(markup).toContain('HEAT EXCHANGER');
    expect(markup).toContain('STORAGE TANK');
    expect(markup).toContain('Export (Market)');
    expect(markup).toContain('Return Fluid');
    expect(markup).toContain('MAGMA RESERVOIR');
    expect(markup).toContain('Settle Round ▶');
  });

  it('Screen 6: Round Report renders real profit/loss without hiding negatives, depletion bars, and Continue', () => {
    const positiveMarkup = renderToStaticMarkup(
      <RoundReportScreen
        campaignRound={1}
        totalProfit={2480}
        profitPercentage={24}
        depletion={{
          thermalDepletionPercent: 68,
          thermalRemainingPercent: 32,
          mineralsDepletionPercent: 42,
          stableGroundDepletionPercent: 29,
          stableGroundRemainingPercent: 71,
        }}
        lines={[
          { label: 'Gross revenue', value: '$3,200', tone: 'positive' },
          { label: 'Total costs', value: '−$720', tone: 'negative' },
          { label: 'Net profit', value: '+$2,480', tone: 'positive' },
        ]}
        onContinue={() => undefined}
      />,
    );

    expect(positiveMarkup).toContain('Round Report');
    expect(positiveMarkup).toContain('Your performance this round');
    expect(positiveMarkup).toContain('Total Profit');
    expect(positiveMarkup).toContain('+$2,480');
    expect(positiveMarkup).toContain('+24%');
    expect(positiveMarkup).toContain('Resource Depletion');
    expect(positiveMarkup).toContain('Thermal Energy');
    expect(positiveMarkup).toContain('68%');
    expect(positiveMarkup).toContain('Minerals');
    expect(positiveMarkup).toContain('42%');
    expect(positiveMarkup).toContain('Stable Ground');
    expect(positiveMarkup).toContain('71%');
    expect(positiveMarkup).toContain('Continue ▶');

    const lossMarkup = renderToStaticMarkup(
      <RoundReportScreen
        campaignRound={2}
        totalProfit={-450}
        profitPercentage={-18}
        depletion={{
          thermalDepletionPercent: 10,
          thermalRemainingPercent: 90,
          mineralsDepletionPercent: 0,
          stableGroundDepletionPercent: 5,
          stableGroundRemainingPercent: 95,
        }}
        lines={[{ label: 'Net profit', value: '−$450', tone: 'negative' }]}
        onContinue={() => undefined}
      />,
    );

    expect(lossMarkup).toContain('−$450');
    expect(lossMarkup).toContain('-18%');
    expect(lossMarkup).toContain('is-negative');
  });

  it('App renders PlanetSelectScreen when initialPhase is planet', () => {
    const markup = renderToStaticMarkup(<App initialPhase="planet" />);

    expect(markup).toContain('THERM');
    expect(markup).toContain('FRONTIER');
    expect(markup).toContain('Dig. Harness. Prosper.');
    expect(markup).toContain('Zephyr-7');
  });
});
