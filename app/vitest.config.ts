import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// Test-only Vite config: intentionally separate from vite.config.ts so the
// dev/build plugin chain (inspectAttr, base './') never affects tests.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Threads pool: reliable on Windows paths containing spaces where the
    // default forks pool intermittently fails to spawn workers.
    pool: "threads",
    maxWorkers: 2,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
