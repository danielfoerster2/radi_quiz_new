from __future__ import annotations

import base64
import hashlib
import os
import re
import secrets
import uuid
from datetime import datetime, timezone
from typing import Tuple


PASSWORD_REGEX = re.compile(
    r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,30}$"
)
EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def current_timestamp() -> datetime:
    return datetime.now(timezone.utc)


def to_isoformat(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def from_isoformat(value: str) -> datetime:
    return datetime.fromisoformat(value)


def generate_uuid() -> str:
    return str(uuid.uuid4())


def generate_salt(length: int = 16) -> str:
    data = os.urandom(length)
    return base64.b64encode(data).decode("ascii")


def hash_password(password: str, salt: str) -> str:
    salt_bytes = base64.b64decode(salt.encode("ascii"))
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_bytes, 390000)
    return base64.b64encode(hashed).decode("ascii")


def verify_password(password: str, salt: str, hashed: str) -> bool:
    computed = hash_password(password, salt)
    return secrets.compare_digest(computed, hashed)


def generate_verification_code(length: int) -> str:
    digits = "".join(secrets.choice("0123456789") for _ in range(length))
    return digits


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_one_time_password(length: int = 8) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def hash_plain_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def verify_plain_secret(secret: str, hashed: str) -> bool:
    return secrets.compare_digest(hash_plain_secret(secret), hashed)


def validate_password_strength(password: str) -> Tuple[bool, str]:
    if not PASSWORD_REGEX.match(password or ""):
        return (
            False,
            "Password must be 8-30 characters with upper, lower, digit, and special characters.",
        )
    return True, ""


def is_valid_email(value: str) -> bool:
    return bool(EMAIL_REGEX.match(value or ""))


__all__ = [
    "current_timestamp",
    "generate_uuid",
    "generate_salt",
    "hash_password",
    "verify_password",
    "generate_verification_code",
    "generate_session_token",
    "hash_session_token",
    "generate_one_time_password",
    "hash_plain_secret",
    "verify_plain_secret",
    "validate_password_strength",
    "to_isoformat",
    "from_isoformat",
    "is_valid_email",
]
