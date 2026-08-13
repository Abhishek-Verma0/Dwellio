"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { buildQuery, type QueryValue } from "@/lib/url";

/**
 * Where / When / Who — the three things people actually search a stay by.
 *
 * The current values arrive as PROPS from the server page (which read them off
 * the URL). That's deliberate: reading them here with useSearchParams would
 * force a Suspense boundary and re-render on the client for no benefit.
 *
 * Native <input type="date"> instead of a date-picker library — the browser
 * ships a calendar, it's keyboard accessible, and `min` gives us date
 * validation without a line of JS.
 */
export function SearchBar({ params }: { params: Record<string, QueryValue> }) {
  // NEXT-SPECIFIC: useRouter from next/navigation (NOT next/router — that's the
  // old Pages Router). .push() navigates without a full page reload; the server
  // re-renders the page with the new query and streams it back.
  const router = useRouter();

  const [where, setWhere] = useState(String(params.q ?? ""));
  const [checkIn, setCheckIn] = useState(String(params.check_in ?? ""));
  const [checkOut, setCheckOut] = useState(String(params.check_out ?? ""));
  const [guests, setGuests] = useState(String(params.guests ?? ""));
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();

    // The backend rejects these too — this is just the faster, friendlier
    // version of the same rule, so nobody waits for a round trip to be told.
    if (checkIn && checkOut && checkOut <= checkIn) {
      setError("Checkout has to be after check-in.");
      return;
    }
    if (checkIn && !checkOut) {
      setError("Add a checkout date to see what's free.");
      return;
    }
    setError(null);

    // page: undefined resets pagination — a new search should start at page 1.
    router.push(
      `/${buildQuery(params, {
        q: where,
        check_in: checkIn,
        check_out: checkOut || undefined,
        guests: guests || undefined,
        page: undefined,
      })}`,
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <div className="flex flex-col gap-px overflow-hidden rounded-card border border-line bg-line shadow-warm md:flex-row md:rounded-full">
        <Field label="Where" className="md:flex-[1.4]">
          <input
            type="text"
            value={where}
            onChange={(e) => setWhere(e.target.value)}
            placeholder="Goa, Manali, anywhere"
            className="w-full bg-transparent text-body outline-none placeholder:text-slate/70"
          />
        </Field>

        <Field label="Check in">
          <input
            type="date"
            value={checkIn}
            min={today}
            onChange={(e) => setCheckIn(e.target.value)}
            className="w-full bg-transparent text-body outline-none"
          />
        </Field>

        <Field label="Check out">
          <input
            type="date"
            value={checkOut}
            // The browser greys out anything before check-in, so an invalid
            // range is hard to even select.
            min={checkIn || today}
            onChange={(e) => setCheckOut(e.target.value)}
            className="w-full bg-transparent text-body outline-none"
          />
        </Field>

        <Field label="Who">
          <select
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
            className="w-full bg-transparent text-body outline-none"
          >
            <option value="">Any guests</option>
            {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "guest" : "guests"}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex items-center bg-paper p-2">
          <button
            type="submit"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-coral px-6 text-meta font-semibold text-paper transition-colors duration-200 hover:bg-coral-deep md:w-auto"
          >
            <SearchIcon />
            Search
          </button>
        </div>
      </div>

      {/* role="alert" makes a screen reader announce this the moment it appears. */}
      {error && (
        <p role="alert" className="mt-3 pl-6 text-meta text-coral">
          {error}
        </p>
      )}
    </form>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  // The gap-px + bg-line trick on the parent turns these white blocks into
  // hairline-separated segments without a border on each one.
  return (
    <label className={`flex-1 cursor-text bg-paper px-6 py-3.5 transition-colors hover:bg-sand/60 ${className}`}>
      <span className="block text-eyebrow uppercase text-slate">{label}</span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" />
      <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
