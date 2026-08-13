"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ListingCard } from "@/components/ListingCard";
import { useToast } from "@/components/Toast";
import { errorMessage, useUser } from "@/context/UserContext";
import { api } from "@/lib/api";
import type { Filters, Listing, ListingDetail, ListingInput, RoomType } from "@/types";

const ROOM_TYPES: { value: RoomType; label: string; hint: string }[] = [
  { value: "entire_place", label: "Entire place", hint: "Guests have the whole home" },
  { value: "private_room", label: "Private room", hint: "Own room, shared common areas" },
  { value: "shared_room", label: "Shared room", hint: "A bed in a shared space" },
];

/** Numbers live as strings so a half-typed field isn't NaN mid-keystroke. */
interface FormState {
  title: string;
  description: string;
  property_type: string;
  room_type: RoomType;
  address: string;
  city: string;
  country: string;
  latitude: string;
  longitude: string;
  max_guests: string;
  bedrooms: string;
  beds: string;
  bathrooms: string;
  price_per_night: string;
  cleaning_fee: string;
  service_fee: string;
  photos: string[];
  amenity_ids: number[];
}

const emptyForm: FormState = {
  title: "",
  description: "",
  property_type: "",
  room_type: "entire_place",
  address: "",
  city: "",
  country: "India",
  latitude: "",
  longitude: "",
  max_guests: "2",
  bedrooms: "1",
  beds: "1",
  bathrooms: "1",
  price_per_night: "",
  cleaning_fee: "0",
  service_fee: "0",
  photos: [""],
  amenity_ids: [],
};

/**
 * One form for creating and editing — the fields are identical, only the verb
 * and the request differ.
 *
 * The right-hand column shows the actual ListingCard the guest will see,
 * updating as you type. It's the same component the explore grid renders, so
 * the preview can't drift from the real thing.
 */
