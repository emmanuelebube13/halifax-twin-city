// Story rendering: turns a story's answer template and its numbers into a sentence.
// Stories are configuration (config/stories/*.json via /v1/stories/{id}); this file has no story-specific code.

import type { NumberData } from "../api/types";
import { formatByUnit, NO_VALUE } from "./format";

export type AnswerPart = { kind: "text"; text: string } | { kind: "number"; id: string; text: string; missing: boolean };

/** Splits "{trn.buses_live} buses are running." into text and formatted-number parts. */
export function renderAnswerParts(template: string, numbers: Record<string, NumberData | null | undefined>): AnswerPart[] {
  const parts: AnswerPart[] = [];
  const re = /\{([a-z]{3}\.[a-z0-9_]+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template))) {
    if (m.index > last) parts.push({ kind: "text", text: template.slice(last, m.index) });
    const n = numbers[m[1]];
    const text = n ? formatByUnit(n.value, n.unit) : NO_VALUE;
    parts.push({ kind: "number", id: m[1], text, missing: text === NO_VALUE });
    last = m.index + m[0].length;
  }
  if (last < template.length) parts.push({ kind: "text", text: template.slice(last) });
  return parts;
}

export function renderAnswer(template: string, numbers: Record<string, NumberData | null | undefined>): string {
  return renderAnswerParts(template, numbers)
    .map((p) => p.text)
    .join("");
}

/** True when every number the answer needs is missing or null, so the story shows its empty text instead. */
export function answerIsEmpty(ids: string[], numbers: Record<string, NumberData | null | undefined>): boolean {
  if (ids.length === 0) return false;
  return ids.every((id) => {
    const n = numbers[id];
    return !n || n.value === null || n.value === undefined;
  });
}

/** Ids of every number a story uses: the answer's plus the context series. */
export function storyNumberIds(story: { answer: { numbers: string[]; template: string }; context?: { number_id: string } }): string[] {
  const ids = new Set(story.answer.numbers);
  for (const m of story.answer.template.matchAll(/\{([a-z]{3}\.[a-z0-9_]+)\}/g)) ids.add(m[1]);
  if (story.context?.number_id) ids.add(story.context.number_id);
  return [...ids];
}

/** Words for a story status: known ones from the language file, others turned from snake_case into a phrase. */
export function storyStatusLabel(status: string, known: (key: string) => string | null): string {
  const k = known(`story.status.${status}`);
  if (k) return k;
  const words = status.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : status;
}

/** The as-of time shown for a story, in the panel and the map footer alike: its main layer's, else its numbers'. */
export function storyAsOf(primaryLayerAsOf: string | null, numbersAsOf: string | null): string | null {
  return primaryLayerAsOf ?? numbersAsOf ?? null;
}

/** On a phone, following a bus lowers the sheet to its smallest height so the bus stays in view. */
export function sheetOnFollow<T extends string>(current: T, following: boolean): T | "peek" {
  return following ? "peek" : current;
}

/** The template to fill: template_one when the first number in answer.numbers is exactly 1, else template. */
export function chooseTemplate(
  answer: { template: string; template_one?: string | null; numbers: string[] },
  numbers: Record<string, NumberData | null | undefined>,
): string {
  const first = answer.numbers[0];
  if (answer.template_one && first && numbers[first]?.value === 1) return answer.template_one;
  return answer.template;
}
