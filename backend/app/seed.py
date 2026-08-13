"""
Database seeder — run with:  python -m app.seed   (from the backend/ folder)

WIPES the database and rebuilds it, so the demo is identical every time.

Everything here goes in through the same models and helper functions the API
uses (price_breakdown, recalc_listing_rating), so seeded data can't drift from
what a live POST would have produced.

The data is laid out as plain tables at the top of the file — hosts, listings,
stays — and one short loop per table at the bottom. Boring on purpose: when a
seed breaks you want to read it, not debug it.
"""

from datetime import date, timedelta

from sqlmodel import Session, SQLModel, select

from app.auth import hash_password
from app.database import engine
from app.models import (
    Amenity,
    Booking,
    BookingStatus,
    Listing,
    ListingPhoto,
    Review,
    RoomType,
    User,
    UserRole,
    WishlistItem,
    booking_overlap_clause,
)
from app.routers.bookings import price_breakdown
from app.routers.reviews import recalc_listing_rating

# Every seeded account shares one password so the demo logins are easy to type.
DEMO_PASSWORD = "password123"

TODAY = date.today()


def d(offset: int) -> date:
    """Dates relative to today, so the seed never goes stale: a booking seeded
    "20 days ago" is still in the past whenever you run this."""
    return TODAY + timedelta(days=offset)


def photo(photo_id: str) -> str:
    """Real Unsplash images, sized for a listing gallery."""
    return f"https://images.unsplash.com/{photo_id}?w=1200&q=80&auto=format&fit=crop"


# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------

AMENITIES = [
    ("Wifi", "Essentials", "📶"),
    ("Kitchen", "Essentials", "🍳"),
    ("Air conditioning", "Essentials", "❄️"),
    ("Heating", "Essentials", "🔥"),
    ("Washing machine", "Essentials", "🧺"),
    ("Free parking", "Parking", "🅿️"),
    ("Pool", "Features", "🏊"),
    ("Hot tub", "Features", "🛁"),
    ("Gym", "Features", "🏋️"),
    ("TV", "Entertainment", "📺"),
    ("Workspace", "Features", "💻"),
    ("Breakfast", "Dining", "🥐"),
    ("Balcony", "Outdoor", "🌇"),
    ("Garden", "Outdoor", "🌿"),
    ("Beach access", "Outdoor", "🏖️"),
    ("Mountain view", "Outdoor", "🏔️"),
    ("Pets allowed", "Rules", "🐾"),
    ("Smoke alarm", "Safety", "🚨"),
]

# (email, full_name, role, is_superhost, bio, avatar photo id)
USERS = [
    ("priya@dwellio.com", "Priya Sharma", UserRole.host, True,
     "Architect turned host. I rent out the coastal homes I designed.", "photo-1494790108377-be9c29b29330"),
    ("rahul@dwellio.com", "Rahul Mehta", UserRole.host, True,
     "Mountain guy. Cabins in the north, chai always on.", "photo-1500648767791-00dcc994a43e"),
    ("ananya@dwellio.com", "Ananya Iyer", UserRole.host, False,
     "City apartments for people who work while they travel.", "photo-1438761681033-6461ffad8d80"),
    ("vikram@dwellio.com", "Vikram Singh", UserRole.host, False,
     "Third-generation caretaker of two heritage properties.", "photo-1507003211169-0a1dd7228f2d"),
    ("aditya@dwellio.com", "Aditya Rao", UserRole.guest, False, None, "photo-1633332755192-727a05c4013d"),
    ("sara@dwellio.com", "Sara Khan", UserRole.guest, False, None, "photo-1494790108377-be9c29b29330"),
    ("dev@dwellio.com", "Dev Patel", UserRole.guest, False, None, "photo-1472099645785-5658abf4ff4e"),
    ("meera@dwellio.com", "Meera Nair", UserRole.guest, False, None, "photo-1534528741775-53994a69daeb"),
]

HOSTS = slice(0, 4)   # first four USERS are hosts
GUESTS = slice(4, 8)  # last four are guests

