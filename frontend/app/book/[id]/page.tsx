import Link from "next/link";
import { notFound } from "next/navigation";

import { Checkout } from "@/components/Checkout";
import { ApiError, api } from "@/lib/api";
import { isRangeFree, nightsBetween, occupiedNights, todayISO } from "@/lib/dates";
import type { Availability, ListingDetail } from "@/types";

export const metadata = { title: "Confirm and pay — Dwellio" };

/**
 * Checkout. A SERVER component that validates the draft before rendering
 * anything, so an impossible booking never reaches the pay button.
 *
 * The dates arrive in the query string (?check_in=&check_out=&guests=) rather
 * than in React state, which is why refreshing this page doesn't lose them.
 */
export default async function BookPage(props: PageProps<"/book/[id]">) {
  const { id } = await props.params;
  const search = await props.searchParams;

  const listingId = Number(id);
  if (!Number.isFinite(listingId)) notFound();

  const checkIn = typeof search.check_in === "string" ? search.check_in : null;
  const checkOut = typeof search.check_out === "string" ? search.check_out : null;
  const guests = Number(search.guests ?? 1) || 1;

  let listing: ListingDetail;
  let availability: Availability;

  try {
    [listing, availability] = await Promise.all([
      api.getListing(listingId),
      api.getAvailability(listingId),
    ]);
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 404) notFound();
    throw caught;
  }

  // Four ways the draft can be wrong. Each gets its own message and a way out —
  // "invalid request" would leave someone stuck with no idea what to change.
  const problem = validate({ checkIn, checkOut, guests, listing, availability });

  if (problem || !checkIn || !checkOut) {
    return (
      <main className="mx-auto max-w-xl px-6 py-24 text-center">
        <p className="text-eyebrow uppercase text-slate">Checkout</p>
        <h1 className="mt-5 font-display text-h1">{problem?.title ?? "Pick your dates first"}</h1>
        <p className="mt-5 text-body text-slate">
          {problem?.body ?? "Choose a check-in and checkout date on the listing to see the total."}
        </p>
        <Link
          href={`/listings/${listingId}`}
          className="mt-8 inline-block rounded-full bg-coral px-6 py-3 text-meta font-semibold text-paper transition-colors duration-200 hover:bg-coral-deep"
        >
          Back to {listing.title}
        </Link>
      </main>
    );
  }

  return (
    <Checkout listing={listing} checkIn={checkIn} checkOut={checkOut} guests={guests} />
  );
}

function validate({
  checkIn,
  checkOut,
  guests,
  listing,
  availability,
}: {
  checkIn: string | null;
  checkOut: string | null;
  guests: number;
  listing: ListingDetail;
  availability: Availability;
}): { title: string; body: string } | null {
  if (!checkIn || !checkOut) return null; // handled by the caller's fallback copy

  if (nightsBetween(checkIn, checkOut) < 1) {
    return {
      title: "Those dates don't work",
      body: "Checkout has to be at least one night after check-in.",
    };
  }

  if (checkIn < todayISO()) {
    return { title: "That date has passed", body: "Pick a check-in date from today onwards." };
  }

  if (guests > listing.max_guests) {
    return {
      title: "Too many guests",
      body: `${listing.title} sleeps ${listing.max_guests}. Lower the guest count to continue.`,
    };
  }

  // The same half-open overlap rule the backend enforces. Checking it here
  // saves a round trip; the server still checks again on POST, because this
  // page could have been open for an hour.
  if (!isRangeFree(occupiedNights(availability.booked), checkIn, checkOut)) {
    return {
      title: "Those dates were taken",
      body: "Someone booked this place while you were deciding. Pick another range.",
    };
  }

  return null;
}
