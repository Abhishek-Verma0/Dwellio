"""
Listing routes: browse/search, detail, availability, and host CRUD.

The search endpoint is the interesting one. Rather than writing a different
query per filter combination, we start with one base query and conditionally
bolt on .where() clauses. SQLModel/SQLAlchemy statements are immutable-ish
builders — `stmt = stmt.where(...)` returns a NEW statement — so nothing runs
against the database until session.exec(). Same idea as chaining
`Model.find().where().limit()` in Mongoose before awaiting it.
"""

from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import col, func, select

from app.auth import HostUser
from app.database import SessionDep
from app.models import (
    Amenity,
    Booking,
    Listing,
    ListingAmenityLink,
    ListingPhoto,
    RoomType,
    booking_overlap_clause,
)
from app.schemas import (
    AvailabilityRead,
    FiltersRead,
    ListingCard,
    ListingCreate,
    ListingDetail,
    ListingPage,
    ListingUpdate,
)

router = APIRouter(prefix="/listings", tags=["listings"])

# sort=<key> -> ORDER BY. A dict keeps the route body free of if/elif stairs,
# and an unknown key simply falls back to newest instead of erroring.
SORT_OPTIONS = {
    "newest": col(Listing.created_at).desc(),
    "price_asc": col(Listing.price_per_night).asc(),
    "price_desc": col(Listing.price_per_night).desc(),
    "rating": col(Listing.avg_rating).desc(),
}


def get_listing_or_404(session: SessionDep, listing_id: int) -> Listing:
    """Used by five routes below — one lookup, one error message."""
    listing = session.get(Listing, listing_id)  # .get() = primary-key lookup, findById()
    if listing is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Listing not found")
    return listing


def apply_photos_and_amenities(
    session: SessionDep,
    listing: Listing,
    photos: Optional[list] = None,
    amenity_ids: Optional[list[int]] = None,
) -> None:
    """Replace a listing's gallery and/or amenity set. Shared by create+update.

    `None` means "not sent, leave it alone"; a list means "this is now the
    complete set" — which is why update deletes the old photos first.
    """
    if photos is not None:
        for old in listing.photos:
            session.delete(old)
        listing.photos = [
            ListingPhoto(url=p.url, caption=p.caption, sort_order=i if p.sort_order == 0 else p.sort_order)
            for i, p in enumerate(photos)
        ]

    if amenity_ids is not None:
        found = session.exec(select(Amenity).where(col(Amenity.id).in_(amenity_ids))).all()
        if len(found) != len(set(amenity_ids)):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "One or more amenity_ids do not exist")
        # Assigning to the relationship rewrites the link table for us.
        listing.amenities = list(found)


# ---------------------------------------------------------------------------
# Browse / search
# ---------------------------------------------------------------------------

@router.get("", response_model=ListingPage)
def search_listings(
    session: SessionDep,
    # Every one of these is optional, so they're all query params with defaults:
    #   /listings?city=Goa&guests=4&max_price=8000&page=2
    q: Annotated[Optional[str], Query(description="Free text: title, city or country")] = None,
    city: Optional[str] = None,
    country: Optional[str] = None,
    guests: Annotated[Optional[int], Query(gt=0)] = None,
    min_price: Annotated[Optional[float], Query(ge=0)] = None,
    max_price: Annotated[Optional[float], Query(ge=0)] = None,
    property_type: Optional[str] = None,
    room_type: Optional[RoomType] = None,
    amenity_ids: Annotated[Optional[list[int]], Query(description="Repeat the param: ?amenity_ids=1&amenity_ids=2")] = None,
    check_in: Optional[date] = None,
    check_out: Optional[date] = None,
    sort: str = "newest",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
):
    """The explore grid: filter, sort, paginate."""
    if check_in and check_out and check_out <= check_in:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "check_out must be after check_in")

    stmt = select(Listing).where(Listing.is_active == True)  # noqa: E712 — SQL needs ==, not `is`

    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            col(Listing.title).ilike(like)
            | col(Listing.city).ilike(like)
            | col(Listing.country).ilike(like)
        )
    if city:
        stmt = stmt.where(col(Listing.city).ilike(f"%{city}%"))
    if country:
        stmt = stmt.where(col(Listing.country).ilike(f"%{country}%"))
    if guests:
        stmt = stmt.where(Listing.max_guests >= guests)
    if min_price is not None:
        stmt = stmt.where(Listing.price_per_night >= min_price)
    if max_price is not None:
        stmt = stmt.where(Listing.price_per_night <= max_price)
    if property_type:
        stmt = stmt.where(Listing.property_type == property_type)
    if room_type:
        stmt = stmt.where(Listing.room_type == room_type)

    if amenity_ids:
        # AND semantics: "wifi AND pool", not "wifi OR pool". One subquery per
        # amenity, because each must be present.
        # ponytail: N subqueries for N amenities. Fine for a filter row of ~5;
        # swap for a GROUP BY ... HAVING COUNT(*) = N if that ever gets long.
        for amenity_id in set(amenity_ids):
            stmt = stmt.where(
                col(Listing.id).in_(
                    select(ListingAmenityLink.listing_id).where(ListingAmenityLink.amenity_id == amenity_id)
                )
            )

    if check_in and check_out:
        # Hide anything already booked for those dates: "id NOT IN (listings
        # with a colliding booking)". Same clause the booking route enforces.
        stmt = stmt.where(
            col(Listing.id).not_in(
                select(Booking.listing_id).where(booking_overlap_clause(check_in, check_out))
            )
        )

    # COUNT over the filtered set, before pagination — that's the `total` the
    # frontend needs to render "1–20 of 137" and to know when to stop.
    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()

    stmt = stmt.order_by(SORT_OPTIONS.get(sort, SORT_OPTIONS["newest"]))
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)  # OFFSET/LIMIT = .skip()/.limit()
    items = session.exec(stmt).all()

    return ListingPage(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,  # ceiling division
    )


