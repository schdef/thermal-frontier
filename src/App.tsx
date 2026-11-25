import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LandAuctionScreen } from './components/LandAuctionScreen';
import { NextActionCard } from './components/NextActionCard';
import { PhaseRail } from './components/PhaseRail';
import { PlanetSelectScreen } from './components/PlanetSelectScreen';
import { ProductionSetupScreen } from './components/ProductionSetupScreen';
import { ResourceBar } from './components/ResourceBar';
import { RoundReportScreen } from './components/RoundReportScreen';
import { SurfaceSurveyScreen } from './components/SurfaceSurveyScreen';
import { TurmoilDrillingScreen } from './components/TurmoilDrillingScreen';
import {
  advanceAuctionTime,
  advanceToNextRound,
  completeSession,
  continueGame,
  createRoundSession,
  deployEchoScanCar,
  drillWell,
  launchPlanetSession,
  performSurfaceScanAt,
  proceedToSurvey,
  purchaseDrillSpeedUpgrade,
  purchaseSurvey,
  resetGame,
  retryAuction,
  selectParcel,
  sellStoredTherm,
  setExtractionRate,
  setSimulationSpeed,
  settleSession,
  startDrilling,
  startNewGame,
  startNewWell,
  startOperation,
  submitBid,
  tickSession,
  toggleDrillSnapToLayer,
  toggleExportActive,
  toggleReturnFluidLoop,
  toggleSimulationPause,
  withdrawFromAuction,
  type RoundPhase,
  type RoundSession,
} from './game/session';
import {
  clearSavedSession,
  hasSavedSession,
  loadSession,
  saveSession,
} from './game/storage';
import { getAvailableCash, getCommittedAmount } from './simulation/auction';
import { SIMULATION_DEFAULTS } from './simulation/constants';
import type { Point, RivalCompany } from './simulation/types';
import { surveyFixture } from './ui/fixtures';
import type {
  Parcel as UiParcel,
  ResourceValue,
  SurveyTool,
} from './ui/types';

const money = (amount: number) =>
  amount < 0
    ? `−$${Math.abs(Math.round(amount)).toLocaleString()}`
    : `$${Math.round(amount).toLocaleString()}`;

export interface AppProps {
  initialPhase?: RoundPhase;
}

function formatBidderLabel(
  bidderId: string | null | undefined,
  rivals: Array<{ id: string; name: string }> = [],
): string {
  if (!bidderId) return '—';
  if (bidderId === 'player') return 'You';
  const rival = rivals.find((r) => r.id === bidderId);
  return rival ? rival.name.split(' ')[0] : 'Rival';
}

