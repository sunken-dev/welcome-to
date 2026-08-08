import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { loadSheet } from "../harness.js";

/**
 * City Plans: which ones may be drawn, how they are identified, and the rule
 * that keeps every category with something left to draw.
 */

let sheet;

beforeAll(async () => {
  sheet = await loadSheet();
});

afterAll(() => sheet.close());

beforeEach(() => sheet.reset());

describe("the plan sets", () => {
  it("holds eighteen standard plans, six per category", () => {
    const plans = sheet.json("BASIC_PLANS");

    expect(plans).toHaveLength(18);
    expect(plans.filter((p) => p.n === 1)).toHaveLength(6);
    expect(plans.filter((p) => p.n === 2)).toHaveLength(6);
    expect(plans.filter((p) => p.n === 3)).toHaveLength(6);
  });

  it("holds ten advanced plans", () => {
    expect(sheet.json("ADV_PLANS")).toHaveLength(10);
  });

  it("scores every plan higher before approval than after", () => {
    const all = sheet.json("BASIC_PLANS.concat(ADV_PLANS)");

    for (const plan of all) {
      expect(plan.hi).toBeGreaterThan(plan.lo);
    }
  });

  it("gives every plan an id derived from its requirement, not its position", () => {
    const all = sheet.json("BASIC_PLANS.concat(ADV_PLANS)");
    const ids = all.map((p) => p.id);

    expect(new Set(ids).size).toBe(ids.length);

    // A plan requiring six estates of size 1, in category 1, of the basic set.
    expect(ids).toContain("b1-111111");
  });
});

describe("which plans may be drawn", () => {
  it("offers only the standard plans by default", () => {
    const active = sheet.json("activePlans()");

    expect(active).toHaveLength(18);
    expect(active.every((p) => !p.sp)).toBe(true);
  });

  it("brings in the starred plans when advanced is switched on", () => {
    sheet.eval("CFG.advanced = true");
    const active = sheet.json("activePlans()");

    // Nine of the ten: the roundabout plan needs roundabouts as well.
    expect(active).toHaveLength(27);
  });

  it("brings in the tenth advanced plan only once roundabouts are on too", () => {
    sheet.eval("CFG.advanced = true; CFG.roundabouts = true;");
    const active = sheet.json("activePlans()");

    expect(active).toHaveLength(28);
    expect(active.some((p) => p.sp === "parkpoolround")).toBe(true);
  });

  it("explains why a plan is unavailable", () => {
    const roundaboutPlan = sheet.json("ADV_PLANS.find(p => p.sp === 'parkpoolround')");

    expect(sheet.call("planGate", roundaboutPlan)).toBe("Advanced plans are switched off.");

    sheet.eval("CFG.advanced = true");
    expect(sheet.call("planGate", roundaboutPlan)).toBe(
      "Needs roundabouts, which are switched off.",
    );
  });
});

describe("curating the pool", () => {
  it("switches a plan off and takes it out of the pool", () => {
    expect(sheet.call("togglePlan", "b1-111111")).toBe(true);

    expect(sheet.eval("planPool().some(p => p.id === 'b1-111111')")).toBe(false);
  });

  it("switches it back on again", () => {
    sheet.call("togglePlan", "b1-111111");
    expect(sheet.call("togglePlan", "b1-111111")).toBe(true);

    expect(sheet.eval("planPool().some(p => p.id === 'b1-111111')")).toBe(true);
  });

  it("keeps at least one plan in every category", () => {
    const category1 = sheet.json("activePlans().filter(p => p.n === 1).map(p => p.id)");

    // Switch off all but the last, which must then refuse.
    for (const id of category1.slice(0, -1)) {
      expect(sheet.call("togglePlan", id)).toBe(true);
    }

    const last = category1[category1.length - 1];
    expect(sheet.call("togglePlan", last)).toBe(false);
    expect(sheet.eval("planPool().filter(p => p.n === 1).length")).toBe(1);
  });

  it("ignores a plan that is not in the current set", () => {
    // An advanced plan while advanced is off.
    expect(sheet.call("togglePlan", "a1-temps")).toBe(false);
  });

  it("leaves every category drawable after the advanced gate closes again", () => {
    sheet.eval("CFG.advanced = true");
    sheet.eval("setAdvanced(false)");

    for (const n of [1, 2, 3]) {
      expect(sheet.eval(`planPool().filter(p => p.n === ${n}).length`)).toBeGreaterThan(0);
    }
  });
});

describe("drawing the three", () => {
  it("draws one plan from each category", () => {
    expect(sheet.json("G.plans.map(p => p.n)")).toEqual([1, 2, 3]);
  });

  it("starts them open and unscored", () => {
    const plans = sheet.json("G.plans");

    for (const plan of plans) {
      expect(plan.done).toBe(false);
      expect(plan.scored).toBe(0);
    }
  });

  it("draws only from the plans left switched on", () => {
    const category1 = sheet.json("activePlans().filter(p => p.n === 1).map(p => p.id)");
    for (const id of category1.slice(0, -1)) sheet.call("togglePlan", id);
    const survivor = category1[category1.length - 1];

    for (let i = 0; i < 10; i++) {
      sheet.eval("newGame()");
      expect(sheet.eval("G.plans[0].id")).toBe(survivor);
    }
  });

  it("replaces a drawn plan that is switched off, leaving the others alone", () => {
    const drawn = sheet.json("G.plans.map(p => p.id)");

    expect(sheet.call("togglePlan", drawn[0])).toBe(true);

    const after = sheet.json("G.plans.map(p => p.id)");
    expect(after[0]).not.toBe(drawn[0]);
    expect(after[1]).toBe(drawn[1]);
    expect(after[2]).toBe(drawn[2]);
  });
});

describe("scoring a plan", () => {
  it("is worth its high value until the plans are approved", () => {
    sheet.eval("G.plans[0].done = true; G.plans[0].scored = G.plans[0].hi;");

    const expected = sheet.eval("G.plans[0].hi");
    expect(sheet.eval("score().rows.find(r => r[3] === 'plan')[1]")).toBe(expected);
  });
});
