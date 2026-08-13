"""
The app entrypoint — this is your Express `app.js`.

    const app = express()                  ->  app = FastAPI(...)
    app.use(cors({...}))                   ->  app.add_middleware(CORSMiddleware, ...)
    app.use('/auth', authRouter)           ->  app.include_router(auth.router)

Run it with:  uvicorn app.main:app --reload
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import create_db_and_tables
from app.routers import auth


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown hook. Code before `yield` runs once when the server
    boots, code after runs on shutdown. Here: make sure the tables exist."""
    create_db_and_tables()
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
# ponytail: explicit localhost origins, not allow_origins=["*"] — the wildcard is
# incompatible with credentials and would need changing before deploy anyway.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],   # GET, POST, PATCH, DELETE, OPTIONS...
    allow_headers=["*"],   # notably Authorization and Content-Type
)

app.include_router(auth.router)


@app.get("/", tags=["meta"])
def root():
    """Sanity check that the server is up, plus a pointer to the docs."""
    return {"name": "Dwellio API", "docs": "/docs"}
