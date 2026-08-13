"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/Toast";
import { useUser } from "@/context/UserContext";
import { api } from "@/lib/api";
import type { Listing } from "@/types";

interface WishlistContextValue {
  /** Ids only — what the heart on every card needs to know. */
  saved: Set<number>;
  /** Full listings, so /wishlist doesn't have to fetch them a second time. */
  listings: Listing[];
  loading: boolean;
  toggle: (listing: Listing) => void;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

/**
 * The saved-homes list, loaded once per session.
 *
 * Cards all over the app need to know whether a listing is hearted. Fetching
 * that per card would be one request per tile; holding it here is one request
 * per login.
 *
 * Toggling is OPTIMISTIC: the heart fills the instant it's clicked, and only
 * rolls back if the server refuses. Waiting ~100ms for a round trip before a
 * heart reacts feels broken, and this is the one place in the app where that
 * latency would be felt on every interaction.
 */
export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { token, status } = useUser();
  const showToast = useToast();

  const [listings, setListings] = useState<Listing[]>([]);
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Signed out: there's no wishlist to load, and an empty set means every
    // heart renders unfilled.
    if (status !== "authenticated" || !token) {
      setListings([]);
      setSaved(new Set());
      return;
    }

    setLoading(true);
    api
      .getWishlist(token)
      .then((result) => {
        setListings(result);
        setSaved(new Set(result.map((listing) => listing.id)));
      })
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  }, [token, status]);

  const toggle = useCallback(
    (listing: Listing) => {
      if (!token) return;

      const wasSaved = saved.has(listing.id);

      // 1. Flip the UI immediately.
      setSaved((current) => {
        const next = new Set(current);
        if (wasSaved) next.delete(listing.id);
        else next.add(listing.id);
        return next;
      });
      setListings((current) =>
        wasSaved ? current.filter((l) => l.id !== listing.id) : [listing, ...current],
      );

      // 2. Tell the server. 3. Put it back if it says no.
      const call = wasSaved
        ? api.removeFromWishlist(token, listing.id)
        : api.addToWishlist(token, listing.id);

      call
        .then(() => showToast(wasSaved ? "Removed from your wishlist." : "Saved to your wishlist."))
        .catch(() => {
          setSaved((current) => {
            const next = new Set(current);
            if (wasSaved) next.add(listing.id);
            else next.delete(listing.id);
            return next;
          });
          setListings((current) =>
            wasSaved ? [listing, ...current] : current.filter((l) => l.id !== listing.id),
          );
          showToast("Couldn't update your wishlist. Try again.", "error");
        });
    },
    [token, saved, showToast],
  );

  const value = useMemo(
    () => ({ saved, listings, loading, toggle }),
    [saved, listings, loading, toggle],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) throw new Error("useWishlist must be used inside <WishlistProvider>");
  return context;
}
