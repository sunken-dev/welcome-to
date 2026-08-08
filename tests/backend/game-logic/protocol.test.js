import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";
import { connect, connectAll, rawConnect, freshCode } from "../relay.js";

/**
 * The relay knows nothing about Welcome To -- no rules, no cards, no scores. Its
 * logic is entirely the room protocol: who is in, who is host, that a message
 * cannot lie about who sent it, and that a latecomer is handed the seed.
 */

describe("joining", () => {
  it("greets a player with the id it has given them", async () => {
    const player = await connect(freshCode(), "Ada");
    const welcome = await player.waitFor("welcome");

    expect(welcome.you).toBe("p1");
    expect(welcome.setup).toBeNull();
  });

  it("hands out a distinct id per player", async () => {
    const code = freshCode();
    const [first, second] = await connectAll(code, ["Ada", "Grace"]);

    expect((await first.waitFor("welcome")).you).toBe("p1");
    expect((await second.waitFor("welcome")).you).toBe("p2");
  });

  it("puts the first joiner first, because the sheet treats that as the host", async () => {
    const code = freshCode();
    const [first, second] = await connectAll(code, ["Ada", "Grace"]);

    const roster = await second.waitFor((m) => m.t === "roster" && m.players.length === 2);

    expect(roster.players.map((p) => p.name)).toEqual(["Ada", "Grace"]);
    expect(roster.players[0].id).toBe("p1");
    void first;
  });

  it("falls back to Architect when no name is offered", async () => {
    const player = await connect(freshCode());
    const roster = await player.waitFor("roster");

    expect(roster.players[0].name).toBe("Architect");
  });

  it("truncates a long name to 24 characters", async () => {
    const player = await connect(freshCode(), "x".repeat(50));
    const roster = await player.waitFor("roster");

    expect(roster.players[0].name).toHaveLength(24);
  });

  it("refuses anything that is not a websocket upgrade", async () => {
    const res = await SELF.fetch(`https://exchange.example.com/room/${freshCode()}`);

    expect(res.status).toBe(426);
    expect(await res.text()).toBe("expected a websocket upgrade");
  });

  it("uppercases the room code so one room is one object", async () => {
    // Covered end to end in the storage suite; here only that both are accepted.
    const res = await rawConnect("mIxEd1");

    expect(res.status).toBe(101);
    res.webSocket.accept();
    res.webSocket.close();
  });
});

describe("room capacity", () => {
  it("admits six players", async () => {
    const code = freshCode();
    const names = ["a", "b", "c", "d", "e", "f"];
    const players = await connectAll(code, names);

    const roster = await players[5].waitFor((m) => m.t === "roster" && m.players.length === 6);
    expect(roster.players).toHaveLength(6);
  });

  it("turns the seventh away rather than silently dropping them", async () => {
    const code = freshCode();
    await connectAll(code, ["a", "b", "c", "d", "e", "f"]);

    const res = await rawConnect(code, "g");

    expect(res.status).toBe(409);
    expect(await res.text()).toBe("room is full");
  });

  it("frees the place again when somebody leaves", async () => {
    const code = freshCode();
    const players = await connectAll(code, ["a", "b", "c", "d", "e", "f"]);

    players[0].close();
    await players[1].waitFor((m) => m.t === "roster" && m.players.length === 5);

    const res = await rawConnect(code, "g");
    expect(res.status).toBe(101);
    res.webSocket.accept();
    res.webSocket.close();
  });
});

describe("forwarding", () => {
  it("stamps the sender so nobody can claim to be somebody else", async () => {
    const code = freshCode();
    const [ada, grace] = await connectAll(code, ["Ada", "Grace"]);

    ada.send({ t: "ready", round: 1, from: "p2" });

    const received = await grace.waitFor("ready");
    expect(received.from).toBe("p1");
  });

  it("does not echo a message back to its sender", async () => {
    const code = freshCode();
    const [ada, grace] = await connectAll(code, ["Ada", "Grace"]);

    ada.send({ t: "ready", round: 1 });
    await grace.waitFor("ready");

    await ada.quiet();
    expect(ada.ofType("ready")).toHaveLength(0);
  });

  it("reaches every other player in the room", async () => {
    const code = freshCode();
    const [ada, grace, edsger] = await connectAll(code, ["Ada", "Grace", "Edsger"]);

    ada.send({ t: "plan", planId: "b1-111111", round: 3 });

    expect((await grace.waitFor("plan")).planId).toBe("b1-111111");
    expect((await edsger.waitFor("plan")).planId).toBe("b1-111111");
  });

  it("carries the protocol's own message types unchanged", async () => {
    const code = freshCode();
    const [ada, grace] = await connectAll(code, ["Ada", "Grace"]);

    ada.send({ t: "final", name: "Ada", temp: 4, base: 71 });

    const received = await grace.waitFor("final");
    expect(received).toMatchObject({ t: "final", name: "Ada", temp: 4, base: 71, from: "p1" });
  });
});

