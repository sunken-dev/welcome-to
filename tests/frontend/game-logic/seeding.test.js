import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { loadSheet } from "../harness.js";

/**
 * Two people typing the same seed must see the same cards, round after round,
 * with nothing passing between their devices. That is the whole promise of a
 * seed, and it rests on the deck and the plan draw running on separate streams
 * from the one seed -- so rerolling plans cannot disturb the cards.
 */

let sheet;

beforeAll(async () => {
  sheet = await loadSheet();
});

afterAll(() => sheet.close());

beforeEach(() => sheet.reset());

const dealWith = (seed) => {
  sheet.eval(`CFG.seed = ${JSON.stringify(seed)}; newGame();`);
  return sheet.json("G.stacks");
};

describe("reproducing a sheet", () => {
  it("deals the identical deck from the identical seed", () => {
    const first = dealWith("PERFECT");
    const second = dealWith("PERFECT");

    expect(second).toEqual(first);
  });

  it("deals a different deck from a different seed", () => {
    const first = dealWith("PERFECT");
    const second = dealWith("HOUSING");

    expect(second).not.toEqual(first);
  });

  it("records the seed it dealt from", () => {
    dealWith("PERFECT");

    expect(sheet.eval("G.seed")).toBe("PERFECT");
  });

  it("rolls a fresh seed when none is pinned", () => {
    sheet.eval(`CFG.seed = ""; newGame();`);
    const first = sheet.eval("G.seed");

    sheet.eval(`CFG.seed = ""; newGame();`);
    const second = sheet.eval("G.seed");

    expect(first).toHaveLength(6);
    expect(second).not.toBe(first);
  });
});

describe("seed text", () => {
  it.each([
    ["lower case", "perfect", "PERFECT"],
    ["surrounding space", "  PERFECT  ", "PERFECT"],
    ["punctuation", "my perfect home!", "MY-PERFECT-HOME"],
    ["repeated separators", "a___b", "A-B"],
    ["leading and trailing separators", "--abc--", "ABC"],
  ])("normalises %s", (_label, input, expected) => {
    expect(sheet.call("normalizeSeed", input)).toBe(expected);
  });

  it("caps a seed at 24 characters", () => {
    expect(sheet.call("normalizeSeed", "A".repeat(40))).toHaveLength(24);
  });

  it("treats an empty seed as no seed", () => {
    expect(sheet.call("normalizeSeed", "")).toBe("");
    expect(sheet.call("normalizeSeed", "  ")).toBe("");
  });

  it("rolls seeds from an alphabet with no lookalike characters", () => {
    const alphabet = sheet.eval("SEED_ALPHABET");

    expect(alphabet).not.toMatch(/[O0I1]/);

    for (let i = 0; i < 50; i++) {
      const seed = sheet.eval("randomSeed()");
      expect(seed).toHaveLength(6);
      expect(seed.split("").every((c) => alphabet.includes(c))).toBe(true);
    }
  });
});

describe("separate streams", () => {
  it("leaves the cards untouched when the plans are rerolled", () => {
    const dealt = dealWith("PERFECT");
    const plansBefore = sheet.json("G.plans.map(p => p.id)");

    expect(sheet.eval("redrawPlans()")).toBe(true);

    expect(sheet.json("G.stacks")).toEqual(dealt);
    expect(sheet.json("G.plans.map(p => p.id)")).not.toEqual(plansBefore);
  });

  it("leaves the cards untouched however many times the plans are rerolled", () => {
    const dealt = dealWith("PERFECT");

    for (let i = 0; i < 5; i++) sheet.eval("redrawPlans()");

    expect(sheet.json("G.stacks")).toEqual(dealt);
    expect(sheet.eval("G.planRoll")).toBe(5);
  });

  it("makes a reroll reproducible from the seed and the reroll count", () => {
    dealWith("PERFECT");
    sheet.eval("redrawPlans(); redrawPlans();");
    const afterTwo = sheet.json("G.plans.map(p => p.id)");

    dealWith("PERFECT");
    sheet.eval("redrawPlans(); redrawPlans();");

    expect(sheet.json("G.plans.map(p => p.id)")).toEqual(afterTwo);
    expect(sheet.eval("G.planRoll")).toBe(2);
  });

  it("returns to the first three exactly, rather than drawing again", () => {
    dealWith("PERFECT");
    const original = sheet.json("G.plans.map(p => p.id)");

    sheet.eval("redrawPlans(); redrawPlans(); redrawPlans();");
    expect(sheet.eval("resetPlans()")).toBe(true);

    expect(sheet.json("G.plans.map(p => p.id)")).toEqual(original);
    expect(sheet.eval("G.planRoll")).toBe(0);
  });
});

describe("once the game is under way", () => {
  it("refuses to reroll the plans", () => {
    dealWith("PERFECT");
    sheet.eval("startGame(true)");

    expect(sheet.eval("redrawPlans()")).toBe(false);
  });

  it("refuses to reset the plans", () => {
    dealWith("PERFECT");
    sheet.eval("redrawPlans()");
    sheet.eval("startGame(true)");

    expect(sheet.eval("resetPlans()")).toBe(false);
  });
});
