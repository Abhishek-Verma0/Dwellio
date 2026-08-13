"""
Database models = your Mongoose schemas, but for a relational DB.

SQLModel is one class doing two jobs at once:
  1. a SQLAlchemy table  (the DB rows)      -> because of `table=True`
  2. a Pydantic model    (validation/JSON)  -> so FastAPI can serialise it

Mongoose mapping:
  mongoose.Schema({...})        -> class Listing(SQLModel, table=True)
  ObjectId ref: 'User'          -> host_id: int = Field(foreign_key="user.id")
  .populate('host')             -> host: User = Relationship(...)
  array of refs (m2m)           -> a real link table (ListingAmenityLink)

Table names are auto-derived from the class name, lowercased:
  Listing -> "listing", ListingPhoto -> "listingphoto".
"""

from datetime import date, datetime, timezone
from enum import Enum
from typing import Optional

from sqlmodel import Field, Relationship, SQLModel


def utc_now() -> datetime:
    """default=datetime.utcnow is deprecated in 3.12; this is the replacement."""
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Enums — stored in SQLite as plain strings ("guest", "host", ...).
# Inheriting from `str` is what makes them JSON-serialisable for free.
# ---------------------------------------------------------------------------

class UserRole(str, Enum):
    guest = "guest"
    host = "host"


class RoomType(str, Enum):
    entire_place = "entire_place"
    private_room = "private_room"
    shared_room = "shared_room"


class BookingStatus(str, Enum):
    confirmed = "confirmed"   # Instant Book: created == confirmed
    cancelled = "cancelled"


# ---------------------------------------------------------------------------
# Link table for the Listing <-> Amenity many-to-many.
#
# In Mongo you'd shove an array of amenity ids on the listing document.
# In SQL the normalised way is a third table whose primary key is the pair
# of foreign keys — which also makes duplicate rows impossible at the DB level.
# ---------------------------------------------------------------------------

class ListingAmenityLink(SQLModel, table=True):
    listing_id: int = Field(foreign_key="listing.id", primary_key=True)
    amenity_id: int = Field(foreign_key="amenity.id", primary_key=True)


class WishlistItem(SQLModel, table=True):
    """Also a link table (User <-> Listing), plus when it was saved.

    ponytail: one flat wishlist per user. Real Airbnb has named collections
    ("Summer 2026"); add a Wishlist parent table only if the UI asks for it.
    """
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    listing_id: int = Field(foreign_key="listing.id", primary_key=True)
    created_at: datetime = Field(default_factory=utc_now)


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    email: str = Field(unique=True, index=True)      # unique index, like Mongoose `unique: true`
    hashed_password: str                             # bcrypt hash, never the raw password
    full_name: str
    role: UserRole = Field(default=UserRole.guest)   # chosen at signup, drives permissions

    avatar_url: Optional[str] = None
    bio: Optional[str] = None

    # Host-only profile bits (null/false for guests).
    is_superhost: bool = Field(default=False)
    host_since: Optional[date] = None
    response_rate: Optional[int] = None              # percent, 0-100

    created_at: datetime = Field(default_factory=utc_now)

    # `back_populates` links both sides so SQLModel knows they're the same
    # relationship viewed from opposite ends (Listing.host <-> User.listings).
    listings: list["Listing"] = Relationship(back_populates="host")
    bookings: list["Booking"] = Relationship(back_populates="guest")
    reviews: list["Review"] = Relationship(back_populates="author")
    wishlist: list["Listing"] = Relationship(link_model=WishlistItem)


# ---------------------------------------------------------------------------
# Listing
# ---------------------------------------------------------------------------

