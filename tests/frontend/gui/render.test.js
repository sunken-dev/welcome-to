import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { loadSheet } from "../harness.js";

/**
 * What actually reaches the page. The sheet renders itself from `G` on every
 * change, so these check the document rather than the state behind it.
 */

let sheet;

beforeAll(async () => {
  sheet = await loadSheet();
});

afterAll(() => sheet.close());

beforeEach(() => {
  sheet.reset();
  sheet.eval("render()");
});

describe("the masthead", () => {
  it("shows the round, the deck, the houses and the score", () => {
    expect(sheet.$("rd-round").textContent).toBe("0");
    expect(sheet.$("rd-deck").textContent).toBe("81/81");
    expect(sheet.$("rd-built").textContent).toBe("0/33");
    expect(sheet.$("rd-score").textContent).toBe("0");
  });

  it("shows an em dash for a best score not yet set", () => {
    expect(sheet.$("rd-best").textContent).toBe("—");
  });

  it("follows the round on", () => {
    sheet.eval("startGame(true)");

    expect(sheet.$("rd-round").textContent).toBe("1");
  });

  it("counts the houses as they are built", () => {
    sheet.eval("G.streets[0].slots[0].v = 5; render();");

    expect(sheet.$("rd-built").textContent).toBe("1/33");
  });

  it("marks a negative score so it reads as a loss", () => {
    sheet.eval("G.refusals = 3; render();");

    const score = sheet.$("rd-score");
    expect(Number(score.textContent)).toBeLessThan(0);
    expect(score.classList.contains("bad")).toBe(true);
  });

  it("shows the three clocks", () => {
    expect(sheet.$("rd-time").textContent).toContain("round");
    expect(sheet.$("rd-time").textContent).toContain("avg");
    expect(sheet.$("rd-time").textContent).toContain("total");
  });
});

describe("the city", () => {
  it("draws three streets", () => {
    const streets = sheet.$("streets");

    expect(streets.children.length).toBeGreaterThanOrEqual(3);
  });

  it("draws every lot of every street", () => {
    const lots = sheet.$("streets").querySelectorAll(".lot");

    expect(lots).toHaveLength(33);
  });

  it("labels an empty lot for a screen reader", () => {
    const first = sheet.$("streets").querySelector(".lot");

    expect(first.getAttribute("aria-label")).toBe("Street 1 house 1, empty");
  });

  it("shows a number once it is written in", () => {
    sheet.eval("G.streets[0].slots[0].v = 12; render();");

    expect(sheet.$("streets").textContent).toContain("12");
  });
});

describe("the panels", () => {
  it("draws the three city plans", () => {
    const plans = sheet.$("plans").querySelectorAll(".plan");

    expect(plans).toHaveLength(3);
  });

  it("draws the scoresheet with a row per scoring line, and a total beneath", () => {
    const rows = [...sheet.$("sheet").querySelectorAll("tr")];
    const expected = sheet.eval("score().rows.length");

    expect(rows).toHaveLength(expected + 1);
    expect(rows[rows.length - 1].textContent).toContain("Total");
  });

  it("draws the estate ladder, the pools, the temps and the penalties", () => {
    for (const id of ["stair", "tracks", "temps", "pens"]) {
      expect(sheet.$(id).children.length, id).toBeGreaterThan(0);
    }
  });

  it("keeps the hints panel hidden while hints are off", () => {
    expect(sheet.eval("CFG.hints")).toBe(false);
    expect(sheet.$("hint").hasAttribute("hidden")).toBe(true);
  });

  it("shows the hints panel once hints are on", () => {
    sheet.eval("CFG.hints = true; startGame(true); render();");

    expect(sheet.$("hint").hasAttribute("hidden")).toBe(false);
    expect(sheet.$("hintbody").textContent.length).toBeGreaterThan(0);
  });
});

describe("the toolbar", () => {
  it("offers the buttons the sheet is driven by", () => {
    for (const id of ["btn-undo", "btn-redo", "btn-rules", "btn-hints", "btn-theme", "btn-new"]) {
      expect(sheet.$(id), id).not.toBeNull();
    }
  });

  it("says what to do next", () => {
    sheet.eval("startGame(true)");

    expect(sheet.$("msg").textContent.length).toBeGreaterThan(0);
  });
});
