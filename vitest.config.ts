import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // Automatic JSX runtime for .tsx tests (replaces @vitejs/plugin-react,
  // which would force a Vite major-version conflict with vitest 2.1).
  esbuild: {
    jsx: "automatic",
  },
  test: {
    // Single project (vitest 2.1 `projects` handling is unreliable here).
    // jsdom for the component/hook/lib tests; the backend API tests
    // are DOM-independent pure logic and run fine in the same environment.
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
    ],
  },
});
