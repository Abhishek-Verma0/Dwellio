"""
The one test in this repo, covering the one piece of logic that must not break:
the overlap rule and the price maths.

Run it:  python test_bookings.py     (from the backend/ folder)

No pytest, no fixtures — plain asserts against an in-memory SQLite database, so
it runs in a second and touches nothing on disk.
"""

from datetime import date, timedelta

from sqlmodel import Session, SQLModel, create_engine, select

from app.models import Booking, BookingStatus, Listing, User, UserRole, booking_overlap_clause
from app.routers.bookings import price_breakdown

# ":memory:" = a throwaway database that never touches dwellio.db.
engine = create_engine("sqlite://")
SQLModel.metadata.create_all(engine)

TODAY = date.today()


def d(offset: int) -> date:
    """Day N from today, so the test never rots against hardcoded dates."""
    return TODAY + timedelta(days=offset)


with Session(engine) as session:
    host = User(email="h@x.com", hashed_password="x", full_name="Host", role=UserRole.host)
    guest = User(email="g@x.com", hashed_password="x", full_name="Guest", role=UserRole.guest)
    session.add_all([host, guest])
    session.commit()

    listing = Listing(
        host_id=host.id, title="Test Villa", description="d", property_type="Villa",
        address="a", city="Goa", country="India", latitude=0, longitude=0,
        max_guests=4, bedrooms=2, beds=2, bathrooms=1,
        price_per_night=2000, cleaning_fee=500, service_fee=300,
    )
    session.add(listing)
    session.commit()

    # An existing stay: day 10 -> day 15.
    session.add(Booking(
        listing_id=listing.id, guest_id=guest.id, check_in=d(10), check_out=d(15),
        guests=2, nights=5, nightly_rate=2000, cleaning_fee=500, service_fee=300,
        total_price=10800, status=BookingStatus.confirmed,
    ))
    session.commit()

    def is_free(check_in: date, check_out: date) -> bool:
        """Exactly what the booking route asks the database."""
        clash = session.exec(
            select(Booking)
            .where(Booking.listing_id == listing.id)
            .where(booking_overlap_clause(check_in, check_out))
        ).first()
        return clash is None

    # --- overlaps must be REJECTED -----------------------------------------
    assert not is_free(d(10), d(15)), "identical dates must clash"
    assert not is_free(d(11), d(14)), "a stay fully inside must clash"
    assert not is_free(d(8), d(12)), "overlapping the start must clash"
    assert not is_free(d(13), d(18)), "overlapping the end must clash"
    assert not is_free(d(5), d(20)), "a stay that swallows it must clash"
    assert not is_free(d(14), d(16)), "one shared night is still a clash"

    # --- non-overlaps must be ALLOWED --------------------------------------
    # These two are the reason the comparisons are strict (< and >) rather than
    # <= and >=. Get this wrong and back-to-back bookings become impossible.
    assert is_free(d(15), d(18)), "checking in the day they check out is a turnover, not a clash"
    assert is_free(d(7), d(10)), "checking out the day they check in is a turnover, not a clash"
    assert is_free(d(1), d(5)), "well before must be free"
    assert is_free(d(20), d(25)), "well after must be free"

    # --- cancelled bookings release their dates ----------------------------
    cancelled = Booking(
        listing_id=listing.id, guest_id=guest.id, check_in=d(30), check_out=d(33),
        guests=1, nights=3, nightly_rate=2000, cleaning_fee=500, service_fee=300,
        total_price=6800, status=BookingStatus.cancelled,
    )
    session.add(cancelled)
    session.commit()
    assert is_free(d(30), d(33)), "a cancelled booking must not block the dates"

    # --- price maths --------------------------------------------------------
    # 3 nights x 2000 = 6000, + 500 cleaning + 300 service = 6800.
    p = price_breakdown(listing, d(1), d(4))
    assert p["nights"] == 3, p
    assert p["total_price"] == 6800, p

    # 1 night: fees are charged once per stay, not per night.
    p = price_breakdown(listing, d(1), d(2))
    assert p["nights"] == 1 and p["total_price"] == 2800, p

    # Float dust must be rounded away, not returned as 4599.990000000001.
    listing.price_per_night = 1533.33
    listing.cleaning_fee = 0
    listing.service_fee = 0
    p = price_breakdown(listing, d(1), d(4))
    assert p["total_price"] == 4599.99, p

print("test_bookings: all checks passed")