# One dict per listing. host = index into USERS. amenities = names from AMENITIES.
LISTINGS = [
    {
        "host": 0, "title": "Beachfront Villa with Private Pool",
        "description": "Wake up to the sound of the Arabian Sea. This four-bedroom villa sits right on the sand in North Goa, with a private pool, an open-air kitchen and a shaded veranda made for long breakfasts. Ten minutes from Anjuna market, and far enough from the road that all you hear at night is water.",
        "property_type": "Villa", "room_type": RoomType.entire_place,
        "address": "House 12, Ashwem Beach Road", "city": "Goa", "country": "India",
        "latitude": 15.6425, "longitude": 73.7307,
        "max_guests": 8, "bedrooms": 4, "beds": 5, "bathrooms": 3.5,
        "price_per_night": 12500, "cleaning_fee": 1500, "service_fee": 900,
        "amenities": ["Wifi", "Pool", "Air conditioning", "Kitchen", "Free parking", "Beach access", "Garden", "TV"],
        "photos": ["photo-1512917774080-9991f1c4c750", "photo-1571003123894-1f0594d2b5d9",
                   "photo-1506929562872-bb421503ef21", "photo-1616486338812-3dadae4b4ace"],
    },
    {
        "host": 2, "title": "Sea-View Apartment in Bandra",
        "description": "A bright two-bedroom on the eleventh floor with an uninterrupted view of the Bandra-Worli Sea Link. Fast wifi, a proper desk, and a building gym downstairs. Carter Road promenade is a five-minute walk.",
        "property_type": "Apartment", "room_type": RoomType.entire_place,
        "address": "Sea Breeze Towers, Bandra West", "city": "Mumbai", "country": "India",
        "latitude": 19.0596, "longitude": 72.8295,
        "max_guests": 4, "bedrooms": 2, "beds": 2, "bathrooms": 2,
        "price_per_night": 7800, "cleaning_fee": 800, "service_fee": 600,
        "amenities": ["Wifi", "Air conditioning", "Kitchen", "Workspace", "Gym", "TV", "Washing machine", "Balcony"],
        "photos": ["photo-1522708323590-d24dbb6b0267", "photo-1493809842364-78817add7ffb",
                   "photo-1507089947368-19c1da9775ae", "photo-1631049307264-da0ec9d70304"],
    },
    {
        "host": 1, "title": "Wooden Cabin in the Pines",
        "description": "A hand-built deodar cabin above Old Manali, surrounded by pine forest. Wood-burning stove, thick blankets, and a deck that catches the morning sun over the Beas valley. No TV on purpose.",
        "property_type": "Cabin", "room_type": RoomType.entire_place,
        "address": "Nasogi Village, Old Manali", "city": "Manali", "country": "India",
        "latitude": 32.2643, "longitude": 77.1892,
        "max_guests": 4, "bedrooms": 2, "beds": 3, "bathrooms": 1,
        "price_per_night": 4200, "cleaning_fee": 600, "service_fee": 350,
        "amenities": ["Wifi", "Heating", "Kitchen", "Free parking", "Mountain view", "Pets allowed", "Smoke alarm"],
        "photos": ["photo-1587061949409-02df41d5e562", "photo-1449844908441-8829872d2607",
                   "photo-1568605114967-8130f3a36994", "photo-1615529182904-14819c35db37"],
    },
    {
        "host": 3, "title": "Heritage Haveli Suite",
        "description": "One suite inside a 180-year-old family haveli in the Pink City. Hand-painted ceilings, a jharokha window over the courtyard, and breakfast served on the terrace. The family lives in the other wing — you have your own entrance.",
        "property_type": "Heritage Home", "room_type": RoomType.private_room,
        "address": "Gangori Bazaar, Near Hawa Mahal", "city": "Jaipur", "country": "India",
        "latitude": 26.9239, "longitude": 75.8267,
        "max_guests": 3, "bedrooms": 1, "beds": 2, "bathrooms": 1,
        "price_per_night": 5600, "cleaning_fee": 500, "service_fee": 400,
        "amenities": ["Wifi", "Air conditioning", "Breakfast", "Free parking", "Garden", "Smoke alarm"],
        "photos": ["photo-1590490360182-c33d57733427", "photo-1571508601891-ca5e7a713859",
                   "photo-1566073771259-6a8506099945", "photo-1552321554-5fefe8c9ef14"],
    },
    {
        "host": 2, "title": "Minimal Studio in Indiranagar",
        "description": "A compact, quiet studio on 12th Main. Everything you need and nothing you don't: a good mattress, a standing desk, blackout curtains and 300 Mbps fibre. Cafes and the metro are around the corner.",
        "property_type": "Studio", "room_type": RoomType.entire_place,
        "address": "12th Main Road, Indiranagar", "city": "Bengaluru", "country": "India",
        "latitude": 12.9784, "longitude": 77.6408,
        "max_guests": 2, "bedrooms": 1, "beds": 1, "bathrooms": 1,
        "price_per_night": 3500, "cleaning_fee": 400, "service_fee": 300,
        "amenities": ["Wifi", "Air conditioning", "Workspace", "Kitchen", "TV", "Washing machine"],
        "photos": ["photo-1586023492125-27b2c045efd7", "photo-1631679706909-1844bbd07221",
                   "photo-1533090161767-e6ffed986c88", "photo-1595526114035-0d45ed16cfbf"],
    },
    {
        "host": 0, "title": "Lakeside Room at a Boutique Haveli",
        "description": "A corner room facing Lake Pichola, with a window seat built for watching the light change on the City Palace. Rooftop dinners, and the ghats are a two-minute walk downhill.",
        "property_type": "Boutique Hotel", "room_type": RoomType.private_room,
        "address": "Lal Ghat, Old City", "city": "Udaipur", "country": "India",
        "latitude": 24.5765, "longitude": 73.6835,
        "max_guests": 2, "bedrooms": 1, "beds": 1, "bathrooms": 1,
        "price_per_night": 6400, "cleaning_fee": 500, "service_fee": 450,
        "amenities": ["Wifi", "Air conditioning", "Breakfast", "TV", "Balcony", "Smoke alarm"],
        "photos": ["photo-1542314831-068cd1dbfeeb", "photo-1618773928121-c32242e63f39",
                   "photo-1522771739844-6a9f6d5f14af", "photo-1560448075-bb485b067938"],
    },
    {
        "host": 1, "title": "Riverside Bamboo Cottage",
        "description": "A bamboo-and-mud cottage twenty steps from the Ganga at Tapovan. Yoga shalas on either side, a hammock on the porch, and the sound of the river all night. Solar hot water, so shower before sundown.",
        "property_type": "Cottage", "room_type": RoomType.entire_place,
        "address": "Tapovan, Laxman Jhula", "city": "Rishikesh", "country": "India",
        "latitude": 30.1290, "longitude": 78.3200,
        "max_guests": 2, "bedrooms": 1, "beds": 1, "bathrooms": 1,
        "price_per_night": 2800, "cleaning_fee": 300, "service_fee": 200,
        "amenities": ["Wifi", "Garden", "Mountain view", "Breakfast", "Pets allowed"],
        "photos": ["photo-1521401830884-6c03c1c87ebb", "photo-1441974231531-c6227db76b6e",
                   "photo-1470071459604-3b5ec3a7fe05", "photo-1522444195799-478538b28823"],
    },
    {
        "host": 2, "title": "Designer Loft in Hauz Khas",
        "description": "A converted warehouse loft with 14-foot ceilings, exposed brick and a mezzanine bedroom. Overlooks the deer park. Walk to the village bars, or stay in — there's a record player and a very good kitchen.",
        "property_type": "Loft", "room_type": RoomType.entire_place,
        "address": "Hauz Khas Village", "city": "New Delhi", "country": "India",
        "latitude": 28.5535, "longitude": 77.1943,
        "max_guests": 4, "bedrooms": 1, "beds": 2, "bathrooms": 2,
        "price_per_night": 6900, "cleaning_fee": 700, "service_fee": 500,
        "amenities": ["Wifi", "Air conditioning", "Kitchen", "Workspace", "TV", "Heating", "Smoke alarm"],
        "photos": ["photo-1505873242700-f289a29e1e0f", "photo-1559599189-fe84dea4eb79",
                   "photo-1600566753086-00f18fb6b3ea", "photo-1600607687920-4e2a09cf159d"],
    },
    {
        "host": 0, "title": "Private Houseboat on the Backwaters",
        "description": "A traditional kettuvallam, yours for the night, with a crew of two. You'll drift through the Kuttanad canals, moor by a village for the evening, and eat karimeen cooked on board. Air-conditioned bedroom from 9pm.",
        "property_type": "Houseboat", "room_type": RoomType.entire_place,
        "address": "Finishing Point Jetty", "city": "Alleppey", "country": "India",
        "latitude": 9.4981, "longitude": 76.3388,
        "max_guests": 4, "bedrooms": 2, "beds": 2, "bathrooms": 2,
        "price_per_night": 9500, "cleaning_fee": 1000, "service_fee": 700,
        "amenities": ["Air conditioning", "Breakfast", "Wifi", "Balcony", "Smoke alarm"],
        "photos": ["photo-1476514525535-07fb3b4ae5f1", "photo-1470770841072-f978cf4d019e",
                   "photo-1520250497591-112f2f40a3f4", "photo-1615874959474-d609969a20ed"],
    },
    {
        "host": 1, "title": "Colonial Bungalow on a Tea Estate",
        "description": "A planter's bungalow from 1912, still on a working estate outside Darjeeling. Four poster beds, a fireplace lit for you at dusk, and Kanchenjunga from the lawn on a clear morning. Estate walks with the manager if you ask.",
        "property_type": "Bungalow", "room_type": RoomType.entire_place,
        "address": "Happy Valley Tea Estate", "city": "Darjeeling", "country": "India",
        "latitude": 27.0538, "longitude": 88.2540,
        "max_guests": 6, "bedrooms": 3, "beds": 4, "bathrooms": 2,
        "price_per_night": 5200, "cleaning_fee": 700, "service_fee": 400,
        "amenities": ["Wifi", "Heating", "Breakfast", "Free parking", "Mountain view", "Garden", "Smoke alarm"],
        "photos": ["photo-1583608205776-bfd35f0d9f83", "photo-1472396961693-142e6e269027",
                   "photo-1600210492486-724fe5c67fb0", "photo-1618221195710-dd6b41faaea6"],
    },
    {
        "host": 3, "title": "Bunk in a French Quarter Guesthouse",
        "description": "One bunk in a four-bed dorm inside a restored Tamil-French house on Rue Suffren. Shared courtyard, filter coffee at 7am, bicycles to borrow. The cheapest way to stay inside White Town.",
        "property_type": "Guesthouse", "room_type": RoomType.shared_room,
        "address": "Rue Suffren, White Town", "city": "Pondicherry", "country": "India",
        "latitude": 11.9338, "longitude": 79.8348,
        "max_guests": 1, "bedrooms": 1, "beds": 1, "bathrooms": 1,
        "price_per_night": 1400, "cleaning_fee": 200, "service_fee": 100,
        "amenities": ["Wifi", "Air conditioning", "Breakfast", "Garden", "Free parking"],
        "photos": ["photo-1556228453-efd6c1ff04f6", "photo-1518495973542-4542c06a5843",
                   "photo-1560448204-e02f11c3d0e2", "photo-1604709177225-055f99402ea3"],
    },
]

