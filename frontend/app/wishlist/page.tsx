"use client";

import Link from "next/link";

import { AuthGate } from "@/components/AuthGate";
import { ListingCard } from "@/components/ListingCard";
import { ListingCardSkeleton } from "@/components/ListingCardSkeleton";
import { useWishlist } from "@/context/WishlistContext";

/**
 * Saved homes. No fetch of its own — WishlistProvider already loaded the list
 * so that every heart in the app could render in the right state, and this
 * page reads the same data.
 *
 * Unhearting a card here removes it from the grid immediately, because the
 * context is the single source of truth for both.
 */
export default function WishlistPage() {
  return (
    <main className="mx-auto max-w-[1400px] px-6 pb-32 lg:px-10">
      <header className="py-12 lg:py-16">
        <p className="text-eyebrow uppercase text-slate">Saved homes</p>
        <h1 className="mt-5 font-display text-h1">Wishlist</h1>
      </header>

      <AuthGate
        title="Log in to see your wishlist"
        body="Saved homes are tied to your account so they're waiting on whichever device you open next."
        skeleton={<WishlistSkeleton />}
      >
        <SavedGrid />
      </AuthGate>
    </main>
  );
}

function SavedGrid() {
  const { listings, loading } = useWishlist();

  if (loading) return <WishlistSkeleton />;

  if (listings.length === 0) {
    return (
      <div className="rounded-card border border-line bg-paper px-8 py-20 text-center shadow-warm">
        <p className="font-display text-h2">Nothing saved yet</p>
        <p className="mx-auto mt-4 max-w-sm text-body text-slate">
          Tap the heart on any home to keep it here while you decide.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-full bg-coral px-6 py-3 text-meta font-semibold text-paper transition-colors duration-200 hover:bg-coral-deep"
        >
          Browse homes
        </Link>
      </div>
    );
  }

  return (
    <>
      <p className="mb-10 text-meta text-slate">
        {listings.length} {listings.length === 1 ? "home" : "homes"} saved
      </p>
      <div className="grid grid-cols-1 gap-x-8 gap-y-16 sm:grid-cols-2 xl:grid-cols-3">
        {listings.map((listing, index) => (
          <ListingCard key={listing.id} listing={listing} index={index} />
        ))}
      </div>
    </>
  );
}

function WishlistSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-16 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <ListingCardSkeleton key={index} />
      ))}
    </div>
  );
}
