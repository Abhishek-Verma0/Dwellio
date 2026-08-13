"""
The DB connection — this file is your `mongoose.connect(...)`.

Two things live here:
  1. `engine`      — the connection pool, created ONCE for the whole app.
  2. `get_session` — hands each request its own Session, then closes it.

A SQLModel `Session` is a unit of work: you add/query through it and call
.commit() to write. Closest Mongoose analogue is a transaction-scoped
connection — except here you get a fresh one per HTTP request, automatically.
"""

from pathlib import Path
from typing import Annotated

from fastapi import Depends
from sqlmodel import Session, SQLModel, create_engine

# Anchor the DB file to backend/ instead of the current working directory, so
# `uvicorn app.main:app` and `python -m app.seed` always hit the SAME file no
# matter which folder you run them from.
DB_PATH = Path(__file__).resolve().parent.parent / "dwellio.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    # SQLite refuses to reuse a connection across threads by default, and
    # FastAPI runs sync endpoints in a threadpool. This flag is safe here
    # because each request still gets its own Session.
    connect_args={"check_same_thread": False},
    echo=False,  # flip to True to see every SQL statement in the console
)


def create_db_and_tables() -> None:
    """CREATE TABLE IF NOT EXISTS for every model. Called once on startup.

    ponytail: no Alembic migrations. This is a fresh-seed demo DB — if the
    schema changes you delete dwellio.db and re-seed. Add Alembic the day
    there's production data you can't throw away.
    """
    from app import models  # noqa: F401  — importing registers the tables on SQLModel.metadata

    SQLModel.metadata.create_all(engine)


def get_session():
    """FastAPI dependency: open a session, hand it to the route, close it after.

    `yield` (not `return`) is what makes this work — everything after the yield
    runs once the response is sent, like Express middleware's `next()` + cleanup.
    """
    with Session(engine) as session:
        yield session


# Type alias so routes read `session: SessionDep` instead of
# `session: Session = Depends(get_session)` on all ~20 endpoints.
SessionDep = Annotated[Session, Depends(get_session)]
