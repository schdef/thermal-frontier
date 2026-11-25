import type { ReactNode } from "react";

export type ThermalTone = "ember" | "ice" | "neutral" | "signal";

export interface ResourceValue {
  label: string;
  value: string;
  detail?: string;
  tone: ThermalTone;
  icon: ReactNode;
}

export interface Parcel {
  id: string;
  name: string;
  region: string;
  terrain: string;
  clue: string;
  temperature: string;
  depth: string;
  potential: string;
  marketDistance: string;
  currentBid: number;
  nextBid: number;
  bidder: string;
  timeLeft: string;
  trend: "rising" | "steady" | "watched";
  featured?: boolean;
}

export interface SurveyTool {
  id: string;
  name: string;
  description: string;
  cost: string;
  reveal: string;
  active?: boolean;
  icon: ReactNode;
}

export interface MapPoint {
  x: number;
  y: number;
}

export interface Reservoir {
  id: string;
  x: number;
  y: number;
  rx: number;
  ry: number;
  temperature: number;
  label: string;
  status: "known" | "suspected" | "active";
}

export interface Well {
  id: string;
  label: string;
  x: number;
  y: number;
  depth: string;
  output: string;
  status: "producing" | "drilling" | "idle";
}

export interface PipeRoute {
  id: string;
  points: string;
  kind: "hot" | "return" | "export";
  status: "flowing" | "ready" | "blocked";
}

export interface EquipmentItem {
  id: string;
  name: string;
  category: string;
  level: number;
  description: string;
  nextUpgrade: string;
  cost: string;
  status: "installed" | "available" | "locked";
  icon: ReactNode;
}

export interface MarketPoint {
  x: number;
  y: number;
}

export interface SettlementLine {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "muted";
}
