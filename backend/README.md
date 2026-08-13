# Dwellio API — Backend

An Airbnb-style booking API. Standalone REST service; a separate Next.js app consumes it.

- **Framework:** FastAPI
- **ORM / models:** SQLModel (SQLAlchemy + Pydantic in one class)
- **Database:** SQLite (`backend/dwellio.db`)
- **Auth:** JWT (PyJWT, HS256) + bcrypt password hashing
- **Python:** 3.12 (3.10+ required — the code uses `list[X]` and `X | None`)

---

## Setup

From the `backend/` folder:

```bash
python -m venv .venv
.venv\Scripts\activate         # Windows
# source .venv/bin/activate    # macOS / Linux

pip install -r requirements.txt

python -m app.seed             # wipes + rebuilds dwellio.db, prints the demo logins
uvicorn app.main:app --reload  # http://localhost:8000
```

Then open **http://localhost:8000/docs** for interactive Swagger docs. To call a
protected route there: `POST /auth/login`, copy `access_token`, click
**Authorize**, paste it.

### Demo logins

Every seeded account uses the password **`password123`**.

| Role | Email | Notes |
|---|---|---|
| Host | `priya@dwellio.com` | Superhost, 3 listings |
| Host | `rahul@dwellio.com` | Superhost, 3 listings |
| Host | `ananya@dwellio.com` | 3 listings |
| Host | `vikram@dwellio.com` | 2 listings |
| Guest | `aditya@dwellio.com` | has trips, reviews, wishlist |
| Guest | `sara@dwellio.com` | |
| Guest | `dev@dwellio.com` | |
| Guest | `meera@dwellio.com` | |

The seeder also prints the future bookings that already block dates — POST those
same dates to `/bookings` and the API answers **409**.

### Tests

```bash
python test_bookings.py   # overlap rule + price maths (plain asserts, in-memory DB)
python -m app.auth        # bcrypt + JWT self-check
```

### Environment variables

| Var | Default | Notes |
|---|---|---|
| `SECRET_KEY` | `dev-secret-change-me-in-production` | JWT signing key. **Must** be set for any deployment — the fallback exists so `clone && run` works with zero setup. |

CORS is open to `http://localhost:3000` and `http://127.0.0.1:3000` only
(`app/main.py`). Add the deployed frontend origin there before shipping.

---

## Architecture

```
backend/
├── app/
│   ├── main.py         # FastAPI app, CORS, router mounting  (≈ Express app.js)
│   ├── database.py     # engine + per-request Session dependency
│   ├── models.py       # SQLModel tables + the shared overlap clause
│   ├── schemas.py      # request/response Pydantic shapes (input & output contracts)
│   ├── auth.py         # bcrypt, JWT, get_current_user / require_host dependencies
│   ├── seed.py         # destructive demo-data seeder
│   └── routers/
│       ├── auth.py       /auth
│       ├── listings.py   /listings      (search, detail, availability, host CRUD)
│       ├── bookings.py   /bookings
│       ├── reviews.py    /listings/{id}/reviews
│       ├── wishlist.py   /wishlist
│       └── users.py      /users
├── test_bookings.py
└── requirements.txt
```

**Layering.** Routers hold HTTP concerns and business rules; `models.py` holds
the tables; `schemas.py` holds the wire contracts. There is no service layer —
the routes are thin enough that one would be indirection for its own sake.

Three ideas do most of the work:

**1. Separate model and schema classes.** `User` has `hashed_password`;
`UserPublic` does not, so `response_model=UserPublic` makes leaking it
impossible. Likewise `ListingCreate` has no `avg_rating` or `is_superhost`
field, so a client cannot POST its way to a 5-star listing.

**2. Auth as a dependency, not middleware.** `CurrentUser` and `HostUser` are
type aliases over `Depends(...)`. A route declares `host: HostUser` as a
parameter and the 401/403 happen before the body runs — and `/docs` shows a
padlock on exactly those routes because the framework knows which are guarded.
Role (`require_host`) and ownership (`listing.host_id == user.id`) are separate
checks: the first says "a host", the second says "the host who owns this".

**3. One definition of "overlap".** `booking_overlap_clause()` in `models.py` is
used by all three callers — the search filter, the availability endpoint, and
booking creation — so the calendar, the search results, and the 409 can never
disagree about what "booked" means.

### The booking rule

Dates are a **half-open range** `[check_in, check_out)`. A booking collides with
an existing one when:

```
existing.check_in < new.check_out  AND  existing.check_out > new.check_in
```

Both comparisons are strict. The old guest leaves on the morning the new guest
arrives, so `existing.check_out == new.check_in` is a turnover day, not a clash.
Using `<=` / `>=` would make back-to-back bookings impossible.

