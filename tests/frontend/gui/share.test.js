import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { loadSheet } from "../harness.js";

/**
 * Share setup produces a link carrying the whole setup. Only what differs from
 * the defaults travels, and it travels in the part after the `#`, which a
 * browser never sends to a server.
 */

let sheet;

beforeAll(async () => {
  sheet = await loadSheet();
});

afterAll(() => sheet.close());

beforeEach(() => {
  sheet.reset();
  sheet.eval(`CFG.seed = ""; newGame();`);
});

describe("what travels", () => {
  it("sends nothing but the sheet's own seed when everything is default", () => {
    const diff = sheet.json("shareDiff()");

    expect(Object.keys(diff).sort()).toEqual(["sd"]);
  });

  it("sends a setting that differs from the printed default", () => {
    sheet.eval("CFG.roundabouts = true");

    expect(sheet.json("shareDiff()").roundabouts).toBe(true);
  });

  it("leaves out a setting that has been put back to its default", () => {
    sheet.eval("CFG.roundabouts = true; CFG.roundabouts = false;");

    expect(sheet.json("shareDiff()")).not.toHaveProperty("roundabouts");
  });

  it("sends the sheet on screen, not merely the same rules", () => {
    const diff = sheet.json("shareDiff()");

    expect(diff.sd).toBe(sheet.eval("G.seed"));
  });

  it("sends a pinned seed as a setting instead", () => {
    sheet.eval(`CFG.seed = "PERFECT"; newGame();`);
    const diff = sheet.json("shareDiff()");

    expect(diff.seed).toBe("PERFECT");
    expect(diff).not.toHaveProperty("sd");
  });

  it("sends how many times the plans were rerolled", () => {
    sheet.eval("redrawPlans(); redrawPlans();");

    expect(sheet.json("shareDiff()").r).toBe(2);
  });

  it("never sends the best score", () => {
    sheet.eval("best = 92");

    expect(JSON.stringify(sheet.json("shareDiff()"))).not.toContain("92");
  });

  it("never sends the city name", () => {
    sheet.eval(`CFG.city = "Springfield";`);

    expect(sheet.eval("SHARE_KEYS.indexOf('city') >= 0")).toBe(false);
    expect(sheet.json("shareDiff()")).not.toHaveProperty("city");
    expect(sheet.eval("shareLink()")).not.toContain("Springfield");
  });

  it("does not carry the city name even inside the encoded fragment", () => {
    sheet.eval(`CFG.city = "Springfield"; CFG.roundabouts = true;`);

    const encoded = sheet.eval("shareLink()").split("#set=")[1];
    const decoded = JSON.parse(sheet.call("unb64u", encoded));

    expect(decoded).not.toHaveProperty("city");
  });
});

describe("the link", () => {
  it("carries the setup in the fragment, which never reaches a server", () => {
    sheet.eval("CFG.roundabouts = true");
    const link = sheet.eval("shareLink()");

    expect(link).toContain("#set=");
    expect(link.split("#")[0]).not.toContain("set=");
  });

  it("round-trips the setup through the fragment", () => {
    sheet.eval("CFG.roundabouts = true; CFG.advanced = true;");
    const link = sheet.eval("shareLink()");

    const encoded = link.split("#set=")[1];
    const decoded = JSON.parse(sheet.call("unb64u", encoded));

    expect(decoded.roundabouts).toBe(true);
    expect(decoded.advanced).toBe(true);
  });

  it("encodes with a URL-safe alphabet", () => {
    sheet.eval("CFG.roundabouts = true");
    const encoded = sheet.eval("shareLink()").split("#set=")[1];

    expect(encoded).not.toMatch(/[+/=]/);
  });
});

describe("what a shared link is allowed to say", () => {
  it("refuses anything that is not an object", () => {
    expect(sheet.call("sanitizeShared", null)).toBeNull();
    expect(sheet.call("sanitizeShared", [1, 2, 3])).toBeNull();
    expect(sheet.call("sanitizeShared", "mode=solo")).toBeNull();
  });

  it("accepts the two modes and no others", () => {
    expect(sheet.callJson("sanitizeShared", { mode: "solo" }).mode).toBe("solo");
    expect(sheet.callJson("sanitizeShared", { mode: "standard" }).mode).toBe("standard");

    // Nothing recognisable survived, so there is no setup to apply at all.
    expect(sheet.callJson("sanitizeShared", { mode: "expert" })).toBeNull();
  });

  it("normalises a seed that arrives in a link", () => {
    expect(sheet.callJson("sanitizeShared", { seed: "my home" }).seed).toBe("MY-HOME");
  });

  it("drops a ladder that is not a list of numbers", () => {
    expect(sheet.callJson("sanitizeShared", { pool: [0, null, 6] })).toBeNull();
  });

  it("drops a ladder of the wrong shape rather than half-applying it", () => {
    expect(sheet.callJson("sanitizeShared", { pool: [] })).toBeNull();
    expect(sheet.callJson("sanitizeShared", { refusal: "0,0,3,5" })).toBeNull();
  });

  it("keeps the good half of a link and drops only the bad", () => {
    const cleaned = sheet.callJson("sanitizeShared", { mode: "solo", pool: [0, null, 6] });

    expect(cleaned).toEqual({ mode: "solo" });
  });

  it("ignores a city name in a link, so an older one cannot rename your city", () => {
    const cleaned = sheet.callJson("sanitizeShared", { mode: "solo", city: "Shelbyville" });

    expect(cleaned).toEqual({ mode: "solo" });
  });

  it("ignores a theme in a link, so it cannot repaint your screen", () => {
    const cleaned = sheet.callJson("sanitizeShared", { mode: "solo", theme: "orbit" });

    expect(cleaned).toEqual({ mode: "solo" });
  });

  it("keeps a ladder that is a proper list of numbers", () => {
    const cleaned = sheet.callJson("sanitizeShared", { refusal: [0, 0, 4, 6] });

    expect(cleaned.refusal).toEqual([0, 0, 4, 6]);
  });
});

describe("number validation", () => {
  it("accepts a number in range", () => {
    expect(sheet.call("intIn", 5, 0, 10)).toBe(5);
    expect(sheet.call("intIn", "5", 0, 10)).toBe(5);
  });

  it("refuses one out of range", () => {
    expect(sheet.call("intIn", 11, 0, 10)).toBeNull();
    expect(sheet.call("intIn", -1, 0, 10)).toBeNull();
  });

  it("refuses a value that is not a number, rather than coercing it", () => {
    // Number(null) is 0 and Number(true) is 1; neither may pass as a value.
    expect(sheet.call("intIn", null, 0, 10)).toBeNull();
    expect(sheet.call("intIn", true, 0, 10)).toBeNull();
    expect(sheet.call("intIn", "", 0, 10)).toBeNull();
    expect(sheet.call("intIn", "abc", 0, 10)).toBeNull();
  });

  it("refuses a list of nulls as a ladder of zeroes", () => {
    expect(sheet.call("intsIn", [null, null], 0, 10, 5)).toBeNull();
  });

  it("refuses a list longer than the ladder allows", () => {
    expect(sheet.call("intsIn", [1, 2, 3, 4, 5, 6], 0, 10, 5)).toBeNull();
  });
});
