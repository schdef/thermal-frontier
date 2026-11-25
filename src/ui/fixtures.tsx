import type {
  EquipmentItem,
  MarketPoint,
  Parcel,
  PipeRoute,
  Reservoir,
  ResourceValue,
  SettlementLine,
  SurveyTool,
  Well,
} from "./types";

const Icon = ({ children }: { children: string }) => (
  <span aria-hidden="true" className="tf-icon">
    {children}
  </span>
);

export const resourceFixture: ResourceValue[] = [
  { label: "Balance", value: "$18,420", detail: "+$1,240 this round", tone: "signal", icon: <Icon>◈</Icon> },
  { label: "Therm", value: "2,480 TH", detail: "1,800 in storage", tone: "ember", icon: <Icon>ϟ</Icon> },
  { label: "Reputation", value: "74", detail: "Trusted operator", tone: "ice", icon: <Icon>✦</Icon> },
  { label: "Round", value: "04 / 08", detail: "Caldera-7 · Basin 03", tone: "neutral", icon: <Icon>◷</Icon> },
];

export const parcelFixture: Parcel[] = [
  {
    id: "basin-03",
    name: "Morrow Basin 03",
    region: "Caldera-7 · Morrow Basin",
    terrain: "Ash shelf / vent line",
    clue: "Warm fissures · low basalt cover",
    temperature: "186°C",
    depth: "620 m",
    potential: "High",
    marketDistance: "1.4 km",
    currentBid: 7420,
    nextBid: 7620,
    bidder: "You",
    timeLeft: "00:18",
    trend: "rising",
    featured: true,
  },
  {
    id: "basin-07",
    name: "Morrow Basin 07",
    region: "Caldera-7 · Morrow Basin",
    terrain: "Dry ridge / crystal seam",
    clue: "Strong surface anomaly",
    temperature: "162°C",
    depth: "480 m",
    potential: "Medium",
    marketDistance: "0.8 km",
    currentBid: 5160,
    nextBid: 5360,
    bidder: "Northstar",
    timeLeft: "00:18",
    trend: "watched",
  },
  {
    id: "basin-02",
    name: "Morrow Basin 02",
    region: "Caldera-7 · Morrow Basin",
    terrain: "Flat plain / shallow cover",
    clue: "Cool surface · clean access",
    temperature: "138°C",
    depth: "350 m",
    potential: "Medium",
    marketDistance: "0.5 km",
    currentBid: 2980,
    nextBid: 3180,
    bidder: "—",
    timeLeft: "00:18",
    trend: "steady",
  },
];

export const surveyFixture: SurveyTool[] = [
  { id: "surface", name: "Surface scanner", description: "Maps broad heat anomalies and visible fissures.", cost: "$280", reveal: "Broad anomaly", icon: <Icon>⌁</Icon>, active: true },
  { id: "thermal", name: "Thermal probe", description: "Reads a localized temperature gradient at depth.", cost: "$640", reveal: "Temperature band", icon: <Icon>⊙</Icon> },
  { id: "seismic", name: "Seismic pulse", description: "Reveals layer boundaries, cavities and fractures.", cost: "$1,200", reveal: "Structure map", icon: <Icon>∿</Icon> },
];

export const reservoirFixture: Reservoir[] = [
  { id: "r-01", x: 28, y: 72, rx: 11, ry: 8, temperature: 178, label: "Morrow pocket", status: "active" },
  { id: "r-02", x: 60, y: 53, rx: 14, ry: 10, temperature: 214, label: "Deep aquifer", status: "known" },
  { id: "r-03", x: 82, y: 81, rx: 9, ry: 6, temperature: 194, label: "Suspected seam", status: "suspected" },
];

export const wellFixture: Well[] = [
  { id: "well-01", label: "W-01", x: 22, y: 21, depth: "640 m", output: "680 TH/h", status: "producing" },
  { id: "well-02", label: "W-02", x: 46, y: 25, depth: "510 m", output: "—", status: "drilling" },
];

export const pipeFixture: PipeRoute[] = [
  { id: "pipe-hot", points: "22,21 27,33 34,43 48,55 65,62 75,62", kind: "hot", status: "flowing" },
  { id: "pipe-return", points: "75,69 65,69 49,61 34,49 27,40", kind: "return", status: "flowing" },
  { id: "pipe-export", points: "75,62 85,56 94,56", kind: "export", status: "flowing" },
];

export const equipmentFixture: EquipmentItem[] = [
  { id: "drill-speed", name: "Drill speed", category: "Drilling", level: 0, description: "Cuts the cost of reaching a deep thermal interval.", nextUpgrade: "+15% route efficiency", cost: "$120", status: "available", icon: <Icon>⌖</Icon> },
  { id: "pipe-capacity", name: "Pipe capacity", category: "Network", level: 0, description: "Insulates the hot-fluid route and reduces heat loss.", nextUpgrade: "−8% heat loss", cost: "$160", status: "available", icon: <Icon>╱</Icon> },
  { id: "exchanger-efficiency", name: "Exchanger efficiency", category: "Processing", level: 0, description: "Converts more of the delivered heat into saleable TH.", nextUpgrade: "+10% TH output", cost: "$140", status: "available", icon: <Icon>ϟ</Icon> },
  { id: "automated", name: "Automated rig", category: "Automation", level: 0, description: "Repeats a planned drilling operation without manual steering.", nextUpgrade: "Unlock at level 4", cost: "LOCKED", status: "locked", icon: <Icon>◇</Icon> },
];

export const marketFixture: MarketPoint[] = [
  { x: 0, y: 64 }, { x: 10, y: 61 }, { x: 20, y: 67 }, { x: 30, y: 55 }, { x: 40, y: 58 }, { x: 50, y: 43 }, { x: 60, y: 46 }, { x: 70, y: 29 }, { x: 80, y: 35 }, { x: 90, y: 19 }, { x: 100, y: 22 },
];

export const settlementFixture: SettlementLine[] = [
  { label: "Therm sold", value: "2,480 TH", tone: "muted" },
  { label: "Gross revenue", value: "$12,984", tone: "positive" },
  { label: "Land + surveys", value: "−$8,140", tone: "negative" },
  { label: "Operations", value: "−$2,180", tone: "negative" },
  { label: "Round profit", value: "+$2,664", tone: "positive" },
];