export function ListingForm({ existing }: { existing?: ListingDetail }) {
  const router = useRouter();
  const showToast = useToast();
  const { token, user } = useUser();

  const [form, setForm] = useState<FormState>(() =>
    existing ? fromListing(existing) : emptyForm,
  );
  const [filters, setFilters] = useState<Filters | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getFilters().then(setFilters).catch(() => setFilters(null));
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;

    setError(null);
    setSaving(true);

    try {
      const body = toInput(form);
      if (existing) {
        await api.updateListing(token, existing.id, body);
        showToast("Changes saved.");
      } else {
        await api.createListing(token, body);
        showToast("Listing published.");
      }
      router.push("/host");
      // refresh() re-runs the server components on /host so the new listing is
      // there, instead of a cached version without it.
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-16 lg:grid-cols-[1fr_380px]">
      <div className="space-y-12">
        <Section title="The basics">
          <Field label="Title" hint="What a guest sees first">
            <input
              required
              maxLength={90}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Beachfront villa with a private pool"
              className={inputClass}
            />
          </Field>

          <Field label="Description" hint="What makes it worth the trip">
            <textarea
              required
              rows={6}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Wake up to the sound of the sea. Ten minutes from the market, far enough from the road that all you hear at night is water."
              className={`${inputClass} resize-y`}
            />
          </Field>
        </Section>

        <Section title="The place">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Property type">
              <input
                required
                list="property-types"
                value={form.property_type}
                onChange={(e) => set("property_type", e.target.value)}
                placeholder="Villa"
                className={inputClass}
              />
              {/* datalist = native autocomplete. Suggests the types already in
                  use without stopping a host from inventing a new one. */}
              <datalist id="property-types">
                {filters?.property_types.map((type) => (
                  <option key={type} value={type} />
                ))}
              </datalist>
            </Field>

            <Field label="Room type">
              <select
                value={form.room_type}
                onChange={(e) => set("room_type", e.target.value as RoomType)}
                className={inputClass}
              >
                {ROOM_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} — {option.hint}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Field label="Guests">
              <input required type="number" min={1} value={form.max_guests} onChange={(e) => set("max_guests", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Bedrooms">
              <input required type="number" min={0} value={form.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Beds">
              <input required type="number" min={1} value={form.beds} onChange={(e) => set("beds", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Baths">
              <input required type="number" min={0.5} step={0.5} value={form.bathrooms} onChange={(e) => set("bathrooms", e.target.value)} className={inputClass} />
            </Field>
          </div>
        </Section>

        <Section title="Where it is">
          <Field label="Address">
            <input required value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="House 12, Ashwem Beach Road" className={inputClass} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="City">
              <input required value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Goa" className={inputClass} />
            </Field>
            <Field label="Country">
              <input required value={form.country} onChange={(e) => set("country", e.target.value)} className={inputClass} />
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Latitude" hint="For the map pin">
              <input required type="number" step="any" min={-90} max={90} value={form.latitude} onChange={(e) => set("latitude", e.target.value)} placeholder="15.6425" className={inputClass} />
            </Field>
            <Field label="Longitude">
              <input required type="number" step="any" min={-180} max={180} value={form.longitude} onChange={(e) => set("longitude", e.target.value)} placeholder="73.7307" className={inputClass} />
            </Field>
          </div>
        </Section>

        <Section title="What it costs">
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Per night" hint="₹">
              <input required type="number" min={1} value={form.price_per_night} onChange={(e) => set("price_per_night", e.target.value)} placeholder="8000" className={inputClass} />
            </Field>
            <Field label="Cleaning fee" hint="Once per stay">
              <input type="number" min={0} value={form.cleaning_fee} onChange={(e) => set("cleaning_fee", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Service fee" hint="Once per stay">
              <input type="number" min={0} value={form.service_fee} onChange={(e) => set("service_fee", e.target.value)} className={inputClass} />
            </Field>
          </div>
        </Section>

        <Section title="Photos" description="Paste image URLs. The first one is the cover.">
          <div className="space-y-3">
            {form.photos.map((url, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="url"
                  value={url}
                  onChange={(e) =>
                    set("photos", form.photos.map((p, i) => (i === index ? e.target.value : p)))
                  }
                  placeholder="https://images.unsplash.com/photo-…"
                  className={inputClass}
                />
                {form.photos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => set("photos", form.photos.filter((_, i) => i !== index))}
                    aria-label={`Remove photo ${index + 1}`}
                    className="shrink-0 rounded-input border border-line px-4 text-meta transition-colors hover:border-coral hover:text-coral"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => set("photos", [...form.photos, ""])}
            className="text-meta font-medium underline underline-offset-4 transition-colors hover:text-coral"
          >
            Add another photo
          </button>
        </Section>

        <Section title="Amenities" description="Guests filter by these, so be accurate.">
          {filters ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {filters.amenities.map((amenity) => {
                const checked = form.amenity_ids.includes(amenity.id);
                return (
                  <label
                    key={amenity.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-input border px-4 py-3 text-meta transition-colors ${
                      checked ? "border-coral bg-coral/5" : "border-line hover:border-ink/25"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        set(
                          "amenity_ids",
                          checked
                            ? form.amenity_ids.filter((id) => id !== amenity.id)
                            : [...form.amenity_ids, amenity.id],
                        )
                      }
                      className="h-4 w-4 accent-coral"
                    />
                    <span>
                      {amenity.icon} {amenity.name}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <div aria-hidden className="h-32 animate-pulse rounded-input bg-line/60" />
          )}
        </Section>

        {error && (
          <p role="alert" className="rounded-input border border-coral/30 bg-coral/5 px-4 py-3 text-meta text-coral">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-8">
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-coral px-8 py-4 text-body font-semibold text-paper transition-colors duration-200 hover:bg-coral-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : existing ? "Save changes" : "Publish listing"}
          </button>
          <Link
            href="/host"
            className="rounded-full border border-line px-6 py-4 text-meta font-medium transition-colors hover:border-ink/30"
          >
            Cancel
          </Link>
        </div>
      </div>

      <aside>
        <div className="sticky top-24">
          <p className="text-eyebrow uppercase text-slate">How guests will see it</p>
          {/* The real card component, fed from form state. pointer-events-none
              because it's a preview — its links and heart aren't live. */}
          <div className="mt-5 pointer-events-none">
            <ListingCard listing={previewListing(form, user?.is_superhost ?? false)} />
          </div>
        </div>
      </aside>
    </form>
  );
}

const inputClass =
  "w-full rounded-input border border-line bg-paper px-4 py-3 text-body outline-none transition-colors focus:border-ink/40";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-display text-h2">{title}</h2>
        {description && <p className="mt-2 text-meta text-slate">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-eyebrow uppercase text-slate">{label}</span>
        {hint && <span className="text-meta text-slate">{hint}</span>}
      </span>
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

/** Form state -> the request body the API expects. */
function toInput(form: FormState): ListingInput {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    property_type: form.property_type.trim(),
    room_type: form.room_type,
    address: form.address.trim(),
    city: form.city.trim(),
    country: form.country.trim(),
    latitude: Number(form.latitude),
    longitude: Number(form.longitude),
    max_guests: Number(form.max_guests),
    bedrooms: Number(form.bedrooms),
    beds: Number(form.beds),
    bathrooms: Number(form.bathrooms),
    price_per_night: Number(form.price_per_night),
    cleaning_fee: Number(form.cleaning_fee || 0),
    service_fee: Number(form.service_fee || 0),
    // Blank rows are dropped rather than saved as empty images.
    photos: form.photos
      .map((url) => url.trim())
      .filter(Boolean)
      .map((url, index) => ({ url, sort_order: index })),
    amenity_ids: form.amenity_ids,
  };
}

/** An existing listing -> form state. */
function fromListing(listing: ListingDetail): FormState {
  return {
    title: listing.title,
    description: listing.description,
    property_type: listing.property_type,
    room_type: listing.room_type,
    address: listing.address,
    city: listing.city,
    country: listing.country,
    latitude: String(listing.latitude),
    longitude: String(listing.longitude),
    max_guests: String(listing.max_guests),
    bedrooms: String(listing.bedrooms),
    beds: String(listing.beds),
    bathrooms: String(listing.bathrooms),
    price_per_night: String(listing.price_per_night),
    cleaning_fee: String(listing.cleaning_fee),
    service_fee: String(listing.service_fee),
    photos: listing.photos.length > 0 ? listing.photos.map((photo) => photo.url) : [""],
    amenity_ids: listing.amenities.map((amenity) => amenity.id),
  };
}

/** Form state -> a Listing shaped object, purely so the card can render it. */
function previewListing(form: FormState, isSuperhost: boolean): Listing {
  return {
    id: 0,
    title: form.title || "Your listing title",
    city: form.city || "City",
    country: form.country || "Country",
    property_type: form.property_type || "Home",
    room_type: form.room_type,
    price_per_night: Number(form.price_per_night) || 0,
    cleaning_fee: Number(form.cleaning_fee) || 0,
    service_fee: Number(form.service_fee) || 0,
    max_guests: Number(form.max_guests) || 1,
    bedrooms: Number(form.bedrooms) || 0,
    beds: Number(form.beds) || 1,
    bathrooms: Number(form.bathrooms) || 1,
    avg_rating: 0,
    review_count: 0,
    latitude: 0,
    longitude: 0,
    photos: form.photos
      .filter((url) => url.trim())
      .map((url, index) => ({ id: index, url, caption: null, sort_order: index })),
    host: isSuperhost
      ? ({ is_superhost: true } as Listing["host"])
      : null,
  };
}
