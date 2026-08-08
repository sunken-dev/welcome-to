import { defineProject } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

/**
 * The relay's tests run in workerd, against the real Durable Object, driven
 * from the production wrangler config so the bindings and migrations under test
 * are the ones that ship.
 */
export default defineProject({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "../../backend/wrangler.jsonc" },
    }),
  ],
  test: {
    name: "backend",
    include: [
      "game-logic/**/*.test.js",
      "health/**/*.test.js",
      "storage/**/*.test.js",
    ],
  },
});
