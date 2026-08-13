/**
 * The URL is the state.
 *
 * Every filter, date and page number lives in the query string rather than in
 * React state. That buys three things for free:
 *   - the back button works
 *   - a filtered search is a shareable link
 *   - the server can render the right results on first paint (no flash of
 *     unfiltered listings while a useEffect catches up)
 *
 * These helpers merge new values into the existing query without clobbering
 * the rest of it.
 */

export type QueryValue = string | number | string[] | undefined | null;

/** Merge `updates` over `current`, dropping anything empty. Returns "?a=1&b=2". */
export function buildQuery(
  current: Record<string, QueryValue>,
  updates: Record<string, QueryValue> = {},
): string {
  const merged = { ...current, ...updates };
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => search.append(key, String(v)));
    else search.append(key, String(value));
  }

  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/** How many filters are actually applied — drives the "Filters (3)" badge. */
export function countActiveFilters(params: Record<string, QueryValue>): number {
  const filterKeys = ["min_price", "max_price", "property_type", "amenity_ids", "room_type", "sort"];
  return filterKeys.filter((key) => {
    const value = params[key];
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null && value !== "";
  }).length;
}
