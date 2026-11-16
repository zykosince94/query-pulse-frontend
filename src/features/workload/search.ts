import type { Schemas } from "@/api/client";

/**
 * The explorer's filters and time range live in the URL, typed and validated here, so a
 * copied link reopens exactly the same view (QP-AC-16). Defaults are left out of the URL to
 * keep links short; anything invalid falls back to its default instead of erroring.
 */

export type SortKey = Schemas["OperationList"]["sort"];
export const SORTS: { value: SortKey; label: string }[] = [
  { value: "total_time", label: "Total time" },
  { value: "mean_time", label: "Mean time" },
  { value: "calls", label: "Calls" },
];

export const RANGES = [
  { value: "15m", label: "Last 15 minutes", minutes: 15 },
  { value: "1h", label: "Last hour", minutes: 60 },
  { value: "6h", label: "Last 6 hours", minutes: 360 },
  { value: "24h", label: "Last 24 hours", minutes: 1440 },
  { value: "7d", label: "Last 7 days", minutes: 10_080 },
] as const;
export type RangeKey = (typeof RANGES)[number]["value"];
export const DEFAULT_RANGE: RangeKey = "1h";
const DEFAULT_SORT: SortKey = "total_time";
const MAX_QUERY_LENGTH = 200;

/** The time range part, shared by the explorer and the operation page. */
export type WindowSearch = {
  /** A relative range ("last hour"). Ignored when `from`/`to` are set. */
  range?: RangeKey | undefined;
  /** An absolute range (ISO 8601), e.g. after "Lock range" so a link shows fixed data. */
  from?: string | undefined;
  to?: string | undefined;
};

export type ExplorerSearch = WindowSearch & {
  sort?: SortKey | undefined;
  source?: number | undefined;
  q?: string | undefined;
};

function isoOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

/**
 * Every key is always returned (possibly undefined): if a bad value were simply left out, the
 * router would keep the raw one from the URL.
 */
export function validateWindowSearch(search: Record<string, unknown>): WindowSearch {
  let from = isoOrUndefined(search.from);
  let to = isoOrUndefined(search.to);
  if (!from || (to && Date.parse(to) <= Date.parse(from))) {
    from = undefined;
    to = undefined;
  }
  const range = RANGES.some((r) => r.value === search.range)
    ? (search.range as RangeKey)
    : undefined;
  return {
    range: from || range === DEFAULT_RANGE ? undefined : range,
    from,
    to,
  };
}

export function validateExplorerSearch(search: Record<string, unknown>): ExplorerSearch {
  const sort = SORTS.some((s) => s.value === search.sort) ? (search.sort as SortKey) : undefined;
  const source = Number(search.source);
  const q = typeof search.q === "string" ? search.q.trim().slice(0, MAX_QUERY_LENGTH) : "";
  return {
    ...validateWindowSearch(search),
    sort: sort === DEFAULT_SORT ? undefined : sort,
    source: Number.isInteger(source) && source > 0 ? source : undefined,
    q: q || undefined,
  };
}

/** The API's window parameters for a search: `{minutes}` or `{start, end}`. */
export function windowParams(search: WindowSearch): {
  minutes?: number;
  start?: string;
  end?: string;
} {
  if (search.from)
    return search.to ? { start: search.from, end: search.to } : { start: search.from };
  const range = RANGES.find((r) => r.value === (search.range ?? DEFAULT_RANGE));
  return { minutes: range?.minutes ?? 60 };
}

/** Just the time range keys of a search, to carry the window from the explorer to an operation. */
export function windowOnly(search: WindowSearch): WindowSearch {
  return { range: search.range, from: search.from, to: search.to };
}

/** Turn a relative range into the absolute one it covers right now. */
export function lockWindow(search: WindowSearch, now = new Date()): WindowSearch {
  if (search.from) return windowOnly(search);
  const minutes = windowParams(search).minutes ?? 60;
  return {
    range: undefined,
    from: new Date(now.getTime() - minutes * 60_000).toISOString(),
    to: now.toISOString(),
  };
}

const rangeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function describeWindow(search: WindowSearch): string {
  if (search.from) {
    const end = search.to ? rangeFormat.format(new Date(search.to)) : "now";
    return `${rangeFormat.format(new Date(search.from))} – ${end}`;
  }
  return RANGES.find((r) => r.value === (search.range ?? DEFAULT_RANGE))?.label ?? "Last hour";
}
