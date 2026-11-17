import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY, setTheme } from "@/features/theme/theme";
import { ADMIN_USER, backend, DEMO_USER } from "./fake-backend";
import { renderApp } from "./render-app";

const html = document.documentElement;

/** Node 24 ships its own half-working localStorage that hides jsdom's: use a plain one. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  backend.session = ADMIN_USER;
  setTheme({ mode: "light", palette: "pulse" });
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  html.classList.remove("dark");
  delete html.dataset.palette;
});

describe("where the controls live", () => {
  it("are in Settings, not in the top bar", async () => {
    renderApp("/findings");
    await screen.findByRole("heading", { level: 1, name: "Findings" });
    expect(screen.queryByRole("radio", { name: /Dark/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Colour theme" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Switch to/ })).not.toBeInTheDocument();
  });

  it("are open to the read-only demo user too, since they only affect this browser", async () => {
    backend.session = DEMO_USER;
    const { user } = renderApp("/settings");
    await user.click(await screen.findByRole("radio", { name: /Dark/ }));
    expect(html).toHaveClass("dark");
  });
});

describe("light and dark mode", () => {
  it("switches and remembers the choice", async () => {
    const { user } = renderApp("/settings");
    expect(await screen.findByRole("radio", { name: /Light/ })).toBeChecked();
    expect(html).not.toHaveClass("dark");

    await user.click(screen.getByRole("radio", { name: /Dark/ }));
    expect(html).toHaveClass("dark");
    expect(screen.getByRole("radio", { name: /Dark/ })).toBeChecked();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")).toMatchObject({ mode: "dark" });

    await user.click(screen.getByRole("radio", { name: /Light/ }));
    expect(html).not.toHaveClass("dark");
  });
});

describe("colour themes", () => {
  it("offers three, starts on Pulse and applies the one you pick", async () => {
    const { user } = renderApp("/settings");
    const group = await screen.findByRole("group", { name: "Colour theme" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(within(group).getByRole("radio", { name: /^Pulse/ })).toBeChecked();

    await user.click(within(group).getByRole("radio", { name: /^Lagoon/ }));
    expect(html.dataset.palette).toBe("lagoon");
    expect(within(group).getByRole("radio", { name: /^Lagoon/ })).toBeChecked();
    expect(within(group).getByRole("radio", { name: /^Pulse/ })).not.toBeChecked();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")).toMatchObject({
      palette: "lagoon",
    });
  });

  it("moves between themes with the arrow keys", async () => {
    const { user } = renderApp("/settings");
    (await screen.findByRole("radio", { name: /^Pulse/ })).focus();
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByRole("radio", { name: /^Lagoon/ })).toBeChecked();
    expect(html.dataset.palette).toBe("lagoon");
  });

  it("keeps the mode and the theme independent", async () => {
    const { user } = renderApp("/settings");
    await user.click(await screen.findByRole("radio", { name: /^Dusk/ }));
    await user.click(screen.getByRole("radio", { name: /Dark/ }));
    expect(html).toHaveClass("dark");
    expect(html.dataset.palette).toBe("dusk");
  });
});

describe("a saved or broken preference", () => {
  it("ignores junk in storage and falls back to the defaults", async () => {
    localStorage.setItem(STORAGE_KEY, '{"mode":"neon","palette":"<script>"}');
    vi.resetModules();
    const fresh = await import("@/features/theme/theme");
    expect(fresh.PALETTES.map((p) => p.id)).toEqual(["pulse", "lagoon", "dusk"]);
    expect(html.dataset.palette).toBe("pulse");
    expect(html).not.toHaveClass("dark");
  });

  it("restores what was saved", async () => {
    localStorage.setItem(STORAGE_KEY, '{"mode":"dark","palette":"dusk"}');
    vi.resetModules();
    await import("@/features/theme/theme");
    expect(html).toHaveClass("dark");
    expect(html.dataset.palette).toBe("dusk");
  });

  it("still works when storage is blocked", async () => {
    vi.stubGlobal("localStorage", {
      ...memoryStorage(),
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const { user } = renderApp("/settings");
    await user.click(await screen.findByRole("radio", { name: /Dark/ }));
    expect(html).toHaveClass("dark");
  });
});
