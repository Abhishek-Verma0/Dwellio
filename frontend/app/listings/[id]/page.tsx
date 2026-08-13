import Image from "next/image";
import { notFound } from "next/navigation";

import { BookingPanel } from "@/components/BookingPanel";
import { PhotoGallery } from "@/components/PhotoGallery";
import { ApiError, api } from "@/lib/api";
import { roomTypeLabel } from "@/lib/format";
import type { Availability, ListingDetail, Review } from "@/types";

/**
 * NEXT-SPECIFIC: the folder name [id] makes this a dynamic route. The value
 * arrives as `props.params` — a Promise in Next 16, so it must be awaited.
 *
 * `PageProps<'/listings/[id]'>` is a globally available type Next generates
 * from the route tree, so `params.id` is typed without writing the shape out.
 * Rename the folder and this type breaks — which is the point.
 */
export default async function ListingPage(props: PageProps<"/listings/[id]">) {
  const { id } = await props.params;
  const listingId = Number(id);

  // A non-numeric URL like /listings/banana never reaches the API.
  if (!Number.isFinite(listingId)) notFound();

  let listing: ListingDetail;
  let availability: Availability;
  let reviews: Review[];

  try {
    [listing, availability, reviews] = await Promise.all([
      api.getListing(listingId),
      api.getAvailability(listingId),
      api.getReviews(listingId),
    ]);
  } catch (caught) {
    // Only a real 404 from the backend (missing or deactivated listing) becomes
    // the 404 page. A network failure or a 500 must NOT masquerade as "this
    // listing doesn't exist" — it gets rethrown to the error boundary instead.
    if (caught instanceof ApiError && caught.status === 404) notFound();
    throw caught;
  }

  return (
    <main className="mx-auto max-w-[1200px] px-6 pb-32 lg:px-10">
      <header className="py-10">
        <p className="text-eyebrow uppercase text-slate">
          {listing.city}, {listing.country}
        </p>
        <h1 className="mt-4 max-w-3xl font-display text-h1">{listing.title}</h1>
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-slate">
          {listing.review_count > 0 && (
            <>
              <span className="text-ink">
                <span aria-hidden>★</span>{" "}
                <span className="tabular font-medium">{listing.avg_rating.toFixed(2)}</span>{" "}
                <span className="text-slate">
                  ({listing.review_count} {listing.review_count === 1 ? "review" : "reviews"})
                </span>
              </span>
              <span aria-hidden>·</span>
            </>
          )}
          <span>{listing.property_type}</span>
          <span aria-hidden>·</span>
          <span>{listing.address}</span>
        </p>
      </header>

      <PhotoGallery photos={listing.photos} title={listing.title} />

      <div className="mt-14 grid gap-16 lg:grid-cols-[1fr_400px]">
        <div>
          <section className="border-b border-line pb-10">
            <h2 className="font-display text-h2">
              {roomTypeLabel(listing.room_type)} hosted by {listing.host?.full_name ?? "your host"}
            </h2>
            <p className="mt-3 text-body text-slate">
              {listing.max_guests} guests · {listing.bedrooms}{" "}
              {listing.bedrooms === 1 ? "bedroom" : "bedrooms"} · {listing.beds}{" "}
              {listing.beds === 1 ? "bed" : "beds"} · {listing.bathrooms}{" "}
              {listing.bathrooms === 1 ? "bath" : "baths"}
            </p>
          </section>

          <section className="border-b border-line py-10">
            <p className="whitespace-pre-line text-body">{listing.description}</p>
          </section>

          {listing.amenities.length > 0 && (
            <section className="border-b border-line py-10">
              <h2 className="font-display text-h2">What this place offers</h2>
              <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {listing.amenities.map((amenity) => (
                  <li key={amenity.id} className="flex items-center gap-3 text-body">
                    <span aria-hidden className="text-lead">
                      {amenity.icon}
                    </span>
                    {amenity.name}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {listing.host && <HostCard host={listing.host} />}

          <ReviewsSection reviews={reviews} listing={listing} />
        </div>

        <aside>
          <BookingPanel listing={listing} availability={availability} />
        </aside>
      </div>
    </main>
  );
}

function HostCard({ host }: { host: NonNullable<ListingDetail["host"]> }) {
  const hostingSince = host.host_since ? new Date(host.host_since).getUTCFullYear() : null;

  return (
    <section className="border-b border-line py-10">
      <div className="flex items-start gap-5">
        {host.avatar_url && (
          <Image
            src={host.avatar_url}
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 shrink-0 rounded-full object-cover"
          />
        )}
        <div>
          <h2 className="font-display text-h2">Hosted by {host.full_name}</h2>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-slate">
            {host.is_superhost && (
              <>
                <span className="rounded-full bg-coral/10 px-2.5 py-1 font-semibold text-coral">
                  Superhost
                </span>
                <span aria-hidden>·</span>
              </>
            )}
            {hostingSince && <span>Hosting since {hostingSince}</span>}
            {host.response_rate !== null && (
              <>
                <span aria-hidden>·</span>
                <span>{host.response_rate}% response rate</span>
              </>
            )}
          </p>
          {host.bio && <p className="mt-4 max-w-lg text-body text-slate">{host.bio}</p>}
        </div>
      </div>
    </section>
  );
}

/** The six sub-scores Airbnb collects, averaged across every review. */
const SUB_RATINGS = [
  { key: "cleanliness", label: "Cleanliness" },
  { key: "accuracy", label: "Accuracy" },
  { key: "check_in_rating", label: "Check-in" },
  { key: "communication", label: "Communication" },
  { key: "location_rating", label: "Location" },
  { key: "value", label: "Value" },
] as const;

function ReviewsSection({ reviews, listing }: { reviews: Review[]; listing: ListingDetail }) {
  if (reviews.length === 0) {
    return (
      <section className="py-10">
        <h2 className="font-display text-h2">No reviews yet</h2>
        <p className="mt-3 max-w-md text-body text-slate">
          This one&apos;s new. Book it and you&apos;ll be the first to say how it went.
        </p>
      </section>
    );
  }

  const average = (key: (typeof SUB_RATINGS)[number]["key"]) =>
    reviews.reduce((sum, review) => sum + review[key], 0) / reviews.length;

  return (
    <section className="py-10">
      <h2 className="font-display text-h2">
        <span aria-hidden>★</span> {listing.avg_rating.toFixed(2)} · {listing.review_count}{" "}
        {listing.review_count === 1 ? "review" : "reviews"}
      </h2>

      <dl className="mt-8 grid grid-cols-1 gap-x-12 gap-y-4 sm:grid-cols-2">
        {SUB_RATINGS.map(({ key, label }) => {
          const score = average(key);
          return (
            <div key={key} className="flex items-center gap-4">
              <dt className="w-32 shrink-0 text-meta">{label}</dt>
              {/* The bar is decorative; the number beside it carries the value. */}
              <dd className="flex flex-1 items-center gap-3">
                <span aria-hidden className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                  <span className="block h-full rounded-full bg-ink" style={{ width: `${(score / 5) * 100}%` }} />
                </span>
                <span className="tabular w-8 shrink-0 text-right text-meta">{score.toFixed(1)}</span>
              </dd>
            </div>
          );
        })}
      </dl>

      <ul className="mt-12 grid gap-10 sm:grid-cols-2">
        {reviews.map((review) => (
          <li key={review.id}>
            <div className="flex items-center gap-3">
              {review.author?.avatar_url && (
                <Image
                  src={review.author.avatar_url}
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full object-cover"
                />
              )}
              <div>
                <p className="font-medium">{review.author?.full_name ?? "A guest"}</p>
                <p className="text-meta text-slate">
                  {new Date(review.created_at).toLocaleDateString("en-IN", {
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
            <p className="mt-4 text-body text-slate">{review.comment}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
