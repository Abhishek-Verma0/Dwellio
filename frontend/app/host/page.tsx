"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AuthGate } from "@/components/AuthGate";
import { useToast } from "@/components/Toast";
import { errorMessage, useUser } from "@/context/UserContext";
import { api } from "@/lib/api";
import { formatDayShort, nightsBetween, todayISO } from "@/lib/dates";
import { formatPrice } from "@/lib/format";
import type { Booking, ListingDetail } from "@/types";

/**
 * The host dashboard.
 *
 * It opens with the next arrival rather than a row of KPI tiles, because that
 * is the thing a host actually acts on: someone is turning up, on a date, at
 * one of your places. Occupancy percentages can wait.
 *
 * Below it, reservations are nested UNDER the listing they belong to — which
 * is how the data is shaped and how a host thinks about it.
 */
export default function HostPage() {
  return (
    <main className="mx-auto max-w-[1000px] px-6 pb-32 lg:px-10">
      <AuthGate
        title="Log in to manage your places"
        body="Hosting tools are tied to your account."
        skeleton={<DashboardSkeleton />}
      >
        <Dashboard />
      </AuthGate>
    </main>
  );
}

function Dashboard() {
  const { token, user } = useUser();
  const showToast = useToast();

  const [listings, setListings] = useState<ListingDetail[] | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([api.myListings(token), api.hostBookings(token)])
      .then(([myListings, hostBookings]) => {
        setListings(myListings);
        setBookings(hostBookings);
      })
      .catch((caught) => setError(errorMessage(caught)));
  }, [token]);

  // A guest account has no hosting tools — say so and offer the way forward
  // rather than showing an empty dashboard that looks broken.
  if (user && user.role !== "host") {
    return (
      <div className="py-24 text-center">
        <h1 className="font-display text-h1">You&apos;re signed in as a guest</h1>
        <p className="mx-auto mt-5 max-w-md text-body text-slate">
          Only host accounts can create listings. Register a host account to put a place up.
        </p>
        <Link
          href="/register?role=host"
          className="mt-8 inline-block rounded-full bg-coral px-6 py-3 text-meta font-semibold text-paper transition-colors duration-200 hover:bg-coral-deep"
        >
          Create a host account
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="mt-16 rounded-card border border-coral/30 bg-coral/5 px-6 py-5 text-body text-coral">
        {error}
      </p>
    );
  }

  if (!listings) return <DashboardSkeleton />;

  const today = todayISO();
  const upcoming = bookings
    .filter((booking) => booking.check_out > today)
    .sort((a, b) => a.check_in.localeCompare(b.check_in));

  const next = upcoming[0];
  const nextListing = next ? listings.find((l) => l.id === next.listing_id) : undefined;

  return (
    <>
      <header className="py-12 lg:py-16">
        <p className="text-eyebrow uppercase text-slate">Hosting</p>

        {next && nextListing ? (
          <>
            <h1 className="mt-5 max-w-3xl font-display text-h1">
              Your next guest arrives {arrival(next.check_in, today)}.
            </h1>
            <p className="mt-5 text-lead text-slate">
              {next.guests} {next.guests === 1 ? "guest" : "guests"} at {nextListing.title},{" "}
              {formatDayShort(next.check_in)} to {formatDayShort(next.check_out)}.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-5 font-display text-h1">No one&apos;s booked in yet.</h1>
            <p className="mt-5 max-w-lg text-lead text-slate">
              {listings.length === 0
                ? "Put a place up and it'll show in search straight away."
                : "Your listings are live. Reservations will appear here as they come in."}
            </p>
          </>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/host/new"
            className="rounded-full bg-coral px-6 py-3 text-meta font-semibold text-paper transition-colors duration-200 hover:bg-coral-deep"
          >
            Add a listing
          </Link>
          {listings.length > 0 && (
            <p className="flex items-center text-meta text-slate">
              {listings.filter((l) => l.is_active).length} live ·{" "}
              {upcoming.length} upcoming {upcoming.length === 1 ? "reservation" : "reservations"}
            </p>
          )}
        </div>
      </header>

      {listings.length === 0 ? (
        <div className="rounded-card border border-line bg-paper px-8 py-20 text-center shadow-warm">
          <p className="font-display text-h2">Nothing listed yet</p>
          <p className="mx-auto mt-4 max-w-sm text-body text-slate">
            Add your first place — title, a few photos by URL, and a nightly price is enough to go
            live.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {listings.map((listing) => (
            <ListingRow
              key={listing.id}
              listing={listing}
              bookings={bookings.filter((b) => b.listing_id === listing.id)}
              onChanged={(updated) => {
                setListings((current) =>
                  (current ?? []).map((l) => (l.id === updated.id ? updated : l)),
                );
                showToast(updated.is_active ? "Listing is live again." : "Listing hidden.");
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ListingRow({
  listing,
  bookings,
  onChanged,
}: {
  listing: ListingDetail;
  bookings: Booking[];
  onChanged: (updated: ListingDetail) => void;
}) {
  const { token } = useUser();
  const showToast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const today = todayISO();
  const upcoming = bookings
    .filter((booking) => booking.check_out > today)
    .sort((a, b) => a.check_in.localeCompare(b.check_in));

  async function hide() {
    if (!token) return;
    setBusy(true);
    try {
      await api.deleteListing(token, listing.id);
      onChanged({ ...listing, is_active: false });
      setConfirming(false);
    } catch (caught) {
      showToast(errorMessage(caught), "error");
    } finally {
      setBusy(false);
    }
  }

  async function relist() {
    if (!token) return;
    setBusy(true);
    try {
      const updated = await api.updateListing(token, listing.id, { is_active: true });
      onChanged(updated);
    } catch (caught) {
      showToast(errorMessage(caught), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-card border border-line bg-paper shadow-warm">
      <div className="flex flex-col gap-5 p-5 sm:flex-row">
        {listing.photos[0] && (
          <div className="relative h-40 shrink-0 overflow-hidden rounded-input bg-line sm:h-28 sm:w-40">
            <Image
              src={listing.photos[0].url}
              alt=""
              fill
              sizes="160px"
              className={`object-cover ${listing.is_active ? "" : "grayscale"}`}
            />
          </div>
        )}

        <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-eyebrow uppercase text-slate">
                {listing.city}, {listing.country}
              </p>
              {listing.is_active ? (
                <span className="rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-success">
                  Live
                </span>
              ) : (
                <span className="rounded-full bg-line px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate">
                  Hidden
                </span>
              )}
            </div>

            <h2 className="mt-2 font-display text-title">{listing.title}</h2>

            <p className="mt-2 text-meta text-slate">
              <span className="tabular">{formatPrice(listing.price_per_night)}</span> night ·{" "}
              {listing.max_guests} guests ·{" "}
              {listing.review_count > 0 ? (
                <>
                  <span aria-hidden>★</span> {listing.avg_rating.toFixed(2)} ({listing.review_count})
                </>
              ) : (
                "No reviews yet"
              )}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href={`/listings/${listing.id}`}
              className="rounded-full border border-line px-4 py-2 text-meta font-medium transition-colors hover:border-ink/30"
            >
              View
            </Link>
            <Link
              href={`/host/${listing.id}/edit`}
              className="rounded-full border border-line px-4 py-2 text-meta font-medium transition-colors hover:border-ink/30"
            >
              Edit
            </Link>
            {listing.is_active ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-full border border-line px-4 py-2 text-meta font-medium transition-colors hover:border-coral hover:text-coral"
              >
                Remove
              </button>
            ) : (
              <button
                type="button"
                onClick={relist}
                disabled={busy}
                className="rounded-full bg-ink px-4 py-2 text-meta font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Relist
              </button>
            )}
          </div>
        </div>
      </div>

      {upcoming.length > 0 && (
        <div className="border-t border-line bg-sand/50 px-5 py-4">
          <p className="text-eyebrow uppercase text-slate">
            {upcoming.length} upcoming {upcoming.length === 1 ? "reservation" : "reservations"}
          </p>
          <ul className="mt-3 space-y-2">
            {upcoming.map((booking) => (
              <li key={booking.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-meta">
                <span>
                  {formatDayShort(booking.check_in)} — {formatDayShort(booking.check_out)}
                  <span className="text-slate">
                    {" "}
                    · {booking.nights} {booking.nights === 1 ? "night" : "nights"} ·{" "}
                    {booking.guests} {booking.guests === 1 ? "guest" : "guests"}
                  </span>
                </span>
                <span className="tabular font-medium">{formatPrice(booking.total_price)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The copy explains what "Remove" actually does, because the backend
          hides rather than deletes — and that difference matters to a host
          with reservations on the books. */}
      {confirming && (
        <div className="border-t border-line px-5 py-5">
          <p className="font-medium">Hide {listing.title}?</p>
          <p className="mt-2 max-w-lg text-meta text-slate">
            It disappears from search and its page stops loading for guests. Existing reservations
            stay in your dashboard, and you can relist it any time.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={hide}
              disabled={busy}
              className="rounded-full bg-coral px-5 py-2.5 text-meta font-semibold text-paper transition-colors hover:bg-coral-deep disabled:opacity-60"
            >
              {busy ? "Hiding…" : "Hide it"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-full border border-line px-5 py-2.5 text-meta font-medium transition-colors hover:border-ink/30"
            >
              Keep it live
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

/** "in 10 days" / "tomorrow" / "today" — the phrase completes the headline. */
function arrival(checkIn: string, today: string): string {
  if (checkIn <= today) return "today";
  const days = nightsBetween(today, checkIn);
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

function DashboardSkeleton() {
  return (
    <div className="py-16" aria-hidden>
      <div className="h-3 w-24 animate-pulse rounded-full bg-line/70" />
      <div className="mt-6 h-12 w-[30rem] max-w-full animate-pulse rounded-full bg-line/70" />
      <div className="mt-12 space-y-6">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="h-40 animate-pulse rounded-card bg-line/60" />
        ))}
      </div>
    </div>
  );
}