Instant Book means creating the booking *is* the confirmation — checkout is
mocked, there is no pending state. `POST /bookings` runs five gates:

1. listing exists and `is_active`
2. you are not the host of it
3. `guests <= max_guests`
4. **the overlap re-check against the DB** → 409 if it clashes
5. price computed from the listing's own columns, never from the request body

The price breakdown is then **frozen onto the booking row**
(`nights`, `nightly_rate`, `cleaning_fee`, `service_fee`, `total_price`). If the
host raises the rate tomorrow, this booking's total must not move.

```
total = price_per_night × nights + cleaning_fee + service_fee
```

Fees are charged once per stay, not per night.

---

## Database schema

SQLite. Tables are created on startup (`SQLModel.metadata.create_all`); there
are no migrations — the schema changes by deleting `dwellio.db` and re-seeding.

```
User ──< Listing ──< ListingPhoto
 │         │  └──── Amenity        (m2m via ListingAmenityLink)
 │         │
 │         ├──< Booking >── User   (guest)
 │         └──< Review  >── User   (author)
 │                └─ 1:1 Booking   (unique booking_id)
 └──< WishlistItem >── Listing     (m2m)
```

### `user`
| Column | Type | Notes |
|---|---|---|
| id | int PK | |
| email | str | **unique**, indexed |
| hashed_password | str | bcrypt |
| full_name | str | |
| role | enum | `guest` \| `host` — chosen at signup, drives permissions |
| avatar_url, bio | str? | |
| is_superhost | bool | |
| host_since | date? | set at registration for hosts |
| response_rate | int? | 0–100 |
| created_at | datetime | |

### `listing`
| Column | Type | Notes |
|---|---|---|
| id | int PK | |
| host_id | int FK → user.id | indexed |
| title, description | str | |
| property_type | str | indexed — free-form ("Villa", "Cabin", "Loft"); the list grows |
| room_type | enum | indexed — `entire_place` \| `private_room` \| `shared_room` |
| address, city, country | str | city + country indexed (every search filters on them) |
| latitude, longitude | float | for the map |
| max_guests, bedrooms, beds | int | |
| bathrooms | float | 1.5 baths is real |
| price_per_night | float | indexed — price-range filter |
| cleaning_fee, service_fee | float | per stay |
| avg_rating, review_count | float / int | **denormalised**, recomputed on every review write |
| is_active | bool | soft-delete flag |
| created_at | datetime | |

### `listingphoto`
`id`, `listing_id` FK (indexed), `url`, `caption?`, `sort_order` — its own table
because one listing has many photos. `sort_order == 0` is the cover; no separate
`is_cover` flag. Cascade-deleted with the listing.

### `amenity`
`id`, `name` (unique), `category`, `icon` — a shared lookup table, so "Wifi"
exists once, not once per listing.

### `listingamenitylink`
`(listing_id, amenity_id)` composite PK — the many-to-many. The composite key
makes duplicate links impossible at the DB level.

### `booking`
| Column | Type | Notes |
|---|---|---|
| id | int PK | |
| listing_id | int FK | indexed — the overlap query filters on it |
| guest_id | int FK | indexed — "My Trips" filters on it |
| check_in, check_out | date | half-open range |
| guests | int | |
| nights, nightly_rate, cleaning_fee, service_fee, total_price | | **price snapshot** taken at booking time |
| status | enum | `confirmed` \| `cancelled` — cancelled rows release their dates |
| created_at | datetime | |

### `review`
`id`, `listing_id` FK, `author_id` FK, `booking_id` FK **unique** (one review per
stay, enforced by the DB rather than a route check), `rating` 1–5, plus Airbnb's
six sub-scores as columns — `cleanliness`, `accuracy`, `check_in_rating`,
`communication`, `location_rating`, `value` — then `comment`, `created_at`.
Sub-scores are columns, not a child table, because the set is fixed and always
read together with the review.

### `wishlistitem`
`(user_id, listing_id)` composite PK + `created_at`. The composite key is what
makes the add/remove routes idempotent — "saved twice" cannot exist.

---

## API overview

21 endpoints. Full interactive reference at `/docs`.
🔒 = requires `Authorization: Bearer <token>`. 🏠 = host role required.

### Auth
| Method | Path | |
|---|---|---|
| POST | `/auth/register` | email, password (min 8), full_name, role. Returns a token + user — registers and logs in. 409 if the email is taken. |
| POST | `/auth/login` | JSON body (not form-encoded). Returns a token + user. One generic 401 for both wrong email and wrong password, so accounts can't be enumerated. |
| GET | `/auth/me` 🔒 | The current user. |

