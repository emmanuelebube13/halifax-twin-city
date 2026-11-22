import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { NumberData, Story } from "../api/types";
import { AnswerPlate, LegendTiles, seriesLabeller, type LayerView } from "./story";

const base: Story = {
  id: "TRN-Q01",
  question: "Where is every bus right now, and is it on time?",
  sector_id: "S04",
  subsector_id: "TRN-01",
  lenses: ["live"],
  status: "live",
  answer: { template: "{trn.buses_live} buses are on the road.", numbers: ["trn.buses_live"], empty_text: "No buses have reported in the last 3 minutes." },
  evidence: { layers: [] },
  context: { number_id: "trn.on_time_share_24h", title: "On time by hour" },
  trust: { source_ids: ["SRC-001"] },
};
const num = (value: number | null): Record<string, NumberData> => ({ "trn.buses_live": { id: "trn.buses_live", label: "Buses", value, unit: "buses" } });

describe("answer plate", () => {
  it("renders the sentence with the number emphasised", () => {
    const html = renderToStaticMarkup(<AnswerPlate story={base} numbers={num(1240)} loading={false} />);
    expect(html).toContain('<strong class="answer-num"');
    expect(html).toContain(">1,240</strong><span> buses are on the road.</span>");
  });
  it("shows the story's empty text, not a zero, when there is no data", () => {
    const html = renderToStaticMarkup(<AnswerPlate story={base} numbers={num(null)} loading={false} />);
    expect(html).toContain("No buses have reported");
    expect(html).not.toContain("answer-num");
  });
  it("shows the status and its note, never a number, when the story is not live", () => {
    const story = { ...base, status: "collecting_data", status_note: "Needs one whole service day of arrivals." };
    const html = renderToStaticMarkup(<AnswerPlate story={story} numbers={num(118)} loading={false} />);
    expect(html).toContain("Collecting data");
    expect(html).toContain("Needs one whole service day of arrivals.");
    expect(html).not.toContain("118");
  });
});

describe("legend tiles", () => {
  it("count the features on the map by legend value, with the shape beside each word", () => {
    const layer: LayerView = {
      name: "vehicles", path: "live", title: "Buses", property: "status",
      legend: [{ value: "on_time", label: "On time" }, { value: "late", label: "Late" }, { value: "early", label: "Early" }, { value: "unknown", label: "No arrival yet" }],
      features: [{ properties: { status: "late" } }, { properties: { status: "late" } }, { properties: { status: "on_time" } }, { properties: { status: "unknown" } }],
      asOf: null, freshness: "fresh", lastOk: null, loading: false, sourceIds: [], tier: null,
    };
    const html = renderToStaticMarkup(<LegendTiles layer={layer} />);
    expect(html).toMatch(/Late<\/span><span class="tile-value mono">2</);
    expect(html).toMatch(/On time<\/span><span class="tile-value mono">1</);
    expect(html).toContain("status-late");
    expect(html).toContain("1 no arrival yet");
  });
});

describe("chart labels", () => {
  it("show the clock within a day, dates across days, years and names as given", () => {
    expect(seriesLabeller(["2026-11-21T23:00:00Z", "2026-11-22T00:00:00Z"])("2026-11-21T23:00:00Z")).toBe("19:00");
    expect(seriesLabeller(["2026-11-02T04:00:00Z", "2026-11-16T04:00:00Z"])("2026-11-16T04:00:00Z")).toBe("16 Nov");
    expect(seriesLabeller(["2025", "2026"])("2026")).toBe("2026");
    expect(seriesLabeller(["1", "7A"])("7A")).toBe("7A");
  });
});
