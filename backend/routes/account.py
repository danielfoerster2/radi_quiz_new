from __future__ import annotations

import os
import shutil
import sqlite3
import tempfile
import zipfile
from datetime import timedelta
from functools import wraps
from pathlib import Path
from typing import Any, Dict

from flask import (
    Blueprint,
    after_this_request,
    current_app,
    g,
    jsonify,
    make_response,
    request,
    send_file,
)

from ..database import get_connection, transaction
from ..notifications import send_verification_email
from ..session_manager import create_session, revoke_user_sessions
from ..utils import (
    current_timestamp,
    from_isoformat,
    generate_salt,
    generate_verification_code,
    hash_password,
    hash_plain_secret,
    is_valid_email,
    to_isoformat,
    validate_password_strength,
    verify_password,
    verify_plain_secret,
)
from ..workspace import DEFAULT_STUDENT_INSTRUCTIONS, provision_user_workspace


account_bp = Blueprint("account", __name__)


def _json_error(message: str, status: int = 400, **payload):
    response = {"error": message}
    response.update(payload)
    return jsonify(response), status


def _json_success(payload: Dict[str, Any], status: int = 200):
    return jsonify(payload), status


def _require_auth(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        if not g.get("current_user"):
            return _json_error("Not authenticated.", status=401)
        return func(*args, **kwargs)

    return wrapper


def _workspace_path() -> Path:
    storage_root = Path(current_app.config["STORAGE_ROOT"])
    user_uuid = g.current_user["user_uuid"]
    workspace = storage_root / user_uuid
    if not workspace.exists():
        provision_user_workspace(storage_root, user_uuid)
    return workspace


def _defaults_path() -> Path:
    return _workspace_path() / "user_defaults.sqlite"


def _ensure_defaults_record(conn: sqlite3.Connection) -> None:
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT 1 FROM defaults WHERE id = 1").fetchone()
    if row is None:
        conn.execute(
            """
            INSERT INTO defaults (
                id,
                first_name,
                last_name,
                institution_name,
                student_instructions,
                coding_explanation,
                email_subject,
                email_body,
                quiz_language
            )
            VALUES (1, '', '', '', ?, '', '', '', 'fr')
            """,
            (DEFAULT_STUDENT_INSTRUCTIONS,),
        )
        conn.commit()


def _load_defaults() -> Dict[str, Any]:
    path = _defaults_path()
    with sqlite3.connect(path) as conn:
        conn.row_factory = sqlite3.Row
        _ensure_defaults_record(conn)
        row = conn.execute("SELECT * FROM defaults WHERE id = 1").fetchone()
        if row is None:
            return {}
        return dict(row)


def _update_defaults(fields: Dict[str, Any]) -> Dict[str, Any]:
    if not fields:
        return _load_defaults()
    assignments = ", ".join(f"{key} = ?" for key in fields.keys())
    values = list(fields.values())
    values.append(1)
    path = _defaults_path()
    with sqlite3.connect(path) as conn:
        _ensure_defaults_record(conn)
        conn.execute(f"UPDATE defaults SET {assignments} WHERE id = ?", values)
        conn.commit()
    return _load_defaults()


@account_bp.route("/me", methods=["GET"])
@_require_auth
def get_me():
    defaults = _load_defaults()
    payload = {
        "email": g.current_user["email"],
        "first_name": defaults.get("first_name", ""),
        "last_name": defaults.get("last_name", ""),
        "quiz_language": defaults.get("quiz_language", "fr"),
    }
    return _json_success(payload)


@account_bp.route("/me", methods=["PUT"])
@_require_auth
def update_me():
    data = request.get_json(silent=True) or {}
    updates = {}
    if "first_name" in data:
        updates["first_name"] = (data.get("first_name") or "").strip()
    if "last_name" in data:
        updates["last_name"] = (data.get("last_name") or "").strip()

    if not updates:
        return _json_error("No fields to update.", status=400)

    updated = _update_defaults(updates)
    response = {
        "email": g.current_user["email"],
        "first_name": updated.get("first_name", ""),
        "last_name": updated.get("last_name", ""),
    }
    return _json_success(response)


@account_bp.route("/me/defaults", methods=["GET"])
@_require_auth
def get_defaults():
    defaults = _load_defaults()
    payload = {
        "institution_name": defaults.get("institution_name", ""),
        "student_instructions": defaults.get("student_instructions", ""),
        "coding_explanation": defaults.get("coding_explanation", ""),
        "email_subject": defaults.get("email_subject", ""),
        "email_body": defaults.get("email_body", ""),
        "quiz_language": defaults.get("quiz_language", "fr"),
    }
    return _json_success(payload)


@account_bp.route("/me/defaults", methods=["PUT"])
@_require_auth
def update_defaults():
    data = request.get_json(silent=True) or {}
    allowed = {
        "institution_name",
        "student_instructions",
        "coding_explanation",
        "email_subject",
        "email_body",
        "quiz_language",
    }
    updates = {}
    for key in allowed:
        if key in data:
            value = data.get(key)
            updates[key] = value if value is not None else ""

    if not updates:
        return _json_error("No fields to update.", status=400)

    updated = _update_defaults(updates)
    payload = {
        "institution_name": updated.get("institution_name", ""),
        "student_instructions": updated.get("student_instructions", ""),
        "coding_explanation": updated.get("coding_explanation", ""),
        "email_subject": updated.get("email_subject", ""),
        "email_body": updated.get("email_body", ""),
        "quiz_language": updated.get("quiz_language", "fr"),
    }
    return _json_success(payload)


@account_bp.route("/me/email-change", methods=["POST"])
@_require_auth
def request_email_change():
    data = request.get_json(silent=True) or {}
    new_email = (data.get("new_email") or "").strip().lower()

    if not is_valid_email(new_email):
        return _json_error("Invalid email address.", status=400)

    if new_email == g.current_user["email"]:
        return _json_error("Email address is unchanged.", status=400)

    conn = get_connection()
    other = conn.execute(
        "SELECT 1 FROM users WHERE email = ? AND user_uuid != ?",
        (new_email, g.current_user["user_uuid"]),
    ).fetchone()
    if other:
        return _json_error("Email address already in use.", status=409)

    verification_code = generate_verification_code(
        current_app.config["VERIFICATION_CODE_LENGTH"]
    )
    code_hash = hash_plain_secret(verification_code)
    now = current_timestamp()

    with transaction() as tx_conn:
        tx_conn.execute(
            """
            UPDATE users
            SET pending_email = ?, pending_email_code = ?, pending_email_requested_at = ?, updated_at = ?
            WHERE user_uuid = ?
            """,
            (
                new_email,
                code_hash,
                to_isoformat(now),
                to_isoformat(now),
                g.current_user["user_uuid"],
            ),
        )

    send_verification_email(new_email, verification_code)

    payload = {"message": "Verification code sent to new email."}
    if current_app.config.get("ENVIRONMENT") != "production":
        payload["verification_code"] = verification_code
    return _json_success(payload, status=202)


@account_bp.route("/me/email-change/verify", methods=["POST"])
@_require_auth
def verify_email_change():
    data = request.get_json(silent=True) or {}
    code = (data.get("verification_code") or "").strip()
    if not code:
        return _json_error("Verification code is required.", status=400)

    conn = get_connection()
    user_row = conn.execute(
        """
        SELECT pending_email, pending_email_code, pending_email_requested_at
        FROM users
        WHERE user_uuid = ?
        """,
        (g.current_user["user_uuid"],),
    ).fetchone()
    if not user_row or not user_row["pending_email"]:
        return _json_error("No email change requested.", status=400)

    code_hash = user_row["pending_email_code"]
    if not code_hash or not verify_plain_secret(code, code_hash):
        return _json_error("Invalid verification code.", status=400)

    requested_at_raw = user_row["pending_email_requested_at"]
    if requested_at_raw:
        try:
            requested_at = from_isoformat(requested_at_raw)
        except Exception:
            requested_at = None
        if requested_at:
            if current_timestamp() - requested_at > timedelta(minutes=30):
                return _json_error("Verification code expired.", status=400)

    new_email = user_row["pending_email"]
    other = conn.execute(
        "SELECT 1 FROM users WHERE email = ? AND user_uuid != ?",
        (new_email, g.current_user["user_uuid"]),
    ).fetchone()
    if other:
        return _json_error("Email address already in use.", status=409)

    now = current_timestamp()
    with transaction() as tx_conn:
        tx_conn.execute(
            """
            UPDATE users
            SET email = ?, pending_email = NULL, pending_email_code = NULL,
                pending_email_requested_at = NULL, updated_at = ?
            WHERE user_uuid = ?
            """,
            (
                new_email,
                to_isoformat(now),
                g.current_user["user_uuid"],
            ),
        )

    g.current_user["email"] = new_email
    payload = {"message": "Email address updated.", "email": new_email}
    return _json_success(payload)


@account_bp.route("/me/password", methods=["POST"])
@_require_auth
def change_password():
    data = request.get_json(silent=True) or {}
    current_password = data.get("current_password") or ""
    new_password = data.get("new_password") or ""

    if not current_password or not new_password:
        return _json_error("Current and new passwords are required.", status=400)

    ok, message = validate_password_strength(new_password)
    if not ok:
        return _json_error(message, status=400)

    user = g.current_user
    if not user.get("salt") or not user.get("salted_password_hash"):
        return _json_error(
            "Password credentials not configured. Use Google sign-in or reset flow.",
            status=409,
        )

    if not verify_password(
        current_password, user["salt"], user["salted_password_hash"]
    ):
        return _json_error("Current password is incorrect.", status=400)

    salt = generate_salt()
    password_hash = hash_password(new_password, salt)
    now = current_timestamp()

    with transaction() as tx_conn:
        tx_conn.execute(
            """
            UPDATE users
            SET salt = ?, salted_password_hash = ?, one_time_pwd = NULL,
                one_time_pwd_expires_at = ?, updated_at = ?
            WHERE user_uuid = ?
            """,
            (
                salt,
                password_hash,
                to_isoformat(now),
                to_isoformat(now),
                user["user_uuid"],
            ),
        )

    revoke_user_sessions(user["user_uuid"])

    token, expires_at = create_session(
        user["user_uuid"], current_app.config["SESSION_LIFETIME"]
    )
    response = make_response(
        jsonify(
            {
                "message": "Password updated.",
                "session_expires_at": to_isoformat(expires_at),
            }
        )
    )
    response.set_cookie(
        current_app.config["SESSION_COOKIE_NAME"],
        token,
        max_age=int(current_app.config["SESSION_LIFETIME"].total_seconds()),
        expires=expires_at,
        httponly=True,
        secure=current_app.config["SESSION_COOKIE_SECURE"],
        samesite="Lax",
        path="/",
    )
    return response


@account_bp.route("/me/export", methods=["GET"])
@_require_auth
def export_workspace():
    workspace = _workspace_path()
    if not workspace.exists():
        return _json_error("Workspace not found.", status=404)

    temp_dir = tempfile.mkdtemp(prefix="radiquiz-export-")
    archive_path = Path(temp_dir) / f"{g.current_user['user_uuid']}.zip"

    with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for root, _, files in os.walk(workspace):
            for file in files:
                file_path = Path(root) / file
                archive.write(file_path, arcname=file_path.relative_to(workspace))

    @after_this_request
    def cleanup(response):
        try:
            shutil.rmtree(temp_dir)
        except OSError:
            pass
        return response

    return send_file(
        archive_path,
        as_attachment=True,
        download_name=f"{g.current_user['user_uuid']}-workspace.zip",
        mimetype="application/zip",
        max_age=0,
    )


@account_bp.route("/me", methods=["DELETE"])
@_require_auth
def delete_account():
    workspace = _workspace_path()
    user_uuid = g.current_user["user_uuid"]

    revoke_user_sessions(user_uuid)

    with transaction() as tx_conn:
        tx_conn.execute("DELETE FROM users WHERE user_uuid = ?", (user_uuid,))

    if workspace.exists():
        shutil.rmtree(workspace, ignore_errors=True)

    response = make_response(jsonify({"message": "Account deleted."}))
    response.delete_cookie(
        current_app.config["SESSION_COOKIE_NAME"],
        path="/",
    )
    return response, 200
