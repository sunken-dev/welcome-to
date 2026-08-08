import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadSheet, installFakeSocket } from "../harness.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const readRepoFile = (path) => readFileSync(resolve(ROOT, path), "utf8");

/**
 * Connecting to the relay, and coming apart from it again.
 *
 * The sheet's socket comes from `MP_SOCKET`, which production declares as a
 * `let` marked "replaced in tests". Nothing here modifies the sheet: the seam
 * is the one it already offers.
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
});

describe("the relay address", () => {
  it("is fixed rather than a setting, so nobody has to know an address", () => {
    expect(sheet.eval("EXCHANGE")).toBe("https://exchange.welcome-to.sunken.dev/");
  });

  it("is asked about before multiplayer is offered at all", () => {
    expect(sheet.json("exchangeInfo")).toEqual({
      asked: true,
      up: true,
      ms: expect.any(Number),
      version: "0.1.0",
    });
  });

  it("is dialled over a websocket on the same host", () => {
    sheet.call("mpConnect", "ABCD");

    expect(relay.url()).toBe("wss://exchange.welcome-to.sunken.dev/room/ABCD?name=Architect");
  });

  it("carries the player's name", () => {
    sheet.eval(`CFG.city = "Springfield";`);
    sheet.call("mpConnect", "ABCD");

    expect(relay.url()).toContain("?name=Springfield");
  });

  it("escapes a name that would otherwise break the query", () => {
    sheet.eval(`CFG.city = "A&B C";`);
    sheet.call("mpConnect", "ABCD");

    expect(relay.url()).toContain("?name=A%26B%20C");
  });
});

describe("room codes", () => {
  it("is uppercased, so a typo still meets your friend", () => {
    sheet.call("mpConnect", "abcd");

    expect(relay.url()).toContain("/room/ABCD");
    expect(sheet.eval("MP.room")).toBe("ABCD");
  });

  it("strips anything that is not a letter, a digit or a dash", () => {
    sheet.call("mpConnect", "ab cd!ef");

    expect(sheet.eval("MP.room")).toBe("ABCDEF");
  });

  it("is capped at sixteen characters, which is what the relay accepts", () => {
    sheet.call("mpConnect", "A".repeat(30));

    expect(sheet.eval("MP.room")).toHaveLength(16);
  });

  it("refuses a code shorter than four characters without dialling", () => {
    sheet.call("mpConnect", "AB");

    expect(sheet.eval("MP.error")).toBe("Room codes need at least four characters.");
    expect(relay.count()).toBe(0);
  });
});

describe("the handshake", () => {
  it("is not connected until the socket opens", () => {
    sheet.call("mpConnect", "ABCD");

    expect(sheet.eval("MP.status")).toBe("connecting");
    expect(sheet.eval("MP.on")).toBe(false);
  });

  it("reaches the lobby when the socket opens", () => {
    sheet.call("mpConnect", "ABCD");
    relay.open();

    expect(sheet.eval("MP.on")).toBe(true);
    expect(sheet.eval("MP.status")).toBe("lobby");
    expect(sheet.eval("MP.error")).toBe("");
  });

  it("switches a solo sheet to the standard turn, because multiplayer is never solo", () => {
    sheet.eval(`CFG.mode = "solo"; newGame();`);
    sheet.call("mpConnect", "ABCD");
    relay.open();

    expect(sheet.eval("CFG.mode")).toBe("standard");
  });

  it("reports a socket that will not open at all", () => {
    sheet.eval(`MP_SOCKET = () => { throw new Error("refused"); };`);
    sheet.call("mpConnect", "ABCD");

    expect(sheet.eval("MP.status")).toBe("offline");
    expect(sheet.eval("MP.error")).toBe("Could not open a connection.");
  });

  it("notices when the connection is lost", () => {
    sheet.call("mpConnect", "ABCD");
    relay.open();
    relay.drop();

    expect(sheet.eval("MP.status")).toBe("lost");
    expect(sheet.eval("MP.error")).toBe("Connection closed.");
  });
});

describe("leaving", () => {
  it("puts every trace of the session back", () => {
    sheet.call("mpConnect", "ABCD");
    relay.open();
    relay.receive({ t: "welcome", you: "p1", setup: null });
    relay.receive({ t: "roster", players: [{ id: "p1", name: "Ada" }] });

    sheet.call("mpDisconnect", true);

    expect(sheet.json("MP")).toMatchObject({
      on: false,
      me: null,
      players: [],
      participants: [],
      ready: {},
      claims: [],
      finals: {},
      status: "offline",
      inProgress: false,
    });
  });

  it("does not treat its own closing as a lost connection", () => {
    sheet.call("mpConnect", "ABCD");
    relay.open();
    sheet.call("mpDisconnect", true);

    expect(sheet.eval("MP.status")).toBe("offline");
  });

  it("drops the old socket before dialling a new room", () => {
    sheet.call("mpConnect", "ABCD");
    relay.open();
    sheet.call("mpConnect", "EFGH");

    expect(relay.count()).toBe(2);
    expect(relay.url()).toContain("/room/EFGH");
  });
});

describe("sending", () => {
  it("says nothing down a socket that is not open", () => {
    sheet.call("mpConnect", "ABCD");

    sheet.call("mpSend", { t: "ready", round: 1 });

    expect(relay.sent()).toHaveLength(0);
  });

  it("speaks once the socket is open", () => {
    sheet.call("mpConnect", "ABCD");
    relay.open();

    sheet.call("mpSend", { t: "ready", round: 1 });

    expect(relay.sent()).toEqual([{ t: "ready", round: 1 }]);
  });
});

describe("the switch itself", () => {
  it("is off, so the sheet offers no multiplayer buttons yet", () => {
    expect(sheet.eval("MP_ENABLED")).toBe(false);
  });
});

/**
 * The relay's address is written down in three places that cannot see each
 * other: the sheet dials it, wrangler deploys to it, and the workflow links to
 * it from the Actions tab. They are compared here rather than derived from one
 * another, so a change to any one of them fails loudly instead of leaving the
 * sheet talking to an address nothing answers on.
 */
describe("one address, written three times", () => {
  it("is the custom domain the Worker is deployed to", () => {
    const config = readRepoFile("backend/wrangler.jsonc");
    const pattern = /"pattern"\s*:\s*"([^"]+)"/.exec(config)?.[1];

    expect(pattern).toBeTruthy();
    expect(sheet.eval("EXCHANGE")).toBe(`https://${pattern}/`);
  });

  it("is the address the deploy workflow links to", () => {
    const workflow = readRepoFile(".github/workflows/deploy-backend.yml");

    expect(workflow).toContain(`url: ${sheet.eval("EXCHANGE")}`);
  });

  it("is dialled over a websocket on that same host", () => {
    const config = readRepoFile("backend/wrangler.jsonc");
    const pattern = /"pattern"\s*:\s*"([^"]+)"/.exec(config)[1];

    sheet.call("mpConnect", "ABCD");

    expect(relay.url()).toMatch(new RegExp(`^wss://${pattern.replace(/\./g, "\\.")}/room/`));
  });
});
