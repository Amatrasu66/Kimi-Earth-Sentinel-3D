import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// testing-library's auto-cleanup relies on a global afterEach, which
// vitest only provides with globals:true — register it explicitly so
// renders and window listeners never leak between tests.
afterEach(() => {
  cleanup();
});
