import { useState } from "react";
import { AuctionBoard } from "../components/AuctionBoard";
import { EquipmentPanel } from "../components/EquipmentPanel";
import { MarketStoragePanel } from "../components/MarketStoragePanel";
import { OperatingControls } from "../components/OperatingControls";
import { ResourceBar } from "../components/ResourceBar";
import { SettlementSummary } from "../components/SettlementSummary";
import { SurveyPanel } from "../components/SurveyPanel";
import { UndergroundMap } from "../components/UndergroundMap";
import { equipmentFixture, marketFixture, parcelFixture, pipeFixture, reservoirFixture, resourceFixture, settlementFixture, surveyFixture, wellFixture } from "./fixtures";
import type { MapPoint, Parcel } from "./types";

export interface GameUiShellProps { onLedger?: () => void; }

export function GameUiShell({ onLedger }: GameUiShellProps) {
  const [selectedParcelId, setSelectedParcelId] = useState(parcelFixture[0].id);
  const [selectedSurveyId, setSelectedSurveyId] = useState(surveyFixture[0].id);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState(equipmentFixture[0].id);
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 3>(1);
  const [pathPoints, setPathPoints] = useState<MapPoint[]>([{ x: 46, y: 25 }, { x: 49, y: 38 }, { x: 56, y: 48 }, { x: 60, y: 53 }]);
  const selectedParcel = parcelFixture.find((parcel) => parcel.id === selectedParcelId) ?? parcelFixture[0];

  const announce = (message: string) => { if (typeof window !== "undefined") window.setTimeout(() => window.dispatchEvent(new CustomEvent("thermal-frontier:notice", { detail: message })), 0); };
  const addWaypoint = (point: MapPoint) => setPathPoints((current) => [...current, point]);

  return <div className="tf-app-shell"><ResourceBar resources={resourceFixture} onOpenLedger={onLedger} /><div className="tf-shell-content"><div className="tf-context-strip"><div><span className="tf-breadcrumb">OPERATIONS / CALDERA-7 / MORROW BASIN</span><h1>Build where the planet breathes.</h1></div><OperatingControls isPaused={isPaused} speed={speed} onTogglePause={() => setIsPaused((value) => !value)} onSetSpeed={setSpeed} /></div><main className="tf-dashboard"><div className="tf-dashboard-main"><AuctionBoard parcels={parcelFixture} budget={18420} selectedParcelId={selectedParcelId} onSelectParcel={(parcel: Parcel) => setSelectedParcelId(parcel.id)} onBid={(parcel) => announce(`Bid placed on ${parcel.name}`)} onWithdraw={(parcel) => announce(`Withdrawn from ${parcel.name}`)} /><UndergroundMap reservoirs={reservoirFixture} wells={wellFixture} pipes={pipeFixture} drillingPath={{ points: pathPoints, suggestedPoints: [{ x: 46, y: 25 }, { x: 52, y: 32 }, { x: 57, y: 40 }, { x: 60, y: 53 }], onAddWaypoint: addWaypoint, onConfirm: () => announce("Drilling path confirmed"), onCancel: () => setPathPoints([]) }} onMapClick={addWaypoint} /></div><aside className="tf-dashboard-side"><SurveyPanel tools={surveyFixture} selectedToolId={selectedSurveyId} onSelectTool={(tool) => setSelectedSurveyId(tool.id)} onPurchase={(tool) => announce(`${tool.name} purchased`)} /><MarketStoragePanel points={marketFixture} storedTherm={1800} storageCapacity={3000} currentPrice="$5.24" trend="PRICE RISING" onSell={() => announce("Stored TH sent to market")} onSetThreshold={() => announce("Sell threshold ready to set")} /><EquipmentPanel equipment={equipmentFixture} selectedEquipmentId={selectedEquipmentId} onSelect={(item) => setSelectedEquipmentId(item.id)} onUpgrade={(item) => announce(`${item.name} upgraded`)} /><SettlementSummary lines={settlementFixture} onContinue={() => announce("Moving to next parcel")} /></aside></main><footer className="tf-footer"><span><i className="tf-status-dot" /> All systems nominal</span><span>Last save · just now</span><span>Help & controls <b>?</b></span></footer></div></div>;
}

export * from "./fixtures";
export * from "./types";
