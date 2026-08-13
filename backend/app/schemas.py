"""
API shapes — what the endpoints ACCEPT and what they RETURN.

Why these exist at all, given models.py already describes the data:

  * Security: `User` has `hashed_password`. If a route returned a raw `User`,
    that hash goes out over the wire. `UserPublic` makes leaking it impossible.
  * Input control: a client must not be able to POST `is_superhost: true` or
    `avg_rating: 5.0`. The Create schemas simply don't have those fields.
  * Docs: FastAPI reads these classes to generate /docs. Free API documentation.

In Express you'd do this with Joi/Zod for input and a `toJSON()` for output.
Here one class does both, and it's enforced by the framework, not by discipline.

These classes inherit `SQLModel` WITHOUT `table=True` — so they're plain
Pydantic models (no DB table), and they can be built straight from an ORM
object (`from_attributes` is on by default).
"""

from datetime import date, datetime
from typing import Optional

from pydantic import EmailStr, model_validator
from sqlmodel import Field, SQLModel

from app.models import RoomType, UserRole


# ---------------------------------------------------------------------------
# Users & auth
# ---------------------------------------------------------------------------

class UserCreate(SQLModel):
    # EmailStr rejects "not-an-email" before your code ever runs.
    email: EmailStr
    # max 72: bcrypt hashes at most 72 bytes, so document the ceiling here
    # rather than silently truncating a 200-character password.
    password: str = Field(min_length=8, max_length=72)
    full_name: str = Field(min_length=1)
    role: UserRole = UserRole.guest  # guest unless they pick host at signup


class UserLogin(SQLModel):
    email: EmailStr
    password: str


class UserPublic(SQLModel):
    """Safe to send to anyone. Note what's NOT here: hashed_password."""
    id: int
    email: EmailStr
    full_name: str
    role: UserRole
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    is_superhost: bool
    host_since: Optional[date] = None
    response_rate: Optional[int] = None
    created_at: datetime


class Token(SQLModel):
    """Login/register response. The user object rides along so the frontend
    doesn't have to immediately call /auth/me after logging in."""
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


# ---------------------------------------------------------------------------
# Photos & amenities
# ---------------------------------------------------------------------------

class PhotoCreate(SQLModel):
    url: str
    caption: Optional[str] = None
    sort_order: int = 0  # 0 = cover photo


class PhotoRead(PhotoCreate):
    id: int


class AmenityRead(SQLModel):
    id: int
    name: str
    category: str
    icon: Optional[str] = None


# ---------------------------------------------------------------------------
# Listings
# ---------------------------------------------------------------------------

class ListingCreate(SQLModel):
    title: str = Field(min_length=1)
    description: str = Field(min_length=1)
    property_type: str
    room_type: RoomType = RoomType.entire_place

    address: str
    city: str
    country: str
    latitude: float
    longitude: float

    # gt/ge are DB-independent guards: a listing for 0 guests or -50/night is
    # rejected with a 422 before it reaches the handler.
    max_guests: int = Field(gt=0)
    bedrooms: int = Field(ge=0)
    beds: int = Field(gt=0)
    bathrooms: float = Field(gt=0)

    price_per_night: float = Field(gt=0)
    cleaning_fee: float = Field(default=0, ge=0)
    service_fee: float = Field(default=0, ge=0)

    # Nested writes: the client sends photos and amenity ids with the listing
    # in one POST, instead of three round trips.
    photos: list[PhotoCreate] = []
    amenity_ids: list[int] = []


class ListingUpdate(SQLModel):
    """PATCH body: every field optional, only what's sent gets changed.

    ponytail: one Update schema instead of Update + Replace. PATCH covers
    both; add PUT the day a client actually needs full-replace semantics.
    """
    title: Optional[str] = None
    description: Optional[str] = None
    property_type: Optional[str] = None
    room_type: Optional[RoomType] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    max_guests: Optional[int] = Field(default=None, gt=0)
    bedrooms: Optional[int] = Field(default=None, ge=0)
    beds: Optional[int] = Field(default=None, gt=0)
    bathrooms: Optional[float] = Field(default=None, gt=0)
    price_per_night: Optional[float] = Field(default=None, gt=0)
    cleaning_fee: Optional[float] = Field(default=None, ge=0)
    service_fee: Optional[float] = Field(default=None, ge=0)
    is_active: Optional[bool] = None
    photos: Optional[list[PhotoCreate]] = None   # if sent, replaces the whole gallery
    amenity_ids: Optional[list[int]] = None      # if sent, replaces the whole amenity set