class Listing(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    host_id: int = Field(foreign_key="user.id", index=True)

    title: str
    description: str

    # What kind of place. property_type is free-form-ish ("Apartment", "Villa",
    # "Cabin", "Loft") because the list grows; room_type is a fixed enum because
    # Airbnb only has three and we filter on it.
    property_type: str = Field(index=True)
    room_type: RoomType = Field(default=RoomType.entire_place, index=True)

    # Location. Kept as plain columns (no separate Address table) — we only ever
    # read them together with the listing.
    address: str
    city: str = Field(index=True)                    # indexed: every search filters on city
    country: str = Field(index=True)
    latitude: float
    longitude: float

    # Capacity
    max_guests: int
    bedrooms: int
    beds: int
    bathrooms: float                                 # 1.5 baths is a real thing

    # Money. ponytail: floats, not Decimal — SQLite has no money type and this is
    # a demo. Switch to integer cents if real currency ever touches this.
    price_per_night: float = Field(index=True)       # indexed: price-range filter
    cleaning_fee: float = Field(default=0.0)
    service_fee: float = Field(default=0.0)

    # Denormalised review aggregates: recomputed when a review is posted, so the
    # listing grid doesn't need a JOIN + AVG on every request.
    avg_rating: float = Field(default=0.0)
    review_count: int = Field(default=0)

    is_active: bool = Field(default=True)            # soft-delete flag
    created_at: datetime = Field(default_factory=utc_now)

    host: Optional[User] = Relationship(back_populates="listings")
    photos: list["ListingPhoto"] = Relationship(
        back_populates="listing",
        # Deleting a listing deletes its photos instead of leaving orphan rows.
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "order_by": "ListingPhoto.sort_order"},
    )
    amenities: list["Amenity"] = Relationship(back_populates="listings", link_model=ListingAmenityLink)
    bookings: list["Booking"] = Relationship(back_populates="listing")
    reviews: list["Review"] = Relationship(back_populates="listing")


class ListingPhoto(SQLModel, table=True):
    """Own table because one listing has many photos (a gallery).

    ponytail: no `is_cover` flag — sort_order == 0 is the cover.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    listing_id: int = Field(foreign_key="listing.id", index=True)
    url: str
    caption: Optional[str] = None
    sort_order: int = Field(default=0)

    listing: Optional[Listing] = Relationship(back_populates="photos")


class Amenity(SQLModel, table=True):
    """A shared lookup table: "Wifi" exists once, not once per listing."""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    category: str = Field(default="General")         # "Essentials", "Kitchen", ...
    icon: Optional[str] = None                       # emoji / icon key for the UI

    listings: list[Listing] = Relationship(back_populates="amenities", link_model=ListingAmenityLink)


# ---------------------------------------------------------------------------
# Booking
# ---------------------------------------------------------------------------

class Booking(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    listing_id: int = Field(foreign_key="listing.id", index=True)  # indexed: overlap query filters on it
    guest_id: int = Field(foreign_key="user.id", index=True)       # indexed: "my trips" filters on it

    # Half-open date range [check_in, check_out): the guest leaves on check_out,
    # so a new booking starting that same day does NOT overlap. This is exactly
    # why the overlap test is strict `<` on both sides.
    check_in: date
    check_out: date
    guests: int = Field(default=1)

    # Price snapshot. Copied from the listing at booking time on purpose — if the
    # host raises the price tomorrow, this booking's total must not change.
    nights: int
    nightly_rate: float
    cleaning_fee: float
    service_fee: float
    total_price: float

    status: BookingStatus = Field(default=BookingStatus.confirmed)
    created_at: datetime = Field(default_factory=utc_now)

    listing: Optional[Listing] = Relationship(back_populates="bookings")
    guest: Optional[User] = Relationship(back_populates="bookings")
    review: Optional["Review"] = Relationship(back_populates="booking")


# ---------------------------------------------------------------------------
# Review
# ---------------------------------------------------------------------------

class Review(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    listing_id: int = Field(foreign_key="listing.id", index=True)
    author_id: int = Field(foreign_key="user.id", index=True)
    # unique -> one review per booking, enforced by the DB, not by a route check.
    booking_id: Optional[int] = Field(default=None, foreign_key="booking.id", unique=True)

    rating: int                                      # overall, 1-5
    # Airbnb's six sub-scores. Kept as columns (not a separate table) because the
    # set is fixed and always read together with the review.
    cleanliness: int
    accuracy: int
    check_in_rating: int
    communication: int
    location_rating: int
    value: int

    comment: str
    created_at: datetime = Field(default_factory=utc_now)

    listing: Optional[Listing] = Relationship(back_populates="reviews")
    author: Optional[User] = Relationship(back_populates="reviews")
    booking: Optional[Booking] = Relationship(back_populates="review")
