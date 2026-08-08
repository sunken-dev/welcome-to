import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { loadSheet } from "../harness.js";

/**
 * The deck is the one table the README calls the check on everything else: 81
 * cards, read off a physical deck card by card, whose number distribution has
 * to reproduce the 2018 rulebook exactly (p7).
 */

let sheet;

beforeAll(async () => {
  sheet = await loadSheet();
});

afterAll(() => sheet.close());

describe("deck composition", () => {
  it("holds 81 construction cards", () => {
    expect(sheet.eval("deckTotal()")).toBe(81);
  });

  it("splits into the printed effect counts", () => {
    const deck = sheet.json("CFG.deck");
    const counts = Object.fromEntries(
      Object.entries(deck).map(([effect, numbers]) => [effect, numbers.length]),
    );

    expect(counts).toEqual({
      surveyor: 18,
      landscaper: 18,
      agent: 18,
      pool: 9,
      temp: 9,
      bis: 9,
    });
  });

  it("reproduces the rulebook's number distribution exactly", () => {
    // p7: 3x 1,2,14,15 - 4x 3,13 - 5x 4,12 - 6x 5,11 - 7x 6,10 - 8x 7,9 - 9x 8
    const hist = sheet.json("numberHist()");

    expect(hist.lo).toBe(1);
    expect(hist.hi).toBe(15);
    expect(hist.counts).toEqual([3, 3, 4, 5, 6, 7, 8, 9, 8, 7, 6, 5, 4, 3, 3]);
    expect(hist.counts.reduce((a, b) => a + b, 0)).toBe(81);
  });

  it("has nine planned pools, one per crossable box on the pool ladder", () => {
    const streets = sheet.json("CFG.streets");
    const planned = streets.reduce((total, street) => total + street.pools.length, 0);
    const crossable = sheet.json("CFG.pool").length - 1;

    expect(planned).toBe(9);
    expect(planned).toBe(crossable);
  });
});

describe("dealing", () => {
  it("deals every card and invents none", () => {
    const dealt = sheet.json("makeCards()");
    expect(dealt).toHaveLength(81);

    const tally = {};
    for (const card of dealt) {
      const key = card.e + ":" + card.n;
      tally[key] = (tally[key] || 0) + 1;
    }

    const expected = {};
    const deck = sheet.json("CFG.deck");
    for (const [effect, numbers] of Object.entries(deck)) {
      for (const n of numbers) {
        const key = effect + ":" + n;
        expected[key] = (expected[key] || 0) + 1;
      }
    }

    expect(tally).toEqual(expected);
  });

  it("gives every card both a number and an effect", () => {
    const dealt = sheet.json("makeCards()");
    for (const card of dealt) {
      expect(typeof card.n).toBe("number");
      expect(Object.keys(sheet.json("CFG.deck"))).toContain(card.e);
    }
  });
});