class ListingCard(SQLModel):
    """The explore-grid shape. Photos ride along because Airbnb cards are a
    swipeable carousel, and `host` rides along for the Superhost badge —
    saves the frontend an extra request per card."""
    id: int
    title: str
    city: str
    country: str
    property_type: str
    room_type: RoomType
    price_per_night: float
    cleaning_fee: float
    service_fee: float
    max_guests: int
    bedrooms: int
    beds: int
    bathrooms: float
    avg_rating: float
    review_count: int
    latitude: float
    longitude: float
    photos: list[PhotoRead] = []
    host: Optional[UserPublic] = None


class ListingDetail(ListingCard):
    """Detail page = card + the heavy fields you don't need 20 copies of."""
    description: str
    address: str
    host_id: int
    is_active: bool
    created_at: datetime
    amenities: list[AmenityRead] = []


class ListingPage(SQLModel):
    """Paginated list response. Returning `total` lets the frontend render
    "1–20 of 137" and know when to stop fetching."""
    items: list[ListingCard]
    total: int
    page: int
    page_size: int
    total_pages: int


# ---------------------------------------------------------------------------
# Availability
# ---------------------------------------------------------------------------

class BookedRange(SQLModel):
    check_in: date
    check_out: date


class AvailabilityRead(SQLModel):
    listing_id: int
    booked: list[BookedRange]              # so the date picker can grey out days
    available: Optional[bool] = None       # only set when ?check_in&check_out were given


# ---------------------------------------------------------------------------
# Bookings
# ---------------------------------------------------------------------------

class BookingCreate(SQLModel):
    listing_id: int
    check_in: date
    check_out: date
    guests: int = Field(default=1, gt=0)

    @model_validator(mode="after")
    def check_dates(self):
        """Runs after the individual fields are parsed, so both dates exist.

        Cross-field rules can't live on a single Field() — this is the hook for
        them. Rejecting here means the booking route never sees a nonsense range.
        """
        if self.check_out <= self.check_in:
            raise ValueError("check_out must be after check_in")
        if self.check_in < date.today():
            raise ValueError("check_in cannot be in the past")
        return self


class BookingRead(SQLModel):
    id: int
    listing_id: int
    guest_id: int
    check_in: date
    check_out: date
    guests: int
    nights: int
    # The price breakdown, exactly as shown at checkout. Snapshotted at booking
    # time — see the comment on models.Booking.
    nightly_rate: float
    cleaning_fee: float
    service_fee: float
    total_price: float
    status: str
    created_at: datetime
    listing: Optional[ListingCard] = None  # populated for "My Trips"


# ---------------------------------------------------------------------------
# Reviews
# ---------------------------------------------------------------------------

class ReviewCreate(SQLModel):
    # le=5/ge=1 on every score: a 7-star rating can't reach the database.
    rating: int = Field(ge=1, le=5)
    cleanliness: int = Field(ge=1, le=5)
    accuracy: int = Field(ge=1, le=5)
    check_in_rating: int = Field(ge=1, le=5)
    communication: int = Field(ge=1, le=5)
    location_rating: int = Field(ge=1, le=5)
    value: int = Field(ge=1, le=5)
    comment: str = Field(min_length=1)
    booking_id: Optional[int] = None  # ties the review to a specific stay


class ReviewRead(SQLModel):
    id: int
    listing_id: int
    rating: int
    cleanliness: int
    accuracy: int
    check_in_rating: int
    communication: int
    location_rating: int
    value: int
    comment: str
    created_at: datetime
    author: Optional[UserPublic] = None
