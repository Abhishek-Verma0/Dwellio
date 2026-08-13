"""
Auth routes: register, login, me.

`APIRouter` is `express.Router()`. The prefix is declared once here instead of
at mount time, so every path below is relative to /auth.
"""

from datetime import date

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.auth import CurrentUser, create_access_token, hash_password, verify_password
from app.database import SessionDep
from app.models import User, UserRole
from app.schemas import Token, UserCreate, UserLogin, UserPublic

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, session: SessionDep):
    """Create an account and log in immediately (returns a token, like Airbnb).

    `payload: UserCreate` is the whole body-parsing story — no express.json(),
    no manual req.body validation. Bad email or a 5-char password is a 422
    before this function is even called.
    """
    # Friendly 409 instead of a raw DB error. The `unique=True` index on
    # User.email is still the real guarantee — this check could lose a race
    # between two simultaneous signups, the constraint cannot.
    existing = session.exec(select(User).where(User.email == payload.email)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),  # the raw password is never stored
        full_name=payload.full_name,
        role=payload.role,
        # Hosts get their "Host since" date now; guests leave it null.
        host_since=date.today() if payload.role == UserRole.host else None,
    )

    session.add(user)      # stage the INSERT
    session.commit()       # run it
    session.refresh(user)  # read back DB-generated values (id, created_at)

    return Token(access_token=create_access_token(user), user=user)


@router.post("/login", response_model=Token)
def login(payload: UserLogin, session: SessionDep):
    """Email + password -> JWT.

    ponytail: JSON body, not OAuth2PasswordRequestForm. Your Next.js client
    posts JSON anyway, and it saves the python-multipart dependency. Cost: in
    /docs you paste the token into Authorize instead of typing credentials.
    """
    user = session.exec(select(User).where(User.email == payload.email)).first()

    # One branch, one message, for both "no such email" and "wrong password" —
    # separate errors would let anyone enumerate which emails have accounts.
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    return Token(access_token=create_access_token(user), user=user)


@router.get("/me", response_model=UserPublic)
def me(user: CurrentUser):
    """Who am I? The dependency already did all the work: no token, expired
    token, or deleted user never reaches this line — it's a 401 before that.

    response_model=UserPublic is what strips `hashed_password` from the User
    object on its way out.
    """
    return user
