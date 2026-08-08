import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { loadSheet, installFakeSocket } from "../harness.js";

/**
 * The sheet's half of the protocol: what it makes of what the relay says.
 *
 * The relay stamps `from` on every forwarded message, so these drive messages
 * in exactly as the relay would -- with the sender named by the server, never
 * by the client.
 */

let sheet;
let relay;

beforeAll(async () => {
  sheet = await loadSheet();
});

afterAll(() => sheet.close());

beforeEach(() => {
  sheet.reset();
  relay = installFakeSocket(sheet);
  sheet.call("mpConnect", "ABCD");
  relay.open();
});

/** Put the sheet in a room of `names`, as player index `me`. */
const roomOf = (names, me = 0) => {
  const players = names.map((name, i) => ({ id: "p" + (i + 1), name }));
  relay.receive({ t: "welcome", you: players[me].id, setup: null });
  relay.receive({ t: "roster", players });
  return players;
};

describe("welcome", () => {
  it("takes the id the relay has given us", () => {
    relay.receive({ t: "welcome", you: "p3", setup: null });

    expect(sheet.eval("MP.me")).toBe("p3");
  });

  it("notices a game already under way, so we do not start rounds behind", () => {
    relay.receive({ t: "welcome", you: "p2", setup: { t: "setup", seed: "PERFECT" } });

    expect(sheet.eval("MP.inProgress")).toBe(true);
  });

  it("treats an empty room as one not yet started", () => {
    relay.receive({ t: "welcome", you: "p1", setup: null });

    expect(sheet.eval("MP.inProgress")).toBe(false);
  });
});

describe("the roster", () => {
  it("keeps the relay's order, because the first player is the host", () => {
    roomOf(["Ada", "Grace"]);

    expect(sheet.eval("mpHostId()")).toBe("p1");
    expect(sheet.json("MP.players.map(p => p.name)")).toEqual(["Ada", "Grace"]);
  });

  it("knows when we are the host", () => {
    roomOf(["Ada", "Grace"], 0);

    expect(sheet.eval("mpIsHost()")).toBe(true);
  });

  it("knows when we are not", () => {
    roomOf(["Ada", "Grace"], 1);

    expect(sheet.eval("mpIsHost()")).toBe(false);
  });

  it("names a player by id, and says so plainly for one it cannot place", () => {
    roomOf(["Ada", "Grace"]);

    expect(sheet.call("mpWho", "p2")).toBe("Grace");
    expect(sheet.call("mpWho", "p9")).toBe("a player");
  });

  it("forgets a player's readiness once they leave", () => {
    roomOf(["Ada", "Grace"]);
    relay.receive({ t: "ready", from: "p2", round: 1 });
    expect(sheet.json("MP.ready")).toHaveProperty("p2");

    relay.receive({ t: "roster", players: [{ id: "p1", name: "Ada" }] });

    expect(sheet.json("MP.ready")).not.toHaveProperty("p2");
  });
});

describe("the host's opening broadcast", () => {
  it("sends the seed, the variant and the plans when the host starts", () => {
    roomOf(["Ada", "Grace"], 0);
    sheet.eval(`CFG.seed = "PERFECT"; newGame();`);

    sheet.eval("startGame()");

    const setup = relay.sent().find((m) => m.t === "setup");
    expect(setup).toMatchObject({ t: "setup", seed: "PERFECT", mode: "standard" });
    expect(setup.planIds).toHaveLength(3);
  });

  it("is not sent by a guest, who waits for the host", () => {
    roomOf(["Ada", "Grace"], 1);

    sheet.eval("startGame()");

    expect(relay.sent().some((m) => m.t === "setup")).toBe(false);
    expect(sheet.eval("G.started")).toBe(false);
  });

  it("builds the identical sheet at the other end from the seed alone", () => {
    // What the host would have sent, on a sheet that has itself begun: the
    // guest's startGame deals the first round too, so both must be compared
    // from the same point.
    sheet.eval(`CFG.seed = "PERFECT"; newGame();`);
    const hostPlans = sheet.json("G.plans.map(p => p.id)");
    sheet.eval("startGame(true)");
    const hostStacks = sheet.json("G.stacks");

    // A guest receiving it, from a different starting state.
    sheet.reset("SOMETHINGELSE");
    relay = installFakeSocket(sheet);
    sheet.call("mpConnect", "ABCD");
    relay.open();
    roomOf(["Ada", "Grace"], 1);

    relay.receive({
      t: "setup",
      from: "p1",
      seed: "PERFECT",
      mode: "standard",
      roundabouts: false,
      planIds: hostPlans,
      planRoll: 0,
    });

    expect(sheet.json("G.stacks")).toEqual(hostStacks);
    expect(sheet.json("G.plans.map(p => p.id)")).toEqual(hostPlans);
    expect(sheet.eval("G.started")).toBe(true);
  });

  it("carries the variant so everyone plays the same game", () => {
    roomOf(["Ada", "Grace"], 1);

    relay.receive({
      t: "setup", from: "p1", seed: "PERFECT", mode: "standard",
      roundabouts: true, planIds: [], planRoll: 0,
    });

    expect(sheet.eval("CFG.roundabouts")).toBe(true);
  });

  it("is ignored once our own sheet is already under way", () => {
    roomOf(["Ada", "Grace"], 1);
    sheet.eval(`CFG.seed = "MINE"; newGame(); startGame(true);`);
    const mine = sheet.json("G.stacks");

    relay.receive({ t: "setup", from: "p1", seed: "THEIRS", mode: "standard", planIds: [] });

    expect(sheet.json("G.stacks")).toEqual(mine);
  });
});

