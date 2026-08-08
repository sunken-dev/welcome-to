import { defineProject } from "vitest/config";

/**
 * `environment: "node"` is deliberate. The harness builds its own JSDOM so it
 * can install a fetch stub in `beforeParse`, before the sheet's inline script
 * runs; Vitest's own jsdom environment gives no such hook and no way to have
 * the document's scripts executed.
 */
export default defineProject({
  test: {
    name: "frontend",
    environment: "node",
    include: [
      "game-logic/**/*.test.js",
      "gui/**/*.test.js",
      "multiplayer/**/*.test.js",
    ],
  },
});
