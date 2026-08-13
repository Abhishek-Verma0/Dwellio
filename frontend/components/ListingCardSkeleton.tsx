/**
 * Skeleton, not a spinner: it holds the exact shape of the card that's coming,
 * so the layout doesn't jump when real content lands. A spinner tells you to
 * wait; a skeleton tells you what for.
 *
 * `animate-pulse` is a Tailwind built-in, and the reduced-motion rule in
 * globals.css already switches it off for anyone who asked for less movement.
 */
export function ListingCardSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="aspect-[4/3] rounded-card bg-line/70" />
      <div className="pt-5">
        <div className="h-2.5 w-24 rounded-full bg-line/70" />
        <div className="mt-4 h-5 w-3/4 rounded-full bg-line/70" />
        <div className="mt-3 h-3 w-1/2 rounded-full bg-line/70" />
        <div className="mt-6 h-6 w-28 rounded-full bg-line/70" />
      </div>
    </div>
  );
}
