/**
 * These mirror the FastAPI response schemas one-to-one (backend/app/schemas.py).
 * Keeping them in one file means a backend field rename breaks the build here
 * instead of silently rendering `undefined` in the UI.
 */

export type UserRole = "guest" | "host";
export type RoomType = "entire_place" | "private_room" | "shared_room";

/** UserPublic — note there is no password field, by design. */
export interface User {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url: string | null;
  bio: string | null;
  is_superhost: boolean;
  host_since: string | null;
  response_rate: number | null;
  created_at: string;
}

export interface Photo {
  id: number;
  url: string;
  caption: string | null;
  sort_order: number;
}

export interface Amenity {
  id: number;
  name: string;
  category: string;
  icon: string | null;
}

/** ListingCard — the shape the explore grid renders. */
export interface Listing {
  id: number;
  title: string;
  city: string;
  country: string;
  property_type: string;
  room_type: RoomType;
  price_per_night: number;
  cleaning_fee: number;
  service_fee: number;
  max_guests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  avg_rating: number;
  review_count: number;
  latitude: number;
  longitude: number;
  photos: Photo[];
  host: User | null;
}

/** ListingDetail extends the card with the heavy fields. */
export interface ListingDetail extends Listing {
  description: string;
  address: string;
  host_id: number;
  is_active: boolean;
  created_at: string;
  amenities: Amenity[];
}

/** What a host sends when creating or editing a listing. */
export interface PhotoInput {
  url: string;
  caption?: string | null;
  sort_order?: number;
}

export interface ListingInput {
  title: string;
  description: string;
  property_type: string;
  room_type: RoomType;
  address: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  max_guests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  price_per_night: number;
  cleaning_fee: number;
  service_fee: number;
  photos: PhotoInput[];
  amenity_ids: number[];
}

/** POST /auth/login and /auth/register both return this. */
export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

/** A confirmed booking. The price fields are the server's, frozen at booking time. */
export interface Booking {
  id: number;
  listing_id: number;
  guest_id: number;
  check_in: string;
  check_out: string;
  guests: number;
  nights: number;
  nightly_rate: number;
  cleaning_fee: number;
  service_fee: number;
  total_price: number;
  status: string;
  created_at: string;
  listing: Listing | null;
}

/** A review, with the six sub-scores Airbnb collects. */
export interface Review {
  id: number;
  listing_id: number;
  rating: number;
  cleanliness: number;
  accuracy: number;
  check_in_rating: number;
  communication: number;
  location_rating: number;
  value: number;
  comment: string;
  created_at: string;
  author: User | null;
}

/** GET /listings/{id}/availability — feeds the calendar. */
export interface Availability {
  listing_id: number;
  /** Half-open ranges: the guest leaves on check_out, so that night is free. */
  booked: { check_in: string; check_out: string }[];
  available: boolean | null;
}

/** GET /listings/filters — what the filter row can filter by. */
export interface Filters {
  amenities: Amenity[];
  property_types: string[];
  price_min: number;
  price_max: number;
}

/** ListingPage — the paginated envelope from GET /listings. */
export interface ListingPage {
  items: Listing[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
