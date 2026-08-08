import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { loadSheet } from "../harness.js";

/**
 * The state behind the interface: themes, the settings that are remembered, the
 * city name and seed a player types, the panels, and undo.
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

describe("themes", () => {
  it("offers six", () => {
    expect(sheet.json("THEME_ORDER")).toHaveLength(6);
  });

  it("names every one of them in THEMES", () => {
    const order = sheet.json("THEME_ORDER");

    for (const name of order) {
      expect(sheet.eval(`typeof THEMES[${JSON.stringify(name)}]`), name).toBe("object");
    }
  });

  it("paints the page without touching the stored preference", () => {
    // applyTheme paints only; the picker is what records the choice.
    sheet.call("applyTheme", "orbit");

    expect(sheet.$("themecss").textContent.length).toBeGreaterThan(0);
    expect(sheet.eval("CFG.theme")).toBe("drafting");
  });

  it("falls back to the default for a theme it does not know", () => {
    sheet.call("applyTheme", "drafting");
    const drafting = sheet.$("themecss").textContent;

    sheet.call("applyTheme", "no-such-theme");

    expect(sheet.$("themecss").textContent).toBe(drafting);
  });

  it("changes the values the page paints with", () => {
    sheet.call("applyTheme", "drafting");
    const drafting = sheet.$("themecss").textContent;

    sheet.call("applyTheme", "cats");
    const cats = sheet.$("themecss").textContent;

    expect(cats).not.toBe(drafting);
  });

  it("leaves the rules alone, whichever theme is on", () => {
    const before = sheet.json("CFG.streets");
    sheet.call("applyTheme", "risograph");

    expect(sheet.json("CFG.streets")).toEqual(before);
    expect(sheet.eval("deckTotal()")).toBe(81);
  });
});

describe("the city name", () => {
  it("starts blank", () => {
    expect(sheet.eval("CFG.city")).toBe("");
  });

  it("is written into the masthead", () => {
    sheet.eval(`CFG.city = "Springfield"; renderCity();`);

    expect(sheet.$("cityslot").textContent).toContain("Springfield");
  });

  it("is capped so it fits the masthead and the briefing", () => {
    expect(sheet.eval("CITY_MAX")).toBe(20);
  });

  it("cuts a typed name to the cap", () => {
    sheet.call("commitCity", "x".repeat(40));

    expect(sheet.eval("CFG.city")).toHaveLength(20);
  });

  it("trims again after cutting, so no trailing space is stored", () => {
    // Nineteen characters, a space, then more: slicing at 20 would leave the space.
    sheet.call("commitCity", "y".repeat(19) + " tail");

    expect(sheet.eval("CFG.city")).toBe("y".repeat(19));
  });

  it("stores nothing for a name that is only whitespace", () => {
    sheet.call("commitCity", "   ");

    expect(sheet.eval("CFG.city")).toBe("");
  });

  it("names the player in a room, falling back to Architect", () => {
    expect(sheet.eval("mpMyName()")).toBe("Architect");

    sheet.eval(`CFG.city = "  Springfield  ";`);
    expect(sheet.eval("mpMyName()")).toBe("Springfield");
  });
});

describe("the seed a player types", () => {
  it("is normalised on the way in", () => {
    sheet.eval(`CFG.seed = "my home"; CFG.seed = normalizeSeed(CFG.seed);`);

    expect(sheet.eval("CFG.seed")).toBe("MY-HOME");
  });

  it("rebuilds the same sheet when typed again", () => {
    sheet.eval(`CFG.seed = "PERFECT"; newGame();`);
    const first = sheet.json("G.stacks");

    sheet.eval(`CFG.seed = ""; newGame();`);
    sheet.eval(`CFG.seed = "PERFECT"; newGame();`);

    expect(sheet.json("G.stacks")).toEqual(first);
  });
});

describe("settings that are remembered", () => {
  it("keeps preferences apart from the sheet in progress", () => {
    const prefs = sheet.json("PREF_KEYS");
    const local = sheet.json("LOCAL_KEYS");

    expect(prefs.length).toBeGreaterThan(0);
    expect(local.length).toBeGreaterThan(0);
  });

  it("writes to localStorage rather than to a server", () => {
    expect(sheet.eval("STORE.kind")).toBe("localStorage");
  });

  it("stores the settings when they change", async () => {
    sheet.eval(`CFG.theme = "hillside"; save();`);
    await sheet.settle();

    const stored = JSON.stringify(sheet.window.localStorage);
    expect(stored).toContain("hillside");
  });

  it("bumps a data version so a corrected table can replace a stored one", () => {
    expect(sheet.eval("BASE.dataVersion")).toBe(3);
  });
});

describe("the round readout", () => {
  it("counts towards nothing, because a sheet has no fixed number of rounds", () => {
    sheet.eval("startGame(true); nextRound(); nextRound();");

    sheet.$("btn-new").click();
    const dialog = sheet.$("modal").textContent;

    expect(dialog).toContain("Round");
    expect(dialog).not.toMatch(/Round\s*\d+\s*of/);
    // The city-name cap must not leak into a round count again.
    expect(dialog).not.toContain("of 20");
  });

  it("shows the round the sheet is actually on", () => {
    sheet.eval("startGame(true); nextRound();");
    const round = sheet.eval("G.round");

    sheet.$("btn-new").click();

    expect(sheet.$("modal").textContent).toContain("Round" + round);
  });
});

describe("the panels", () => {
  it("opens a panel over a scrim", () => {
    sheet.eval("openBox('<p>hello</p>')");

    expect(sheet.$("scrim").hasAttribute("hidden")).toBe(false);
    expect(sheet.$("modal").textContent).toContain("hello");
  });

  it("closes it again", () => {
    sheet.eval("openBox('<p>hello</p>')");
    sheet.eval("forceCloseBox()");

    expect(sheet.$("scrim").hasAttribute("hidden")).toBe(true);
  });
});

describe("undo", () => {
  it("allows five rounds back by default", () => {
    expect(sheet.eval("CFG.undo")).toBe(5);
  });

  it("has nothing to undo on a fresh sheet", () => {
    expect(sheet.eval("undoAvailable()")).toBeFalsy();
    expect(sheet.eval("redoAvailable()")).toBeFalsy();
  });

  it("keeps the buttons in step with what is possible", () => {
    sheet.eval("syncUndoButtons()");

    expect(sheet.$("btn-undo").disabled).toBe(true);
    expect(sheet.$("btn-redo").disabled).toBe(true);
  });

  it("records a round in the log so it can be replayed", () => {
    sheet.eval("startGame(true)");
    const depth = sheet.eval("undoDepth()");

    expect(typeof depth).toBe("number");
  });
});

describe("the clocks", () => {
  it("shows two dashes before anything has been timed", () => {
    expect(sheet.call("fmt2", null)).toBe("--:--");
  });

  it("pads to a fixed width so the masthead does not shuffle", () => {
    expect(sheet.call("fmt2", 9000)).toBe("00:09");
    expect(sheet.call("fmt2", 61000)).toBe("01:01");
  });

  it("caps the minutes rather than widening the slot", () => {
    expect(sheet.call("fmt2", 100 * 60 * 1000)).toBe("99:00");
  });

  it("spells longer times out in full", () => {
    expect(sheet.call("fmt", 3661000)).toBe("1:01:01");
    expect(sheet.call("fmt", 61000)).toBe("1:01");
  });
});
