import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW, parseView, serializeView } from "./url";

describe("view in the URL", () => {
  it("round-trips story, lens, selection and panel", () => {
    const v = { ...DEFAULT_VIEW, story: "TRN-Q01", lens: "analytics" as const, sel: { kind: "asset" as const, id: 812 }, panel: "list" as const, route: "1" };
    expect(parseView(serializeView(v))).toEqual(v);
  });
  it("leaves defaults out", () => {
    expect(serializeView(DEFAULT_VIEW)).toBe("");
  });
  it("ignores values it does not know", () => {
    expect(parseView("?story=DROP%20TABLE&lens=fly&sel=bus:x&panel=admin")).toEqual(DEFAULT_VIEW);
  });
});
