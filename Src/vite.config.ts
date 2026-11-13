import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths so the build works from any sub-path on a static host.
  base: "./",
  build: {
    target: "es2022",
  },
});
