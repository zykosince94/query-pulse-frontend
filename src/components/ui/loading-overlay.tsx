import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Seconds since `active` became true; 0 while it is false. For "still waiting…" messages. */
export function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return seconds;
}

type Props = {
  /** What is happening, e.g. "Asking the model…". */
  label: string;
  /** A second, quieter line, e.g. how long it has been. */
  detail?: string;
  /** Cover the whole window instead of the nearest positioned parent. */
  fullscreen?: boolean;
  className?: string;
};

/**
 * A veil with a spinner over whatever it is placed in. The parent must be `relative` (unless
 * `fullscreen`). It blocks clicks on what is underneath, and says what it is waiting for to
 * screen readers too.
 */
export function LoadingOverlay({ label, detail, fullscreen = false, className }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "z-30 flex flex-col items-center justify-center gap-2 bg-background/80 px-6 text-center backdrop-blur-[2px]",
        fullscreen ? "fixed inset-0" : "absolute inset-0 rounded-[inherit]",
        className,
      )}
    >
      <Loader2 aria-hidden className="size-8 text-primary motion-safe:animate-spin" />
      <p className="text-sm font-medium text-foreground">{label}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
