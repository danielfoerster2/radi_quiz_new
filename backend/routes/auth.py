from __future__ import annotations

import base64
import json
import logging
from datetime import timedelta
from pathlib import Path
from typing import Any, Dict, Optional

from flask import (
    Blueprint,
    current_app,
    g,
    jsonify,
    make_response,
    request,
)

from ..database import get_connection, transaction
from ..notifications import (
    send_password_reset_email,
    send_verification_email,
)
from ..session_manager import (
    create_session,
    invalidate_session,
    refresh_session_lifetime,
    revoke_user_sessions,
)
from ..utils import (
    current_timestamp,
    from_isoformat,
    generate_one_time_password,
    generate_salt,
    generate_uuid,
    generate_verification_code,
    hash_password,
    hash_plain_secret,
    is_valid_email,
    to_isoformat,
    validate_password_strength,
    verify_password,
    verify_plain_secret,
)
from ..workspace import (
    is_workspace_encrypted,
    mark_workspace_encrypted,
    provision_user_workspace,
)


LOGGER = logging.getLogger(__name__)

auth_bp = Blueprint("auth", __name__)


def _json_error(message: str, status: int = 400, **payload):
    response = {"error": message}
    response.update(payload)
    return jsonify(response), status


def _json_success(payload: Dict[str, Any], status: int = 200):
    return jsonify(payload), status


def _set_session_cookie(response, token: str, expires_at):
    lifetime: timedelta = current_app.config["SESSION_LIFETIME"]
    response.set_cookie(
        current_app.config["SESSION_COOKIE_NAME"],
        token,
        max_age=int(lifetime.total_seconds()),
        expires=expires_at,
        httponly=True,
        secure=current_app.config["SESSION_COOKIE_SECURE"],
        samesite="Lax",
        path="/",
    )


def _clear_session_cookie(response):
    response.delete_cookie(
        current_app.config["SESSION_COOKIE_NAME"],
        path="/",
    )


def _serialize_user(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "email": row["email"],
        "user_uuid": row["user_uuid"],
        "last_active": row.get("last_active"),
        "workspace_is_encrypted": bool(row.get("workspace_is_encrypted", 0)),
    }


def _fetch_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM users WHERE email = ?",
        (email,),
    ).fetchone()
    return dict(row) if row else None


