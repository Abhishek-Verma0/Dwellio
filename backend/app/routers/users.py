"""
Public user profiles — the "Meet your host" panel on a listing page.

One route. `response_model=UserPublic` is what makes it safe to expose at all:
the User row has a password hash on it, and UserPublic doesn't have that field.
"""

from fastapi import APIRouter, HTTPException, status
from sqlmodel import col, select

from app.database import SessionDep
from app.models import Listing, User
from app.schemas import ListingCard, UserPublic

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/{user_id}", response_model=UserPublic)
def get_user(session: SessionDep, user_id: int):
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


@router.get("/{user_id}/listings", response_model=list[ListingCard])
def get_user_listings(session: SessionDep, user_id: int):
    """A host's public listings — active ones only, unlike /listings/mine
    which is the owner's private view and includes deactivated ones."""
    return session.exec(
        select(Listing)
        .where(Listing.host_id == user_id)
        .where(Listing.is_active == True)  # noqa: E712
        .order_by(col(Listing.created_at).desc())
    ).all()
