import { describe, it, expect } from "vitest";
import { parseJsonl } from "./parse";
import { fieldUnion, foldByEntity, foldEntity, foldSchema } from "./fold";

const ORDER = [
  // 4-event lifecycle for a deal: create → qualify → proposal_sent → won
  `{"id":"deal_1","at":"2026-04-01","by":"alice","op":"create","customer":"acme","amount":48000}`,
  `{"id":"deal_1","at":"2026-04-15","by":"alice","op":"qualify","note":"budget confirmed"}`,
  `{"id":"deal_1","at":"2026-05-01","by":"alice","op":"proposal_sent","amount":52000}`,
  `{"id":"deal_1","at":"2026-05-20","by":"customer","op":"won","actual_amount":52000}`,
  // A second entity, single create
  `{"id":"deal_2","at":"2026-04-10","by":"bob","op":"create","customer":"contoso","amount":12000}`,
  // A third entity that gets soft-deleted
  `{"id":"deal_3","at":"2026-04-12","by":"bob","op":"create","customer":"initech","amount":8000}`,
  `{"id":"deal_3","at":"2026-04-13","by":"bob","op":"delete","reason":"duplicate"}`,
].join("\n");

describe("foldByEntity", () => {
  it("folds an entity through its lifecycle, latest fields winning", () => {
    const { lines } = parseJsonl(ORDER);
    const folded = foldByEntity(lines);
    const deal1 = folded.find((e) => e.id === "deal_1");
    expect(deal1).toBeDefined();
    expect(deal1?.state).toMatchObject({
      customer: "acme",
      // Latest amount (from `proposal_sent`) wins; `won` carries
      // actual_amount but does not overwrite `amount`.
      amount: 52000,
      actual_amount: 52000,
      note: "budget confirmed",
    });
    expect(deal1?.history).toHaveLength(4);
    expect(deal1?.latest.op).toBe("won");
    expect(deal1?.status).toBe("active"); // create → ... → won (no delete)
  });

  it("marks soft-deleted entities as deleted", () => {
    const { lines } = parseJsonl(ORDER);
    const folded = foldByEntity(lines);
    const deal3 = folded.find((e) => e.id === "deal_3");
    expect(deal3?.status).toBe("deleted");
  });

  it("returns entities in order of first appearance", () => {
    const { lines } = parseJsonl(ORDER);
    const folded = foldByEntity(lines);
    expect(folded.map((e) => e.id)).toEqual(["deal_1", "deal_2", "deal_3"]);
  });

  it("supports as-of (point-in-time) folding", () => {
    const { lines } = parseJsonl(ORDER);
    const folded = foldByEntity(lines, "2026-04-15");
    const deal1 = folded.find((e) => e.id === "deal_1");
    expect(deal1?.history).toHaveLength(2); // only create + qualify
    expect(deal1?.state.amount).toBe(48000); // pre-proposal
    expect(deal1?.latest.op).toBe("qualify");
  });

  it("excludes entities entirely if all their lines are after asOf", () => {
    const { lines } = parseJsonl(ORDER);
    // All deal_1 events on or after 2026-04-01; pick a date before any.
    const folded = foldByEntity(lines, "2026-03-01");
    expect(folded).toEqual([]);
  });

  it("treats restore as re-activating a deleted entity", () => {
    const lifecycle = [
      `{"id":"x","at":"1","op":"create"}`,
      `{"id":"x","at":"2","op":"delete"}`,
      `{"id":"x","at":"3","op":"restore"}`,
    ].join("\n");
    const { lines } = parseJsonl(lifecycle);
    const folded = foldByEntity(lines);
    expect(folded[0]?.status).toBe("active");
  });

  it("leaves status unchanged for unknown ops (custom business verbs)", () => {
    const lifecycle = [
      `{"id":"x","at":"1","op":"create"}`,
      `{"id":"x","at":"2","op":"ship"}`,
      `{"id":"x","at":"3","op":"refund_request"}`,
    ].join("\n");
    const { lines } = parseJsonl(lifecycle);
    const folded = foldByEntity(lines);
    expect(folded[0]?.status).toBe("active"); // create set it; custom verbs don't change it
  });
});

