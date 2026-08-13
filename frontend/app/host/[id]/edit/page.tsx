"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthGate } from "@/components/AuthGate";
import { ListingForm } from "@/components/ListingForm";
import { errorMessage, useUser } from "@/context/UserContext";
import { api } from "@/lib/api";
import type { ListingDetail } from "@/types";

/**
 * NEXT-SPECIFIC: this page is a client component, so it can't await
 * `props.params` — it reads the [id] segment with useParams() instead.
 *
 * It loads from /listings/mine rather than /listings/{id} on purpose: the
 * public endpoint 404s on a hidden listing, and a host has to be able to edit
 * one they've hidden. That endpoint also only ever returns listings YOU own,
 * so "not in the list" and "not yours" collapse into the same safe answer.
 */
export default function EditListingPage() {
  const params = useParams<{ id: string }>();
  const listingId = Number(params.id);

  return (
    <main className="mx-auto max-w-[1100px] px-6 pb-32 lg:px-10">
      <AuthGate
        title="Log in to edit this listing"
        body="Only the host who owns a listing can change it."
        skeleton={<EditSkeleton />}
      >
        <Editor listingId={listingId} />
      </AuthGate>
    </main>
  );
}

function Editor({ listingId }: { listingId: number }) {
  const { token } = useUser();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .myListings(token)
      .then((mine) => {
        const found = mine.find((item) => item.id === listingId);
        if (!found) setError("That listing isn't one of yours, or it no longer exists.");
        else setListing(found);
      })
      .catch((caught) => setError(errorMessage(caught)));
  }, [token, listingId]);

  if (error) {
    return (
      <div className="py-24 text-center">
        <h1 className="font-display text-h1">Can&apos;t edit this</h1>
        <p className="mx-auto mt-5 max-w-md text-body text-slate">{error}</p>
        <Link
          href="/host"
          className="mt-8 inline-block rounded-full bg-coral px-6 py-3 text-meta font-semibold text-paper transition-colors duration-200 hover:bg-coral-deep"
        >
          Back to your listings
        </Link>
      </div>
    );
  }

  if (!listing) return <EditSkeleton />;

  return (
    <>
      <header className="py-12 lg:py-16">
        <p className="text-eyebrow uppercase text-slate">
          Editing · {listing.is_active ? "Live" : "Hidden"}
        </p>
        <h1 className="mt-5 font-display text-h1">{listing.title}</h1>
        <p className="mt-5 text-lead text-slate">
          Changes show up for guests straight away. Existing bookings keep the price they were made
          at.
        </p>
      </header>

      {/* key: remount the form once the listing arrives, so its initial state
          is built from real data rather than from an empty object. */}
      <ListingForm key={listing.id} existing={listing} />
    </>
  );
}

function EditSkeleton() {
  return (
    <div className="py-16" aria-hidden>
      <div className="h-3 w-28 animate-pulse rounded-full bg-line/70" />
      <div className="mt-6 h-12 w-96 max-w-full animate-pulse rounded-full bg-line/70" />
      <div className="mt-12 grid gap-16 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-card bg-line/60" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-card bg-line/60" />
      </div>
    </div>
  );
}
