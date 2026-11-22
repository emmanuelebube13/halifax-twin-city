import { describe, expect, it } from "vitest";
import type { NumberData } from "../api/types";
import { answerIsEmpty, renderAnswer, renderAnswerParts, storyNumberIds } from "./story";

const n = (id: string, value: number | null, unit: string): NumberData => ({ id, label: id, value, unit });

describe("answer sentence", () => {
  const template = "{trn.buses_live} buses are running. {trn.on_time_share} are on time.";
  it("fills each placeholder with its formatted number", () => {
    const numbers = { "trn.buses_live": n("trn.buses_live", 212, "buses"), "trn.on_time_share": n("trn.on_time_share", 81.2, "percent") };
    expect(renderAnswer(template, numbers)).toBe("212 buses are running. 81% are on time.");
  });
  it("marks the numbers so they can be emphasised", () => {
    const parts = renderAnswerParts(template, { "trn.buses_live": n("trn.buses_live", 1240, "buses") });
    expect(parts.filter((p) => p.kind === "number").map((p) => p.text)).toEqual(["1,240", "–"]);
  });
  it("shows a dash for a missing number, never a zero", () => {
    expect(renderAnswer(template, {})).toBe("– buses are running. – are on time.");
  });
  it("knows when the whole answer is empty", () => {
    expect(answerIsEmpty(["trn.buses_live"], { "trn.buses_live": n("trn.buses_live", null, "buses") })).toBe(true);
    expect(answerIsEmpty(["trn.buses_live"], { "trn.buses_live": n("trn.buses_live", 0, "buses") })).toBe(false);
  });
  it("collects the ids a story needs", () => {
    expect(storyNumberIds({ answer: { template, numbers: ["trn.buses_live"] }, context: { number_id: "trn.on_time_share_24h" } }).sort())
      .toEqual(["trn.buses_live", "trn.on_time_share", "trn.on_time_share_24h"]);
  });
});