Tokens are HS256, expire in 7 days, and carry `sub` (user id) and `role`. The
role in the token is a convenience for the frontend and is **never** trusted for
authorization — every request re-reads the user from the DB.

### Listings
| Method | Path | |
|---|---|---|
| GET | `/listings` | The explore grid. Filters: `q`, `city`, `country`, `guests`, `min_price`, `max_price`, `property_type`, `room_type`, `amenity_ids` (repeat the param; AND semantics), `check_in`+`check_out` (hides listings already booked). `sort` = `newest` \| `price_asc` \| `price_desc` \| `rating`. Paginated via `page` / `page_size` (max 50); returns `{items, total, page, page_size, total_pages}`. |
| GET | `/listings/mine` 🔒🏠 | Host dashboard — own listings, **including** deactivated ones. |
| GET | `/listings/{id}` | Detail: photos, amenities, host. 404 if deactivated. |
| GET | `/listings/{id}/availability` | Booked date ranges for the calendar. Pass `check_in`+`check_out` to also get a boolean `available`. |
| POST | `/listings` 🔒🏠 | Create, with nested `photos[]` and `amenity_ids[]` in one request. `host_id` comes from the token, so you cannot create a listing owned by someone else. |
| PATCH | `/listings/{id}` 🔒🏠 | Partial update; only fields actually sent are written. Sending `photos` or `amenity_ids` **replaces** that whole set. 403 unless you own it. |
| DELETE | `/listings/{id}` 🔒🏠 | **Soft delete** (`is_active = False`). A hard delete would orphan every booking pointing at the listing and wipe guests' trip history. 403 unless you own it. |

### Bookings
| Method | Path | |
|---|---|---|
| POST | `/bookings` 🔒 | Instant Book. 422 bad dates · 404 no listing · 400 own listing / over capacity · **409 dates taken** · 201 confirmed. |
| GET | `/bookings/my-trips` 🔒 | The guest's own bookings with the listing populated. Scoped by the token's user id, so you cannot read anyone else's. |
| GET | `/bookings/host` 🔒 | The other side: reservations on listings you own. |

### Reviews
| Method | Path | |
|---|---|---|
| GET | `/listings/{id}/reviews` | Public. |
| POST | `/listings/{id}/reviews` 🔒 | Only after a **completed** stay (403 otherwise), once per stay (409 otherwise). The server picks which booking the review attaches to — the client cannot name one. Updates the listing's `avg_rating` / `review_count`. |

### Wishlist
| Method | Path | |
|---|---|---|
| GET | `/wishlist` 🔒 | Saved listings as cards; deactivated ones filtered out. |
| POST | `/wishlist/{listing_id}` 🔒 | Idempotent — 204. |
| DELETE | `/wishlist/{listing_id}` 🔒 | Idempotent — 204. |

### Users
| Method | Path | |
|---|---|---|
| GET | `/users/{id}` | Public profile ("Meet your host"). Never includes the password hash. |
| GET | `/users/{id}/listings` | A host's public (active) listings. |

### Status codes

`200` ok · `201` created · `204` no content · `400` valid request, business rule
says no · `401` not authenticated · `403` authenticated but not allowed · `404`
missing · `409` conflict (email taken, dates booked, already reviewed) · `422`
body failed validation.

---

## Assumptions

- **Checkout is mocked.** No payment provider, no pending state — creating a booking *is* the confirmation, which is why there's a single `confirmed` status on insert.
- **Any signed-in user can book** someone else's listing, including a host. That mirrors real Airbnb. Only *creating* listings is host-gated.
- **Cancellation isn't exposed.** `BookingStatus.cancelled` exists and the overlap clause honours it (cancelled bookings release their dates), but no endpoint sets it yet.
- **Photos are URLs, not uploads.** No file storage; the seeder uses real Unsplash URLs.
- **Money is stored as `float`.** SQLite has no money type and this is a demo; totals are `round(..., 2)`. Real currency would mean integer cents.
- **Overlap is check-then-insert, not a DB constraint.** SQLite has no exclusion constraint, so two requests landing in the same millisecond could in principle both pass. Fine for a single-process demo; on Postgres this becomes `EXCLUDE USING gist (daterange(...))` and the race disappears.
- **No migrations.** Schema changes = delete `dwellio.db`, re-run the seeder.
- **No refresh tokens, no logout/revocation.** A 7-day access token is enough here.
- **Amenities are seeded, not user-creatable.** Hosts pick from the fixed list by id.
- **Reviews are immutable** once posted — no edit or delete route.
