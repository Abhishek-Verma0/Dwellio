/**
 * Every call to the FastAPI backend goes through this file. One place that
 * knows the base URL, one place that attaches the JWT, one place that turns a
 * non-2xx response into a thrown Error.
 *
 * Coming from Express: think of this as your axios instance with an
 * interceptor, except it's plain fetch — Next patches global fetch with
 * caching, so using it directly is what you want here.
 *
 * NEXT_PUBLIC_ prefix: Next inlines these into the browser bundle at build
 * time. Without the prefix the variable is server-only and would be undefined
 * in a client component.
 */

import type {
  AuthResponse,
  Availability,
  Booking,
  Filters,
  Listing,
  ListingDetail,
  ListingInput,
  ListingPage,
  Review,
  User,
  UserRole,
} from "@/types";

// Two callers, two answers. In the browser everything goes through "/api", which
// next.config.ts rewrites to uvicorn — same origin, no CORS, and nothing to
// configure at build time. Server components run *inside* the container, so they
// skip the proxy and hit loopback directly. Setting NEXT_PUBLIC_API_URL overrides
// both, which is what a split frontend/backend deploy would need.
const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (typeof window === "undefined" ? "http://127.0.0.1:8000" : "/api");

/** Query-string builder that drops empty values, so `?city=&guests=` never happens. */
function query(params: Record<string, string | number | boolean | undefined | null | number[]>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    // The backend reads repeated params for lists: ?amenity_ids=1&amenity_ids=2
    if (Array.isArray(value)) value.forEach((v) => search.append(key, String(v)));
    else search.append(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Carries the HTTP status alongside the message, so callers can tell the
 * difference between "this listing doesn't exist" (404 -> show the 404 page)
 * and "those dates were just taken" (409 -> show a toast) without string
 * matching on the error text.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions extends RequestInit {
  token?: string | null;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, ...init } = options;

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    // Listings change when hosts edit them, so never serve a stale cache.
    // ponytail: no-store everywhere for now. Swap individual calls to
    // next: { revalidate: 60 } if the demo ever feels slow.
    cache: "no-store",
  });

  if (!response.ok) {
    // FastAPI puts the human-readable message in `detail`. Validation errors
    // (422) put an array there instead, so fall back to a plain message.
    const body = await response.json().catch(() => null);
    const detail = typeof body?.detail === "string" ? body.detail : null;
    throw new ApiError(detail ?? `Request failed (${response.status})`, response.status);
  }

  // 204 No Content has an empty body — .json() would throw on it.
  return response.status === 204 ? (undefined as T) : response.json();
}

export interface ListingSearchParams {
  q?: string;
  city?: string;
  guests?: number;
  min_price?: number;
  max_price?: number;
  property_type?: string;
  room_type?: string;
  amenity_ids?: number[];
  check_in?: string;
  check_out?: string;
  sort?: string;
  page?: number;
  page_size?: number;
}

export const api = {
  searchListings: (params: ListingSearchParams = {}) =>
    request<ListingPage>(`/listings${query({ ...params })}`),

  getFilters: () => request<Filters>("/listings/filters"),

  getListing: (id: number) => request<ListingDetail>(`/listings/${id}`),

  /** Booked ranges for the calendar. Passing both dates also returns a yes/no. */
  getAvailability: (id: number, checkIn?: string, checkOut?: string) =>
    request<Availability>(
      `/listings/${id}/availability${query({ check_in: checkIn, check_out: checkOut })}`,
    ),

  getReviews: (id: number) => request<Review[]>(`/listings/${id}/reviews`),

  // --- auth ---------------------------------------------------------------

  register: (body: { email: string; password: string; full_name: string; role: UserRole }) =>
    request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(body) }),

  login: (body: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(body) }),

  /** Verifies a stored token AND returns the current user in one call. */
  me: (token: string) => request<User>("/auth/me", { token }),

  // --- bookings -----------------------------------------------------------

  /**
   * Instant Book. Note what is NOT sent: any price. The server reads the rate
   * off the listing and recomputes the total, so a tampered body changes
   * nothing. It also re-checks the dates and answers 409 if they were taken
   * while this tab sat open.
   */
  createBooking: (
    token: string,
    body: { listing_id: number; check_in: string; check_out: string; guests: number },
  ) => request<Booking>("/bookings", { method: "POST", token, body: JSON.stringify(body) }),

  myTrips: (token: string) => request<Booking[]>("/bookings/my-trips", { token }),

  // --- wishlist -----------------------------------------------------------
  // Returns the listings themselves, not link rows, so the wishlist page can
  // render the same card component as the explore grid.

  getWishlist: (token: string) => request<Listing[]>("/wishlist", { token }),

  /** Idempotent on the backend — saving twice is a no-op, not an error. */
  addToWishlist: (token: string, listingId: number) =>
    request<void>(`/wishlist/${listingId}`, { method: "POST", token }),

  removeFromWishlist: (token: string, listingId: number) =>
    request<void>(`/wishlist/${listingId}`, { method: "DELETE", token }),

  // --- hosting ------------------------------------------------------------

  /**
   * The host's OWN listings, including hidden ones — unlike GET /listings/{id},
   * which 404s on anything deactivated. That's why the edit page reads from
   * here instead: a host has to be able to edit a listing they've hidden.
   */
  myListings: (token: string) => request<ListingDetail[]>("/listings/mine", { token }),

  /** Reservations across every listing this host owns. */
  hostBookings: (token: string) => request<Booking[]>("/bookings/host", { token }),

  createListing: (token: string, body: ListingInput) =>
    request<ListingDetail>("/listings", { method: "POST", token, body: JSON.stringify(body) }),

  /** PATCH: only the fields sent get written, so a partial update is safe. */
  updateListing: (token: string, id: number, body: Partial<ListingInput> & { is_active?: boolean }) =>
    request<ListingDetail>(`/listings/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    }),

  /** Soft delete on the backend — the listing is hidden, bookings are kept. */
  deleteListing: (token: string, id: number) =>
    request<void>(`/listings/${id}`, { method: "DELETE", token }),
};
