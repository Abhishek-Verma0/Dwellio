import { ListingCardSkeleton } from "@/components/ListingCardSkeleton";

/**
 * NEXT-SPECIFIC: a file named loading.tsx is shown automatically while the
 * sibling page.tsx is fetching on the server. No isLoading state, no ternary
 * in the page — Next wraps the route in a <Suspense> boundary using this as
 * the fallback.
 *
 * Because our page fetches on the server, this is the ONLY loading UI the
 * explore page needs.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-[1400px] px-6 pb-32 lg:px-10">
      <div className="py-12 lg:py-16">
        <div className="h-3 w-40 animate-pulse rounded-full bg-line/70" />
        <div className="mt-6 h-12 w-[28rem] max-w-full animate-pulse rounded-full bg-line/70" />
      </div>
      <div className="h-[86px] w-full animate-pulse rounded-card bg-line/70 md:rounded-full" />
      <div className="mt-10 h-10 w-full animate-pulse rounded-full bg-line/70" />
      <div className="mt-12 grid grid-cols-1 gap-x-8 gap-y-16 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <ListingCardSkeleton key={index} />
        ))}
      </div>
    </main>
  );
}