# Stays that already ENDED. Each one gets a review, which is what gives the
# listings their ratings. (listing, guest, check_in offset, nights, rating, comment)
PAST_STAYS = [
    (0, 0, -45, 4, 5, "The photos undersell it. Waking up to that pool and the sea behind it was unreal. Priya left us a bottle of feni and a hand-drawn map of the good shacks."),
    (0, 1, -20, 3, 5, "Perfect for our group. The open kitchen got used every single night. Would come back in a heartbeat."),
    (1, 2, -30, 5, 4, "Great desk setup and the view is genuinely as good as the pictures. Traffic noise from the Sea Link at rush hour, but the AC drowns it out."),
    (2, 3, -60, 3, 5, "Woke up to frost on the deck and pine everywhere. Rahul stocked the stove with wood before we arrived. Bring warmer socks than you think."),
    (2, 0, -25, 2, 4, "Beautiful cabin, exactly as described. The walk up from the road is steeper than it looks with luggage."),
    (3, 1, -38, 2, 5, "Sleeping under a 180-year-old painted ceiling is not something I'll forget. Breakfast on the terrace with the fort in view was the highlight."),
    (4, 2, -15, 6, 4, "Did a full work week here without a single dropped call. Small, but everything is thought through."),
    (5, 3, -50, 3, 5, "The window seat alone is worth it. Watched the sun set over the lake every evening with chai."),
    (6, 0, -28, 5, 5, "Fell asleep to the river for five nights. The yoga shala next door starts at 6am — that was a feature for us, might not be for everyone."),
    (7, 1, -22, 3, 4, "The loft is stunning and the record collection is excellent. Hauz Khas is loud on weekends, worth knowing."),
    (8, 2, -35, 1, 5, "One night on the backwaters and the crew cooked the best fish I've eaten in India. Book it."),
    (9, 3, -55, 4, 5, "Kanchenjunga at 6am from the lawn, and a fire waiting when we came back from the estate walk. Timeless place."),
    (9, 0, -18, 2, 4, "Lovely old bungalow with real character. The heating struggles a bit in the far bedroom."),
    (10, 1, -12, 2, 4, "Clean, cheap, and right in White Town. It's a dorm, so pack earplugs, but the courtyard makes up for it."),
]

