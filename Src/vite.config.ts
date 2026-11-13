import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative asset paths so the build works from any sub-path on a static host.
  base: "./",
  build: {
    target: "es2022",
  },
  test: {
    // Unit tests cover pure modules only, so they run in Node without a DOM.
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