describe("foldEntity (single)", () => {
  it("returns the folded state for a specific id", () => {
    const { lines } = parseJsonl(ORDER);
    const e = foldEntity(lines, "deal_1");
    expect(e?.id).toBe("deal_1");
    expect(e?.state.customer).toBe("acme");
  });

  it("returns null when the id is not present", () => {
    const { lines } = parseJsonl(ORDER);
    expect(foldEntity(lines, "nonexistent")).toBeNull();
  });
});

describe("foldSchema", () => {
  it("returns null when no schema events exist", () => {
    expect(foldSchema([])).toBeNull();
  });

  it("returns the single schema's payload when there's only one", () => {
    const { schemas } = parseJsonl(
      `{"op":"schema","at":"2026-05-07T09:00:00Z","schema":{"fields":{"name":{"type":"text"}}}}`,
    );
    const folded = foldSchema(schemas);
    expect(folded).toEqual({ fields: { name: { type: "text" } } });
  });

  it("deep-merges multiple schema events; later wins on scalar conflicts", () => {
    const content = [
      `{"op":"schema","at":"2026-05-07T09:00:00Z","schema":{"title":"v1","fields":{"name":{"type":"text"}}}}`,
      `{"op":"schema","at":"2026-05-07T10:00:00Z","schema":{"title":"v2","fields":{"role":{"type":"text"}}}}`,
    ].join("\n");
    const { schemas } = parseJsonl(content);
    const folded = foldSchema(schemas);
    expect(folded).toEqual({
      title: "v2",
      fields: {
        name: { type: "text" }, // preserved
        role: { type: "text" }, // added
      },
    });
  });

  it("orders schemas by `at`, not file order", () => {
    const content = [
      `{"op":"schema","at":"2026-05-07T11:00:00Z","schema":{"title":"later"}}`,
      `{"op":"schema","at":"2026-05-07T09:00:00Z","schema":{"title":"earlier"}}`,
    ].join("\n");
    const { schemas } = parseJsonl(content);
    const folded = foldSchema(schemas);
    expect(folded).toEqual({ title: "later" });
  });

  it("replaces arrays wholesale rather than concatenating", () => {
    const content = [
      `{"op":"schema","at":"1","schema":{"list_view":{"filters":["stage","company"]}}}`,
      `{"op":"schema","at":"2","schema":{"list_view":{"filters":["stage"]}}}`,
    ].join("\n");
    const { schemas } = parseJsonl(content);
    const folded = foldSchema(schemas);
    expect((folded as Record<string, Record<string, unknown>>).list_view.filters).toEqual([
      "stage",
    ]);
  });

  it("falls back to line order when `at` is missing", () => {
    const content = [
      `{"op":"schema","schema":{"title":"first"}}`,
      `{"op":"schema","schema":{"title":"second"}}`,
    ].join("\n");
    const { schemas } = parseJsonl(content);
    const folded = foldSchema(schemas);
    expect(folded).toEqual({ title: "second" });
  });
});

describe("fieldUnion", () => {
  it("ranks columns by frequency, ties broken by first appearance", () => {
    const content = [
      // amount appears 3x, customer 2x, note 1x, reason 1x
      `{"id":"a","customer":"acme","amount":100}`,
      `{"id":"b","customer":"contoso","amount":200,"note":"ok"}`,
      `{"id":"c","amount":300,"reason":"x"}`,
    ].join("\n");
    const { lines } = parseJsonl(content);
    const cols = fieldUnion(lines);
    expect(cols[0]).toBe("amount");
    expect(cols[1]).toBe("customer");
    // `note` appeared on line 2, `reason` on line 3 — same frequency, first wins
    expect(cols[2]).toBe("note");
    expect(cols[3]).toBe("reason");
  });

  it("excludes the four conventions (id/at/by/op)", () => {
    const content = `{"id":"a","at":"1","by":"alice","op":"create","x":1}`;
    const { lines } = parseJsonl(content);
    expect(fieldUnion(lines)).toEqual(["x"]);
  });

  it("returns an empty array for empty input", () => {
    expect(fieldUnion([])).toEqual([]);
  });
});
