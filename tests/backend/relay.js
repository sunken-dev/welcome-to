import { SELF } from "cloudflare:test";

/**
 * Drives the relay the way the sheet does: a real WebSocket upgrade through the
 * Worker, into the real Durable Object.
 *
 * Every test takes a fresh room code. A Durable Object is keyed by name and
 * outlives a single test, so reusing codes would let one test's roster leak
 * into the next.
 */

const ORIGIN = "https://exchange.example.com";

let counter = 0;

/** A room code no other test has used. */
export function freshCode(prefix = "ROOM") {
  counter += 1;
  return (prefix + counter).toUpperCase().slice(0, 16);
}

export function roomUrl(code, name) {
  const query = name === undefined ? "" : "?name=" + encodeURIComponent(name);
  return `${ORIGIN}/room/${code}${query}`;
}

/** Attempt an upgrade without accepting it, for the cases that must be refused. */
export function rawConnect(code, name) {
  return SELF.fetch(roomUrl(code, name), { headers: { Upgrade: "websocket" } });
}

/**
 * Join a room and start collecting what the relay says.
 *
 * @returns a handle whose `messages` array grows in arrival order, with
 *          `waitFor` to await a specific message rather than guessing at timing.
 */
export async function connect(code, name) {
  const res = await rawConnect(code, name);
  if (res.status !== 101) {
    throw new Error(`upgrade refused with ${res.status}: ${await res.text()}`);
  }

  const ws = res.webSocket;
  const messages = [];
  const waiters = [];

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    messages.push(msg);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].match(msg)) {
        waiters[i].resolve(msg);
        waiters.splice(i, 1);
      }
    }
  });

  ws.accept();

  return {
    ws,
    messages,

    send(obj) {
      ws.send(JSON.stringify(obj));
    },

    /** Send something the protocol does not allow, exactly as written. */
    sendRaw(data) {
      ws.send(data);
    },

    close() {
      ws.close();
    },

    /** Every message of one type, oldest first. */
    ofType(type) {
      return messages.filter((m) => m.t === type);
    },

    /** The most recent message of one type, or undefined. */
    latest(type) {
      return messages.filter((m) => m.t === type).pop();
    },

    /**
     * Resolve once a message satisfying `match` has arrived. Messages already
     * received count, so there is no race against a message that beat the call.
     */
    waitFor(match, { timeout = 1000 } = {}) {
      const predicate = typeof match === "string" ? (m) => m.t === match : match;
      const already = messages.find(predicate);
      if (already) return Promise.resolve(already);

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const seen = messages.map((m) => m.t).join(", ") || "nothing";
          reject(new Error(`waited too long; received: ${seen}`));
        }, timeout);

        waiters.push({
          match: predicate,
          resolve: (msg) => {
            clearTimeout(timer);
            resolve(msg);
          },
        });
      });
    },

    /**
     * Let pending traffic arrive. Used only to assert that something did *not*
     * turn up; prefer `waitFor` everywhere else.
     */
    async quiet(ticks = 5) {
      for (let i = 0; i < ticks; i++) await new Promise((r) => setTimeout(r, 0));
      return messages;
    },
  };
}

/** Join a room `count` times, in order, awaiting each welcome. */
export async function connectAll(code, names) {
  const players = [];
  for (const name of names) {
    const player = await connect(code, name);
    await player.waitFor("welcome");
    players.push(player);
  }
  return players;
}
