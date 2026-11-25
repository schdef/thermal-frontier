import type { RoundPhase } from '../game/session';

export interface NextActionCardProps {
  phase: RoundPhase;
  notice: string;
}

const actionCopy: Record<RoundPhase, { eyebrow: string; title: string; body: string; cue: string }> = {
  planet: {
    eyebrow: 'Orbital insertion',
    title: 'Review planetary stats and launch descent.',
    body: 'Zephyr-7 features hyperactive magmatic plumes, subterranean aquifers, and extreme thermal gradients.',
    cue: 'Launch descent to initiate the land auction',
  },
  auction: {
    eyebrow: 'Your first decision',
    title: 'Choose land before you build anything.',
    body: 'Select a parcel, then raise your bid only while the geology still looks worth the risk. Rivals can outbid you.',
    cue: 'Start with a parcel card below',
  },
  survey: {
    eyebrow: 'Parcel secured',
    title: 'Buy one useful clue.',
    body: 'A surface scan is cheap and broad. A deep probe costs more, but narrows the temperature and pressure range.',
    cue: 'Choose a survey on the right',
  },
  drill: {
    eyebrow: 'You own the route',
    title: 'Draw a path into the unknown.',
    body: 'Tap the map to add waypoints. The pale route is assistance, not an order. Confirm only when the cost feels right.',
    cue: 'Tap the map to place a waypoint',
  },
  operate: {
    eyebrow: 'The loop is running',
    title: 'Watch heat, storage, and price.',
    body: 'Your reservoir is finite. Sell when the price is good, and pause or upgrade before your storage overflows.',
    cue: 'Press play or sell stored TH',
  },
  production: {
    eyebrow: 'The loop is running',
    title: 'Watch heat, storage, and price.',
    body: 'Your reservoir is finite. Sell when the price is good, and pause or upgrade before your storage overflows.',
    cue: 'Press play or sell stored TH',
  },
  settled: {
    eyebrow: 'Round complete',
    title: 'Learn what made or lost money.',
    body: 'The ledger separates land, surveys, drilling, pipes, upgrades, operations, and revenue so the next decision gets easier.',
    cue: 'Open the settlement report',
  },
  report: {
    eyebrow: 'Round complete',
    title: 'Learn what made or lost money.',
    body: 'The ledger separates land, surveys, drilling, pipes, upgrades, operations, and revenue so the next decision gets easier.',
    cue: 'Open the settlement report',
  },
};

export function NextActionCard({ phase, notice }: NextActionCardProps) {
  const copy = actionCopy[phase];
  return (
    <section
      className="tf-next-action"
      aria-labelledby="next-action-title"
      title={copy.body}
    >
      <div className="tf-next-action__marker" aria-hidden="true">
        <span>→</span>
      </div>
      <div className="tf-next-action__copy">
        <span className="tf-kicker">{copy.eyebrow}</span>
        <h2 id="next-action-title">{copy.title}</h2>
        <p>{copy.body}</p>
        <strong className="tf-next-action__cue">{copy.cue}</strong>
        <small className="tf-next-action__notice">{notice}</small>
      </div>
    </section>
  );
}
