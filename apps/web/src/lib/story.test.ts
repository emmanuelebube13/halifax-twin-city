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

import { storyStatusLabel } from "./story";
describe("story status words", () => {
  const known = (k: string) => (k === "story.status.collecting_data" ? "Collecting data" : null);
  it("uses the language file for known statuses", () => {
    expect(storyStatusLabel("collecting_data", known)).toBe("Collecting data");
  });
  it("turns unknown statuses into a sentence-case phrase", () => {
    expect(storyStatusLabel("source_lacks_dates", known)).toBe("Source lacks dates");
  });
});

import { chooseTemplate } from "./story";
describe("singular template", () => {
  const answer = { template: "{pwk.closures_active} street closures are in effect now.", template_one: "{pwk.closures_active} street closure is in effect now.", numbers: ["pwk.closures_active"] };
  const one = { "pwk.closures_active": n("pwk.closures_active", 1, "closures") };
  const two = { "pwk.closures_active": n("pwk.closures_active", 2, "closures") };
  it("uses template_one when the first number is exactly 1", () => {
    expect(renderAnswer(chooseTemplate(answer, one), one)).toBe("1 street closure is in effect now.");
    expect(renderAnswer(chooseTemplate(answer, two), two)).toBe("2 street closures are in effect now.");
    expect(chooseTemplate({ ...answer, template_one: null }, one)).toBe(answer.template);
  });
  it("never doubles a unit: days come as a bare number because the template says days", () => {
    const t = "{pwk.closures_active} street closures are in effect now, planned to last {pwk.closure_median_days} days at the median.";
    const nums = { ...two, "pwk.closure_median_days": n("pwk.closure_median_days", 108, "days") };
    expect(renderAnswer(t, nums)).toBe("2 street closures are in effect now, planned to last 108 days at the median.");
  });
});
