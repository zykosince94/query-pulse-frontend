import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { backend, server } from "./fake-backend";

// jsdom doesn't implement scrolling; the router's scroll restoration calls it.
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

// Fail loudly on any request the fake backend doesn't handle.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  backend.reset();
});
afterAll(() => server.close());