describe("waiting for each other", () => {
  beforeEach(() => {
    roomOf(["Ada", "Grace"], 0);
    sheet.eval(`CFG.seed = "PERFECT"; newGame(); startGame(true);`);
    sheet.eval(`MP.participants = ["p1", "p2"];`);
  });

  it("waits for a player who has not finished the round", () => {
    expect(sheet.json("mpWaitingFor()")).toEqual(["Ada", "Grace"]);
  });

  it("stops waiting for a player once they report", () => {
    relay.receive({ t: "ready", from: "p2", round: 1 });

    expect(sheet.json("mpWaitingFor()")).toEqual(["Ada"]);
  });

  it("moves on only when everyone has reported", () => {
    const round = sheet.eval("G.round");

    relay.receive({ t: "ready", from: "p2", round: 1 });
    expect(sheet.eval("G.round")).toBe(round);

    relay.receive({ t: "ready", from: "p1", round: 1 });
    expect(sheet.eval("G.round")).toBe(round + 1);
  });

  it("never counts a round backwards", () => {
    relay.receive({ t: "ready", from: "p2", round: 3 });
    relay.receive({ t: "ready", from: "p2", round: 1 });

    expect(sheet.json("MP.ready").p2).toBe(3);
  });

  it("waits only for players who were there when the sheet started", () => {
    relay.receive({ t: "roster", players: [
      { id: "p1", name: "Ada" }, { id: "p2", name: "Grace" }, { id: "p3", name: "Edsger" },
    ] });

    expect(sheet.json("mpWaitingFor()")).not.toContain("Edsger");
  });

  it("stops waiting for a player who has left", () => {
    relay.receive({ t: "roster", players: [{ id: "p1", name: "Ada" }] });

    expect(sheet.json("mpWaitingFor()")).toEqual(["Ada"]);
  });

  it("knows when we are the one being waited for", () => {
    expect(sheet.eval("mpIAmWaiting()")).toBe(false);

    relay.receive({ t: "ready", from: "p1", round: 1 });
    expect(sheet.eval("mpIAmWaiting()")).toBe(true);
  });
});

describe("claims and endings", () => {
  beforeEach(() => {
    roomOf(["Ada", "Grace"], 0);
    sheet.eval(`CFG.seed = "PERFECT"; newGame(); startGame(true);`);
  });

  it("records who claimed which plan and when", () => {
    relay.receive({ t: "plan", from: "p2", planId: "b1-111111", round: 4 });

    expect(sheet.json("MP.claims")).toEqual([{ planId: "b1-111111", round: 4, by: "p2" }]);
  });

  it("ends the game when somebody else finishes", () => {
    relay.receive({ t: "end", from: "p2", reason: "the city is full" });

    expect(sheet.eval("G.over")).toBe(true);
    expect(sheet.eval("MP.endedBy")).toBe("p2");
    expect(sheet.eval("G.why")).toContain("Grace");
  });

  it("records another player's final score", () => {
    relay.receive({ t: "final", from: "p2", name: "Grace", temp: 5, base: 71 });

    expect(sheet.json("MP.finals").p2).toEqual({ name: "Grace", temp: 5, base: 71 });
  });

  it("cannot rank the temp agency until everyone has reported", () => {
    sheet.eval("G.temp = 9");

    expect(sheet.eval("mpFinalsIn()")).toBe(false);
    expect(sheet.eval("tempPoints()")).toBe(0);
  });

  it("ignores a message type it does not know", () => {
    const before = sheet.json("MP");
    relay.receive({ t: "something-else", from: "p2" });

    expect(sheet.json("MP")).toEqual(before);
  });
});