function App({ initialPhase }: AppProps) {
  const [hasSave, setHasSave] = useState<boolean>(() => hasSavedSession());
  const [session, setSession] = useState<RoundSession>(() => {
    const saved = loadSession();
    if (saved) {
      return initialPhase ? { ...saved, phase: initialPhase } : continueGame(saved);
    }
    return createRoundSession(42, undefined, {
      initialPhase: initialPhase ?? 'planet',
    });
  });

  const [selectedSurveyId, setSelectedSurveyId] = useState<string>('surface');

  // Deterministic 1s interval loop for live auction and unified production simulation
  useEffect(() => {
    if (session.isPaused || session.speed === 0) return undefined;
    if (!['auction', 'operate', 'production'].includes(session.phase)) {
      return undefined;
    }
    if (
      (session.phase === 'operate' || session.phase === 'production') &&
      (session.plant.operatingState === 'completed' ||
        session.plant.operatingState === 'depleted')
    ) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setSession((current) =>
        current.phase === 'auction'
          ? advanceAuctionTime(current, current.speed || 1)
          : tickSession(current, 1),
      );
    }, 1_000);

    return () => window.clearInterval(timer);
  }, [
    session.isPaused,
    session.phase,
    session.speed,
    session.plant.operatingState,
  ]);

  // Persist session changes
  useEffect(() => {
    saveSession(session);
    setHasSave(true);
  }, [session]);

  const activeParcelId =
    session.ownedParcelId ??
    session.ownedParcelIds[0] ??
    session.selectedParcelId ??
    session.parcels[0]?.id;

  const activeParcel =
    session.parcels.find((p) => p.id === activeParcelId) ?? session.parcels[0];

  const selectedAuctionId =
    session.selectedParcelId ?? session.auction.parcelId ?? session.parcels[0]?.id;
  const activeAuction =
    (selectedAuctionId ? session.auctions[selectedAuctionId] : undefined) ??
    session.auction;

  const committedAuctionCash = useMemo(
    () => getCommittedAmount(session.auctions, 'player'),
    [session.auctions],
  );

  const availableAuctionCash = useMemo(
    () => getAvailableCash(session.auctions, session.cash, 'player'),
    [session.auctions, session.cash],
  );

  // Strictly public clues ONLY on auction parcel cards — never leak hidden reservoirs
  const uiParcels = useMemo<UiParcel[]>(() => {
    return session.parcels.map((parcel, index) => {
      const auc = session.auctions[parcel.id];
      const currentBid = auc?.currentBid ?? 50 + index * 10;
      const nextBid = auc?.nextMinimumBid ?? currentBid + 10;
      const bidder = formatBidderLabel(
        auc?.winnerId ?? auc?.highBidder,
        (auc?.rivals as Array<{ id: string; name: string }> | undefined) ?? [],
      );
      const timeLeftSeconds = Math.ceil(auc?.timeRemainingSeconds ?? 0);

      return {
        id: parcel.id,
        name: parcel.name ?? `Sector parcel ${index + 1}`,
        region: `${session.planet.name} · ${parcel.biome ?? 'Geothermal'}`,
        terrain: `${parcel.publicClues.visibleFissures} visible fissures · ${parcel.biome ?? 'basalt'} terrain`,
        clue: `${Math.round(parcel.publicClues.surfaceTemperature)}°C surface · ${parcel.publicClues.stabilityHint ?? 'moderate'}`,
        temperature: `${Math.round(parcel.publicClues.surfaceTemperature)}°C`,
        depth: `${parcel.publicClues.visibleFissures} fissures`,
        potential:
          parcel.publicClues.surfaceHeatSignal === 'high'
            ? 'High'
            : parcel.publicClues.surfaceHeatSignal === 'low'
              ? 'Low'
              : 'Medium',
        marketDistance: `${Math.round(parcel.publicClues.marketDistance)} km`,
        currentBid,
        nextBid,
        bidder,
        timeLeft: `${String(timeLeftSeconds).padStart(2, '0')}s`,
        trend: auc?.highBidder ? 'rising' : index % 2 ? 'watched' : 'steady',
        featured: index === 0,
      };
    });
  }, [session.auctions, session.parcels, session.planet.name]);

  const resources = useMemo<ResourceValue[]>(() => {
    return [
      {
        label: 'Credits',
        value: money(session.cash),
        tone: 'signal',
        icon: '◈',
      },
      {
        label: 'Storage',
        value: `${Math.round(session.storageTherm)} TH`,
        tone: 'ember',
        icon: 'ϟ',
      },
      {
        label: 'Export',
        value: `${Math.round(session.powerGeneratedMWh)} MWh`,
        tone: 'ice',
        icon: '⚡',
      },
      {
        label: 'Round',
        value: `0${session.campaignRound}`,
        tone: 'neutral',
        icon: '◷',
      },
    ];
  }, [
    session.campaignRound,
    session.cash,
    session.powerGeneratedMWh,
    session.storageTherm,
  ]);

  const allAuctionsEndedWithoutParcel =
    session.phase === 'auction' &&
    session.ownedParcelIds.length === 0 &&
    Object.values(session.auctions).every((auc) => auc.status === 'ended');

  const disabledPhases = useMemo<RoundPhase[]>(() => {
    const disabled: RoundPhase[] = [];
    const ownsParcel = session.ownedParcelIds.length > 0 || Boolean(session.ownedParcelId);
    const hasActiveWell =
      session.wells.some((w) => w.status === 'active') ||
      session.discoveredReservoirIds.length > 0;
    if (!ownsParcel) {
      disabled.push('survey', 'drill', 'operate', 'settled');
    } else if (!hasActiveWell) {
      disabled.push('operate');
    }
    return disabled;
  }, [
    session.discoveredReservoirIds.length,
    session.ownedParcelId,
    session.ownedParcelIds.length,
    session.wells,
  ]);

  // Handlers
  const handleStartRound = (planetId?: string) => {
    setSession((current) => {
      if (current.phase === 'planet') {
        return launchPlanetSession(current);
      }
      return createRoundSession(current.seed + 1, undefined, {
        planetId: planetId ?? current.planetId,
        initialPhase: 'auction',
        campaignRound: current.campaignRound,
        totalCampaignProfit: current.totalCampaignProfit,
      });
    });
  };

  const handleNewGame = () => {
    clearSavedSession();
    setHasSave(false);
    setSession(startNewGame(session.seed + 1, { initialPhase: 'auction' }));
  };

  const handleContinueSaved = () => {
    const saved = loadSession();
    if (saved) {
      setSession(continueGame(saved));
    }
  };

  const handleResetGame = () => {
    clearSavedSession();
    setHasSave(false);
    setSession(resetGame(42, { initialPhase: 'planet' }));
  };

  const handlePurchaseSurvey = (tool: SurveyTool, target?: Point) => {
    const type =
      tool.id === 'surface'
        ? 'surface-scanner'
        : tool.id === 'deep'
          ? 'deep-probe'
          : 'rover-scan';
    setSession((current) => purchaseSurvey(current, type, target));
  };

  const handleSelectPhase = (targetPhase: RoundPhase) => {
    if (disabledPhases.includes(targetPhase)) return;
    if (targetPhase === 'settled') {
      setSession((curr) =>
        curr.settlement ? { ...curr, phase: 'settled' } : completeSession(curr),
      );
      return;
    }
    if (targetPhase === 'drill' && session.drillPath.length === 0) {
      setSession((curr) => ({
        ...curr,
        phase: 'drill',
        drillPath: [{ ...SIMULATION_DEFAULTS.wellHeadStartPoint }],
      }));
      return;
    }
    setSession((curr) => ({ ...curr, phase: targetPhase }));
  };

  const activeSettlement = useMemo(
    () =>
      session.phase === 'settled' || session.phase === 'report'
        ? session.settlement ?? settleSession(session)
        : session.settlement,
    [session],
  );

  const settlementLines = useMemo(() => {
    if (!activeSettlement) return [];
    return [
      {
        label: 'Electricity revenue',
        value: money(activeSettlement.revenue),
        tone: 'positive' as const,
      },
      {
        label: 'Land rights',
        value: `−${money(activeSettlement.costs.land)}`,
        tone: 'negative' as const,
      },
      {
        label: 'Surveys',
        value: `−${money(activeSettlement.costs.survey)}`,
        tone: 'negative' as const,
      },
      {
        label: 'Drilling',
        value: `−${money(activeSettlement.costs.drilling)}`,
        tone: 'negative' as const,
      },
      {
        label: 'Pipes',
        value: `−${money(activeSettlement.costs.pipes)}`,
        tone: 'negative' as const,
      },
      {
        label: 'Upgrades',
        value: `−${money(activeSettlement.costs.upgrades)}`,
        tone: 'negative' as const,
      },
      {
        label: 'Operations',
        value: `−${money(activeSettlement.costs.operating)}`,
        tone: 'negative' as const,
      },
      {
        label: 'Net profit',
        value: money(activeSettlement.profit),
        tone:
          activeSettlement.profit >= 0
            ? ('positive' as const)
            : ('negative' as const),
      },
    ];
  }, [activeSettlement]);

  let workspace: ReactNode;

  if (session.phase === 'planet') {
    workspace = (
      <PlanetSelectScreen
        currentPlanet={session.planet}
        campaignRound={session.campaignRound}
        playerCash={session.cash}
        hasSavedGame={hasSave}
        onStartRound={handleStartRound}
        onNewGame={handleNewGame}
        onContinue={handleContinueSaved}
        onResetGame={handleResetGame}
      />
    );
  } else if (session.phase === 'auction') {
    workspace = (
      <LandAuctionScreen
        parcels={uiParcels}
        rawParcels={session.parcels}
        auctions={session.auctions}
        rivals={(activeAuction.rivals as RivalCompany[] | undefined) ?? undefined}
        budget={availableAuctionCash}
        committedCash={committedAuctionCash}
        selectedParcelId={selectedAuctionId}
        currentBid={activeAuction.currentBid}
        timeRemainingSeconds={activeAuction.timeRemainingSeconds}
        isOpen={activeAuction.status === 'open'}
        auctionEnded={activeAuction.status === 'ended'}
        playerWon={
          session.ownedParcelIds.length > 0 ||
          (activeAuction.status === 'ended' &&
            activeAuction.winnerId === 'player')
        }
        highBidder={activeAuction.highBidder}
        onSelectParcel={(parcel) =>
          setSession((current) => selectParcel(current, parcel.id))
        }
        onBid={(parcel, customAmount) =>
          setSession((current) =>
            submitBid(current, customAmount ?? parcel.nextBid, parcel.id),
          )
        }
        onWithdraw={(parcel) =>
          setSession((current) => withdrawFromAuction(current, parcel.id))
        }
        onProceedToSurvey={() =>
          setSession((current) => proceedToSurvey(current))
        }
      />
    );
  } else if (session.phase === 'survey') {
    const parcelScans = session.surveys.filter(
      (s) => s.parcelId === activeParcel.id,
    );
    workspace = (
      <SurfaceSurveyScreen
        cash={session.cash}
        tools={surveyFixture}
        selectedToolId={selectedSurveyId}
        isAvailable={
          session.phase === 'survey' && session.ownedParcelIds.length > 0
        }
        roverScans={session.roverScans}
        parcel={activeParcel}
        scans={parcelScans}
        surveyResults={session.surveyResults}
        scanCost={SIMULATION_DEFAULTS.roverScanCost}
        scanRadius={SIMULATION_DEFAULTS.roverScanRadius}
        onSelectTool={(tool) => setSelectedSurveyId(tool.id)}
        onPurchase={handlePurchaseSurvey}
        onScanAt={(target) =>
          setSession((current) =>
            performSurfaceScanAt(current, target, activeParcel.id),
          )
        }
        onProceedToDrilling={() =>
          setSession((current) => startDrilling(current))
        }
      />
    );
  } else if (session.phase === 'drill') {
    const parcelWells = session.wells.filter(
      (w) => w.parcelId === activeParcel.id,
    );
    const parcelScans = session.surveys.filter(
      (s) => s.parcelId === activeParcel.id,
    );
    workspace = (
      <TurmoilDrillingScreen
        cash={session.cash}
        initialPath={
          session.drillPath.length > 0
            ? session.drillPath
            : [{ ...SIMULATION_DEFAULTS.wellHeadStartPoint }]
        }
        snapToLayer={session.drillSnapToLayer}
        snapEnabled={session.drillSnapToLayer}
        parcel={activeParcel}
        planet={session.planet}
        wells={parcelWells}
        discoveredReservoirIds={session.discoveredReservoirIds}
        surveyScans={parcelScans}
        roverScans={session.roverScans}
        echoScans={(session.echoScans ?? []).filter(
          (scan) => scan.parcelId === activeParcel.id,
        )}
        drillSpeedLevel={session.drillSpeedLevel ?? 1}
        drillUpgradeLevel={session.upgrades.drill}
        onToggleSnapToLayer={() =>
          setSession((current) => toggleDrillSnapToLayer(current))
        }
        onToggleSnap={() =>
          setSession((current) => toggleDrillSnapToLayer(current))
        }
        onConfirmDrillPath={(points) =>
          setSession((current) =>
            drillWell(current, points, { proceedToOperate: false }),
          )
        }
        onConfirmWell={(well) =>
          setSession((current) =>
            drillWell(current, well.path, {
              wellName: well.name,
              proceedToOperate: false,
            }),
          )
        }
        onDeployEchoScanCar={(scanX) =>
          setSession((current) => deployEchoScanCar(current, scanX))
        }
        onUpgradeDrillSpeed={() =>
          setSession((current) => purchaseDrillSpeedUpgrade(current))
        }
        onDrillingComplete={() =>
          setSession((current) =>
            startOperation({ ...current, phase: 'operate' }),
          )
        }
        onProceedToProduction={() =>
          setSession((current) =>
            startOperation({ ...current, phase: 'operate' }),
          )
        }
      />
    );
  } else if (session.phase === 'operate' || session.phase === 'production') {
    const discoveredReservoirs = activeParcel.reservoirs.filter((r) =>
      session.discoveredReservoirIds.includes(r.id),
    );
    const activeWellFlow =
      session.plant.wellFlow ||
      session.wells
        .filter((w) => w.status === 'active')
        .reduce((sum, w) => sum + w.flowContribution, 0) ||
      6;
    workspace = (
      <ProductionSetupScreen
        cash={session.cash}
        storedTherm={session.storageTherm}
        storageCapacity={session.storageCapacity}
        telemetry={session.plantTelemetry}
        currentPrice={session.currentPrice}
        isPaused={session.isPaused}
        speed={session.speed === 0 ? 1 : session.speed}
        returnLoopActive={session.returnFluidLoopActive}
        plant={session.plant}
        wells={session.wells}
        reservoirs={discoveredReservoirs}
        extractionRate={activeWellFlow}
        onTogglePause={() =>
          setSession((current) => toggleSimulationPause(current))
        }
        onSetSpeed={(nextSpeed) =>
          setSession((current) => setSimulationSpeed(current, nextSpeed))
        }
        onSetExtractionRate={(rate) =>
          setSession((current) => setExtractionRate(current, rate))
        }
        onToggleReturnLoop={() =>
          setSession((current) => toggleReturnFluidLoop(current))
        }
        onTogglePipe={(pipe) => {
          if (pipe === 'return') {
            setSession((current) => toggleReturnFluidLoop(current));
          } else if (pipe === 'export') {
            setSession((current) => toggleExportActive(current));
          }
        }}
        onExportToMarket={() =>
          setSession((current) => sellStoredTherm(current))
        }
        onSettleRound={() =>
          setSession((current) => completeSession(current))
        }
        onDrillAnotherWell={() =>
          setSession((current) => startNewWell(current))
        }
      />
    );
  } else {
    const reportSettlement = activeSettlement ?? settleSession(session);
    const mineralsCount =
      'discoveredMineralsCount' in reportSettlement &&
      typeof reportSettlement.discoveredMineralsCount === 'number'
        ? reportSettlement.discoveredMineralsCount
        : settleSession(session).discoveredMineralsCount;

    workspace = (
      <RoundReportScreen
        campaignRound={session.campaignRound}
        totalProfit={reportSettlement.profit}
        profitPercentage={reportSettlement.profitPercentage}
        depletion={reportSettlement.depletion}
        lines={settlementLines}
        settlement={reportSettlement}
        telemetry={session.plantTelemetry}
        mineralsDiscovered={mineralsCount}
        groundStabilityScore={reportSettlement.depletion.stableGroundRemainingPercent}
        onContinue={() =>
          setSession((current) => advanceToNextRound(current))
        }
        onNewGame={handleNewGame}
        onResetGame={handleResetGame}
      />
    );
  }

  return (
    <main
      className={`tf-app-shell game-shell game-shell--${session.phase}`}
      aria-labelledby="game-title"
    >
      <span id="game-title" className="sr-only">
        Thermal Frontier · {session.planet.name} · Round {session.campaignRound}
      </span>

      <div className="tf-shell-top">
        <ResourceBar
          resources={resources}
          centerSlot={
            <PhaseRail
              phase={session.phase}
              disabledPhases={disabledPhases}
              onSelectPhase={handleSelectPhase}
            />
          }
          actions={
            <>
              {allAuctionsEndedWithoutParcel && (
                <button
                  type="button"
                  className="tf-btn tf-btn--cta"
                  style={{ padding: '4px 10px', fontSize: 11 }}
                  onClick={() => setSession((curr) => retryAuction(curr))}
                >
                  Retry Auction
                </button>
              )}
              {session.phase !== 'planet' && (
                <button
                  type="button"
                  className="tf-btn tf-btn--quiet"
                  style={{ padding: '4px 9px', fontSize: 11 }}
                  onClick={() =>
                    setSession((curr) => ({ ...curr, phase: 'planet' }))
                  }
                  title="Planet Orbit"
                >
                  🪐
                </button>
              )}
              <button
                type="button"
                className="tf-btn tf-btn--quiet"
                style={{ padding: '4px 9px', fontSize: 11 }}
                onClick={handleResetGame}
              >
                Reset
              </button>
            </>
          }
          onOpenLedger={() =>
            setSession((current) => ({
              ...current,
              notice: `Ledger: ${current.ledger.length} entries · Balance ${money(current.cash)}.`,
            }))
          }
        />
        <NextActionCard phase={session.phase} notice={session.notice} />
      </div>

      <div className="tf-app-main">{workspace}</div>

      <span className="sr-only" aria-live="polite">
        {session.notice}
      </span>
    </main>
  );
}

export default App;
