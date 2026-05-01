import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // Root project tests only — packages/huozi-cloud has its own vitest
    // setup and its tests get exercised from that package's `pnpm test`.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