# Stays in the FUTURE. These block their dates — try booking over them in /docs
# and the API answers 409. (listing, guest, check_in offset, nights)
FUTURE_STAYS = [
    (0, 2, 7, 5),    # Goa villa blocked next week
    (0, 3, 30, 4),
    (2, 0, 10, 3),   # Manali cabin
    (4, 1, 5, 7),    # Bengaluru studio
    (7, 3, 14, 2),   # Delhi loft
    (8, 0, 21, 2),   # Houseboat
    (9, 2, 12, 3),   # Darjeeling
]

# (guest index, listing indices they've hearted)
WISHLISTS = [
    (0, [0, 8, 9]),
    (1, [2, 6]),
    (2, [0, 3, 5, 7]),
    (3, [9, 10]),
]


def seed() -> None:
    # Drop everything and start clean, so re-running gives the exact same DB.
    # ponytail: destructive by design — this is demo data, not user data.
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        # --- amenities ---
        amenities = {name: Amenity(name=name, category=cat, icon=icon) for name, cat, icon in AMENITIES}
        session.add_all(amenities.values())

        # --- users ---
        users = []
        for email, name, role, superhost, bio, avatar in USERS:
            users.append(User(
                email=email,
                hashed_password=hash_password(DEMO_PASSWORD),  # same hashing as /auth/register
                full_name=name,
                role=role,
                is_superhost=superhost,
                bio=bio,
                avatar_url=photo(avatar),
                host_since=d(-800) if role == UserRole.host else None,
                response_rate=98 if superhost else (91 if role == UserRole.host else None),
            ))
        session.add_all(users)
        session.commit()

        # --- listings (+ photos, + amenity links) ---
        listings = []
        for row in LISTINGS:
            data = {k: v for k, v in row.items() if k not in ("host", "amenities", "photos")}
            listing = Listing(**data, host_id=users[row["host"]].id)
            # add() BEFORE touching the relationships: assigning listing.amenities
            # writes to the link table, which SQLAlchemy skips (with a warning) if
            # the listing isn't attached to the session yet.
            session.add(listing)
            listing.amenities = [amenities[a] for a in row["amenities"]]
            listing.photos = [ListingPhoto(url=photo(p), sort_order=i) for i, p in enumerate(row["photos"])]
            listings.append(listing)
        session.commit()

        # --- past stays, each with its review ---
        for listing_i, guest_i, start, nights, rating, comment in PAST_STAYS:
            listing, guest = listings[listing_i], users[GUESTS][guest_i]
            check_in, check_out = d(start), d(start + nights)

            booking = Booking(
                listing_id=listing.id, guest_id=guest.id,
                check_in=check_in, check_out=check_out,
                guests=min(2, listing.max_guests),
                **price_breakdown(listing, check_in, check_out),  # same maths as POST /bookings
            )
            session.add(booking)
            session.commit()

            # Sub-scores hover around the overall rating so the breakdown looks
            # human instead of six identical numbers.
            def near(offset: int) -> int:
                return max(1, min(5, rating + offset))

            session.add(Review(
                listing_id=listing.id, author_id=guest.id, booking_id=booking.id,
                rating=rating, comment=comment,
                cleanliness=near(0), accuracy=near(-1), check_in_rating=near(0),
                communication=near(0), location_rating=near(0), value=near(-1),
            ))
        session.commit()

        # Refresh the cached avg_rating / review_count on every listing, using
        # the same helper POST /reviews calls.
        for listing in listings:
            recalc_listing_rating(session, listing)
        session.commit()

        # --- future stays that block dates ---
        for listing_i, guest_i, start, nights in FUTURE_STAYS:
            listing, guest = listings[listing_i], users[GUESTS][guest_i]
            check_in, check_out = d(start), d(start + nights)
            session.add(Booking(
                listing_id=listing.id, guest_id=guest.id,
                check_in=check_in, check_out=check_out,
                guests=min(2, listing.max_guests),
                status=BookingStatus.confirmed,
                **price_breakdown(listing, check_in, check_out),
            ))
        session.commit()

        # --- wishlists ---
        for guest_i, listing_idxs in WISHLISTS:
            for listing_i in listing_idxs:
                session.add(WishlistItem(user_id=users[GUESTS][guest_i].id, listing_id=listings[listing_i].id))
        session.commit()

        report(session)


