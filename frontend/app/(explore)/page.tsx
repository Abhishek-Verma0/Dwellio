import { FilterRow } from "@/components/FilterRow";
import { ListingCard } from "@/components/ListingCard";
import { Pagination } from "@/components/Pagination";
import { SearchBar } from "@/components/SearchBar";
import { api } from "@/lib/api";
import type { QueryValue } from "@/lib/url";
import type { Filters, ListingPage } from "@/types";

const PAGE_SIZE = 9;

/**
 * The explore page — a SERVER component.
 *
 * NEXT-SPECIFIC: `searchParams` is handed to every page as a prop, and in
 * Next 15+ it's a Promise you await. Reading the filters here means the server
 * fetches the RIGHT listings before sending any HTML — no spinner, no flash of
 * unfiltered results, and the page is crawlable and shareable at every filter
 * combination.
 *
 * Coming from React: this replaces useSearchParams + useEffect + useState.
 */
export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? 1) || 1;

  // Everything the child components need to rebuild a URL, in one object.
  const activeParams: Record<string, QueryValue> = { ...params };

  let listings: ListingPage | null = null;
  let filters: Filters | null = null;
  let error: string | null = null;

  try {
    // Promise.all: two independent requests in parallel rather than one after
    // the other. Waterfalls are the easiest performance bug to write.
    [listings, filters] = await Promise.all([
      api.searchListings({
        q: asString(params.q),
        check_in: asString(params.check_in),
        check_out: asString(params.check_out),
        guests: asNumber(params.guests),
        min_price: asNumber(params.min_price),
        max_price: asNumber(params.max_price),
        property_type: asString(params.property_type),
        room_type: asString(params.room_type),
        amenity_ids: asNumbers(params.amenity_ids),
        sort: asString(params.sort),
        page,
        page_size: PAGE_SIZE,
      }),
      api.getFilters(),
    ]);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Something went wrong.";
  }

  return (
    <main className="mx-auto max-w-[1400px] px-6 pb-32 lg:px-10">
      <header className="max-w-2xl py-12 lg:py-16">
        <p className="text-eyebrow uppercase text-slate">Handpicked homes across India</p>
        <h1 className="mt-5 font-display text-h1 lg:text-display">
          Stay somewhere with a point of view.
        </h1>
      </header>

      <SearchBar params={activeParams} />

      {filters && (
        <div className="mt-10">
          <FilterRow filters={filters} params={activeParams} total={listings?.total ?? 0} />
        </div>
      )}

      {error ? (
        <EmptyState
          title="Can't reach the API"
          body={error}
          hint="Start the backend: uvicorn app.main:app --reload"
        />
      ) : listings && listings.items.length === 0 ? (
        <EmptyState
          title="No homes match that yet"
          body="Try widening the dates, raising the price ceiling, or dropping an amenity."
          action={{ href: "/", label: "Clear all filters" }}
        />
      ) : (
        <>
          <div className="mt-12 grid grid-cols-1 gap-x-8 gap-y-16 sm:grid-cols-2 xl:grid-cols-3">
            {listings?.items.map((listing, index) => (
              <ListingCard key={listing.id} listing={listing} index={index} />
            ))}
          </div>

          <Pagination
            page={listings?.page ?? 1}
            totalPages={listings?.total_pages ?? 1}
            params={activeParams}
          />
        </>
      )}
    </main>
  );
}

function EmptyState({
  title,
  body,
  hint,
  action,
}: {
  title: string;
  body: string;
  hint?: string;
  action?: { href: string; label: string };
}) {
  // An empty screen is an invitation to act, so it always ends in a next step.
  return (
    <div className="mt-16 rounded-card border border-line bg-paper px-8 py-20 text-center shadow-warm">
      <p className="font-display text-h2">{title}</p>
      <p className="mx-auto mt-4 max-w-md text-body text-slate">{body}</p>
      {hint && (
        <code className="mt-5 inline-block rounded-input bg-sand px-3 py-2 text-meta text-slate">
          {hint}
        </code>
      )}
      {action && (
        <a
          href={action.href}
          className="mt-8 inline-block rounded-full bg-coral px-6 py-3 text-meta font-semibold text-paper transition-colors duration-200 hover:bg-coral-deep"
        >
          {action.label}
        </a>
      )}
    </div>
  );
}

/* Query params arrive as string | string[] | undefined. These three keep the
   narrowing in one place instead of scattered across the fetch call. */
const asString = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const asNumber = (value: string | string[] | undefined) => {
  const raw = asString(value);
  return raw ? Number(raw) : undefined;
};

const asNumbers = (value: string | string[] | undefined) => {
  if (!value) return undefined;
  return (Array.isArray(value) ? value : [value]).map(Number);
};