describe("renaming", () => {
  it("updates the roster and is not forwarded as a message", async () => {
    const code = freshCode();
    const [ada, grace] = await connectAll(code, ["Ada", "Grace"]);

    ada.send({ t: "name", name: "Ada Lovelace" });

    const roster = await grace.waitFor(
      (m) => m.t === "roster" && m.players.some((p) => p.name === "Ada Lovelace"),
    );

    expect(roster.players[0].name).toBe("Ada Lovelace");
    expect(grace.ofType("name")).toHaveLength(0);
  });

  it("falls back to Architect when the new name is empty", async () => {
    const code = freshCode();
    const [ada, grace] = await connectAll(code, ["Ada", "Grace"]);

    ada.send({ t: "name", name: "" });

    const roster = await grace.waitFor(
      (m) => m.t === "roster" && m.players[0].name === "Architect",
    );
    expect(roster.players[0].name).toBe("Architect");
  });

  it("truncates a long new name to 24 characters", async () => {
    const code = freshCode();
    const [ada, grace] = await connectAll(code, ["Ada", "Grace"]);

    ada.send({ t: "name", name: "y".repeat(40) });

    const roster = await grace.waitFor(
      (m) => m.t === "roster" && m.players[0].name !== "Ada",
    );
    expect(roster.players[0].name).toHaveLength(24);
  });
});

describe("what the relay refuses to pass on", () => {
  it("ignores malformed JSON", async () => {
    const code = freshCode();
    const [ada, grace] = await connectAll(code, ["Ada", "Grace"]);

    ada.sendRaw("{not json");
    ada.send({ t: "ready", round: 1 });

    // The valid message that follows still arrives, so the bad one was dropped
    // rather than breaking the connection.
    await grace.waitFor("ready");
    expect(grace.messages.filter((m) => m.t === undefined)).toHaveLength(0);
  });

  it("ignores a message with no type", async () => {
    const code = freshCode();
    const [ada, grace] = await connectAll(code, ["Ada", "Grace"]);

    ada.sendRaw(JSON.stringify({ hello: "there" }));
    ada.send({ t: "ready", round: 1 });

    await grace.waitFor("ready");
    expect(grace.messages.every((m) => typeof m.t === "string")).toBe(true);
  });

  it("ignores JSON that is not an object", async () => {
    const code = freshCode();
    const [ada, grace] = await connectAll(code, ["Ada", "Grace"]);

    ada.sendRaw(JSON.stringify(["ready", 1]));
    ada.sendRaw(JSON.stringify(null));
    ada.send({ t: "ready", round: 1 });

    await grace.waitFor("ready");
    expect(grace.ofType("ready")).toHaveLength(1);
  });

  it("drops anything over the 4096-byte ceiling", async () => {
    const code = freshCode();
    const [ada, grace] = await connectAll(code, ["Ada", "Grace"]);

    ada.sendRaw(JSON.stringify({ t: "setup", padding: "z".repeat(5000) }));
    ada.send({ t: "ready", round: 1 });

    await grace.waitFor("ready");
    expect(grace.ofType("setup")).toHaveLength(0);
  });

  it("passes a message that sits just under the ceiling", async () => {
    const code = freshCode();
    const [ada, grace] = await connectAll(code, ["Ada", "Grace"]);

    const padding = "z".repeat(4000);
    ada.sendRaw(JSON.stringify({ t: "plan", padding }));

    const received = await grace.waitFor("plan");
    expect(received.padding).toHaveLength(4000);
  });
});
