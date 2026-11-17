import { onlineManager, useIsFetching, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Loader2, WifiOff } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/** How long "Updating…" stays up, so a 50 ms refresh is still seen. */
const MIN_UPDATING_MS = 700;

export type SyncState = "live" | "updating" | "failing" | "offline";

const subscribeOnline = (listener: () => void) => onlineManager.subscribe(listener);
const isOnline = () => onlineManager.isOnline();

/** "just now", "12 s ago", "3 min ago": short enough for a small pill, and it keeps counting. */
export function ago(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  return `${Math.floor(seconds / 3600)} h ago`;
}

/** What the background polling is doing, read from the query cache. */
export function useSyncStatus() {
  const queryClient = useQueryClient();
  const online = useSyncExternalStore(subscribeOnline, isOnline, () => true);
  const fetching = useIsFetching() > 0;
  const [lastSuccess, setLastSuccess] = useState<number | null>(null);
  const [failing, setFailing] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const cache = queryClient.getQueryCache();
    return cache.subscribe((event) => {
      if (event.type === "updated" && event.action.type === "success") setLastSuccess(Date.now());
      // A query someone is looking at that ended in an error and isn't trying again right now.
      setFailing(
        cache
          .getAll()
          .some(
            (q) =>
              q.getObserversCount() > 0 &&
              q.state.status === "error" &&
              q.state.fetchStatus === "idle",
          ),
      );
    });
  }, [queryClient]);

  useEffect(() => {
    if (fetching) {
      setUpdating(true);
      return;
    }
    const timer = setTimeout(() => setUpdating(false), MIN_UPDATING_MS);
    return () => clearTimeout(timer);
  }, [fetching]);

  const state: SyncState = !online
    ? "offline"
    : failing
      ? "failing"
      : updating
        ? "updating"
        : "live";
  return { state, lastSuccess, refresh: () => queryClient.refetchQueries({ type: "active" }) };
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * Bottom-right feedback for the background polling: it says when data is being refreshed, how
 * fresh it is, and when updates are failing or paused (offline). Clicking it refreshes now.
 */
export function SyncIndicator() {
  const { state, lastSuccess, refresh } = useSyncStatus();
  const now = useNow(state === "live");

  const label =
    state === "offline"
      ? "Offline · updates paused"
      : state === "failing"
        ? "Couldn't update · retry"
        : state === "updating"
          ? "Updating…"
          : lastSuccess === null
            ? "Live"
            : `Live · updated ${ago(now - lastSuccess)}`;

  return (
    <div className="pointer-events-none fixed right-3 bottom-3 z-50 sm:right-5 sm:bottom-5 print:hidden">
      <button
        type="button"
        data-sync={state}
        onClick={() => void refresh()}
        title="Refresh now"
        className={cn(
          "pointer-events-auto inline-flex items-center gap-2 rounded-full border bg-card px-3.5 py-2 text-xs font-medium text-muted-foreground shadow-lg transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          state === "failing" && "border-warning text-warning hover:text-warning",
        )}
      >
        {state === "updating" ? (
          <Loader2 aria-hidden className="size-3.5 text-primary motion-safe:animate-spin" />
        ) : state === "offline" ? (
          <WifiOff aria-hidden className="size-3.5" />
        ) : state === "failing" ? (
          <CircleAlert aria-hidden className="size-3.5" />
        ) : (
          <span aria-hidden className="relative flex size-2">
            <span className="absolute inline-flex size-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
        )}
        <span>{label}</span>
      </button>
      {/* Spoken only when something goes wrong or recovers, never on every tick. */}
      <span className="sr-only" aria-live="polite">
        {state === "offline"
          ? "You are offline. Updates are paused."
          : state === "failing"
            ? "Some updates are failing."
            : ""}
      </span>
    </div>
  );
}
