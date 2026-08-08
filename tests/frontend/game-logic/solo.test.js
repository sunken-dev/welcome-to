import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { loadSheet } from "../harness.js";

/**
 * The 2018 solo variant (p9): the deck is dealt once and never reshuffled, the
 * Solo card is shuffled into the bottom half and placed underneath, and when it
 * turns up every City Plan flips to Approved.
 *
 * Because the deck is dealt once, the odds the hints panel shows are exact
 * rather than estimated -- including the claim that the Solo card cannot appear
 * before round 14, which follows from how the deck is built rather than from
 * any rule.
 */

let sheet;

beforeAll(async () => {
  sheet = await loadSheet();
});

afterAll(() => sheet.close());

beforeEach(() => {
  sheet.reset();
  sheet.eval(`CFG.mode = "solo"; newGame();`);
});

describe("the solo deal", () => {
  it("deals every construction card plus the Solo card", () => {
    expect(sheet.eval("G.deck.length")).toBe(82);
    expect(sheet.eval("G.deck.filter(c => c.solo).length")).toBe(1);
  });

  it("counts only the construction cards as dealt", () => {
    expect(sheet.eval("G.dealt")).toBe(81);
  });

  it("puts the Solo card in the bottom half", () => {
    const position = sheet.eval("G.deck.findIndex(c => c.solo)");

    expect(position).toBeGreaterThanOrEqual(41);
  });

  it("starts with the plans unapproved and the Solo card unseen", () => {
    expect(sheet.eval("G.approved")).toBe(false);
    expect(sheet.eval("G.soloSeen")).toBe(false);
  });
});

describe("the hand", () => {
  it("draws three cards a round", () => {
    sheet.eval("startGame(true)");

    expect(sheet.eval("G.hand.length")).toBe(3);
  });

  it("never deals the Solo card into the hand", () => {
    sheet.eval("startGame(true)");

    for (let round = 0; round < 25 && !sheet.eval("G.over"); round++) {
      expect(sheet.eval("G.hand.some(c => c.solo)")).toBe(false);
      sheet.eval("nextRound()");
    }
  });

  it("offers every card in hand as an available number", () => {
    sheet.eval("startGame(true)");

    expect(sheet.json("availableNumbers()")).toEqual(sheet.json("G.hand.map(c => c.n)"));
  });
});

describe("the Solo card", () => {
  it("cannot appear before round 14, whatever the seed", () => {
    for (const seed of ["PERFECT", "HOUSING", "SUBURB", "ESTATE", "STREETS", "CORNER"]) {
      sheet.eval(`CFG.mode = "solo"; CFG.seed = ${JSON.stringify(seed)}; newGame(); startGame(true);`);

      let round = sheet.eval("G.round");
      while (!sheet.eval("G.soloSeen") && !sheet.eval("G.over")) {
        sheet.eval("nextRound()");
        round = sheet.eval("G.round");
      }

      expect(sheet.eval("G.soloSeen"), `seed ${seed}`).toBe(true);
      expect(round, `seed ${seed}`).toBeGreaterThanOrEqual(14);
    }
  });

  it("agrees with the earliest round the hints panel reports", () => {
    sheet.eval("startGame(true)");

    expect(sheet.json("soloStats()").earliest).toBe(14);
  });

  it("approves the plans when it turns up", () => {
    sheet.eval("startGame(true)");

    while (!sheet.eval("G.soloSeen") && !sheet.eval("G.over")) sheet.eval("nextRound()");

    expect(sheet.eval("G.approved")).toBe(true);
  });

  it("leaves only the lower value available once approved", () => {
    sheet.eval("startGame(true); G.approved = true;");
    const plan = sheet.json("G.plans[0]");

    sheet.eval("validatePlan(0)");

    if (sheet.eval("G.plans[0].done")) {
      expect(sheet.eval("G.plans[0].scored")).toBe(plan.lo);
    }
  });
});

describe("exact odds", () => {
  it("is certain when three or fewer cards remain", () => {
    expect(sheet.call("atLeastOneIn3", 1, 3)).toBe(1);
    expect(sheet.call("atLeastOneIn3", 1, 2)).toBe(1);
  });

  it("is impossible when none of the wanted cards are left", () => {
    expect(sheet.call("atLeastOneIn3", 0, 40)).toBe(0);
  });

  it("computes the chance of at least one in the next three", () => {
    // One wanted card among four: it is in the next three unless it is the last.
    expect(sheet.call("atLeastOneIn3", 1, 4)).toBeCloseTo(0.75, 10);

    // Two wanted among ten: 1 - (8/10)(7/9)(6/8).
    expect(sheet.call("atLeastOneIn3", 2, 10)).toBeCloseTo(1 - (8 / 10) * (7 / 9) * (6 / 8), 10);
  });

  it("counts the construction cards left without the Solo card", () => {
    sheet.eval("startGame(true)");

    expect(sheet.json("soloStats()").pool).toBe(sheet.eval("cardsLeft()"));
  });
});

describe("running out", () => {
  it("ends the game when the deck cannot fill a hand", () => {
    sheet.eval("startGame(true)");

    for (let i = 0; i < 40 && !sheet.eval("G.over"); i++) sheet.eval("nextRound()");

    expect(sheet.eval("G.over")).toBe(true);
    expect(sheet.eval("G.why")).toContain("empty");
  });
});