# ---------------------------------------------------------------------------
# Host's own listings
#
# NOTE: declared BEFORE /{listing_id}. FastAPI matches routes in order, and
# "mine" is not an int, so /listings/mine would 422 against /listings/{id:int}
# if that came first. Classic Express gotcha too.
# ---------------------------------------------------------------------------

@router.get("/filters", response_model=FiltersRead)
def get_filter_options(session: SessionDep):
    """What the filter row can filter BY — read from the data, not hardcoded.

    Also declared before /{listing_id} for the same reason as /mine.
    """
    prices = session.exec(select(Listing.price_per_night).where(Listing.is_active == True)).all()  # noqa: E712
    property_types = session.exec(
        select(Listing.property_type).where(Listing.is_active == True).distinct()  # noqa: E712
    ).all()

    return FiltersRead(
        amenities=session.exec(select(Amenity).order_by(col(Amenity.name))).all(),
        property_types=sorted(property_types),
        # Fall back to 0 when there are no listings, so the price slider still
        # has usable bounds on an empty database.
        price_min=min(prices, default=0),
        price_max=max(prices, default=0),
    )


@router.get("/mine", response_model=list[ListingDetail])
def my_listings(session: SessionDep, host: HostUser):
    """Host dashboard. Includes deactivated listings — it's the owner's view."""
    return session.exec(
        select(Listing).where(Listing.host_id == host.id).order_by(col(Listing.created_at).desc())
    ).all()


# ---------------------------------------------------------------------------
# Detail + availability
# ---------------------------------------------------------------------------

@router.get("/{listing_id}", response_model=ListingDetail)
def get_listing(session: SessionDep, listing_id: int):
    listing = get_listing_or_404(session, listing_id)
    if not listing.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Listing not found")
    return listing


@router.get("/{listing_id}/availability", response_model=AvailabilityRead)
def get_availability(
    session: SessionDep,
    listing_id: int,
    check_in: Optional[date] = None,
    check_out: Optional[date] = None,
):
    """Feeds the date picker.

    Always returns the booked ranges (so the calendar can grey out days). If
    both dates are supplied it also answers the yes/no question directly, using
    the same overlap clause the booking route will enforce — the calendar and
    the booking can't disagree.
    """
    get_listing_or_404(session, listing_id)

    booked = session.exec(
        select(Booking)
        .where(Booking.listing_id == listing_id)
        .where(Booking.status == "confirmed")
        .where(Booking.check_out >= date.today())  # past stays don't block anything
        .order_by(col(Booking.check_in).asc())
    ).all()

    available = None
    if check_in and check_out:
        if check_out <= check_in:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "check_out must be after check_in")
        clash = session.exec(
            select(Booking)
            .where(Booking.listing_id == listing_id)
            .where(booking_overlap_clause(check_in, check_out))
        ).first()
        available = clash is None

    return AvailabilityRead(listing_id=listing_id, booked=booked, available=available)


# ---------------------------------------------------------------------------
# Host CRUD
# ---------------------------------------------------------------------------

@router.post("", response_model=ListingDetail, status_code=status.HTTP_201_CREATED)
def create_listing(session: SessionDep, host: HostUser, payload: ListingCreate):
    """`host: HostUser` is the entire authorization story: guests get a 403
    before this body runs, and host.id is trusted (it came from the DB via the
    token) — so a client cannot create a listing owned by someone else."""
    listing = Listing(
        **payload.model_dump(exclude={"photos", "amenity_ids"}),  # the plain columns
        host_id=host.id,
    )
    session.add(listing)
    apply_photos_and_amenities(session, listing, payload.photos, payload.amenity_ids)
    session.commit()
    session.refresh(listing)
    return listing


@router.patch("/{listing_id}", response_model=ListingDetail)
def update_listing(session: SessionDep, host: HostUser, listing_id: int, payload: ListingUpdate):
    listing = get_listing_or_404(session, listing_id)

    # Role said "a host". THIS says "the host who owns it". Without this line
    # any host could edit any other host's listings.
    if listing.host_id != host.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit your own listings")

    # exclude_unset: only fields the client actually SENT get written, so
    # PATCH {"price_per_night": 5000} doesn't blank out the description.
    data = payload.model_dump(exclude_unset=True, exclude={"photos", "amenity_ids"})
    for key, value in data.items():
        setattr(listing, key, value)

    apply_photos_and_amenities(session, listing, payload.photos, payload.amenity_ids)
    session.add(listing)
    session.commit()
    session.refresh(listing)
    return listing


@router.delete("/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_listing(session: SessionDep, host: HostUser, listing_id: int):
    """Soft delete: is_active = False.

    A hard DELETE would orphan every booking that points at this listing —
    guests would lose their trip history for a place the host removed. Flipping
    the flag hides it from search and detail while the bookings stay intact.
    """
    listing = get_listing_or_404(session, listing_id)
    if listing.host_id != host.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only delete your own listings")

    listing.is_active = False
    session.add(listing)
    session.commit()
    # 204 = success, no body. Nothing to return.
