import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Unit tests live in **/__tests__/*.spec.ts
    include: ['src/**/__tests__/**/*.spec.ts'],
    // Smokes are NOT run via vitest (they're integration + side-effectful).
    exclude: [
      'node_modules',
      'dist',
      'src/smoke.ts',
      'src/smoke-mcp.ts',
      'src/smoke-mcp-cf.ts',
    ],
    environment: 'node',
    // Everything we port from CC is sync/pure — no mocks needed.
    // TextEncoder / TextDecoder / crypto.subtle are all available in node >= 20.
  },
})
