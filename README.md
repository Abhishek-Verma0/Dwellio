# Dwellio

An Airbnb-style booking platform. Browse and filter homes, check real availability, book a stay
that instantly blocks those dates for everyone else, and — as a host — list and manage your own
places.

Built as two independent applications: a **FastAPI** JSON API and a **Next.js** frontend that talks
to it over HTTP. Neither knows anything about the other beyond the API contract.

```
Next.js (localhost:3000)  ──fetch──▶  FastAPI (localhost:8000)  ──▶  SQLite
```

---

## Table of contents

- [Running it](#running-it)
- [Demo logins](#demo-logins)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Database schema](#database-schema)
- [The booking rule](#the-booking-rule)
- [API reference](#api-reference)
- [Frontend structure](#frontend-structure)
- [Tests](#tests)
- [Assumptions and scope](#assumptions-and-scope)

---

## Running it

Two terminals. Backend first — the frontend renders on the server and calls the API during that
render, so it needs the API up.

### 1. Backend

```bash
cd backend

python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux

pip install -r requirements.txt
python -m app.seed              # wipes + rebuilds dwellio.db, prints the demo logins
uvicorn app.main:app --reload
```

Runs on **http://localhost:8000**. Interactive docs at **http://localhost:8000/docs** — click
**Authorize**, paste a token from `POST /auth/login`, and every protected route is callable from
the browser.

### 2. Frontend

```bash
cd frontend

npm install
npm run dev
```

Runs on **http://localhost:3000**.

The API base URL comes from `NEXT_PUBLIC_API_URL` in `frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Requires **Python 3.10+** and **Node 20+** (developed on Python 3.12 / Node 24).

### Resetting the data

`python -m app.seed` at any time. It drops every table and rebuilds from scratch, so the demo is
identical each run. The seeded bookings are relative to today's date, so they never go stale.

---

## Demo logins

Every seeded account uses the password **`password123`**.

| Email | Role | What's interesting |
|---|---|---|
| `priya@dwellio.com` | Host, Superhost | 3 listings with upcoming reservations |
| `rahul@dwellio.com` | Host, Superhost | 3 listings across the mountains |
| `ananya@dwellio.com` | Host | 3 city listings |
| `vikram@dwellio.com` | Host | 2 heritage listings |
| `aditya@dwellio.com` | Guest | 6 trips (past + upcoming), 3 saved homes |
| `sara@dwellio.com` | Guest | Past stays with reviews written |
| `dev@dwellio.com` | Guest | — |
| `meera@dwellio.com` | Guest | — |

The seeder prints the currently-blocked date ranges when it finishes. Try booking over one of them
to see the API answer **409**.

---

## Tech stack

**Backend** — FastAPI, SQLModel (SQLAlchemy + Pydantic in one model class), SQLite, PyJWT, bcrypt.

**Frontend** — Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Framer Motion.

Six dependencies on the backend, three on the frontend. Notable things deliberately *not* used:

| Not used | Why |
|---|---|
| `passlib`, `python-jose` | `bcrypt` and `pyjwt` are what they wrap. Two fewer dependencies. |
| `python-multipart` | Login takes JSON, not a form body. The Next.js client posts JSON anyway. |
| A date-picker library | `<input type="date">` ships a calendar that's keyboard accessible, and `min` gives range validation for free. |
| A modal library | The native `<dialog>` element gives a focus trap, Escape-to-close and a `::backdrop`. |
| An icon library | Nine inline SVGs, which inherit `currentColor`. |
| Jest / Pytest | Two plain assert scripts. `python test_bookings.py`, `npm test`. |

---

## Architecture

### Backend — routers, models, schemas

```
backend/
├─ requirements.txt
├─ test_bookings.py          the overlap + price test
└─ app/
   ├─ main.py                FastAPI app, CORS, router mounting
   ├─ database.py            engine + get_session dependency
   ├─ models.py              8 tables + the shared overlap rule
   ├─ schemas.py             request/response shapes
   ├─ auth.py                bcrypt, JWT, get_current_user / require_host
   ├─ seed.py                python -m app.seed
   └─ routers/
      ├─ auth.py        register · login · me
      ├─ listings.py    search · filters · detail · availability · CRUD
      ├─ bookings.py    Instant Book · my-trips · host reservations
      ├─ reviews.py     read + write, gated on a completed stay
      ├─ wishlist.py    save / unsave
      └─ users.py       public host profiles
```

**Three layers, each with one job.** `models.py` is the database. `schemas.py` is the wire format.
Routers are the HTTP layer. The separation isn't ceremony — it's what makes it *impossible* to leak
a password hash, because `UserPublic` has no such field and every route declares a `response_model`.

**Authorization is a function parameter**, not global middleware:

```python
def create_listing(payload: ListingCreate, host: HostUser, session: SessionDep): ...
def create_booking(payload: BookingCreate, user: CurrentUser, session: SessionDep): ...
def list_listings(session: SessionDep): ...                     # public
```

`CurrentUser` resolves the `Authorization: Bearer` header, verifies the JWT and loads the user from
the database. `HostUser` wraps it and adds a 403 for non-hosts. Because the dependency declares the
security scheme, `/docs` shows a padlock on exactly the protected routes.

Role is checked separately from ownership. `require_host` proves the caller is *a* host;
`listing.host_id == user.id` in the route proves they own *this* listing. Without the second check,
any host could edit any other host's listings.

### Frontend — server components by default

Pages are React Server Components unless they need the browser. The split is driven by one thing:
**the JWT lives in `localStorage`, which only the browser can read.**

| Rendering | Pages | Why |
|---|---|---|
| **Server** | explore, listing detail, checkout shell, login, register | Data is public. It's fetched before any HTML is sent — no spinner, no `useEffect`, crawlable. |
| **Client** | trips, wishlist, host dashboard, host forms | The content is per-user, so it needs the token. |

**The URL is the state.** Every filter, date and page number lives in the query string:

```
/?q=goa&check_in=2026-08-20&check_out=2026-08-25&guests=4&amenity_ids=7&sort=price_asc&page=2
```

The back button works, a filtered search is a shareable link, and the server renders the right
results on first paint. Server pages read `searchParams` and pass values down as props, so no child
needs `useSearchParams` (which would force a Suspense boundary).

**All backend calls go through `lib/api.ts`** — one place that knows the base URL, attaches the
token, and converts a non-2xx response into a typed `ApiError` carrying the HTTP status. Callers
branch on `status` rather than string-matching error text: 404 renders the not-found page, 409 shows
"those dates were taken", 401 clears the session and redirects to login.

---

## Database schema

Eight tables. Normalised, with real foreign keys and a genuine many-to-many.

```
                 ┌──────────┐
                 │   User   │  role: guest | host
                 └────┬─────┘
        ┌─────────────┼──────────────┬───────────────┐
        │ host_id     │ guest_id     │ author_id     │ user_id
   ┌────▼─────┐  ┌────▼─────┐   ┌────▼─────┐   ┌─────▼────────┐
   │ Listing  │◀─┤ Booking  │◀──┤  Review  │   │ WishlistItem │
   └──┬────┬──┘  └──────────┘   └──────────┘   └──────────────┘
      │    │          ▲ booking_id (UNIQUE)           │
      │    │          └────────────────────────────────┘ listing_id
      │    └──────────────┐
┌─────▼────────┐   ┌──────▼──────────────┐   ┌─────────┐
│ ListingPhoto │   │ ListingAmenityLink  │──▶│ Amenity │
└──────────────┘   └─────────────────────┘   └─────────┘
                     PK (listing_id, amenity_id)
```

| Table | Columns | Notes |
|---|---|---|
| **User** | 11 | `email` unique+indexed; `hashed_password`; `role`; host fields (`is_superhost`, `host_since`, `response_rate`) |
| **Listing** | 22 | `host_id` FK; `property_type`, `room_type`; location; capacity; `price_per_night` + fees; `avg_rating`/`review_count`; `is_active` |
| **ListingPhoto** | 5 | `listing_id` FK, `url`, `sort_order` (0 = cover). Cascade-deletes with the listing |
| **Amenity** | 4 | `name` unique. A shared lookup — "Wifi" exists once, not once per listing |
| **ListingAmenityLink** | 2 | Composite PK `(listing_id, amenity_id)` — duplicates impossible at the DB level |
| **Booking** | 13 | `listing_id` + `guest_id` FKs, both indexed; dates; **price snapshot**; `status` |
| **Review** | 13 | Overall rating + 6 sub-ratings; `booking_id` **UNIQUE** |
| **WishlistItem** | 3 | Composite PK `(user_id, listing_id)` |

### Four decisions worth explaining

**1. Booking stores a price snapshot, not just a foreign key.** `nightly_rate`, `cleaning_fee`,
`service_fee` and `total_price` are copied onto the row at booking time. If a host raises the
nightly rate tomorrow, an existing booking's total must not silently change.

**2. `avg_rating` and `review_count` are denormalised onto Listing.** They're recomputed from the
reviews table whenever a review is posted. The explore grid returns 20 listings without 20 `AVG()`
subqueries. The cost is that every write path must refresh them — there's exactly one, and it does.

**3. `Review.booking_id` is UNIQUE.** "One review per stay" is enforced by the database, not by an
`if` in a route handler that someone can forget. The route also picks *which* booking a review
belongs to server-side, so a client can't attach a review to someone else's stay.

**4. Delete is soft (`is_active = False`).** A hard delete would orphan every booking pointing at
that listing — guests would lose trip history for a place the host removed. Hidden listings vanish
from search and 404 on their public page, but stay in the owner's dashboard and can be relisted.

Indexes are on exactly the columns queries filter by: `city`, `country`, `property_type`,
`room_type`, `price_per_night`, `booking.listing_id`, `booking.guest_id`, `user.email`.

---

## The booking rule

The core logic of the whole application, defined **once** in `models.py`:

```python
def booking_overlap_clause(check_in: date, check_out: date):
    return and_(
        Booking.check_in < check_out,
        Booking.check_out > check_in,
        Booking.status == BookingStatus.confirmed,
    )
```

Three callers need it — the search filter (hide booked listings), the availability endpoint (grey
out calendar days), and booking creation (reject a double-booking). If each wrote its own version,
one would drift and the same room would be sold twice.

**Both comparisons are strict.** The range is half-open `[check_in, check_out)`: the previous guest
leaves on the morning the next one arrives, so `existing.check_out == new.check_in` is a *turnover
day*, not a conflict. Using `<=` / `>=` would block every back-to-back booking.

| Requested stay vs. an existing 20th → 25th | Result |
|---|---|
| 20th → 25th (identical) | rejected |
| 21st → 23rd (inside) | rejected |
| 18th → 22nd (overlaps start) | rejected |
| 23rd → 28th (overlaps end) | rejected |
| **25th → 28th (check in as they leave)** | **allowed** |
| **17th → 20th (leave as they arrive)** | **allowed** |

### Instant Book

`POST /bookings` runs five gates, then inserts:

1. Listing exists and is active → else **404**
2. Not your own listing → else **400**
3. `guests <= max_guests` → else **400**
4. **Overlap re-check** → else **409**
5. Price computed server-side from the listing's own columns, then frozen onto the row

Creating the booking *is* the confirmation — there's no pending state, because checkout is mocked.

**The client is never trusted about price.** `BookingCreate` has no price fields at all, so a
request carrying `total_price: 1` is silently ignored and the server's number is used. Dates are
re-checked at this moment because the page may have been open for an hour.

The frontend enforces the identical rule in the calendar (`lib/dates.ts`) and again on the checkout
page — but those are courtesies that save a round trip. The server is the only authority.

---

## API reference

22 endpoints. Full interactive documentation at `/docs` when the server is running.

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | — | Create an account (`role`: guest\|host). Returns a token — signing up logs you in |
| `POST` | `/auth/login` | — | Email + password → JWT |
| `GET` | `/auth/me` | Bearer | The current user |

### Listings

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/listings` | — | Search, filter, sort, paginate |
| `GET` | `/listings/filters` | — | Amenities, property types and price range for the filter row |
| `GET` | `/listings/mine` | Host | The host's own listings, including hidden ones |
| `GET` | `/listings/{id}` | — | Full detail with photos, amenities and host |
| `GET` | `/listings/{id}/availability` | — | Booked ranges; with `?check_in&check_out`, a yes/no |
| `POST` | `/listings` | Host | Create, with nested photos and amenity ids |
| `PATCH` | `/listings/{id}` | Host + owner | Partial update — only fields sent are written |
| `DELETE` | `/listings/{id}` | Host + owner | Soft delete |

`GET /listings` query parameters: `q`, `city`, `country`, `guests`, `min_price`, `max_price`,
`property_type`, `room_type`, `amenity_ids` (repeatable, **AND** semantics), `check_in`,
`check_out`, `sort` (`newest`\|`price_asc`\|`price_desc`\|`rating`), `page`, `page_size`.

### Bookings

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/bookings` | Bearer | Instant Book. **409** if the dates collide |
| `GET` | `/bookings/my-trips` | Bearer | The guest's own bookings |
| `GET` | `/bookings/host` | Bearer | Reservations across the host's listings |

### Reviews, wishlist, users

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/listings/{id}/reviews` | — | Reviews with their authors |
| `POST` | `/listings/{id}/reviews` | Bearer | Only after a **completed** stay; one per stay |
| `GET` | `/wishlist` | Bearer | Saved listings |
| `POST` | `/wishlist/{id}` | Bearer | Save (idempotent) |
| `DELETE` | `/wishlist/{id}` | Bearer | Unsave (idempotent) |
| `GET` | `/users/{id}` | — | Public profile — never includes the password hash |
| `GET` | `/users/{id}/listings` | — | A host's active listings |

### Status codes

`200` ok · `201` created · `204` no content · `400` bad request · `401` not authenticated ·
`403` authenticated but not allowed · `404` not found · `409` **dates already booked** ·
`422` validation failed

401 vs 403 is deliberate: 401 means "I don't know who you are", 403 means "I know, and you may
not." All 401s return the same generic message — telling an attacker "expired" vs "no such user"
is free reconnaissance.

---

## Frontend structure

```
frontend/
├─ app/
│  ├─ layout.tsx              fonts, providers, navbar
│  ├─ (explore)/page.tsx      /       explore grid  (route group scopes loading.tsx)
│  ├─ (explore)/loading.tsx           skeleton for the explore route only
│  ├─ listings/[id]/page.tsx  /listings/1
│  ├─ book/[id]/page.tsx      /book/1?check_in=…    checkout
│  ├─ trips/page.tsx          /trips
│  ├─ wishlist/page.tsx       /wishlist
│  ├─ host/page.tsx           /host                 dashboard
│  ├─ host/new/page.tsx       /host/new
│  ├─ host/[id]/edit/page.tsx /host/1/edit
│  ├─ login|register/page.tsx
│  ├─ not-found.tsx · error.tsx
│  └─ globals.css             the design tokens
├─ components/                18 components
├─ context/                   UserContext · WishlistContext
├─ lib/                       api.ts · dates.ts · format.ts · url.ts
└─ types/index.ts             mirrors the FastAPI schemas
```

### Design system — "Warm Editorial"

Tokens live in `app/globals.css`. Tailwind v4 moved theme configuration out of
`tailwind.config.js` and into a CSS `@theme` block, so **that file is the theme config**.

| Token | Value | Used for |
|---|---|---|
| `ink` | `#12233A` | Text, the anchor colour |
| `coral` | `#F0576B` | The single accent — CTAs, active states, the wishlist heart |
| `sand` | `#F7F4EF` | Page background |
| `paper` | `#FFFFFF` | Cards, inputs |
| `slate` | `#6B7A8D` | Secondary text |
| `line` | `#E6E1D8` | Borders |
| `success` | `#2E7D6F` | "Staying now", live listings |

**Fraunces** (variable, with the `WONK` axis on) for display type, **Inter** for everything else,
both self-hosted at build time via `next/font`. Shadows are tinted with the ink navy rather than
neutral black, so they don't go grey on sand. One easing curve, `--ease-editorial`, is used by every
transition in the app.

The signature element is the **oversized editorial listing card**: location as a letterspaced
eyebrow, title in Fraunces, and the price as a typographic statement. Motion is reveal-on-scroll,
hover lift + image zoom, and a wishlist heart that pops — all switched off by
`<MotionConfig reducedMotion="user">` plus a `prefers-reduced-motion` media query.

### Accessibility floor

Visible `:focus-visible` rings on the accent colour, `aria-pressed` on toggles, `aria-current` on
pagination, `aria-live` on toasts, descriptive labels ("Save *Heritage Haveli Suite* to wishlist",
not "Save"), and state never signalled by colour alone — booked calendar days are struck through as
well as greyed.

---

## Tests

Two, both plain assert scripts with no framework, each guarding the one piece of logic in its half
of the codebase that must not break.

```bash
cd backend  && python test_bookings.py    # → test_bookings: all checks passed
cd frontend && npm test                   # → dates: all checks passed
```

`backend/test_bookings.py` runs against an in-memory SQLite database: six overlap cases rejected,
four accepted (including both turnovers), cancelled bookings releasing their dates, and the price
maths — including that fees are charged once per stay, not per night.

`frontend/lib/dates.test.ts` covers the same rule as the calendar sees it, plus month-boundary
arithmetic and that "today" comes from the *local* calendar rather than UTC. Node runs the
TypeScript directly — no build step.

`app/seed.py` also self-checks: after seeding, every booking is re-queried through the overlap
clause and must match exactly one row (itself). If the seed ever double-books a listing, it fails
loudly rather than shipping data the API would reject.

---

## Assumptions and scope

### Deliberate simplifications

Each is marked with a `ponytail:` comment in the code, naming the ceiling and the upgrade path.

| Simplification | Reasoning / upgrade path |
|---|---|
| **Check-then-insert on booking, not a DB constraint** | SQLite has no exclusion constraint. Two requests in the same millisecond could both pass. On Postgres this becomes `EXCLUDE USING gist (daterange)` and the race disappears. |
| **No migrations (no Alembic)** | Schema change = delete `dwellio.db` and re-seed. Add Alembic when there's data you can't throw away. |
| **Money as `float`, not integer cents** | SQLite has no money type; totals are rounded to 2dp. Real currency should be integer cents. |
| **JWT in `localStorage`, no refresh token** | Stateless, 7-day expiry, logout is forgetting the token. An httpOnly cookie is stronger against XSS; refresh tokens would allow real revocation. |
| **`is_superhost` is a seeded flag** | Real Airbnb computes it from ratings and trip count on a schedule — a cron job, not a request handler. |
| **One flat wishlist per user** | No named collections ("Summer 2026"). The link table would need a parent. |
| **Amenity filter = N subqueries** | Fine for a filter row of ~5. Swap for `GROUP BY … HAVING COUNT(*) = N` if it grows. |
| **Photos by URL, no uploads** | The assignment allows it, and it avoids object storage entirely. |

### Interpretations of the brief

- **Any signed-in user can book**, not only `role=guest` — a host booking someone *else's* place is
  normal on real Airbnb. Booking your own listing is blocked.
- **Reviews require a completed stay** (`check_out <= today`) and are limited to one per booking.
  The assignment listed this as a bonus; it's enforced because ratings are worthless otherwise.
- **`GET /bookings/host` and `GET /listings/filters` were added** beyond the original endpoint list
   — the first because the brief asks for a host dashboard of listings *and their bookings*, the
  second because the filter row would otherwise hardcode amenities and drift from the data.
- **The confirmation screen replaces the checkout form in place** rather than living at its own
  URL, so there's no page you can refresh into and re-submit.
- **Demo credentials are printed on the login page.** Deliberate for a seeded portfolio build —
  the first thing to remove for a real deployment.

### Not implemented

Messaging between guest and host, identity verification, real payments, an interactive map, and
booking cancellation (`BookingStatus.cancelled` exists in the schema and the overlap rule already
honours it, but no route sets it). The assignment lists the first four as mockable.
