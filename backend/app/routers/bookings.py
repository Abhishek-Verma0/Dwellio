"""
Booking routes — Instant Book.

The whole point of this file: the client is NOT trusted about availability or
price. The date picker may have been showing stale data for ten minutes, and
anyone can POST a handcrafted body with total_price: 1. So on every POST the
server re-checks the dates against the database and recomputes the money from
the listing's own columns. Creating the booking IS the confirmation — checkout
is mocked, there's no pending state to reconcile.
"""

from datetime import date

from fastapi import APIRouter, HTTPException, status
from sqlmodel import col, select

from app.auth import CurrentUser
from app.database import SessionDep
from app.models import Booking, Listing, booking_overlap_clause
from app.schemas import BookingCreate, BookingRead

router = APIRouter(prefix="/bookings", tags=["bookings"])


def price_breakdown(listing: Listing, check_in: date, check_out: date) -> dict:
    """total = nightly * nights + cleaning_fee + service_fee.

    A pure function (no DB, no request) so test_bookings.py can check the maths
    directly. Every number comes off the listing row — never off the request
    body — which is what stops a client from booking a villa for ₹1.

    round(..., 2) because floats: 3 * 1533.33 lands on 4599.990000000001.
    """
    nights = (check_out - check_in).days
    return {
        "nights": nights,
        "nightly_rate": listing.price_per_night,
        "cleaning_fee": listing.cleaning_fee,
        "service_fee": listing.service_fee,
        "total_price": round(
            listing.price_per_night * nights + listing.cleaning_fee + listing.service_fee, 2
        ),
    }


@router.post("", response_model=BookingRead, status_code=status.HTTP_201_CREATED)
def create_booking(session: SessionDep, user: CurrentUser, payload: BookingCreate):
    """Instant Book. Five gates, then insert.

    Dates themselves (check_out > check_in, not in the past) were already
    rejected by BookingCreate's validator — a 422 before this runs.
    """
    # 1. The listing must exist and still be live.
    listing = session.get(Listing, payload.listing_id)
    if listing is None or not listing.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Listing not found")

    # 2. You can't book your own place.
    # ponytail: any signed-in user can book (a host booking someone ELSE's
    # listing is normal on real Airbnb). Change to `user: GuestUser` if you
    # want strict guests-only.
    if listing.host_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot book your own listing")

    # 3. Capacity.
    if payload.guests > listing.max_guests:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"This place sleeps {listing.max_guests} guests, you asked for {payload.guests}",
        )

    # 4. THE re-check. Same clause the search filter and the calendar use, so
    # the three can never disagree about what "booked" means.
    # ponytail: check-then-insert, not a DB-level exclusion constraint —
    # SQLite has none. Two requests landing in the same millisecond could both
    # pass. Fine for a single-process demo; on Postgres this becomes an
    # EXCLUDE USING gist (daterange) constraint and the race disappears.
    clash = session.exec(
        select(Booking)
        .where(Booking.listing_id == listing.id)
        .where(booking_overlap_clause(payload.check_in, payload.check_out))
    ).first()
    if clash:
        raise HTTPException(
            status.HTTP_409_CONFLICT,  # 409 = "your request is valid, the world disagrees"
            f"Those dates are already booked ({clash.check_in} to {clash.check_out})",
        )

    # 5. Price computed server-side, then FROZEN onto the booking row. If the
    # host raises the nightly rate tomorrow, this total must not move.
    booking = Booking(
        listing_id=listing.id,
        guest_id=user.id,
        check_in=payload.check_in,
        check_out=payload.check_out,
        guests=payload.guests,
        **price_breakdown(listing, payload.check_in, payload.check_out),
    )

    session.add(booking)
    session.commit()
    session.refresh(booking)
    return booking


@router.get("/my-trips", response_model=list[BookingRead])
def my_trips(session: SessionDep, user: CurrentUser):
    """The guest's own bookings, newest stay first.

    `Booking.guest_id == user.id` is the authorization: the user id comes from
    the verified token, so there's no way to ask for someone else's trips.
    The listing rides along (BookingRead.listing) so the trips page can render
    a photo and title without N extra requests.
    """
    return session.exec(
        select(Booking)
        .where(Booking.guest_id == user.id)
        .order_by(col(Booking.check_in).desc())
    ).all()


@router.get("/host", response_model=list[BookingRead])
def bookings_for_my_listings(session: SessionDep, user: CurrentUser):
    """The other side of the same table: reservations on MY listings.

    Feeds the host dashboard. A JOIN instead of a second query: bookings whose
    listing's host_id is me.
    """
    return session.exec(
        select(Booking)
        .join(Listing)
        .where(Listing.host_id == user.id)
        .order_by(col(Booking.check_in).desc())
    ).all()
