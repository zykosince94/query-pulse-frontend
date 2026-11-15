const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

/** 1,284 · 12.9K · 4.2M: full numbers under 10,000, compact above. */
export function count(value: number): string {
  return Math.abs(value) < 10_000 ? whole.format(value) : compact.format(value);
}

/** Milliseconds as a readable duration: "0.4 ms", "850 ms", "2.3 s", "4.1 min". */
export function duration(ms: number): string {
  if (ms === 0) return "0 ms";
  if (ms < 1) return `${ms.toFixed(1)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}
