import type { SettlementLine } from "../ui/types";

export interface SettlementSummaryProps { lines: SettlementLine[]; onContinue: () => void; }

export function SettlementSummary({ lines, onContinue }: SettlementSummaryProps) {
  return <section className="tf-settlement" aria-labelledby="settlement-heading"><div className="tf-settlement-orbit" aria-hidden="true"><span>✦</span></div><span className="tf-kicker">Round complete</span><h2 id="settlement-heading">A healthy first cut</h2><p>Caldera-7 is responding well. Your network stayed below the pressure limit and found a clean export window.</p><div className="tf-settlement-lines">{lines.map((line) => <div className={`tf-settlement-line tf-settlement-${line.tone ?? "muted"}`} key={line.label}><span>{line.label}</span><strong>{line.value}</strong></div>)}</div><button className="tf-button tf-button-primary tf-full-button" type="button" onClick={onContinue}>Continue to next parcel <span>→</span></button></section>;
}
