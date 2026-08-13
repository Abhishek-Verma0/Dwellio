"use client";
// Client component: the trips list is per-user, and the JWT that identifies
// that user only exists in the browser.

import Link from "next/link";
import { useEffect, useState } from "react";

import { AuthGate } from "@/components/AuthGate";
import { TripCard } from "@/components/TripCard";
import { errorMessage, useUser } from "@/context/UserContext";
import { api } from "@/lib/api";
import { todayISO } from "@/lib/dates";
import type { Booking } from "@/types";

export default function TripsPage() {
  return (
    <main className="mx-auto max-w-[900px] px-6 pb-32 lg:px-10">
      <header className="py-12 lg:py-16">
        <p className="text-eyebrow uppercase text-slate">Your bookings</p>
        <h1 className="mt-5 font-display text-h1">Trips</h1>
      </header>

      <AuthGate
        title="Log in to see your trips"
        body="Your bookings are tied to your account, so we need to know who you are."
        skeleton={<TripsSkeleton />}
      >
        <TripsList />
      </AuthGate>
    </main>
  );
}

function TripsList() {
  const { token } = useUser();
  const [trips, setTrips] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .myTrips(token)
      .then(setTrips)
      .catch((caught) => setError(errorMessage(caught)));
  }, [token]);

  if (error) {
    return (
      <p role="alert" className="rounded-card border border-coral/30 bg-coral/5 px-6 py-5 text-body text-coral">
        {error}
      </p>
    );
  }

  if (!trips) return <TripsSkeleton />;

  if (trips.length === 0) {
    return (
      <div className="rounded-card border border-line bg-paper px-8 py-20 text-center shadow-warm">
        <p className="font-display text-h2">No trips booked yet</p>
        <p className="mx-auto mt-4 max-w-sm text-body text-slate">
          When you reserve a place, it shows up here with your dates and the total you paid.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-full bg-coral px-6 py-3 text-meta font-semibold text-paper transition-colors duration-200 hover:bg-coral-deep"
        >
          Find somewhere to stay
        </Link>
      </div>
    );
  }

  // Upcoming vs past is a real division, not a decorative one: a stay you can
  // still cancel reads differently from one you've already had.
  const today = todayISO();
  const upcoming = trips
    .filter((trip) => trip.check_out > today)
    .sort((a, b) => a.check_in.localeCompare(b.check_in)); // soonest first
  const past = trips
    .filter((trip) => trip.check_out <= today)
    .sort((a, b) => b.check_in.localeCompare(a.check_in)); // most recent first

  return (
    <div className="space-y-16">
      {upcoming.length > 0 && (
        <Section title="Upcoming" count={upcoming.length}>
          {upcoming.map((trip, index) => (
            <TripCard key={trip.id} booking={trip} index={index} />
          ))}
        </Section>
      )}

      {past.length > 0 && (
        <Section title="Where you've been" count={past.length}>
          {past.map((trip, index) => (
            <TripCard key={trip.id} booking={trip} index={index} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="flex items-baseline gap-3 font-display text-h2">
        {title}
        <span className="text-meta font-sans text-slate">{count}</span>
      </h2>
      <div className="mt-8 space-y-5">{children}</div>
    </section>
  );
}

function TripsSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-52 animate-pulse rounded-card bg-line/60" />
      ))}
    </div>
  );
}
