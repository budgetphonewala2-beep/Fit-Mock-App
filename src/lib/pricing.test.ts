import { describe, expect, it } from "vitest";
import { priceFor, trialDaysFor, yearlySavingsPct } from "@/lib/pricing";

describe("pricing", () => {
  it("quotes the yearly per-month rate", () => {
    expect(priceFor("pro", "yearly")).toEqual({ total: 5499, perMonth: 458 });
    expect(priceFor("elite", "yearly")).toEqual({ total: 24999, perMonth: 2083 });
  });

  it("computes the yearly saving against four quarters", () => {
    expect(yearlySavingsPct("pro")).toBe(20);
    expect(yearlySavingsPct("elite")).toBe(17);
  });

  it("makes yearly cheaper than four quarters on every plan", () => {
    expect(yearlySavingsPct("starter")).toBe(17);
  });

  it("offers trials on yearly plans only", () => {
    expect(trialDaysFor("starter", "yearly")).toBe(7);
    expect(trialDaysFor("elite", "yearly")).toBe(7);
    expect(trialDaysFor("pro", "quarterly")).toBe(0);
  });
});
