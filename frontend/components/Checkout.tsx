"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PriceBreakdown } from "@/components/PriceBreakdown";
import { useToast } from "@/components/Toast";
import { errorMessage, useUser } from "@/context/UserContext";
import { ApiError, api } from "@/lib/api";
import { formatDayShort, nightsBetween } from "@/lib/dates";
import { formatPrice } from "@/lib/format";
import type { Booking, ListingDetail } from "@/types";

/**
 * Instant Book: one POST, and the booking is confirmed. There's no pending
 * state to reconcile because the backend treats creation AS the confirmation.
 *
 * This is a client component because it needs the JWT (localStorage) and has
 * to react to the response. Everything above it stayed on the server.
 */
export function Checkout({
  listing,
  checkIn,
  checkOut,
  guests,
}: {
  listing: ListingDetail;
  checkIn: string;
  checkOut: string;
  guests: number;
}) {
  const { user, token, status, logout } = useUser();
  const showToast = useToast();
  const router = useRouter();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nights = nightsBetween(checkIn, checkOut);
  const here = `/book/${listing.id}?check_in=${checkIn}&check_out=${checkOut}&guests=${guests}`;

  async function onConfirm() {
    if (!token) return;
    setError(null);
    setSubmitting(true);

    try {
      const created = await api.createBooking(token, {
        listing_id: listing.id,
        check_in: checkIn,
        check_out: checkOut,
        guests,
      });
      setBooking(created);
      // The button said "Confirm and pay"; the toast says the same thing back.
      showToast("Booked. Check your trips for the details.");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        // The token expired between loading this page and pressing the button.
        logout();
        router.push(`/login?next=${encodeURIComponent(here)}`);
        return;
      }
      // 409 means the dates went while this page was open — the backend
      // re-checked and refused. Its message already names the conflicting stay.
      setError(errorMessage(caught));
      showToast(errorMessage(caught), "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (booking) return <Confirmed booking={booking} listing={listing} />;

  return (
    <main className="mx-auto max-w-[1100px] px-6 pb-32 pt-10 lg:px-10">
      <Link
        href={`/listings/${listing.id}`}
        className="text-meta text-slate underline underline-offset-4 transition-colors hover:text-coral"
      >
        ← Back to {listing.title}
      </Link>

      <h1 className="mt-6 font-display text-h1">Confirm and pay</h1>

      <div className="mt-12 grid gap-16 lg:grid-cols-[1fr_420px]">
        <div>
          <section className="border-b border-line pb-8">
            <h2 className="font-display text-h2">Your trip</h2>

            <Row label="Dates" value={`${formatDayShort(checkIn)} — ${formatDayShort(checkOut)}`}>
              <Link
                href={`/listings/${listing.id}`}
                className="text-meta font-medium underline underline-offset-4 transition-colors hover:text-coral"
              >
                Change
              </Link>
            </Row>

            <Row label="Guests" value={`${guests} ${guests === 1 ? "guest" : "guests"}`}>
              <Link
                href={`/listings/${listing.id}`}
                className="text-meta font-medium underline underline-offset-4 transition-colors hover:text-coral"
              >
                Change
              </Link>
            </Row>
          </section>

          <section className="border-b border-line py-8">
            <h2 className="font-display text-h2">Pay with</h2>
            {/* Honest about being a demo. Pretending to take a card number
                would be worse than saying there isn't one. */}
            <div className="mt-5 rounded-card border border-dashed border-line bg-paper p-6">
              <p className="text-meta font-medium">Mock payment</p>
              <p className="mt-2 text-meta text-slate">
                Checkout is simulated for this build. No card is collected and nothing is charged —
                confirming creates a real booking in the database and blocks these dates.
              </p>
            </div>
          </section>

          <section className="py-8">
            {status === "loading" ? (
              <div aria-hidden className="h-14 w-full animate-pulse rounded-full bg-line/60" />
            ) : !user ? (
              <div className="rounded-card border border-line bg-paper p-6">
                <p className="font-display text-title">Log in to finish</p>
                <p className="mt-3 text-meta text-slate">
                  Your dates are held in this link, so you&apos;ll come straight back here.
                </p>
                <Link
                  href={`/login?next=${encodeURIComponent(here)}`}
                  className="mt-5 inline-block rounded-full bg-coral px-6 py-3 text-meta font-semibold text-paper transition-colors duration-200 hover:bg-coral-deep"
                >
                  Log in
                </Link>
              </div>
            ) : (
              <>
                {error && (
                  <p
                    role="alert"
                    className="mb-5 rounded-input border border-coral/30 bg-coral/5 px-4 py-3 text-meta text-coral"
                  >
                    {error}{" "}
                    <Link href={`/listings/${listing.id}`} className="font-medium underline underline-offset-4">
                      Pick new dates
                    </Link>
                  </p>
                )}
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={submitting}
                  className="w-full rounded-full bg-coral px-6 py-4 text-body font-semibold text-paper transition-colors duration-200 hover:bg-coral-deep disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {submitting ? "Confirming…" : "Confirm and pay"}
                </button>
                <p className="mt-4 text-meta text-slate">
                  Instant Book — these dates are yours the moment you confirm.
                </p>
              </>
            )}
          </section>
        </div>

        <aside>
          <div className="sticky top-24 rounded-card border border-line bg-paper p-6 shadow-warm">
            <div className="flex gap-4 border-b border-line pb-6">
              {listing.photos[0] && (
                <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-input bg-line">
                  <Image
                    src={listing.photos[0].url}
                    alt=""
                    fill
                    sizes="128px"
                    className="object-cover"
                  />
                </div>
              )}
              <div>
                <p className="text-eyebrow uppercase text-slate">
                  {listing.city}, {listing.country}
                </p>
                <p className="mt-2 font-display text-title leading-tight">{listing.title}</p>
                {listing.review_count > 0 && (
                  <p className="mt-2 text-meta text-slate">
                    <span aria-hidden>★</span> {listing.avg_rating.toFixed(2)} ({listing.review_count})
                  </p>
                )}
              </div>
            </div>

            <p className="pb-4 pt-6 font-display text-title">Price details</p>
            <PriceBreakdown
              nightlyRate={listing.price_per_night}
              nights={nights}
              cleaningFee={listing.cleaning_fee}
              serviceFee={listing.service_fee}
            />
          </div>
        </aside>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-5 flex items-baseline justify-between gap-4">
      <div>
        <p className="text-eyebrow uppercase text-slate">{label}</p>
        <p className="mt-1.5 text-body">{value}</p>
      </div>
      {children}
    </div>
  );
}

/** The confirmation. Replaces the form in place — no URL you can refresh into
 *  and re-submit, and no dead "thanks" page sitting in your history. */
function Confirmed({ booking, listing }: { booking: Booking; listing: ListingDetail }) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto max-w-2xl px-6 py-20 lg:py-28"
    >
      <p className="text-eyebrow uppercase text-success">Confirmed</p>
      <h1 className="mt-5 font-display text-display">You&apos;re booked.</h1>
      <p className="mt-6 text-lead text-slate">
        {listing.title} is yours from {formatDayShort(booking.check_in)} to{" "}
        {formatDayShort(booking.check_out)}. These dates are now blocked for everyone else.
      </p>

      <dl className="mt-12 divide-y divide-line rounded-card border border-line bg-paper px-6 shadow-warm">
        <Detail label="Confirmation" value={`#${booking.id}`} />
        <Detail
          label="Stay"
          value={`${booking.nights} ${booking.nights === 1 ? "night" : "nights"}, ${booking.guests} ${
            booking.guests === 1 ? "guest" : "guests"
          }`}
        />
        <Detail label="Where" value={`${listing.address}, ${listing.city}`} />
        {/* The server's number, not the one this page calculated. */}
        <Detail label="Total paid" value={formatPrice(booking.total_price)} />
      </dl>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/trips"
          className="rounded-full bg-coral px-6 py-3.5 text-meta font-semibold text-paper transition-colors duration-200 hover:bg-coral-deep"
        >
          See your trips
        </Link>
        <Link
          href="/"
          className="rounded-full border border-line bg-paper px-6 py-3.5 text-meta font-medium transition-colors duration-200 hover:border-ink/30"
        >
          Keep browsing
        </Link>
      </div>
    </motion.main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-5">
      <dt className="text-meta text-slate">{label}</dt>
      <dd className="tabular text-right text-body font-medium">{value}</dd>
    </div>
  );
}
