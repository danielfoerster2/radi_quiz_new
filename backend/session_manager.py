from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from .database import get_connection, transaction
from .utils import (
    current_timestamp,
    from_isoformat,
    generate_session_token,
    hash_session_token,
    to_isoformat,
)


def create_session(user_uuid: str, lifetime: timedelta) -> tuple[str, datetime]:
    token = generate_session_token()
    token_hash = hash_session_token(token)
    now = current_timestamp()
    expires_at = now + lifetime

    with transaction() as conn:
        conn.execute(
            """
            INSERT INTO sessions (session_token_hash, user_uuid, created_at, last_active, expires_at, is_active)
            VALUES (?, ?, ?, ?, ?, 1)
            """,
            (
                token_hash,
                user_uuid,
                to_isoformat(now),
                to_isoformat(now),
                to_isoformat(expires_at),
            ),
        )
    return token, expires_at


def _expire_session(session_id: int) -> None:
    with transaction() as conn:
        conn.execute(
            "UPDATE sessions SET is_active = 0 WHERE id = ?",
            (session_id,),
        )


def get_active_session(token: str) -> Optional[dict]:
    if not token:
        return None
    token_hash = hash_session_token(token)
    conn = get_connection()
    row = conn.execute(
        """
        SELECT id, user_uuid, created_at, last_active, expires_at, is_active
        FROM sessions
        WHERE session_token_hash = ?
        """,
        (token_hash,),
    ).fetchone()
    if row is None:
        return None
    if not row["is_active"]:
        return None
    expires_at = from_isoformat(row["expires_at"])
    now = current_timestamp()
    if expires_at <= now:
        _expire_session(row["id"])
        return None
    return {
        "id": row["id"],
        "user_uuid": row["user_uuid"],
        "created_at": from_isoformat(row["created_at"]),
        "last_active": from_isoformat(row["last_active"]),
        "expires_at": expires_at,
    }


def mark_session_activity(session_id: int) -> datetime:
    now = current_timestamp()
    with transaction() as conn:
        conn.execute(
            """
            UPDATE sessions
            SET last_active = ?
            WHERE id = ?
            """,
            (to_isoformat(now), session_id),
        )
    return now


def refresh_session_lifetime(session_id: int, lifetime: timedelta) -> datetime:
    now = current_timestamp()
    expires_at = now + lifetime
    with transaction() as conn:
        conn.execute(
            """
            UPDATE sessions
            SET last_active = ?, expires_at = ?
            WHERE id = ?
            """,
            (to_isoformat(now), to_isoformat(expires_at), session_id),
        )
    return expires_at


def invalidate_session(token: str) -> None:
    token_hash = hash_session_token(token)
    with transaction() as conn:
        conn.execute(
            """
            UPDATE sessions
            SET is_active = 0
            WHERE session_token_hash = ?
            """,
            (token_hash,),
        )


def revoke_user_sessions(user_uuid: str) -> None:
    with transaction() as conn:
        conn.execute(
            "UPDATE sessions SET is_active = 0 WHERE user_uuid = ?",
            (user_uuid,),
        )


__all__ = [
    "create_session",
    "get_active_session",
    "mark_session_activity",
    "refresh_session_lifetime",
    "invalidate_session",
    "revoke_user_sessions",
]
