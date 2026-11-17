import { Moon, Sun } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { type Mode, PALETTES, useTheme } from "./theme";

const MODES: { id: Mode; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
];

const tile =
  "flex cursor-pointer items-center gap-3 rounded-lg border bg-background/60 px-4 py-3 text-sm transition-colors hover:bg-accent peer-checked:border-primary peer-checked:bg-secondary peer-checked:ring-2 peer-checked:ring-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring";

/**
 * Light or dark, and one of three colour themes. Both are kept in this browser only (see
 * theme.ts), so every user, the read-only demo user included, can set them. They are real
 * radio buttons: the arrow keys move between choices and screen readers announce the group.
 */
export function AppearanceCard() {
  const { mode, palette, setMode, setPalette } = useTheme();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Appearance</CardTitle>
        <CardDescription>
          Saved in this browser. Until you choose a mode, the app follows your system's setting.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="mb-3 text-sm font-medium">Mode</legend>
          <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
            {MODES.map(({ id, label, icon: Icon }) => (
              <label key={id} className="relative">
                <input
                  type="radio"
                  name="colour-mode"
                  value={id}
                  checked={mode === id}
                  onChange={() => setMode(id)}
                  className="peer sr-only"
                />
                <span className={tile}>
                  <Icon aria-hidden className="size-4" />
                  {label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="mb-3 text-sm font-medium">Colour theme</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {PALETTES.map(({ id, label, hint }) => (
              <label key={id} className="relative">
                <input
                  type="radio"
                  name="colour-theme"
                  value={id}
                  checked={palette === id}
                  onChange={() => setPalette(id)}
                  className="peer sr-only"
                />
                <span className={tile}>
                  <span
                    aria-hidden
                    style={{ background: `var(--swatch-${id})` }}
                    className={cn("size-6 shrink-0 rounded-full")}
                  />
                  <span className="flex flex-col">
                    <span className="font-medium">{label}</span>
                    <span className="text-xs text-muted-foreground">{hint}</span>
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}
