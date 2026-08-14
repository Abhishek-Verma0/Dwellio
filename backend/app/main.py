"""
The app entrypoint — this is your Express `app.js`.

    const app = express()                  ->  app = FastAPI(...)
    app.use(cors({...}))                   ->  app.add_middleware(CORSMiddleware, ...)
    app.use('/auth', authRouter)           ->  app.include_router(auth.router)

Run it with:  uvicorn app.main:app --reload
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from app.database import create_db_and_tables, engine
from app.models import User
from app.routers import auth, bookings, listings, reviews, users, wishlist


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown hook. Code before `yield` runs once when the server
    boots, code after runs on shutdown. Here: make sure the tables exist."""
    create_db_and_tables()
    # ponytail: Render's free tier has no persistent disk, so dwellio.db is gone
    # after every deploy and the demo would come up empty. Reseed only when there
    # is no user at all — a database with data in it is never touched. Attach a
    # disk (paid) and this branch simply stops firing.
    with Session(engine) as session:
        if session.exec(select(User)).first() is None:
            from app.seed import seed  # imported here: seed() is startup-only

            seed()
    yield


app = FastAPI(
    title="Dwellio API",
    description="Airbnb-style booking API. Interactive docs below — click **Authorize** and paste a token to try protected routes.",
    version="1.0.0",
    lifespan=lifespan,
)

# The browser blocks cross-origin requests unless the server opts in. The Next.js
# dev server is a DIFFERENT origin (localhost:3000 vs localhost:8000), so without
# this every fetch from the frontend fails with a CORS error.
# ponytail: deployed, this middleware does nothing — Next proxies /api on the same
# origin, so the browser never makes a cross-origin request. It stays for the case
# where the frontend is pointed straight at this API (NEXT_PUBLIC_API_URL set, or a
# split two-service deploy), where dropping it would break every fetch.
# FRONTEND_ORIGINS is a comma-separated list; never allow_origins=["*"], which is
# incompatible with credentials anyway.
_origins = os.getenv("FRONTEND_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],   # GET, POST, PATCH, DELETE, OPTIONS...
    allow_headers=["*"],   # notably Authorization and Content-Type
)

app.include_router(auth.router)
app.include_router(listings.router)
app.include_router(bookings.router)
app.include_router(reviews.router)
app.include_router(wishlist.router)
app.include_router(users.router)


@app.get("/", tags=["meta"])
def root():
    """Sanity check that the server is up, plus a pointer to the docs."""
    return {"name": "Dwellio API", "docs": "/docs"}
