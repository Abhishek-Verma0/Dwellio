"""
Review routes, nested under a listing: /listings/{id}/reviews.

Two rules make this more than a CRUD table:
  1. You may only review a place you actually STAYED at, and only after the
     stay has ended. Otherwise the ratings are worthless.
  2. Posting a review updates the listing's avg_rating / review_count, because
     those columns are denormalised for the explore grid.
"""

from datetime import date

from fastapi import APIRouter, HTTPException, status
from sqlmodel import col, func, select

from app.auth import CurrentUser
from app.database import SessionDep
from app.models import Booking, BookingStatus, Listing, Review
from app.schemas import ReviewCreate, ReviewRead

router = APIRouter(prefix="/listings", tags=["reviews"])


def recalc_listing_rating(session: SessionDep, listing: Listing) -> None:
    """Recompute the cached aggregates from the reviews table.

    Listing.avg_rating and review_count are denormalised copies — fast to read
    on 20 cards at once, but they only stay true if every write path refreshes
    them. This is the only write path, so this is the only place that needs it.
    """
    avg, count = session.exec(
        select(func.avg(Review.rating), func.count(col(Review.id))).where(Review.listing_id == listing.id)
    ).one()
    listing.avg_rating = round(avg or 0, 2)
    listing.review_count = count
    session.add(listing)


@router.get("/{listing_id}/reviews", response_model=list[ReviewRead])
def get_reviews(session: SessionDep, listing_id: int):
    """Public — reading reviews needs no login."""
    return session.exec(
        select(Review).where(Review.listing_id == listing_id).order_by(col(Review.created_at).desc())
    ).all()


@router.post("/{listing_id}/reviews", response_model=ReviewRead, status_code=status.HTTP_201_CREATED)
def create_review(session: SessionDep, user: CurrentUser, listing_id: int, payload: ReviewCreate):
    """Post a review — only for a stay that finished, and only once per stay."""
    listing = session.get(Listing, listing_id)
    if listing is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Listing not found")

    # Every completed stay this user had at this listing.
    completed = session.exec(
        select(Booking)
        .where(Booking.listing_id == listing_id)
        .where(Booking.guest_id == user.id)
        .where(Booking.status == BookingStatus.confirmed)
        .where(Booking.check_out <= date.today())  # the trip must be OVER
        .order_by(col(Booking.check_in).asc())
    ).all()

    if not completed:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "You can only review a place after a completed stay",
        )

    # ...minus the ones already reviewed. The DB's unique index on
    # Review.booking_id is the real backstop; this just picks the right stay
    # and gives a readable error instead of an IntegrityError.
    reviewed = set(session.exec(select(Review.booking_id).where(Review.author_id == user.id)).all())
    booking = next((b for b in completed if b.id not in reviewed), None)
    if booking is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "You have already reviewed this stay")

    review = Review(
        **payload.model_dump(),
        listing_id=listing_id,
        author_id=user.id,      # from the token, not the body
        booking_id=booking.id,  # server-chosen, so a review can't be pinned to someone else's stay
    )
    session.add(review)
    session.commit()

    recalc_listing_rating(session, listing)
    session.commit()

    session.refresh(review)
    return review
