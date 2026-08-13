"""
Wishlist (the heart icon): save and unsave listings.

WishlistItem is a pure link table with a composite primary key
(user_id, listing_id) — so "saved twice" is impossible at the database level,
and both routes below are idempotent: clicking the heart twice is not an error,
it just ends in the state you asked for.
"""

from fastapi import APIRouter, HTTPException, status
from sqlmodel import col, select

from app.auth import CurrentUser
from app.database import SessionDep
from app.models import Listing, WishlistItem
from app.schemas import ListingCard

router = APIRouter(prefix="/wishlist", tags=["wishlist"])


@router.get("", response_model=list[ListingCard])
def get_wishlist(session: SessionDep, user: CurrentUser):
    """The saved listings themselves, not the link rows — the frontend renders
    the same card component as the explore grid.

    Deactivated listings are filtered out: a host deleted it, so it shouldn't
    sit in your wishlist as a dead card.
    """
    return session.exec(
        select(Listing)
        .join(WishlistItem)
        .where(WishlistItem.user_id == user.id)
        .where(Listing.is_active == True)  # noqa: E712
        .order_by(col(WishlistItem.created_at).desc())
    ).all()


@router.post("/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
def add_to_wishlist(session: SessionDep, user: CurrentUser, listing_id: int):
    """Idempotent: saving an already-saved listing is a no-op, not a 409.
    The UI just wants "this is saved now" to be true."""
    if session.get(Listing, listing_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Listing not found")

    # .get() with a tuple looks up a composite primary key.
    if session.get(WishlistItem, (user.id, listing_id)) is None:
        session.add(WishlistItem(user_id=user.id, listing_id=listing_id))
        session.commit()


@router.delete("/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_from_wishlist(session: SessionDep, user: CurrentUser, listing_id: int):
    """Also idempotent — un-saving something that isn't saved is fine."""
    item = session.get(WishlistItem, (user.id, listing_id))
    if item:
        session.delete(item)
        session.commit()
