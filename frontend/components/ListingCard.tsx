"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";

import { useToast } from "@/components/Toast";
import { useUser } from "@/context/UserContext";
import { useWishlist } from "@/context/WishlistContext";
import { formatPrice, roomTypeLabel } from "@/lib/format";
import type { Listing } from "@/types";

/**
 * THE SIGNATURE COMPONENT: an oversized editorial listing card.
 *
 * Three things make it "editorial" rather than a generic product tile:
 *   1. the location is an eyebrow — a small letterspaced label above the title,
 *      the way a magazine datelines a story
 *   2. the title is set in Fraunces at 24px, not in the body sans
 *   3. the price is a typographic statement, not a footnote
 *
 * Everything else is deliberately quiet, because the card is where all the
 * boldness gets spent.
 */
export function ListingCard({ listing, index = 0 }: { listing: Listing; index?: number }) {
  const { user } = useUser();
  const { saved, toggle } = useWishlist();
  const showToast = useToast();
  const router = useRouter();
  const pathname = usePathname();

  const cover = listing.photos[0];
  const isSaved = saved.has(listing.id);

  function onToggleWishlist() {
    // Saving needs an account. Say so, then take them somewhere they can fix
    // it — a toast that only complains leaves the person stuck.
    if (!user) {
      showToast("Log in to save homes.", "error");
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    toggle(listing);
  }

  return (
    // Reveal on scroll. `once: true` so cards don't re-animate when you scroll
    // back up — twitchy pages feel cheap. The stagger is capped at 4 so a long
    // grid never has a card waiting a full second to appear.
    <motion.article
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: Math.min(index, 4) * 0.07 }}
      className="group"
    >
      {/* The hover lift lives on this inner div, not on motion.article — both
          would write to `transform` and fight each other. `relative` makes it
          the positioning context for the heart, so the heart rises with it. */}
      <div className="relative transition-transform duration-500 ease-editorial group-hover:-translate-y-1.5">
        {/* ONE link around the whole card. Splitting the photo and the text into
            two <Link>s would make a screen reader announce every listing twice. */}
        <Link href={`/listings/${listing.id}`} className="block">
          <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-line shadow-warm transition-shadow duration-500 group-hover:shadow-lift">
            {cover ? (
              // NEXT-SPECIFIC: next/image resizes and serves modern formats on
              // demand. `fill` makes it absolutely fill the parent; `sizes`
              // tells it which width to actually fetch per breakpoint, so
              // phones don't download a 1200px photo.
              <Image
                src={cover.url}
                alt={cover.caption ?? listing.title}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                className="object-cover transition-transform duration-700 ease-editorial group-hover:scale-[1.045]"
              />
            ) : (
              <div className="grid h-full place-items-center text-meta text-slate">No photo yet</div>
            )}

            {listing.host?.is_superhost && (
              <span className="absolute left-4 top-4 rounded-full bg-paper/95 px-3 py-1.5 text-eyebrow font-semibold uppercase shadow-warm backdrop-blur-sm">
                Superhost
              </span>
            )}
          </div>

          <div className="pt-5">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-eyebrow uppercase text-slate">
                {listing.city}, {listing.country}
              </span>
              <Rating value={listing.avg_rating} count={listing.review_count} />
            </div>

            <h3 className="mt-3 font-display text-title">{listing.title}</h3>

            <p className="mt-2 text-meta text-slate">
              {roomTypeLabel(listing.room_type)} · {listing.max_guests} guests · {listing.bedrooms}{" "}
              {listing.bedrooms === 1 ? "bedroom" : "bedrooms"}
            </p>

            {/* The typographic statement: price in the display face, unit in the
                body face, sharing a baseline. */}
            <p className="mt-5 flex items-baseline gap-1.5">
              <span className="tabular font-display text-price">
                {formatPrice(listing.price_per_night)}
              </span>
              <span className="text-meta text-slate">night</span>
            </p>
          </div>
        </Link>

        {/* The heart is a SIBLING of the link, layered on top. A <button> nested
            inside an <a> is invalid HTML and breaks keyboard navigation. */}
        <WishlistHeart saved={isSaved} onToggle={onToggleWishlist} title={listing.title} />
      </div>
    </motion.article>
  );
}

function Rating({ value, count }: { value: number; count: number }) {
  // A listing with no reviews shows "New" — printing "0.0" would read as a
  // terrible rating rather than as an absence of them.
  if (count === 0) return <span className="text-meta text-slate">New</span>;

  return (
    <span className="flex shrink-0 items-baseline gap-1 text-meta">
      <span aria-hidden>★</span>
      <span className="tabular font-medium">{value.toFixed(2)}</span>
      <span className="text-slate">({count})</span>
    </span>
  );
}

function WishlistHeart({
  saved,
  onToggle,
  title,
}: {
  saved: boolean;
  onToggle: () => void;
  title: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      // The label says what the BUTTON DOES, and names which listing — a screen
      // reader user hearing "Save" twelve times learns nothing.
      aria-label={saved ? `Remove ${title} from wishlist` : `Save ${title} to wishlist`}
      aria-pressed={saved}
      className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-paper/90 shadow-warm backdrop-blur-sm transition-colors duration-200 hover:bg-paper"
      whileTap={{ scale: 0.88 }}
      // The pop: overshoot to 1.18 and settle. Animating to a keyframe array
      // re-runs on every toggle, so un-saving pops too.
      animate={saved ? { scale: [1, 1.18, 1] } : { scale: 1 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
        <path
          d="M10 17s-6.2-4.05-6.2-8.06A3.65 3.65 0 0 1 10 6.3a3.65 3.65 0 0 1 6.2 2.64C16.2 12.95 10 17 10 17z"
          fill={saved ? "var(--color-coral)" : "rgba(255,255,255,0.35)"}
          stroke={saved ? "var(--color-coral)" : "var(--color-ink)"}
          strokeWidth="1.5"
          strokeLinejoin="round"
          className="transition-colors duration-200"
        />
      </svg>
    </motion.button>
  );
}
