import { describe, it, expect } from "vitest";
import { env, runInDurableObject } from "cloudflare:test";
import { connect, connectAll, freshCode } from "../relay.js";

/**
 * What the room holds, and for how long.
 *
 * Nothing is written to disk by design -- the state under test is the live
 * Durable Object's: one instance per room code anywhere in the world, holding
 * the roster and the host's opening broadcast, and forgetting the latter as
 * soon as the room empties.
 */

describe("object identity", () => {
  it("routes one room code to one object", () => {
    const a = env.ROOM.idFromName("ABCD");
    const b = env.ROOM.idFromName("ABCD");

    expect(a.toString()).toBe(b.toString());
  });

  it("keeps different room codes apart", () => {
    const a = env.ROOM.idFromName("ABCD");
    const b = env.ROOM.idFromName("EFGH");

    expect(a.toString()).not.toBe(b.toString());
  });

  it("treats a room code case-insensitively, so a typo still meets your friend", async () => {
    // The Worker uppercases before deriving the id, so these are one room.
    const lower = await connect("caseroom", "lower");
    await lower.waitFor("welcome");

    const upper = await connect("CASEROOM", "upper");
    await upper.waitFor("welcome");

    const roster = await upper.waitFor((m) => m.t === "roster" && m.players.length === 2);
    expect(roster.players.map((p) => p.name)).toEqual(["lower", "upper"]);
  });

  it("does not leak a roster between two rooms", async () => {
    const here = await connect(freshCode(), "here");
    const there = await connect(freshCode(), "there");

    await here.waitFor("roster");
    await there.waitFor("roster");

    expect(here.latest("roster").players.map((p) => p.name)).toEqual(["here"]);
    expect(there.latest("roster").players.map((p) => p.name)).toEqual(["there"]);
  });
});

describe("the held setup", () => {
  it("is nothing until a host sends one", async () => {
    const player = await connect(freshCode(), "Ada");

    expect((await player.waitFor("welcome")).setup).toBeNull();
  });

  it("is replayed to a latecomer, so a reload is handed the seed again", async () => {
    const code = freshCode();
    const host = await connect(code, "host");
    await host.waitFor("welcome");

    host.send({ t: "setup", seed: "TESTSEED", mode: "standard", planIds: ["b1-111111"], planRoll: 0 });

    const latecomer = await connect(code, "late");
    const welcome = await latecomer.waitFor("welcome");

    expect(welcome.setup).toMatchObject({
      t: "setup",
      seed: "TESTSEED",
      mode: "standard",
      from: "p1",
    });
  });

  it("keeps only the most recent setup", async () => {
    const code = freshCode();
    const host = await connect(code, "host");
    await host.waitFor("welcome");

    host.send({ t: "setup", seed: "FIRST" });
    host.send({ t: "setup", seed: "SECOND" });

    const latecomer = await connect(code, "late");
    const welcome = await latecomer.waitFor("welcome");

    expect(welcome.setup.seed).toBe("SECOND");
  });

  it("is forwarded to the players already present as well as held", async () => {
    const code = freshCode();
    const [host, guest] = await connectAll(code, ["host", "guest"]);

    host.send({ t: "setup", seed: "SHARED" });

    expect((await guest.waitFor("setup")).seed).toBe("SHARED");
  });

  it("is forgotten once the room empties, so the next game starts clean", async () => {
    const code = freshCode();
    const host = await connect(code, "host");
    await host.waitFor("welcome");
    host.send({ t: "setup", seed: "GONE" });

    // Confirm it was held before emptying the room.
    const witness = await connect(code, "witness");
    expect((await witness.waitFor("welcome")).setup.seed).toBe("GONE");

    host.close();
    witness.close();
    await witness.quiet();

    const afterwards = await connect(code, "afterwards");
    expect((await afterwards.waitFor("welcome")).setup).toBeNull();
  });

  it("survives players coming and going while one remains", async () => {
    const code = freshCode();
    const [host, guest] = await connectAll(code, ["host", "guest"]);
    host.send({ t: "setup", seed: "KEPT" });
    await guest.waitFor("setup");

    guest.close();
    await host.waitFor((m) => m.t === "roster" && m.players.length === 1);

    const rejoining = await connect(code, "rejoining");
    expect((await rejoining.waitFor("welcome")).setup.seed).toBe("KEPT");
  });
});

describe("the roster", () => {
  it("is broadcast again whenever somebody joins", async () => {
    const code = freshCode();
    const first = await connect(code, "first");
    await first.waitFor("roster");

    const second = await connect(code, "second");
    await second.waitFor("welcome");

    const roster = await first.waitFor((m) => m.t === "roster" && m.players.length === 2);
    expect(roster.players.map((p) => p.name)).toEqual(["first", "second"]);
  });

  it("is broadcast again whenever somebody leaves", async () => {
    const code = freshCode();
    const [first, second] = await connectAll(code, ["first", "second"]);
    await first.waitFor((m) => m.t === "roster" && m.players.length === 2);

    second.close();

    const roster = await first.waitFor((m) => m.t === "roster" && m.players.length === 1);
    expect(roster.players.map((p) => p.name)).toEqual(["first"]);
  });

  it("promotes the next player to first place when the host leaves", async () => {
    const code = freshCode();
    const [host, guest] = await connectAll(code, ["host", "guest"]);
    await guest.waitFor((m) => m.t === "roster" && m.players.length === 2);

    host.close();

    const roster = await guest.waitFor((m) => m.t === "roster" && m.players.length === 1);
    expect(roster.players[0].name).toBe("guest");
  });

  it("never reuses an id within a room, even after somebody leaves", async () => {
    const code = freshCode();
    const first = await connect(code, "first");
    expect((await first.waitFor("welcome")).you).toBe("p1");

    first.close();
    await first.quiet();

    const second = await connect(code, "second");
    expect((await second.waitFor("welcome")).you).toBe("p2");
  });
});

describe("what is never written down", () => {
  it("holds the room in memory and writes nothing to durable storage", async () => {
    const code = freshCode();
    const host = await connect(code, "host");
    await host.waitFor("welcome");

    host.send({ t: "setup", seed: "TESTSEED" });
    host.send({ t: "final", name: "host", temp: 3, base: 64 });
    await host.quiet();

    const stub = env.ROOM.get(env.ROOM.idFromName(code.toUpperCase()));

    await runInDurableObject(stub, async (room, state) => {
      // The seed is held, so a latecomer can be handed it...
      expect(room.setup).toMatchObject({ t: "setup", seed: "TESTSEED" });
      expect(room.sockets.size).toBe(1);

      // ...but nothing about the game reached disk.
      const written = await state.storage.list();
      expect(written.size).toBe(0);
    });
  });

  it("leaves nothing behind after the last player goes", async () => {
    const code = freshCode();
    const host = await connect(code, "host");
    await host.waitFor("welcome");
    host.send({ t: "setup", seed: "TESTSEED" });
    await host.quiet();

    host.close();
    await host.quiet();

    const stub = env.ROOM.get(env.ROOM.idFromName(code.toUpperCase()));

    await runInDurableObject(stub, async (room, state) => {
      expect(room.setup).toBeNull();
      expect(room.sockets.size).toBe(0);
      expect((await state.storage.list()).size).toBe(0);
    });
  });
});
