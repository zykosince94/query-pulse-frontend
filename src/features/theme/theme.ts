import { useSyncExternalStore } from "react";

/**
 * The look of the app: a mode (light or dark) and a colour theme (palette). Both live on <html>
 * (the `dark` class and `data-palette`), where tokens.css turns them into colours, and in
 * localStorage so they survive a reload. index.html applies them before first paint, so there is
 * no flash; this module keeps them in step afterwards.
 */

export type Mode = "light" | "dark";

export const PALETTES = [
  { id: "pulse", label: "Pulse", hint: "Clear blue" },
  { id: "lagoon", label: "Lagoon", hint: "Calm teal" },
  { id: "dusk", label: "Dusk", hint: "Soft violet" },
] as const;

export type PaletteId = (typeof PALETTES)[number]["id"];

export type Theme = { mode: Mode; palette: PaletteId };

export const STORAGE_KEY = "qp-theme";

const isMode = (value: unknown): value is Mode => value === "light" || value === "dark";
const isPalette = (value: unknown): value is PaletteId =>
  PALETTES.some((palette) => palette.id === value);

/** What the user chose before, if anything. Storage can be blocked or hold junk: never throw. */
function readStored(): Partial<Theme> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof parsed !== "object" || parsed === null) return {};
    const { mode, palette } = parsed as Record<string, unknown>;
    return {
      ...(isMode(mode) ? { mode } : {}),
      ...(isPalette(palette) ? { palette } : {}),
    };
  } catch {
    return {};
  }
}

function systemMode(): Mode {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function apply({ mode, palette }: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.dataset.palette = palette;
  root.style.colorScheme = mode;
}

const stored = readStored();
let chosenMode = stored.mode !== undefined;
let current: Theme = { mode: stored.mode ?? systemMode(), palette: stored.palette ?? "pulse" };
const listeners = new Set<() => void>();

function set(next: Theme): void {
  if (next.mode === current.mode && next.palette === current.palette) return;
  current = next;
  apply(current);
  for (const listener of listeners) listener();
}

if (typeof document !== "undefined") {
  apply(current);
  // Until the user picks a mode themselves, follow the operating system's.
  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
      if (!chosenMode) set({ ...current, mode: event.matches ? "dark" : "light" });
    });
  } catch {
    // No matchMedia (an old browser or a test): the mode just stays as it is.
  }
}

/** Change the mode and/or the colour theme, and remember the choice. */
export function setTheme(patch: Partial<Theme>): void {
  if (patch.mode !== undefined) chosenMode = true;
  set({ ...current, ...patch });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Blocked storage: the choice lasts until the page is closed.
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useTheme(): Theme & {
  setMode: (mode: Mode) => void;
  setPalette: (palette: PaletteId) => void;
  toggleMode: () => void;
} {
  const theme = useSyncExternalStore(subscribe, () => current);
  return {
    ...theme,
    setMode: (mode) => setTheme({ mode }),
    setPalette: (palette) => setTheme({ palette }),
    toggleMode: () => setTheme({ mode: theme.mode === "dark" ? "light" : "dark" }),
  };
}
