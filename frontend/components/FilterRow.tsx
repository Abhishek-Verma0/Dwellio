"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { buildQuery, countActiveFilters, type QueryValue } from "@/lib/url";
import { formatPrice } from "@/lib/format";
import type { Filters } from "@/types";

/** A query param is `string | string[] | undefined`; the API wants number[]. */
const parseIds = (raw: QueryValue): number[] =>
  !raw ? [] : (Array.isArray(raw) ? raw : [raw]).map(Number);

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "rating", label: "Top rated" },
];

/**
 * Property-type chips inline, everything else behind a "Filters" button —
 * the same split Airbnb uses, because a row of twenty amenity checkboxes
 * would bury the listings.
 */
export function FilterRow({
  filters,
  params,
  total,
}: {
  filters: Filters;
  params: Record<string, QueryValue>;
  total: number;
}) {
  const router = useRouter();
  const activeCount = countActiveFilters(params);
  const activeType = params.property_type ? String(params.property_type) : null;

  /** Any filter change resets to page 1 — page 4 of a new filter is usually empty. */
  const apply = (updates: Record<string, QueryValue>) =>
    router.push(`/${buildQuery(params, { ...updates, page: undefined })}`);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-4">
      {/* Chips scroll horizontally rather than wrapping to four rows. */}
      <div className="-mx-1 flex flex-1 gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Chip
          active={!activeType}
          onClick={() => apply({ property_type: undefined })}
        >
          All stays
        </Chip>
        {filters.property_types.map((type) => (
          <Chip
            key={type}
            active={activeType === type}
            // Clicking the active chip clears it — a toggle, not a dead end.
            onClick={() => apply({ property_type: activeType === type ? undefined : type })}
          >
            {type}
          </Chip>
        ))}
      </div>

      <FiltersDialog filters={filters} params={params} activeCount={activeCount} apply={apply} />

      <p className="w-full text-meta text-slate lg:w-auto">
        {total} {total === 1 ? "home" : "homes"}
      </p>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-meta transition-colors duration-200 ${
        active
          ? "border-coral bg-coral text-paper"
          : "border-line bg-paper hover:border-ink/30"
      }`}
    >
      {children}
    </button>
  );
}

function FiltersDialog({
  filters,
  params,
  activeCount,
  apply,
}: {
  filters: Filters;
  params: Record<string, QueryValue>;
  activeCount: number;
  apply: (updates: Record<string, QueryValue>) => void;
}) {
  // The native <dialog> element gives us a focus trap, Escape-to-close, inert
  // background and a ::backdrop for free. A hand-rolled modal is ~80 lines of
  // accessibility work to match it.
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [minPrice, setMinPrice] = useState(String(params.min_price ?? ""));
  const [maxPrice, setMaxPrice] = useState(String(params.max_price ?? ""));
  const [sort, setSort] = useState(String(params.sort ?? "newest"));
  const [amenityIds, setAmenityIds] = useState<number[]>(() => parseIds(params.amenity_ids));

  // amenity_ids is an array, and a fresh array every render would make the
  // effect below loop forever. Comparing the joined string is stable.
  const amenityKey = parseIds(params.amenity_ids).join(",");

  // Re-sync when the URL changes (back button, chip click) so the dialog never
  // reopens showing filters that are no longer applied.
  useEffect(() => {
    setMinPrice(String(params.min_price ?? ""));
    setMaxPrice(String(params.max_price ?? ""));
    setSort(String(params.sort ?? "newest"));
    setAmenityIds(amenityKey ? amenityKey.split(",").map(Number) : []);
  }, [params.min_price, params.max_price, params.sort, amenityKey]);

  const toggleAmenity = (id: number) =>
    setAmenityIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  function onApply() {
    apply({
      min_price: minPrice || undefined,
      max_price: maxPrice || undefined,
      sort: sort === "newest" ? undefined : sort,
      amenity_ids: amenityIds.length ? amenityIds.map(String) : undefined,
    });
    dialogRef.current?.close();
  }

  function onClear() {
    setMinPrice("");
    setMaxPrice("");
    setSort("newest");
    setAmenityIds([]);
    apply({ min_price: undefined, max_price: undefined, sort: undefined, amenity_ids: undefined });
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 text-meta font-medium transition-colors duration-200 hover:border-ink/30"
      >
        <FilterIcon />
        Filters
        {activeCount > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1.5 text-[11px] font-semibold text-paper">
            {activeCount}
          </span>
        )}
      </button>

      <dialog
        ref={dialogRef}
        // ::backdrop is the browser's own overlay layer — no extra div needed.
        className="m-auto w-[min(92vw,560px)] rounded-card bg-paper p-0 shadow-lift backdrop:bg-ink/40 backdrop:backdrop-blur-sm"
        onClick={(e) => {
          // Clicking outside closes it. The dialog element itself fills the
          // whole viewport hit-area, so a click landing ON it means "outside".
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <h2 className="font-display text-title">Filters</h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close filters"
            className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-sand"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="max-h-[60vh] space-y-8 overflow-y-auto px-6 py-6">
          <section>
            <h3 className="text-eyebrow uppercase text-slate">Price per night</h3>
            <p className="mt-2 text-meta text-slate">
              Homes here run {formatPrice(filters.price_min)} to {formatPrice(filters.price_max)}.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <PriceInput label="Min" value={minPrice} onChange={setMinPrice} placeholder={String(filters.price_min)} />
              <span aria-hidden className="mt-6 h-px w-4 bg-line" />
              <PriceInput label="Max" value={maxPrice} onChange={setMaxPrice} placeholder={String(filters.price_max)} />
            </div>
          </section>

          <section>
            <h3 className="text-eyebrow uppercase text-slate">Sort by</h3>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="mt-3 w-full rounded-input border border-line bg-paper px-4 py-3 text-body outline-none focus:border-ink/40"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </section>

          <section>
            <h3 className="text-eyebrow uppercase text-slate">Amenities</h3>
            <p className="mt-2 text-meta text-slate">Homes must have all the ones you pick.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {filters.amenities.map((amenity) => {
                const checked = amenityIds.includes(amenity.id);
                return (
                  <label
                    key={amenity.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-input border px-4 py-3 text-meta transition-colors duration-200 ${
                      checked ? "border-coral bg-coral/5" : "border-line hover:border-ink/25"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAmenity(amenity.id)}
                      className="h-4 w-4 accent-coral"
                    />
                    <span>
                      {amenity.icon} {amenity.name}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between border-t border-line px-6 py-5">
          <button
            type="button"
            onClick={onClear}
            className="text-meta font-medium underline underline-offset-4 transition-colors hover:text-coral"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={onApply}
            className="rounded-full bg-coral px-6 py-3 text-meta font-semibold text-paper transition-colors duration-200 hover:bg-coral-deep"
          >
            Show homes
          </button>
        </div>
      </dialog>
    </>
  );
}

function PriceInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex-1">
      <span className="block text-eyebrow uppercase text-slate">{label}</span>
      <span className="mt-2 flex items-center rounded-input border border-line px-3 py-2.5 focus-within:border-ink/40">
        <span className="text-slate">₹</span>
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="tabular w-full bg-transparent pl-1.5 text-body outline-none"
        />
      </span>
    </label>
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M1 3.5h12M3.5 7h7M5.5 10.5h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
