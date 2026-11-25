import { useEffect, useState } from 'react';
import { RIVAL_COMPANIES } from '../simulation/constants';
import type { AuctionState, BidderId, Parcel as SimParcel, RivalCompany } from '../simulation/types';
import type { Parcel as UiParcel } from '../ui/types';

export interface LandAuctionScreenProps {
  parcels: UiParcel[];
  rawParcels?: SimParcel[];
  auctions?: Record<string, AuctionState>;
  rivals?: RivalCompany[];
  budget: number;
  committedCash?: number;
  selectedParcelId?: string;
  currentBid?: number;
  timeRemainingSeconds?: number;
  isOpen?: boolean;
  auctionEnded?: boolean;
  playerWon?: boolean;
  highBidder?: BidderId | null;
  headingMode?: 'screen' | 'board';
  onSelectParcel: (parcel: UiParcel) => void;
  onBid: (parcel: UiParcel, customAmount?: number) => void;
  onPlaceBid?: (parcelId: string, amount: number) => void;
  onWithdraw: (parcel: UiParcel) => void;
  onWithdrawBid?: (parcelId: string) => void;
  onProceedToSurvey?: () => void;
}

function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `00:${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function formatBidderName(
  bidderId: BidderId | string | null | undefined,
  rivals: Array<{ id: string; name: string }>,
): string {
  if (!bidderId || bidderId === 'none' || bidderId === '—') return 'None';
  if (bidderId === 'player' || bidderId === 'You') return 'You';
  const match = rivals.find((r) => r.id === bidderId);
  if (match) return match.name.split(' ')[0];
  if (bidderId === 'rival' || bidderId === 'Rival') return 'Rival AI';
  return String(bidderId);
}

export function LandAuctionScreen({
  parcels,
  rawParcels,
  auctions,
  rivals: propRivals,
  budget,
  committedCash = 0,
  selectedParcelId,
  currentBid: propCurrentBid,
  timeRemainingSeconds: propTimeRemaining,
  isOpen: propIsOpen,
  auctionEnded: propAuctionEnded,
  playerWon: propPlayerWon,
  highBidder: propHighBidder,
  headingMode = 'screen',
  onSelectParcel,
  onBid,
  onPlaceBid,
  onWithdraw,
  onWithdrawBid,
  onProceedToSurvey,
}: LandAuctionScreenProps) {
  const selectedParcel =
    parcels.find((p) => p.id === selectedParcelId) ?? parcels[0] ?? ({} as UiParcel);

  const selectedAuction = auctions?.[selectedParcel.id];
  const currentBid =
    selectedAuction?.currentBid ?? propCurrentBid ?? selectedParcel.currentBid ?? 50;
  const minIncrement = selectedAuction?.minimumIncrement ?? 10;
  const baseNextBid = Math.max(
    selectedAuction?.nextMinimumBid ?? selectedParcel.nextBid ?? currentBid + minIncrement,
    currentBid + minIncrement,
  );
  const timeRemaining =
    selectedAuction?.timeRemainingSeconds ?? propTimeRemaining ?? 30;
  const activeHighBidder =
    selectedAuction?.highBidder !== undefined ? selectedAuction.highBidder : propHighBidder ?? null;
  const isOpen =
    selectedAuction ? selectedAuction.status === 'open' : (propIsOpen ?? true);
  const auctionEnded =
    selectedAuction ? selectedAuction.status !== 'open' : (propAuctionEnded ?? false);
  const playerWon =
    Boolean(propPlayerWon) ||
    Boolean(
      selectedAuction &&
        selectedAuction.status === 'ended' &&
        selectedAuction.winnerId === 'player',
    );
  const extensionCount = selectedAuction?.extensionCount ?? 0;

  const displayRivals =
    (selectedAuction?.rivals as RivalCompany[] | undefined) ??
    propRivals ??
    RIVAL_COMPANIES.map((r) => ({
      ...r,
      budget: r.startingBudget,
      maxBid: r.startingBudget,
      aggressiveness: r.riskTolerance,
    }));

  const [bidBump, setBidBump] = useState<number>(0);
  useEffect(() => {
    setBidBump(0);
  }, [selectedParcel.id, baseNextBid]);

  const userBidAmount = baseNextBid + bidBump;

  const triggerBid = (amount: number) => {
    onBid(selectedParcel, amount);
    onPlaceBid?.(selectedParcel.id, amount);
  };

  const triggerWithdraw = () => {
    onWithdraw(selectedParcel);
    onWithdrawBid?.(selectedParcel.id);
  };

  const heading = playerWon
    ? 'Parcel secured'
    : auctionEnded
      ? 'Auction ended'
      : headingMode === 'board'
        ? 'Live parcel auction'
        : 'Land Auction';

  return (
    <section
      className="tf-screen tf-auction-screen"
      aria-labelledby="auction-heading"
    >
      {/* Top Compact Auction Header */}
      <header className="tf-auction-header">
        <div className="tf-auction-header-left">
          <span className="tf-auction-icon" aria-hidden="true">
            🔨
          </span>
          <div className="tf-auction-title-wrap">
            {headingMode === 'board' ? (
              <h2 id="auction-heading">{heading}</h2>
            ) : (
              <h1 id="auction-heading">{heading}</h1>
            )}
            <span>Bid for the best parcels! Public clues only — hidden heat stays unknown.</span>
          </div>
        </div>

        <div className="tf-auction-header-right">
          {extensionCount > 0 && (
            <span className="tf-snipe-pill" title="Anti-sniping extension triggered">
              +{extensionCount * 5}s Ext
            </span>
          )}
          <div className="tf-pill tf-pill--timer" aria-label="Auction timer">
            <span aria-hidden="true">⏱</span>
            <strong>{formatTimer(timeRemaining)}</strong>
          </div>
          <div className="tf-pill tf-pill--cash" aria-label="Available capital">
            <span aria-hidden="true">⭐</span>
            <strong>${budget.toLocaleString()}</strong>
            {committedCash > 0 && (
              <small title="Committed in active bids">
                ({committedCash} held)
              </small>
            )}
          </div>
        </div>
      </header>

      {/* Main 2-Column Area: 2x3 Isometric Parcel Cards + Right/Bottom Bidding Dock */}
      <div className="tf-auction-main-layout">
        <div
          className="tf-parcels-grid-2x3"
          role="region"
          aria-label="Available land parcels"
        >
          {parcels.slice(0, 6).map((parcel, index) => {
            const parcelAuction = auctions?.[parcel.id];
            const rawParcel = rawParcels?.find((r) => r.id === parcel.id);
            const parcelNumber = index + 1;
            const isSelected = parcel.id === selectedParcel.id;
            const pCurrentBid = parcelAuction?.currentBid ?? parcel.currentBid;
            const pLeader = parcelAuction?.highBidder ?? parcel.bidder;
            const pOpen = parcelAuction ? parcelAuction.status === 'open' : isOpen;
            const pWinner = parcelAuction?.winnerId ?? (pOpen ? null : pLeader);
            const leaderName = formatBidderName(pWinner ?? pLeader, displayRivals);
            const isPlayerLead = (pWinner ?? pLeader) === 'player' || (pWinner ?? pLeader) === 'You';

            // Strictly public clues — never leak hidden reservoir temp/depth/heat
            const surfaceTemp = rawParcel
              ? `${Math.round(rawParcel.publicClues.surfaceTemperature)}°C`
              : parcel.clue;
            const fissures = rawParcel
              ? `${rawParcel.publicClues.visibleFissures} fissures`
              : parcel.terrain.split('·')[0]?.trim() ?? parcel.terrain;
            const marketDist = rawParcel
              ? `${Math.round(rawParcel.publicClues.marketDistance)} km`
              : parcel.marketDistance;

            const artIndex =
              rawParcel?.biome === 'volcanic'
                ? 1
                : rawParcel?.biome === 'ice'
                  ? 2
                  : rawParcel?.biome === 'forest'
                    ? 3
                    : rawParcel?.biome === 'crystal'
                      ? 4
                      : rawParcel?.biome === 'desert'
                        ? 5
                        : rawParcel?.biome === 'basalt'
                          ? 6
                          : parcelNumber;

            return (
              <article
                key={parcel.id}
                className={`tf-isometric-parcel-card is-parcel-${parcelNumber} ${
                  isSelected ? 'is-selected' : ''
                } ${!pOpen && isPlayerLead ? 'is-won' : ''} ${
                  !pOpen ? 'is-closed' : ''
                }`}
                onClick={() => onSelectParcel(parcel)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectParcel(parcel);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-pressed={isSelected}
                aria-label={`Parcel #${parcelNumber}: ${parcel.name}`}
              >
                <div className="tf-parcel-card-top">
                  <span className="tf-parcel-num-badge">#{parcelNumber}</span>
                  <span
                    className={`tf-parcel-status-tag ${
                      !pOpen
                        ? isPlayerLead
                          ? 'is-player'
                          : 'is-ended'
                        : isPlayerLead
                          ? 'is-player'
                          : leaderName !== 'None'
                            ? 'is-rival'
                            : ''
                    }`}
                  >
                    {!pOpen
                      ? isPlayerLead
                        ? 'WON'
                        : 'SOLD'
                      : isPlayerLead
                        ? 'LEADING'
                        : leaderName !== 'None'
                          ? leaderName
                          : 'OPEN'}
                  </span>
                </div>

                {/* Isometric Biome Artwork */}
                <div className="tf-parcel-isometric-art" aria-hidden="true">
                  <svg
                    viewBox="0 0 200 120"
                    className="tf-isometric-svg"
                    preserveAspectRatio="xMidYMid meet"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <polygon points="100,16 184,58 100,100 16,58" className="tf-iso-tile-base" />
                    <polygon points="16,58 100,100 100,112 16,70" className="tf-iso-extrude-left" />
                    <polygon points="100,100 184,58 184,70 100,112" className="tf-iso-extrude-right" />

                    {artIndex === 1 && (
                      <g className="tf-art-volcanic">
                        <polygon points="75,62 100,28 125,62" fill="#9a3412" />
                        <ellipse cx="100" cy="30" rx="10" ry="5" fill="#f97316" />
                        <ellipse cx="100" cy="30" rx="5" ry="2.5" fill="#fef08a" />
                        <path d="M 100 28 Q 92 15 98 7" stroke="#fdba74" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                      </g>
                    )}

                    {artIndex === 2 && (
                      <g className="tf-art-ice">
                        <polygon points="65,62 80,26 95,62" fill="#7dd3fc" />
                        <polygon points="85,62 105,18 125,62" fill="#e0f2fe" />
                        <polygon points="115,62 130,32 145,62" fill="#38bdf8" />
                        <line x1="105" y1="18" x2="105" y2="62" stroke="#ffffff" strokeWidth="1.5" />
                      </g>
                    )}

                    {artIndex === 3 && (
                      <g className="tf-art-forest">
                        <ellipse cx="78" cy="60" rx="28" ry="15" fill="#16a34a" />
                        <ellipse cx="122" cy="60" rx="30" ry="16" fill="#15803d" />
                        <polygon points="72,50 78,34 84,50" fill="#4ade80" />
                        <polygon points="118,48 124,30 130,48" fill="#22c55e" />
                        <polygon points="98,56 103,40 108,56" fill="#34d399" />
                      </g>
                    )}

                    {artIndex === 4 && (
                      <g className="tf-art-crystal">
                        <polygon points="80,66 90,26 100,66" fill="#818cf8" />
                        <polygon points="95,66 110,16 122,66" fill="#a855f7" />
                        <polygon points="115,66 125,34 135,66" fill="#6366f1" />
                        <line x1="110" y1="16" x2="108" y2="66" stroke="#f3e8ff" strokeWidth="1.5" />
                      </g>
                    )}

                    {artIndex === 5 && (
                      <g className="tf-art-desert">
                        <path d="M 42 66 Q 82 46 122 66 Q 158 50 168 66" fill="#f59e0b" opacity="0.65" />
                        <path d="M 84 66 C 84 34, 120 34, 120 66" stroke="#d97706" strokeWidth="8" fill="none" strokeLinecap="round" />
                      </g>
                    )}

                    {artIndex === 6 && (
                      <g className="tf-art-basalt">
                        <rect x="75" y="40" width="14" height="24" fill="#334155" />
                        <rect x="92" y="30" width="16" height="34" fill="#475569" />
                        <rect x="110" y="42" width="14" height="22" fill="#1e293b" />
                        <path d="M 60 66 L 82 60 L 106 67 L 140 60" stroke="#f97316" strokeWidth="3" fill="none" />
                      </g>
                    )}
                  </svg>
                </div>

                {/* Public Clues + Live Bid */}
                <div className="tf-parcel-info">
                  <h3 className="tf-parcel-card-title">{parcel.name}</h3>
                  <div className="tf-parcel-clues">
                    <span>🌋 {fissures}</span>
                    <span>📍 {marketDist}</span>
                    {rawParcel && <span>☀ {surfaceTemp}</span>}
                  </div>
                  <div className="tf-parcel-bid-row">
                    <strong>${pCurrentBid?.toLocaleString()}</strong>
                    <span className="tf-parcel-bid-leader">
                      {leaderName === 'None' ? 'No bids' : `by ${leaderName}`}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* Right / Bottom Bidding Control Dock */}
        <aside className="tf-bidding-panel" aria-label="Bidding controls">
          <div className="tf-bid-panel-header">
            <span className="tf-kicker">
              Parcel #{selectedParcel.id?.split('-').pop() ?? '1'}
            </span>
            <h3 className="tf-bidding-target-title">{selectedParcel.name}</h3>
            <p className="tf-bidding-target-desc">{selectedParcel.terrain}</p>
          </div>

          {/* 3 Rival Companies Indicators */}
          <div className="tf-rivals-strip" aria-label="Rival companies">
            {displayRivals.slice(0, 3).map((rival) => {
              const isLeading = activeHighBidder === rival.id;
              const isDropped =
                selectedAuction?.withdrawnBidders?.includes(rival.id) ?? false;
              const rivalBudget =
                selectedAuction?.rivalBudgets?.[
                  displayRivals.findIndex((r) => r.id === rival.id)
                ] ?? rival.budget;

              return (
                <div
                  key={rival.id}
                  className={`tf-rival-chip ${isLeading ? 'is-leading' : ''} ${
                    isDropped ? 'is-dropped' : ''
                  }`}
                  style={{ '--rival-color': rival.color } as React.CSSProperties}
                  title={`${rival.name} (${rival.personality})`}
                >
                  <div className="tf-rival-chip-top">
                    <span className="tf-rival-emblem" aria-hidden="true">
                      {rival.emblem}
                    </span>
                    <span className="tf-rival-name">
                      {rival.name.split(' ')[0]}
                    </span>
                  </div>
                  <div className="tf-rival-meta">
                    <span>
                      {isLeading ? 'Lead' : isDropped ? 'Out' : 'Ready'}
                    </span>
                    <strong>${Math.round(rivalBudget)}</strong>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Current Bid + Stepped Your Bid */}
          <div className="tf-bid-display-cards">
            <div className="tf-bid-display-box">
              <span className="tf-bid-box-label">Current Bid</span>
              <div className="tf-bid-box-val">
                <span>⭐</span>
                <strong>${currentBid}</strong>
              </div>
              <small className="tf-bid-box-sub">
                Leader: <b>{formatBidderName(activeHighBidder, displayRivals)}</b>
              </small>
            </div>

            <div className="tf-bid-display-box">
              <span className="tf-bid-box-label">Your Bid</span>
              <div className="tf-stepper-control">
                <span className="tf-stepper-number">${userBidAmount}</span>
                <div className="tf-stepper-buttons">
                  <button
                    type="button"
                    className="tf-btn-step"
                    onClick={() => setBidBump((prev) => prev + 25)}
                    aria-label="Increase bid increment"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="tf-btn-step"
                    onClick={() => setBidBump((prev) => Math.max(0, prev - 25))}
                    disabled={bidBump <= 0}
                    aria-label="Decrease bid increment"
                  >
                    ▼
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Increment Chips */}
          <div className="tf-bid-increment-chips">
            {[10, 25, 50, 100].map((inc) => (
              <button
                key={inc}
                type="button"
                className="tf-inc-chip"
                disabled={!isOpen || baseNextBid + inc > budget}
                onClick={() => setBidBump((prev) => prev + inc)}
              >
                +${inc}
              </button>
            ))}
          </div>

          {/* Bid / Withdraw / Proceed Actions */}
          <div className="tf-bid-actions-stack">
            <div className="tf-bid-btn-row">
              <button
                type="button"
                className="tf-btn-place-bid"
                onClick={() => triggerBid(baseNextBid)}
                disabled={!isOpen || baseNextBid > budget}
              >
                Bid ${baseNextBid.toLocaleString()}
              </button>

              <button
                type="button"
                className="tf-btn-quick-bid"
                onClick={() => triggerBid(userBidAmount)}
                disabled={!isOpen || userBidAmount > budget}
              >
                Place Bid (${userBidAmount})
              </button>
            </div>

            {isOpen && (
              <button
                type="button"
                className="tf-btn-withdraw-quiet"
                onClick={triggerWithdraw}
              >
                Withdraw
              </button>
            )}

            {playerWon && onProceedToSurvey && (
              <button
                type="button"
                className="tf-btn-proceed-survey"
                onClick={onProceedToSurvey}
              >
                Proceed to Survey ▶
              </button>
            )}
          </div>

          {/* Winner / Rival Status Feedback */}
          <div
            className={`tf-auction-status-box ${
              playerWon ? 'is-won' : auctionEnded ? 'is-lost' : ''
            }`}
          >
            <span className="tf-status-dot" />
            <span>
              {playerWon
                ? `Winner: You secured ${selectedParcel.name} for $${currentBid}!`
                : auctionEnded
                  ? `The rivals won this parcel (${formatBidderName(activeHighBidder, displayRivals)}). Select another card to bid.`
                  : timeRemaining <= 5
                    ? 'Closing soon! Late bids extend timer by +5s.'
                    : activeHighBidder === 'player'
                      ? 'You hold the high bid! Watch rival counters.'
                      : 'Rival companies are evaluating surface clues.'}
            </span>
          </div>
        </aside>
      </div>

      {/* Slim Bottom Banner */}
      <footer className="tf-bottom-trophy-banner">
        <span>
          🏆 <strong>Highest Bidder Gets the Parcel!</strong>
        </span>
        <span>3 rival syndicates · late bids +5s anti-snipe</span>
      </footer>
    </section>
  );
}
