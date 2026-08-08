import { defineConfig } from "vitest/config";

/**
 * Two projects, because the halves need different runtimes: the sheet runs in
 * jsdom under Node, the relay runs in workerd. Neither project's files are part
 * of a deployment -- Pages publishes only frontend/, and `wrangler deploy`
 * bundles only what backend/worker.js reaches.
 */
export default defineConfig({
  test: {
    projects: [
      "tests/frontend/vitest.config.js",
      "tests/backend/vitest.config.js",
    ],
  },
});
