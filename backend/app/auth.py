"""
Everything security-related lives here: password hashing, JWT, and the two
dependencies that guard routes.

Express equivalent, one to one:

  bcrypt.hash(pw, 10)                      -> hash_password(pw)
  bcrypt.compare(pw, hash)                 -> verify_password(pw, hash)
  jwt.sign({id}, SECRET, {expiresIn})      -> create_access_token(user)
  app.use(requireAuth)                     -> Depends(get_current_user)
  app.use(requireRole('host'))             -> Depends(require_host)

The difference: FastAPI dependencies are declared per-route as a function
ARGUMENT, not registered globally with app.use(). That's why /docs can show a
padlock on exactly the protected routes — the framework knows which is which.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import select

from app.database import SessionDep
from app.models import User, UserRole

# ponytail: dev fallback secret so `git clone && run` works with zero setup.
# Set SECRET_KEY in the environment for anything deployed — a hardcoded secret
# means anyone with the repo can forge tokens for any user.
SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me-in-production")
ALGORITHM = "HS256"          # symmetric: same key signs and verifies
TOKEN_EXPIRE_DAYS = 7

# Bcrypt hashes at most 72 bytes and raises on longer input. Truncating in ONE
# helper used by both hash and verify keeps them consistent — if only one side
# truncated, long passwords would never log in.
BCRYPT_MAX_BYTES = 72


def _pw_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:BCRYPT_MAX_BYTES]


# ---------------------------------------------------------------------------
# Passwords
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """bcrypt with a per-password random salt (gensalt), stored inside the hash.

    That's why verify doesn't need the salt separately — it's the first 29 chars
    of the hash string. Same design as bcryptjs in Node.
    """
    return bcrypt.hashpw(_pw_bytes(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """Constant-time compare (checkpw), so response timing doesn't leak whether
    the first N characters were right."""
    return bcrypt.checkpw(_pw_bytes(password), hashed.encode("utf-8"))


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------

def create_access_token(user: User) -> str:
    """Sign a token whose payload identifies the user and when it dies.

    `sub` (subject) and `exp` (expiry) are registered JWT claims — PyJWT
    enforces `exp` automatically on decode, so expiry needs zero code from us.
    `sub` must be a string per the spec, hence str()/int() on the way out and in.

    ponytail: no refresh tokens. A 7-day token is fine for a demo; add refresh
    when you need short-lived access tokens plus real logout/revocation.
    """
    payload = {
        "sub": str(user.id),
        "role": user.role.value,  # convenience for the frontend; NEVER trusted for authz
        "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# auto_error=False so a MISSING header reaches our code instead of FastAPI
# raising its default 403. Auth failures should be 401, not 403.
bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    """Reads `Authorization: Bearer <token>`, verifies it, returns the real User.

    Every failure path answers with the SAME generic 401 — telling an attacker
    "expired" vs "no such user" vs "bad signature" is free intel.
    """
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None:
        raise unauthorized

    try:
        # Verifies the signature AND the exp claim. Tampered or stale -> raises.
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise unauthorized

    # Re-read the user from the DB rather than trusting the token's contents.
    # If the account was deleted or its role changed, the token shouldn't
    # outlive that.
    user = session.exec(select(User).where(User.id == user_id)).first()
    if user is None:
        raise unauthorized
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_host(user: CurrentUser) -> User:
    """Role gate, layered on top of get_current_user (a dependency of a
    dependency — FastAPI resolves the chain).

    401 = "I don't know who you are". 403 = "I know, and you may not."
    This only proves the caller IS a host. Whether they own THIS listing is a
    separate check in the route (`listing.host_id == user.id`).
    """
    if user.role != UserRole.host:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only hosts can perform this action",
        )
    return user


HostUser = Annotated[User, Depends(require_host)]


# ---------------------------------------------------------------------------
# Self-check: `python -m app.auth` — the smallest thing that fails if any of
# the security logic above breaks.
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    h = hash_password("correct-horse")
    assert h != "correct-horse", "password must not be stored in plaintext"
    assert verify_password("correct-horse", h), "right password must verify"
    assert not verify_password("wrong-horse", h), "wrong password must fail"
    assert hash_password("correct-horse") != h, "same password must get a different salt"

    fake = User(id=42, email="a@b.c", hashed_password=h, full_name="T", role=UserRole.host)
    token = create_access_token(fake)
    assert int(jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])["sub"]) == 42

    try:
        jwt.decode(token, "an-attackers-guess-of-the-signing-key", algorithms=[ALGORITHM])
        raise AssertionError("a token signed with another key must be rejected")
    except jwt.InvalidSignatureError:
        pass

    expired = jwt.encode(
        {"sub": "42", "exp": datetime.now(timezone.utc) - timedelta(seconds=1)},
        SECRET_KEY, algorithm=ALGORITHM,
    )
    try:
        jwt.decode(expired, SECRET_KEY, algorithms=[ALGORITHM])
        raise AssertionError("an expired token must be rejected")
    except jwt.ExpiredSignatureError:
        pass

    print("auth self-check passed")
