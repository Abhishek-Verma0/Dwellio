"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

import { formatDayShort, nightsBetween, todayISO } from "@/lib/dates";
import { formatPrice } from "@/lib/format";
import type { Booking } from "@/types";

/**
 * A booked stay. Horizontal rather than the vertical explore card, because
 * what matters here isn't browsing — it's when you're going and what it cost.
 *
 * The eyebrow carries the one thing a traveller actually wants to know: how
 * long until this trip. On past stays it becomes the year instead. Same slot,
 * different fact, both true — rather than a decorative label.
 */
export function TripCard({ booking, index = 0 }: { booking: Booking; index?: number }) {
  const listing = booking.listing;
  const status = tripStatus(booking.check_in, booking.check_out);

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: Math.min(index, 4) * 0.06 }}
      className="group overflow-hidden rounded-card border border-line bg-paper shadow-warm transition-shadow duration-500 hover:shadow-lift"
    >
      <div className="flex flex-col sm:flex-row">
        {listing?.photos[0] && (
          <Link
            href={`/listings/${booking.listing_id}`}
            className="relative aspect-[4/3] shrink-0 overflow-hidden sm:aspect-auto sm:h-auto sm:w-64"
          >
            <Image
              src={listing.photos[0].url}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, 256px"
              className="object-cover transition-transform duration-700 ease-editorial group-hover:scale-[1.04]"
            />
          </Link>
        )}

        <div className="flex flex-1 flex-col justify-between gap-6 p-6">
          <div>
            <p className={`text-eyebrow uppercase ${status.tone}`}>{status.label}</p>

            <Link href={`/listings/${booking.listing_id}`} className="mt-3 block">
              <h3 className="font-display text-title">{listing?.title ?? "This home is no longer listed"}</h3>
            </Link>

            {listing && (
              <p className="mt-1.5 text-meta text-slate">
                {listing.city}, {listing.country}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <dl className="flex flex-wrap gap-x-8 gap-y-3">
              <div>
                <dt className="text-eyebrow uppercase text-slate">Dates</dt>
                <dd className="mt-1.5 text-body">
                  {formatDayShort(booking.check_in)} — {formatDayShort(booking.check_out)}
                </dd>
              </div>
              <div>
                <dt className="text-eyebrow uppercase text-slate">Stay</dt>
                <dd className="mt-1.5 text-body">
                  {booking.nights} {booking.nights === 1 ? "night" : "nights"}, {booking.guests}{" "}
                  {booking.guests === 1 ? "guest" : "guests"}
                </dd>
              </div>
            </dl>

            {/* The total the SERVER computed and froze at booking time. */}
            <p className="flex items-baseline gap-1.5">
              <span className="tabular font-display text-price">
                {formatPrice(booking.total_price)}
              </span>
              <span className="text-meta text-slate">total</span>
            </p>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

/** Turns two dates into the one sentence a traveller wants at a glance. */
function tripStatus(checkIn: string, checkOut: string): { label: string; tone: string } {
  const today = todayISO();

  if (checkOut <= today) {
    return { label: `Stayed in ${checkIn.slice(0, 4)}`, tone: "text-slate" };
  }
  if (checkIn <= today) {
    // Success green is reserved for exactly this kind of "it's happening" state.
    return { label: "Staying now", tone: "text-success" };
  }

  const days = nightsBetween(today, checkIn);
  if (days === 0) return { label: "Check in today", tone: "text-coral" };
  if (days === 1) return { label: "Tomorrow", tone: "text-coral" };
  return { label: `In ${days} days`, tone: "text-slate" };
}
