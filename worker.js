const VERSION = "0.1.0";

/**
 * exchange 0.1.0
 * the multiplayer server for Welcome To, at https://exchange.welcome-to.sunken.dev/
 *
 * ---------------------------------------------------------------------------
 * PASTING THIS IN BY HAND
 *
 * This is one file, but it needs a Durable Object, so pasting is not quite the
 * whole job. In the dashboard:
 *
 *   1. Workers & Pages -> Create -> Worker. Name it `exchange`. Paste this in
 *      and deploy once; the first deploy will complain about the binding, which
 *      is expected.
 *   2. Settings -> Bindings -> add a Durable Object binding.
 *        Variable name:  ROOM
 *        Class name:     Room
 *      Saving it creates the migration for you.
 *   3. Settings -> Domains & Routes -> add a custom domain:
 *        exchange.welcome-to.sunken.dev
 *   4. Settings -> Domains & Routes -> disable the workers.dev route. A custom
 *      domain does not remove it, and leaving it on keeps this server reachable
 *      at a second address that says who runs it.
 *
 * Then https://exchange.welcome-to.sunken.dev/ should answer
 * {"ok":true,"version":"0.1.0"} and the sheet will offer multiplayer.
 * ---------------------------------------------------------------------------
 *
 * WHAT IT DOES
 *
 * A room is a Durable Object: exactly one instance per room code, anywhere in the
 * world, which is what a game room needs. It forwards messages between the players
 * in that room and keeps the roster.
 *
 * It knows nothing about Welcome To. No rules, no cards, no scores. Each sheet
 * derives the deck from the seed, so the only things crossing this server are the
 * seed, who is ready, which plan somebody claimed, and the final totals. Nothing is
 * written to disk and an empty room forgets itself.
 *
 * THE PROTOCOL, as the sheet expects it
 *
 *   connect   wss://.../room/CODE?name=Architect
 *   ->  welcome  { you, setup }      the id you have been given, and the host's
 *                                    opening broadcast if the game is under way
 *   ->  roster   { players:[{id,name}] }   join order matters: first is the host
 *   <>  setup, ready, plan, end, final     forwarded to everyone else, with `from`
 *                                          stamped by this server so nobody can
 *                                          claim to be somebody else
 *
 * GET / or /health  ->  {"ok":true,"version":"0.1.0"}
 */


/**
 * welcome-to relay
 *
 * A room is a Durable Object: exactly one instance per room code, anywhere in
 * the world, which is precisely what a game room needs. It forwards messages
 * between the players in that room and keeps the roster. It knows nothing about
 * Welcome To — no rules, no cards, no scores. The deck is derived from the seed
 * on each client, so nothing about the game state passes through here.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MAX_PLAYERS = 6;
const MAX_MESSAGE = 4096;      // the protocol sends a few dozen bytes per round

export class Room {
  constructor(state) {
    this.state = state;
    this.sockets = new Set();
    this.setup = null;           // the host's opening broadcast, replayed to latecomers
    this.seq = 0;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected a websocket upgrade", { status: 426, headers: CORS });
    }
    if (this.sockets.size >= MAX_PLAYERS) {
      return new Response("room is full", { status: 409, headers: CORS });
    }
    const name = new URL(request.url).searchParams.get("name") || "Architect";
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.join(server, name);
    return new Response(null, { status: 101, webSocket: client });
  }

  join(ws, name) {
    ws.accept();
    ws.meta = { id: "p" + (++this.seq), name: String(name).slice(0, 24) };
    this.sockets.add(ws);

    this.sendTo(ws, { t: "welcome", you: ws.meta.id, setup: this.setup });
    this.roster();

    ws.addEventListener("message", (ev) => {
      if (typeof ev.data !== "string" || ev.data.length > MAX_MESSAGE) return;
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (!msg || typeof msg !== "object" || typeof msg.t !== "string") return;

      // The sender is stamped by the relay so a client cannot claim to be someone else.
      msg.from = ws.meta.id;

      if (msg.t === "name") {
        ws.meta.name = String(msg.name || "").slice(0, 24) || "Architect";
        this.roster();
        return;
      }
      // Held so that a player who reloads mid-game can be handed the seed again.
      if (msg.t === "setup") this.setup = msg;

      this.broadcast(msg, ws);
    });

    const leave = () => {
      this.sockets.delete(ws);
      if (this.sockets.size === 0) this.setup = null;   // empty room forgets itself
      this.roster();
    };
    ws.addEventListener("close", leave);
    ws.addEventListener("error", leave);
  }

  roster() {
    // Join order is meaningful: the client treats the first player as the host.
    const players = [...this.sockets].map((s) => s.meta);
    this.broadcast({ t: "roster", players });
  }

  sendTo(ws, obj) {
    try { ws.send(JSON.stringify(obj)); } catch { this.sockets.delete(ws); }
  }

  broadcast(obj, except) {
    const payload = JSON.stringify(obj);
    for (const s of this.sockets) {
      if (s === except) continue;
      try { s.send(payload); } catch { this.sockets.delete(s); }
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    // What the sheet asks before offering multiplayer at all. Says nothing about what
    // runs it: a version and a yes, and no more.
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, version: VERSION }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const match = url.pathname.match(/^\/room\/([A-Za-z0-9-]{4,16})$/);
    if (!match) return new Response("not found", { status: 404, headers: CORS });

    // Same code, same object, regardless of which edge location either player hits.
    const code = match[1].toUpperCase();
    const id = env.ROOM.idFromName(code);
    return env.ROOM.get(id).fetch(request);
  },
};