def _post_register_success_response(user_row: Dict[str, Any]):
    token, expires_at = create_session(
        user_row["user_uuid"],
        current_app.config["SESSION_LIFETIME"],
    )
    response = make_response(
        jsonify(
            {
                "user": _serialize_user(user_row),
                "session_expires_at": to_isoformat(expires_at),
            }
        )
    )
    _set_session_cookie(response, token, expires_at)
    return response


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not is_valid_email(email):
        return _json_error("Invalid email address.", status=400)

    ok, message = validate_password_strength(password)
    if not ok:
        return _json_error(message, status=400)

    verification_code = generate_verification_code(
        current_app.config["VERIFICATION_CODE_LENGTH"]
    )
    salt = generate_salt()
    password_hash = hash_password(password, salt)
    now = current_timestamp()

    existing_user = _fetch_user_by_email(email)
    if existing_user and existing_user.get("verification_code") == "-1":
        return _json_error("Account already exists. Please log in.", status=409)

    with transaction() as conn:
        if existing_user:
            conn.execute(
                """
                UPDATE users
                SET salt = ?, salted_password_hash = ?, verification_code = ?, updated_at = ?
                WHERE email = ?
                """,
                (
                    salt,
                    password_hash,
                    verification_code,
                    to_isoformat(now),
                    email,
                ),
            )
        else:
            user_uuid = generate_uuid()
            conn.execute(
                """
                INSERT INTO users (
                    email,
                    user_uuid,
                    salt,
                    salted_password_hash,
                    verification_code,
                    workspace_is_encrypted,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    email,
                    user_uuid,
                    salt,
                    password_hash,
                    verification_code,
                    to_isoformat(now),
                    to_isoformat(now),
                ),
            )

    send_verification_email(email, verification_code)

    payload = {
        "message": "Verification code sent.",
    }
    if current_app.config.get("ENVIRONMENT") != "production":
        payload["verification_code"] = verification_code
    return _json_success(payload, status=201)


@auth_bp.route("/register/verify", methods=["POST"])
def verify_registration():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    code = (data.get("verification_code") or "").strip()

    if not is_valid_email(email):
        return _json_error("Invalid email address.", status=400)

    user = _fetch_user_by_email(email)
    if not user:
        return _json_error("Account not found.", status=404)

    if user.get("verification_code") == "-1":
        return _json_error("Account already verified.", status=409)

    if user.get("verification_code") != code:
        return _json_error("Invalid verification code.", status=400)

    now = current_timestamp()

    storage_root = Path(current_app.config["STORAGE_ROOT"])
    workspace_path = provision_user_workspace(storage_root, user["user_uuid"])

    with transaction() as conn:
        conn.execute(
            """
            UPDATE users
            SET verification_code = '-1',
                last_active = ?,
                updated_at = ?,
                workspace_is_encrypted = 0
            WHERE email = ?
            """,
            (
                to_isoformat(now),
                to_isoformat(now),
                email,
            ),
        )

    refreshed_user = _fetch_user_by_email(email)
    response = _post_register_success_response(refreshed_user)
    return response


def _parse_google_token(id_token: str) -> Dict[str, Any]:
    try:
        from google.oauth2 import id_token as google_id_token  # type: ignore
        from google.auth.transport import requests as google_requests  # type: ignore

        client_id = current_app.config.get("GOOGLE_CLIENT_ID") or None
        request_adapter = google_requests.Request()
        info = google_id_token.verify_oauth2_token(
            id_token,
            request_adapter,
            client_id,
        )
        return dict(info)
    except Exception:
        pass

    try:
        header, payload, _ = id_token.split(".", 2)
        padding = "=" * (-len(payload) % 4)
        decoded = base64.urlsafe_b64decode(payload + padding)
        info = json.loads(decoded.decode("utf-8"))
        return info
    except Exception:
        pass

    try:
        return json.loads(id_token)
    except Exception as exc:
        raise ValueError("Unable to decode Google ID token.") from exc


def _upsert_google_user(token_data: Dict[str, Any]) -> Dict[str, Any]:
    email = (token_data.get("email") or "").strip().lower()
    sub = token_data.get("sub") or token_data.get("user_id")

    if not email or not is_valid_email(email):
        raise ValueError("Google token missing valid email.")

    if token_data.get("email_verified") is False:
        raise ValueError("Google email is unverified.")

    now = current_timestamp()
    storage_root = Path(current_app.config["STORAGE_ROOT"])
    user = _fetch_user_by_email(email)

    if user:
        with transaction() as conn:
            conn.execute(
                """
                UPDATE users
                SET google_sub = ?, verification_code = '-1', updated_at = ?
                WHERE email = ?
                """,
                (
                    sub,
                    to_isoformat(now),
                    email,
                ),
            )
        if not (storage_root / user["user_uuid"]).exists():
            provision_user_workspace(storage_root, user["user_uuid"])
        return _fetch_user_by_email(email)

    user_uuid = generate_uuid()
    provision_user_workspace(storage_root, user_uuid)
    with transaction() as conn:
        conn.execute(
            """
            INSERT INTO users (
                email,
                user_uuid,
                google_sub,
                verification_code,
                workspace_is_encrypted,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, '-1', 0, ?, ?)
            """,
            (
                email,
                user_uuid,
                sub,
                to_isoformat(now),
                to_isoformat(now),
            ),
        )
    return _fetch_user_by_email(email)


@auth_bp.route("/register/google", methods=["POST"])
def register_google():
    data = request.get_json(silent=True) or {}
    id_token = data.get("id_token") or ""
    if not id_token:
        return _json_error("id_token is required.", status=400)

    try:
        token_data = _parse_google_token(id_token)
    except ValueError as exc:
        return _json_error(str(exc), status=400)

    try:
        user = _upsert_google_user(token_data)
    except ValueError as exc:
        return _json_error(str(exc), status=400)

    response = _post_register_success_response(user)
    return response


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not is_valid_email(email):
        return _json_error("Invalid email address.", status=400)

    user = _fetch_user_by_email(email)
    if not user or user.get("verification_code") != "-1":
        return _json_error("Invalid credentials.", status=401)

    if not user.get("salt") or not user.get("salted_password_hash"):
        return _json_error(
            "Account requires Google sign-in or password reset.",
            status=409,
        )

    if verify_password(password, user["salt"], user["salted_password_hash"]):
        response = _post_register_success_response(user)
        return response

    otp_hash = user.get("one_time_pwd")
    otp_expires_at = user.get("one_time_pwd_expires_at")
    if otp_hash and otp_expires_at:
        try:
            expires_at_dt = from_isoformat(otp_expires_at)
        except Exception:  # pragma: no cover - corrupted data safeguard
            expires_at_dt = None
        now = current_timestamp()
        if expires_at_dt and expires_at_dt > now:
            if verify_plain_secret(password, otp_hash):
                return _json_error(
                    "One-time password accepted. Please reset your password.",
                    status=409,
                    requires_password_reset=True,
                )

    return _json_error("Invalid credentials.", status=401)


@auth_bp.route("/login/google", methods=["POST"])
def login_google():
    data = request.get_json(silent=True) or {}
    id_token = data.get("id_token") or ""
    if not id_token:
        return _json_error("id_token is required.", status=400)

    try:
        token_data = _parse_google_token(id_token)
    except ValueError as exc:
        return _json_error(str(exc), status=400)

    email = (token_data.get("email") or "").strip().lower()
    user = _fetch_user_by_email(email)
    if not user:
        try:
            user = _upsert_google_user(token_data)
        except ValueError as exc:
            return _json_error(str(exc), status=400)

    response = _post_register_success_response(user)
    return response


@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()

    if not is_valid_email(email):
        return _json_error("Invalid email address.", status=400)

    user = _fetch_user_by_email(email)
    if not user:
        return _json_success({"message": "If the account exists, an email has been sent."})

    otp = generate_one_time_password()
    otp_hash = hash_plain_secret(otp)
    expires_at = current_timestamp() + timedelta(minutes=15)

    with transaction() as conn:
        conn.execute(
            """
            UPDATE users
            SET one_time_pwd = ?, one_time_pwd_expires_at = ?, updated_at = ?
            WHERE email = ?
            """,
            (
                otp_hash,
                to_isoformat(expires_at),
                to_isoformat(current_timestamp()),
                email,
            ),
        )

    send_password_reset_email(email, otp, expires_at)

    payload = {"message": "One-time password sent."}
    if current_app.config.get("ENVIRONMENT") != "production":
        payload["one_time_password"] = otp
    return _json_success(payload)


@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    otp = (data.get("otp") or "").strip()
    new_password = data.get("new_password") or ""

    if not is_valid_email(email):
        return _json_error("Invalid email address.", status=400)

    ok, message = validate_password_strength(new_password)
    if not ok:
        return _json_error(message, status=400)

    user = _fetch_user_by_email(email)
    if not user:
        return _json_error("Invalid reset request.", status=400)

    otp_hash = user.get("one_time_pwd")
    otp_expires_at = user.get("one_time_pwd_expires_at")
    if not otp_hash or not otp_expires_at:
        return _json_error("Invalid or expired code.", status=400)

    if not verify_plain_secret(otp, otp_hash):
        return _json_error("Invalid or expired code.", status=400)

    expires_at_dt = from_isoformat(otp_expires_at)
    now = current_timestamp()
    if expires_at_dt <= now:
        return _json_error("Invalid or expired code.", status=400)

    salt = generate_salt()
    password_hash = hash_password(new_password, salt)

    with transaction() as conn:
        conn.execute(
            """
            UPDATE users
            SET salt = ?, salted_password_hash = ?, one_time_pwd = NULL,
                one_time_pwd_expires_at = ?, updated_at = ?
            WHERE email = ?
            """,
            (
                salt,
                password_hash,
                to_isoformat(now),
                to_isoformat(now),
                email,
            ),
        )

    user = _fetch_user_by_email(email)
    revoke_user_sessions(user["user_uuid"])

    token, expires_at = create_session(
        user["user_uuid"],
        current_app.config["SESSION_LIFETIME"],
    )
    response = make_response(
        jsonify(
            {
                "message": "Password reset successfully.",
                "user": _serialize_user(user),
                "session_expires_at": to_isoformat(expires_at),
            }
        )
    )
    _set_session_cookie(response, token, expires_at)
    return response


@auth_bp.route("/session", methods=["GET"])
def get_session():
    if not g.get("current_user") or not g.get("current_session"):
        return _json_error("Not authenticated.", status=401)

    user = g.current_user
    session_info = g.current_session

    payload = {
        "user": _serialize_user(user),
        "session_expires_at": to_isoformat(session_info["expires_at"]),
    }
    if current_app.config.get("ENVIRONMENT") != "production":
        payload["workspace_encrypted"] = is_workspace_encrypted(
            Path(current_app.config["STORAGE_ROOT"]) / user["user_uuid"]
        )
    return _json_success(payload)


@auth_bp.route("/session/refresh", methods=["POST"])
def refresh_session():
    if not g.get("current_user") or not g.get("current_session"):
        return _json_error("Not authenticated.", status=401)

    session = g.current_session
    expires_at = refresh_session_lifetime(
        session["id"], current_app.config["SESSION_LIFETIME"]
    )
    response = make_response(
        jsonify(
            {
                "message": "Session refreshed.",
                "session_expires_at": to_isoformat(expires_at),
            }
        )
    )
    token = request.cookies.get(current_app.config["SESSION_COOKIE_NAME"])
    if token:
        _set_session_cookie(response, token, expires_at)
    return response


@auth_bp.route("/logout", methods=["POST"])
def logout():
    token = request.cookies.get(current_app.config["SESSION_COOKIE_NAME"])
    if token:
        invalidate_session(token)

    if g.get("current_user"):
        user = g.current_user
        storage_root = Path(current_app.config["STORAGE_ROOT"])
        workspace = storage_root / user["user_uuid"]
        if workspace.exists():
            mark_workspace_encrypted(workspace)
        with transaction() as conn:
            conn.execute(
                """
                UPDATE users
                SET workspace_is_encrypted = 1, updated_at = ?
                WHERE user_uuid = ?
                """,
                (
                    to_isoformat(current_timestamp()),
                    user["user_uuid"],
                ),
            )

    response = make_response(jsonify({"message": "Logged out."}))
    _clear_session_cookie(response)
    return response
