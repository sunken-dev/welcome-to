/**
 * Loads frontend/index.html into jsdom and hands back a handle on the running
 * sheet.
 *
 * The sheet is one classic <script> with no exports and no assignments to
 * `window`, so its ~310 top-level bindings are reachable only from inside its
 * own realm. `window.eval` is an indirect eval, which runs in global scope and
 * therefore resolves the global lexical environment where the sheet's `const`
 * and `let` declarations live. That is the whole trick: nothing here requires
 * the sheet to be modified.
 *
 * Two rules for anything built on this:
 *
 *   - Read structured data through `json()`, not `eval()`. Values returned by
 *     `eval()` are built by jsdom's realm, so `instanceof` and prototype checks
 *     against this realm's globals do not hold. `json()` round-trips through a
 *     string and yields plain data belonging to the caller.
 *   - Call `close()` when finished. The sheet installs `setInterval(tickClock,
 *     500)` at load, which keeps the event loop alive until the window is shut.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { JSDOM } from "jsdom";

const HERE = dirname(fileURLToPath(import.meta.url));

export const SHEET_PATH = resolve(HERE, "../../frontend/index.html");

const SHEET_HTML = readFileSync(SHEET_PATH, "utf8");

/** What the relay answers when the sheet asks, unless a test says otherwise. */
export const EXCHANGE_UP = { ok: true, version: "0.1.0" };

/**
 * @param {object}  [opts]
 * @param {string}  [opts.url]       page URL; the fragment carries a shared setup
 * @param {object|null} [opts.exchange]  relay health payload, or null to make the
 *                                       probe fail the way an absent relay would
 */
export async function loadSheet(opts = {}) {
  const { url = "https://welcome-to.sunken.dev/", exchange = EXCHANGE_UP } = opts;

  const fetches = [];

  const dom = new JSDOM(SHEET_HTML, {
    runScripts: "dangerously",
    url,
    beforeParse(window) {
      // Installed before the sheet parses, so its startup probe never reaches
      // the network. The sheet asks exactly once, a tick after load.
      window.fetch = (target, init) => {
        fetches.push({ url: String(target), init });
        if (exchange === null) return Promise.reject(new Error("offline"));
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(exchange),
        });
      };
    },
  });

  const win = dom.window;

  /** Evaluate inside the sheet's realm. Returns that realm's values. */
  const evaluate = (code) => win.eval(code);

  /** Evaluate and bring the result back as plain data belonging to this realm. */
  const json = (code) => {
    const encoded = win.eval(`JSON.stringify(${code})`);
    return encoded === undefined ? undefined : JSON.parse(encoded);
  };

  /** Call one of the sheet's functions with arguments from this realm. */
  const call = (fn, ...args) => {
    win.__testArgs = JSON.parse(JSON.stringify(args));
    return win.eval(`(${fn}).apply(null, window.__testArgs)`);
  };

  /** As `call`, but returns plain data. */
  const callJson = (fn, ...args) => {
    win.__testArgs = JSON.parse(JSON.stringify(args));
    const encoded = win.eval(`JSON.stringify((${fn}).apply(null, window.__testArgs))`);
    return encoded === undefined ? undefined : JSON.parse(encoded);
  };

  const sheet = {
    dom,
    window: win,
    document: win.document,
    fetches,
    eval: evaluate,
    json,
    call,
    callJson,

    /** Wait for the sheet's startup promises (load, the relay probe) to settle. */
    async settle() {
      for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    },

    /**
     * Put the sheet back to a freshly dealt state without reloading the file.
     * Restores the printed defaults, drops any multiplayer session, and deals a
     * new sheet from `seed` (a fixed seed by default, so tests are reproducible).
     */
    reset(seed = "TESTSEED") {
      win.eval(`
        CFG = copy(BASE);
        CFG.seed = ${JSON.stringify(seed)};
        MP.on = false; MP.ws = null; MP.me = null; MP.players = [];
        MP.participants = []; MP.ready = {}; MP.claims = []; MP.finals = {};
        MP.endedBy = null; MP.status = "offline"; MP.error = ""; MP.inProgress = false;
        pendingSeed = ""; pendingRoll = 0;
        resetClock();
        newGame();
      `);
    },

    /** The sheet's element lookup, returning a jsdom element or null. */
    $(id) {
      return win.document.getElementById(id);
    },

    close() {
      win.close();
    },
  };

  await sheet.settle();
  return sheet;
}

/**
 * A stand-in for the relay socket, installed over the sheet's `MP_SOCKET` seam
 * (which production already marks `/* replaced in tests *\/`). Messages the
 * sheet sends are collected; messages from the relay are pushed in by hand, so
 * a test drives both halves of the conversation.
 */
export function installFakeSocket(sheet) {
  sheet.eval(`
    globalThis.__mp = { sent: [], sockets: [], last: null };
    MP_SOCKET = (url) => {
      const ws = {
        url,
        readyState: 0,
        sent: [],
        closed: false,
        onopen: null, onmessage: null, onclose: null, onerror: null,
        send(data) {
          const parsed = JSON.parse(data);
          this.sent.push(parsed);
          globalThis.__mp.sent.push(parsed);
        },
        close() { this.closed = true; this.readyState = 3; },
      };
      globalThis.__mp.sockets.push(ws);
      globalThis.__mp.last = ws;
      return ws;
    };
  `);

  return {
    /** Everything the sheet has sent to the relay, oldest first. */
    sent: () => sheet.json("globalThis.__mp.sent"),
    /** Complete the handshake the way a real socket would. */
    open: () => sheet.eval(`__mp.last.readyState = 1; __mp.last.onopen && __mp.last.onopen();`),
    /** Deliver a message from the relay. */
    receive: (msg) =>
      sheet.eval(`__mp.last.onmessage && __mp.last.onmessage({ data: ${JSON.stringify(JSON.stringify(msg))} })`),
    /** Drop the connection the way a lost relay would. */
    drop: () => sheet.eval(`__mp.last.readyState = 3; __mp.last.onclose && __mp.last.onclose();`),
    url: () => sheet.eval("__mp.last.url"),
    count: () => sheet.eval("__mp.sockets.length"),
  };
}
