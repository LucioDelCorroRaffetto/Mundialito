import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Root (frontend) test config. The previous `test` script pointed at this
// file but it did not exist, so `npm test` failed outright. jsdom + the React
// plugin let component/hook tests run; `passWithNoTests` keeps the command
// green until the first front-end test lands. API tests live under
// packages/api and run via `npm test` inside that package.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
  },
});
