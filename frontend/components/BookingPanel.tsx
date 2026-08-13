"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AvailabilityCalendar } from "@/components/AvailabilityCalendar";
import { PriceBreakdown } from "@/components/PriceBreakdown";
import { formatDayShort, isRangeFree, nightsBetween, occupiedNights } from "@/lib/dates";
import { formatPrice } from "@/lib/format";
import type { Availability, ListingDetail } from "@/types";

/**
 * The sticky reserve card.
 *
 * It owns the booking draft — dates and guest count — and hands it to the
 * checkout page through the URL. Nothing is written to the backend here;
 * Instant Book happens on the checkout screen, and the server re-validates the
 * dates and recomputes the price when it does.
 */
export function BookingPanel({
  listing,
  availability,
}: {
  listing: ListingDetail;
  availability: Availability;
}) {
  const router = useRouter();

  // Build the set of taken nights once, not on every render of every cell.
  const [occupied] = useState(() => occupiedNights(availability.booked));

  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [guests, setGuests] = useState(1);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const rangeIsFree = checkIn && checkOut ? isRangeFree(occupied, checkIn, checkOut) : false;
  const canReserve = nights > 0 && rangeIsFree;

  function onSelect(nextCheckIn: string | null, nextCheckOut: string | null) {
    setCheckIn(nextCheckIn);
    setCheckOut(nextCheckOut);
    // Close only once a full range is chosen, so the second click stays in view.
    if (nextCheckIn && nextCheckOut) setCalendarOpen(false);
  }

  function onReserve() {
    if (!canReserve) return;
    // The draft travels in the URL, so a refresh on checkout doesn't lose it.
    router.push(
      `/book/${listing.id}?check_in=${checkIn}&check_out=${checkOut}&guests=${guests}`,
    );
  }

  return (
    // NEXT/CSS: `sticky top-24` keeps the card in view as the long left column
    // scrolls — the height offset clears the sticky navbar.
    <div className="sticky top-24 rounded-card border border-line bg-paper p-6 shadow-warm">
      <div className="flex items-baseline justify-between gap-4">
        <p className="flex items-baseline gap-1.5">
          <span className="tabular font-display text-price">
            {formatPrice(listing.price_per_night)}
          </span>
          <span className="text-meta text-slate">night</span>
        </p>
        {listing.review_count > 0 && (
          <p className="text-meta">
            <span aria-hidden>★</span> <span className="tabular">{listing.avg_rating.toFixed(2)}</span>{" "}
            <span className="text-slate">({listing.review_count})</span>
          </p>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-input border border-line">
        <div className="grid grid-cols-2">
          <DateButton
            label="Check in"
            value={checkIn}
            onClick={() => setCalendarOpen(true)}
            active={calendarOpen && !checkOut}
          />
          <DateButton
            label="Check out"
            value={checkOut}
            onClick={() => setCalendarOpen(true)}
            active={calendarOpen && Boolean(checkIn) && !checkOut}
            className="border-l border-line"
          />
        </div>

        <label className="block cursor-pointer border-t border-line px-4 py-3">
          <span className="block text-eyebrow uppercase text-slate">Guests</span>
          <select
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
            className="mt-1 w-full bg-transparent text-body outline-none"
          >
            {Array.from({ length: listing.max_guests }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "guest" : "guests"}
              </option>
            ))}
          </select>
        </label>
      </div>

      {calendarOpen && (
        <div className="mt-4 rounded-input border border-line p-4">
          <AvailabilityCalendar
            occupied={occupied}
            checkIn={checkIn}
            checkOut={checkOut}
            onSelect={onSelect}
          />
          {checkIn && !checkOut && (
            <p className="mt-4 text-meta text-slate">Now pick your checkout date.</p>
          )}
          <button
            type="button"
            onClick={() => setCalendarOpen(false)}
            className="mt-4 text-meta font-medium underline underline-offset-4 transition-colors hover:text-coral"
          >
            Close calendar
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onReserve}
        disabled={!canReserve}
        className="mt-6 w-full rounded-full bg-coral px-6 py-4 text-body font-semibold text-paper transition-colors duration-200 hover:bg-coral-deep disabled:cursor-not-allowed disabled:bg-line disabled:text-slate"
      >
        {canReserve ? "Reserve" : "Choose your dates"}
      </button>

      {canReserve ? (
        <>
          <p className="mt-4 text-center text-meta text-slate">You won&apos;t be charged yet</p>
          <div className="mt-6 border-t border-line pt-6">
            <PriceBreakdown
              nightlyRate={listing.price_per_night}
              nights={nights}
              cleaningFee={listing.cleaning_fee}
              serviceFee={listing.service_fee}
            />
          </div>
        </>
      ) : (
        <p className="mt-4 text-center text-meta text-slate">
          {checkIn && checkOut && !rangeIsFree
            ? "Those dates aren't free. Pick another range."
            : "Instant Book — no waiting on the host."}
        </p>
      )}
    </div>
  );
}

function DateButton({
  label,
  value,
  onClick,
  active,
  className = "",
}: {
  label: string;
  value: string | null;
  onClick: () => void;
  active: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-3 text-left transition-colors hover:bg-sand/60 ${
        active ? "bg-sand/60" : ""
      } ${className}`}
    >
      <span className="block text-eyebrow uppercase text-slate">{label}</span>
      <span className={`mt-1 block text-body ${value ? "" : "text-slate/70"}`}>
        {value ? formatDayShort(value) : "Add date"}
      </span>
    </button>
  );
}
