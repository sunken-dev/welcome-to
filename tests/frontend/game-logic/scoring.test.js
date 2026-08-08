import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { loadSheet } from "../harness.js";

/**
 * The printed tables, and the shape of the scoresheet built from them.
 *
 * Every value below is quoted from the Blue Cocker / Deep Water Games 2018
 * English rulebook v2.0, which is what makes these tests worth having: they fail
 * if a table is ever edited into disagreement with the printed game.
 */

let sheet;

beforeAll(async () => {
  sheet = await loadSheet();
});

afterAll(() => sheet.close());

beforeEach(() => sheet.reset());

/** Build `count` swimming pools, keeping the running total and the sheet in step. */
const buildPools = (count) => {
  sheet.eval(`
    let built = 0;
    G.streets.forEach(st => st.slots.forEach(s => {
      if (s.isPool && built < ${count}) { s.pool = true; built++; }
    }));
    G.pools = built;
  `);
};

describe("the printed tables", () => {
  it("gives each street its park ladder", () => {
    const streets = sheet.json("CFG.streets");

    expect(streets.map((s) => s.parks)).toEqual([
      [0, 2, 4, 10],
      [0, 2, 4, 6, 14],
      [0, 2, 4, 6, 8, 18],
    ]);
  });

  it("shares one swimming pool ladder across the sheet", () => {
    expect(sheet.json("CFG.pool")).toEqual([0, 3, 6, 9, 13, 17, 21, 26, 31, 36]);
  });

  it("counts bis houses up the printed ladder", () => {
    expect(sheet.json("CFG.bis")).toEqual([0, 1, 3, 6, 9, 12, 16, 20, 24, 28]);
  });

  it("charges nothing for the first two building permit refusals", () => {
    expect(sheet.json("CFG.refusal")).toEqual([0, 0, 3, 5]);
  });

  it("prices the real estate ladder by estate size", () => {
    expect(sheet.json("CFG.estate")).toEqual({
      1: [1, 3],
      2: [2, 3, 4],
      3: [3, 4, 5, 6],
      4: [4, 5, 6, 7, 8],
      5: [5, 6, 7, 8, 10],
      6: [6, 7, 8, 10, 12],
    });
  });

  it("charges 3 for the first roundabout and 5 more for the second", () => {
    const values = sheet.json("CFG.roundaboutValues");

    expect(values).toEqual([0, 3, 8]);
    expect(values[2] - values[1]).toBe(5);
  });

  it("pays the solo temp agency only from six temps upward", () => {
    expect(sheet.eval("CFG.soloTempMin")).toBe(6);
    expect(sheet.eval("CFG.soloTempPts")).toBe(7);
  });

  it("allows temp agency counts from 0 to 17", () => {
    expect(sheet.eval("CFG.numMin")).toBe(0);
    expect(sheet.eval("CFG.numMax")).toBe(17);
  });
});

describe("estate values", () => {
  it("starts every size at the foot of its column", () => {
    for (let size = 1; size <= 6; size++) {
      const column = sheet.json(`CFG.estate[${size}]`);
      expect(sheet.call("estateValue", size)).toBe(column[0]);
    }
  });

  it("climbs the column as the real estate ladder is crossed", () => {
    sheet.eval("G.improve[3] = 2");

    expect(sheet.call("estateValue", 3)).toBe(5);
  });

  it("stops at the top of the column rather than running off it", () => {
    sheet.eval("G.improve[1] = 99");

    expect(sheet.call("estateValue", 1)).toBe(3);
  });
});

describe("the solo temp agency", () => {
  it("pays nothing below the threshold", () => {
    sheet.eval("G.temp = 5");

    expect(sheet.eval("tempPoints()")).toBe(0);
  });

  it("pays seven at the threshold and above", () => {
    sheet.eval("G.temp = 6");
    expect(sheet.eval("tempPoints()")).toBe(7);

    sheet.eval("G.temp = 12");
    expect(sheet.eval("tempPoints()")).toBe(7);
  });
});

describe("the multiplayer temp agency ranking", () => {
  it("pays most boxes 7, next 4, third 1", () => {
    expect(sheet.call("positionalTemp", 9, [9, 5, 2])).toBe(7);
    expect(sheet.call("positionalTemp", 5, [9, 5, 2])).toBe(4);
    expect(sheet.call("positionalTemp", 2, [9, 5, 2])).toBe(1);
  });

  it("pays a tie the same on both sides", () => {
    expect(sheet.call("positionalTemp", 5, [5, 5, 2])).toBe(4 - 4 + 7);
  });

  it("pays nothing below third place", () => {
    expect(sheet.call("positionalTemp", 1, [9, 5, 2, 1])).toBe(0);
  });

  it("pays nothing for hiring nobody", () => {
    expect(sheet.call("positionalTemp", 0, [9, 5, 2])).toBe(0);
  });
});

describe("the scoresheet", () => {
  it("scores an untouched sheet at nothing", () => {
    expect(sheet.eval("score().total")).toBe(0);
  });

  it("adds its own total rows up to the total it reports", () => {
    sheet.eval("G.pools = 4; G.temp = 7; G.bisCount = 3; G.refusals = 2;");
    const { rows, total } = sheet.json("score()");

    const sum = rows
      .filter((row) => row[6] !== true && row[2] === false)
      .reduce((running, row) => running + (row[1] || 0), 0);

    expect(sum).toBe(total);
  });

  it("breaks every total down into parts that sum to it", () => {
    // The pool rows divide one shared ladder, so the running count and the
    // built pools have to be set together, exactly as taking a pool does.
    buildPools(4);
    const { rows } = sheet.json("score()");

    const groups = [];
    let current = null;
    for (const row of rows) {
      if (row[6] === true) continue; // a heading, not a figure
      if (row[2] === false) {
        current = { label: row[0], expected: row[1], parts: [] };
        groups.push(current);
      } else if (current) {
        current.parts.push(row[1]);
      }
    }

    const broken = groups.filter((g) => g.parts.length > 0);
    expect(broken.length).toBeGreaterThan(0);

    for (const group of broken) {
      const sum = group.parts.reduce((a, b) => a + b, 0);
      expect({ label: group.label, sum }).toEqual({ label: group.label, sum: group.expected });
    }
  });

  it("subtracts the penalties rather than adding them", () => {
    const before = sheet.eval("score().total");
    sheet.eval("G.bisCount = 4; G.refusals = 3;");
    const after = sheet.eval("score().total");

    // p7/p8: four bis costs 9, a third refusal costs 5.
    expect(after).toBe(before - 9 - 5);
  });

  it("walks the shared pool ladder rather than scoring pools per street", () => {
    sheet.eval("G.pools = 3;");

    const pools = sheet.json("score().rows").find((row) => row[3] === "pool");
    expect(pools[1]).toBe(9);
  });
});
