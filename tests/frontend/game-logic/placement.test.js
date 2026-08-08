import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { loadSheet } from "../harness.js";

/**
 * p5: an empty house, ascending left to right, never the same number twice in a
 * street. p11: a roundabout divides the street and numbering starts over on the
 * far side, so the ordering rule applies within a segment rather than a street.
 */

let sheet;

beforeAll(async () => {
  sheet = await loadSheet();
});

afterAll(() => sheet.close());

beforeEach(() => sheet.reset());

/** Write numbers into a street without going through a turn. */
const write = (street, values) => {
  sheet.eval(`
    (${JSON.stringify(values)}).forEach((v, i) => {
      if (v !== null) G.streets[${street}].slots[i].v = v;
    });
  `);
};

describe("the three streets", () => {
  it("are 10, 11 and 12 houses long", () => {
    expect(sheet.json("G.streets.map(s => s.slots.length)")).toEqual([10, 11, 12]);
  });

  it("start empty, with a fence between every pair of neighbours available", () => {
    expect(sheet.eval("houses()")).toBe(0);
    expect(sheet.json("G.streets.map(s => s.fences.length)")).toEqual([9, 10, 11]);
    expect(sheet.eval("G.streets.every(s => s.fences.every(f => f === false))")).toBe(true);
  });

  it("count 33 lots in total", () => {
    expect(sheet.eval("allLots()")).toBe(33);
  });
});

describe("ascending order", () => {
  it("accepts a number greater than everything to its left", () => {
    write(0, [3]);

    expect(sheet.call("ascOK", 0, 1, 4)).toBe(true);
  });

  it("refuses a number smaller than something to its left", () => {
    write(0, [7]);

    expect(sheet.call("ascOK", 0, 1, 4)).toBe(false);
  });

  it("refuses the same number twice in one street", () => {
    write(0, [5]);

    expect(sheet.call("ascOK", 0, 1, 5)).toBe(false);
  });

  it("refuses a number greater than something to its right", () => {
    write(0, [null, null, null, 6]);

    expect(sheet.call("ascOK", 0, 1, 9)).toBe(false);
  });

  it("accepts a number that fits between its neighbours", () => {
    write(0, [2, null, 8]);

    expect(sheet.call("ascOK", 0, 1, 5)).toBe(true);
    expect(sheet.call("ascOK", 0, 1, 1)).toBe(false);
    expect(sheet.call("ascOK", 0, 1, 9)).toBe(false);
  });
});

describe("placing a house", () => {
  it("refuses a lot that is already built on", () => {
    write(0, [4]);

    expect(sheet.call("canPlace", 0, 0, 9)).toBe(false);
  });

  it("refuses a lot holding a roundabout", () => {
    sheet.eval("G.streets[0].slots[2].round = true");

    expect(sheet.call("canPlace", 0, 2, 5)).toBe(false);
  });

  it("reports whether a number fits anywhere at all", () => {
    expect(sheet.call("anyPlace", 7)).toBe(true);

    // Fill the first street's ends and leave no room in the others either.
    sheet.eval(`
      G.streets.forEach(st => st.slots.forEach((s, i) => { s.v = i + 1; }));
    `);

    expect(sheet.call("anyPlace", 7)).toBe(false);
  });
});

describe("a roundabout divides the street", () => {
  it("bounds a segment at the roundabout", () => {
    sheet.eval("G.streets[0].slots[3].round = true");

    expect(sheet.callJson("segment", 0, 1)).toEqual([0, 2]);
    expect(sheet.callJson("segment", 0, 5)).toEqual([4, 9]);
  });

  it("spans the whole street when there is no roundabout", () => {
    expect(sheet.callJson("segment", 0, 5)).toEqual([0, 9]);
  });

  it("lets numbering start over on the far side", () => {
    // 1, 2, 3 up to the roundabout, then 1 again beyond it.
    write(0, [1, 2, 3]);
    sheet.eval("G.streets[0].slots[3].round = true");

    expect(sheet.call("ascOK", 0, 4, 1)).toBe(true);
  });

  it("still forbids descending within a segment beyond the roundabout", () => {
    sheet.eval("G.streets[0].slots[3].round = true");
    write(0, [null, null, null, null, 6]);

    expect(sheet.call("ascOK", 0, 5, 4)).toBe(false);
    expect(sheet.call("ascOK", 0, 5, 8)).toBe(true);
  });

  it("does not count as a house, so a filled street reads as complete", () => {
    sheet.eval(`
      G.streets.forEach(st => st.slots.forEach((s, i) => { s.v = i + 1; }));
      G.streets[0].slots[0].v = null;
      G.streets[0].slots[0].round = true;
    `);

    expect(sheet.eval("allBuilt()")).toBe(true);
    expect(sheet.eval("roundCount()")).toBe(1);
    expect(sheet.eval("buildable()")).toBe(32);
  });
});

describe("fences", () => {
  it("may be placed on a free dotted space", () => {
    expect(sheet.call("fenceOK", 0, 0)).toBe(true);
  });

  it("may not be placed where one already stands", () => {
    sheet.eval("G.streets[0].fences[0] = true");

    expect(sheet.call("fenceOK", 0, 0)).toBe(false);
  });

  it("may not split a duplicate pair", () => {
    write(0, [6, 6]);

    expect(sheet.call("fenceOK", 0, 0)).toBe(false);
  });

  it("may not split an estate already used for a City Plan", () => {
    write(0, [3, 4]);
    sheet.eval("G.streets[0].slots[0].locked = true; G.streets[0].slots[1].locked = true;");

    expect(sheet.call("fenceOK", 0, 0)).toBe(false);
  });

  it("divides a street into estates", () => {
    write(0, [1, 2, 3, 4]);
    sheet.eval("G.streets[0].fences[1] = true");

    const sizes = sheet.json("estates().map(e => e.size)");
    expect(sizes).toContain(2);
  });
});

describe("bis", () => {
  it("offers a neighbour's number to an empty lot", () => {
    write(0, [5]);

    const target = sheet.json("bisAt(0, 1)");
    expect(target.vals).toEqual([5]);
  });

  it("offers both neighbours when both are built", () => {
    write(0, [4, null, 9]);

    const target = sheet.json("bisAt(0, 1)");
    expect(target.vals).toEqual([4, 9]);
  });

  it("does not reach across a fence", () => {
    write(0, [5]);
    sheet.eval("G.streets[0].fences[0] = true");

    expect(sheet.json("bisAt(0, 1)")).toBeUndefined();
  });

  it("offers nothing to a lot with no built neighbour", () => {
    expect(sheet.json("bisAt(0, 4)")).toBeUndefined();
  });
});

describe("refusals", () => {
  it("is not forced while a shown number still fits", () => {
    sheet.eval("startGame(true)");

    expect(sheet.eval("mustBuild()")).toBe(true);
  });

  it("counts a number as usable when a temp agency could shift it into place", () => {
    // Leave a single gap that only 8 fits, then offer 6 with a temp available.
    sheet.eval(`
      G.streets.forEach(st => st.slots.forEach((s, i) => { s.v = i + 1; }));
      G.streets[0].slots[7].v = null;
    `);

    expect(sheet.call("numberUsable", 6, false)).toBe(false);
    expect(sheet.call("numberUsable", 6, true)).toBe(true);
    expect(sheet.call("numberUsable", 1, true)).toBe(false);
  });
});