def report(session: Session) -> None:
    """Print the demo logins and a summary of what's in the database.

    ponytail: plain ASCII only. The Windows console defaults to cp1252 and
    raises UnicodeEncodeError on emoji or an em dash, which would crash the
    seeder at the very last line after all the work succeeded.
    """
    listings = session.exec(select(Listing)).all()
    bookings = session.exec(select(Booking)).all()
    upcoming = [b for b in bookings if b.check_in > TODAY]

    print()
    print("=" * 74)
    print("  DWELLIO - database seeded")
    print("=" * 74)
    print(f"  {len(session.exec(select(User)).all()):>3} users        "
          f"{len(listings):>3} listings      {len(session.exec(select(Amenity)).all()):>3} amenities")
    print(f"  {len(bookings):>3} bookings     {len(session.exec(select(Review)).all()):>3} reviews       "
          f"{len(session.exec(select(WishlistItem)).all()):>3} wishlist items")
    print()
    print(f"  DEMO LOGINS - every account uses the password:  {DEMO_PASSWORD}")
    print("  " + "-" * 70)
    for role_label, role in (("HOSTS", UserRole.host), ("GUESTS", UserRole.guest)):
        print(f"  {role_label}")
        for user in session.exec(select(User).where(User.role == role)).all():
            badge = "  [SUPERHOST]" if user.is_superhost else ""
            owned = len([listing for listing in listings if listing.host_id == user.id])
            extra = f"({owned} listings)" if role == UserRole.host else ""
            print(f"    {user.email:<24} {user.full_name:<16}{extra}{badge}")
    print()
    print("  DATES ALREADY BOOKED (try these in POST /bookings - expect 409)")
    print("  " + "-" * 70)
    for booking in sorted(upcoming, key=lambda b: b.check_in):
        listing = next(listing for listing in listings if listing.id == booking.listing_id)
        print(f"    listing {listing.id:<3} {listing.title[:34]:<36} {booking.check_in} -> {booking.check_out}")
    print()
    print("  Start the API:  uvicorn app.main:app --reload")
    print("  Then open:      http://localhost:8000/docs")
    print("=" * 74)
    print()


if __name__ == "__main__":
    seed()

    # Sanity check: every future booking must actually block its own dates.
    # If this ever fails, the seed wrote data the API would reject.
    with Session(engine) as session:
        for booking in session.exec(select(Booking)).all():
            clash = session.exec(
                select(Booking)
                .where(Booking.listing_id == booking.listing_id)
                .where(booking_overlap_clause(booking.check_in, booking.check_out))
            ).all()
            assert len(clash) == 1, (
                f"listing {booking.listing_id} has {len(clash)} bookings colliding on "
                f"{booking.check_in}..{booking.check_out} - the seed double-booked it"
            )
    print("  seed self-check: no listing was double-booked\n")
