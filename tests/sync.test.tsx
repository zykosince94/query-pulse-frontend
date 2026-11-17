import { onlineManager } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import { delay, HttpResponse, http } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { ago } from "@/features/shell/SyncIndicator";
import { ADMIN_USER, backend, server } from "./fake-backend";
import { renderApp } from "./render-app";

afterEach(() => onlineManager.setOnline(true));

const pill = () => document.querySelector<HTMLButtonElement>("[data-sync]");

describe("ago", () => {
  it("reads naturally and never goes negative", () => {
    expect(ago(-5000)).toBe("just now");
    expect(ago(2_000)).toBe("just now");
    expect(ago(12_000)).toBe("12 s ago");
    expect(ago(3 * 60_000)).toBe("3 min ago");
    expect(ago(2 * 3600_000)).toBe("2 h ago");
  });
});

describe("the polling indicator", () => {
  it("shows that it is updating, then that the data is live", async () => {
    backend.session = ADMIN_USER;
    server.use(
      http.get("/api/findings", async () => {
        await delay(150);
        return HttpResponse.json({
          findings: [],
          counts: { open: 0, dismissed: 0, resolved: 0 },
        });
      }),
    );
    renderApp("/findings");
    expect(await screen.findByText("Updating…")).toBeInTheDocument();
    expect(pill()).toHaveAttribute("data-sync", "updating");
    expect(await screen.findByText(/^Live · updated/, {}, { timeout: 4000 })).toBeInTheDocument();
    expect(pill()).toHaveAttribute("data-sync", "live");
  });

  it("refreshes right away when clicked", async () => {
    backend.session = ADMIN_USER;
    let requests = 0;
    server.use(
      http.get("/api/findings", () => {
        requests += 1;
        return HttpResponse.json({ findings: [], counts: { open: 0, dismissed: 0, resolved: 0 } });
      }),
    );
    const { user } = renderApp("/findings");
    await screen.findByText(/^Live/, {}, { timeout: 4000 });
    const before = requests;
    await user.click(screen.getByTitle("Refresh now"));
    await waitFor(() => expect(requests).toBeGreaterThan(before));
  });

  it("says so when updates fail, and recovers when they work again", async () => {
    backend.session = ADMIN_USER;
    server.use(
      http.get("/api/findings", () => HttpResponse.json({ detail: "Boom" }, { status: 400 })),
    );
    const { user } = renderApp("/findings");
    expect(await screen.findByText("Couldn't update · retry")).toBeInTheDocument();
    expect(pill()).toHaveAttribute("data-sync", "failing");

    server.resetHandlers();
    await user.click(screen.getByTitle("Refresh now"));
    expect(await screen.findByText(/^Live/, {}, { timeout: 4000 })).toBeInTheDocument();
  });

  it("says when the browser is offline", async () => {
    backend.session = ADMIN_USER;
    renderApp("/findings");
    await screen.findByText(/^Live/, {}, { timeout: 4000 });
    act(() => onlineManager.setOnline(false));
    expect(await screen.findByText("Offline · updates paused")).toBeInTheDocument();
    expect(pill()).toHaveAttribute("data-sync", "offline");
    act(() => onlineManager.setOnline(true));
    expect(await screen.findByText(/^Live|Updating/, {}, { timeout: 4000 })).toBeInTheDocument();
  });

  it("isn't shown on the sign-in screen", async () => {
    renderApp("/");
    await screen.findByRole("button", { name: "Sign in" });
    expect(pill()).toBeNull();
  });
});
