import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

/**
 * What the sheet asks before it offers multiplayer at all. The contract is
 * deliberately small: a version and a yes, from two paths, with CORS open
 * because the sheet is served from a different origin.
 */

describe("health endpoint", () => {
  it("answers on /", async () => {
    const res = await SELF.fetch("https://exchange.example.com/");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: "0.1.0" });
  });

  it("answers the same on /health", async () => {
    const res = await SELF.fetch("https://exchange.example.com/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: "0.1.0" });
  });

  it("declares itself as JSON", async () => {
    const res = await SELF.fetch("https://exchange.example.com/health");

    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  it("allows the sheet's origin to read the answer", async () => {
    const res = await SELF.fetch("https://exchange.example.com/health");

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("preflight", () => {
  it("answers OPTIONS with the CORS contract and no body", async () => {
    const res = await SELF.fetch("https://exchange.example.com/", { method: "OPTIONS" });

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    expect(await res.text()).toBe("");
  });

  it("answers preflight on any path, room codes included", async () => {
    const res = await SELF.fetch("https://exchange.example.com/room/ABCD", { method: "OPTIONS" });

    expect(res.status).toBe(200);
  });
});

describe("unknown paths", () => {
  it("gives 404 with CORS still attached", async () => {
    const res = await SELF.fetch("https://exchange.example.com/nope");

    expect(res.status).toBe(404);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it.each([
    ["too short", "/room/ABC"],
    ["too long", "/room/" + "A".repeat(17)],
    ["illegal characters", "/room/AB_D"],
    ["a nested path", "/room/ABCD/extra"],
    ["the bare prefix", "/room/"],
  ])("rejects a room code that is %s", async (_label, path) => {
    const res = await SELF.fetch("https://exchange.example.com" + path);

    expect(res.status).toBe(404);
  });
});
