import { defineConfig } from 'vitest/config';

// Tests for the API package run in a Node environment (no DOM). They cover
// the pure business-logic helpers (scoring, fantasy scoring, lock windows,
// fantasy rounds, levels, FIFA parser helpers) — no DB or network. The
// vitest binary is hoisted from the repo root node_modules, so `npm test`
// here works without a separate install.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
