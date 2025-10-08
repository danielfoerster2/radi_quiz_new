from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Generator, Optional

from flask import g


_DATABASE_URL: Optional[str] = None
_DB_LOCK = threading.Lock()


def init_app(app) -> None:
    global _DATABASE_URL
    _DATABASE_URL = app.config["DATABASE_URL"]

    app.teardown_appcontext(_close_connection)

    with app.app_context():
        initialize_schema()


def _connect(database_url: str) -> sqlite3.Connection:
    if database_url.startswith("sqlite:///"):
        db_path = Path(database_url.replace("sqlite:///", "", 1))
        db_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(
            db_path,
            detect_types=sqlite3.PARSE_DECLTYPES,
            check_same_thread=False,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection
    raise ValueError("Unsupported database URL. Only sqlite:/// is supported.")


def get_connection() -> sqlite3.Connection:
    if _DATABASE_URL is None:
        raise RuntimeError("Database URL is not configured.")
    if "db_conn" not in g:
        g.db_conn = _connect(_DATABASE_URL)
    return g.db_conn


def _close_connection(exception=None) -> None:
    connection = g.pop("db_conn", None)
    if connection is not None:
        connection.close()


@contextmanager
def transaction() -> Generator[sqlite3.Connection, None, None]:
    connection = get_connection()
    with _DB_LOCK:
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise


def initialize_schema() -> None:
    if _DATABASE_URL is None:
        raise RuntimeError("Database URL is not configured.")
    with _connect(_DATABASE_URL) as connection:
        cursor = connection.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                user_uuid TEXT NOT NULL UNIQUE,
                salt TEXT,
                salted_password_hash TEXT,
                one_time_pwd TEXT,
                one_time_pwd_expires_at TEXT,
                verification_code TEXT,
                pending_email TEXT,
                pending_email_code TEXT,
                pending_email_requested_at TEXT,
                google_sub TEXT,
                last_active TEXT,
                workspace_is_encrypted INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_token_hash TEXT NOT NULL UNIQUE,
                user_uuid TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_active TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                FOREIGN KEY (user_uuid) REFERENCES users (user_uuid) ON DELETE CASCADE
            )
            """
        )
        cursor.close()
        connection.commit()
        _ensure_user_columns(connection)


def _ensure_user_columns(connection: sqlite3.Connection) -> None:
    columns = {
        "pending_email": "TEXT",
        "pending_email_code": "TEXT",
        "pending_email_requested_at": "TEXT",
    }
    existing = {
        row["name"] for row in connection.execute("PRAGMA table_info(users)")
    }
    for column, definition in columns.items():
        if column not in existing:
            connection.execute(
                f"ALTER TABLE users ADD COLUMN {column} {definition}"
            )
    connection.commit()


__all__ = ["init_app", "get_connection", "transaction"]
