from __future__ import annotations

import csv
import json
import sqlite3
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from flask import Blueprint, current_app, g, jsonify, request

from ..notifications import (
    send_password_reset_email,
    send_verification_email,
)
from ..services.email_service import (
    EmailConfig,
    EmailRequest,
    render_template,
    send_email,
)
from ..utils import current_timestamp, is_valid_email, to_isoformat
from ..workspace import ensure_quiz_workspace, provision_user_workspace


emails_bp = Blueprint("emails", __name__)


def _json_error(message: str, status: int = 400, **payload):
    response = {"error": message}
    response.update(payload)
    return jsonify(response), status


def _json_success(payload: Dict[str, Any], status: int = 200):
    return jsonify(payload), status


def _require_auth(func):
    from functools import wraps

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


def _quiz_dir(quiz_uuid: str) -> Path:
    workspace = _workspace_path()
    ensure_quiz_workspace(workspace, quiz_uuid)
    return workspace / quiz_uuid


def _quizes_db_path() -> Path:
    return _workspace_path() / "quizes.sqlite"


def _fetch_quiz(quiz_uuid: str) -> Optional[Dict[str, Any]]:
    path = _quizes_db_path()
    with sqlite3.connect(path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM quizes WHERE quiz_uuid = ?",
            (quiz_uuid,),
        ).fetchone()
    return dict(row) if row else None


def _ensure_quiz(quiz_uuid: str):
    quiz = _fetch_quiz(quiz_uuid)
    if quiz is None:
        return None, _json_error("Quiz not found.", status=404)
    return quiz, None


def _load_roster(quiz_uuid: str) -> List[Dict[str, str]]:
    roster_path = _quiz_dir(quiz_uuid) / "list.csv"
    if not roster_path.exists():
        return []
    with roster_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        return [
            {
                "id": (row.get("id") or "").strip(),
                "nom": (row.get("nom") or "").strip(),
                "prenom": (row.get("prenom") or "").strip(),
                "email": (row.get("email") or "").strip(),
            }
            for row in reader
        ]


def _load_notes(quiz_uuid: str) -> Dict[str, Dict[str, Any]]:
    notes_path = _quiz_dir(quiz_uuid) / "amc_session" / "notes.csv"
    results: Dict[str, Dict[str, Any]] = {}
    if not notes_path.exists():
        return results
    with notes_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            student_id = (row.get("etu") or "").strip()
            if not student_id:
                continue
            raw_mark = (row.get("Mark") or "").strip()
            grade = None
            if raw_mark:
                normalized = raw_mark.replace(",", ".")
                try:
                    grade = float(normalized)
                except ValueError:
                    grade = None
            results[student_id] = {
                "grade": grade,
                "raw": row,
            }
    return results


def _format_grade(value: Optional[float]) -> str:
    if value is None:
        return "ABS"
    return f"{value:.2f}"


def _email_templates(quiz: Dict[str, Any]) -> Dict[str, str]:
    return {
        "subject": quiz.get("email_subject") or f"Résultats - {quiz.get('quiz_title', '')}",
        "body": quiz.get("email_body")
        or "Bonjour {prenom} {nom},\n\nVotre note pour le quiz {quiz_title} est {grade}/20.\n\nCordialement,\n{instructor}",
    }


def _instructor_name() -> str:
    defaults_path = _workspace_path() / "user_defaults.sqlite"
    if not defaults_path.exists():
        return ""
    with sqlite3.connect(defaults_path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT first_name, last_name FROM defaults WHERE id = 1").fetchone()
    if not row:
        return ""
    parts = [row["first_name"] or "", row["last_name"] or ""]
    return " ".join(part for part in parts if part).strip()


def _build_email_payloads(
    quiz_uuid: str,
    quiz: Dict[str, Any],
    requested_ids: Optional[Sequence[str]],
    reply_to: Optional[str],
    bcc: Sequence[str],
) -> List[Dict[str, Any]]:
    roster = _load_roster(quiz_uuid)
    notes = _load_notes(quiz_uuid)
    templates = _email_templates(quiz)
    instructor = _instructor_name()

    roster_map = {student["id"]: student for student in roster if student.get("id")}

    if requested_ids:
        student_ids = [student_id for student_id in requested_ids if student_id in roster_map]
    else:
        student_ids = list(roster_map.keys())

    corrections_dir = _quiz_dir(quiz_uuid) / "amc_session" / "cr" / "corrections" / "pdf"
    quiz_title = quiz.get("quiz_title") or "Quiz"

    payloads: List[Dict[str, Any]] = []
    for student_id in student_ids:
        student = roster_map[student_id]
        email_address = student.get("email")
        if not email_address:
            continue

        grade_info = notes.get(student_id)
        grade_value = grade_info["grade"] if grade_info else None
        grade_display = _format_grade(grade_value)

        context = {
            "prenom": student.get("prenom", ""),
            "nom": student.get("nom", ""),
            "grade": grade_display,
            "quiz_title": quiz_title,
            "instructor": instructor,
        }
        subject = render_template(templates["subject"], context)
        body = render_template(templates["body"], context)

        attachment = corrections_dir / f"{student_id}.pdf"
        payloads.append(
            {
                "student_id": student_id,
                "email": email_address,
                "subject": subject,
                "body": body,
                "grade": grade_display,
                "attachment_path": str(attachment) if attachment.exists() else None,
                "attachment_exists": attachment.exists(),
                "reply_to": reply_to,
                "bcc": list(bcc),
            }
        )
    return payloads


@emails_bp.route("/emails/verification", methods=["POST"])
@_require_auth
def issue_verification_email():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    code = (data.get("code") or "").strip()
    if not is_valid_email(email):
        return _json_error("Invalid email address.", status=400)
    if not code:
        return _json_error("Verification code is required.", status=400)

    success = send_verification_email(email, code)
    if not success:
        return _json_error("Failed to send verification email.", status=502)
    return _json_success({"message": "Verification email sent."}, status=202)


@emails_bp.route("/emails/password-reset", methods=["POST"])
@_require_auth
def issue_password_reset_email():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    otp = (data.get("otp") or "").strip()
    expires_at_raw = data.get("expires_at")

    if not is_valid_email(email):
        return _json_error("Invalid email address.", status=400)
    if not otp:
        return _json_error("otp is required.", status=400)

    if expires_at_raw:
        try:
            expires_at = datetime.fromisoformat(expires_at_raw)
        except ValueError:
            return _json_error("expires_at must be ISO-8601.", status=400)
    else:
        expires_at = current_timestamp()

    success = send_password_reset_email(email, otp, expires_at)
    if not success:
        return _json_error("Failed to send password reset email.", status=502)
    return _json_success({"message": "Password reset email sent."}, status=202)


@emails_bp.route("/quizzes/<quiz_uuid>/emails/preview", methods=["POST"])
@_require_auth
def preview_quiz_emails(quiz_uuid: str):
    quiz, error = _ensure_quiz(quiz_uuid)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    requested_ids = data.get("student_ids")
    if requested_ids is not None and not isinstance(requested_ids, list):
        return _json_error("student_ids must be a list.", status=400)

    reply_to = data.get("reply_to")
    bcc = data.get("bcc", [])
    if reply_to and not is_valid_email(reply_to):
        return _json_error("reply_to must be a valid email.", status=400)
    if not isinstance(bcc, list):
        return _json_error("bcc must be a list of email addresses.", status=400)
    for address in bcc:
        if not is_valid_email(address):
            return _json_error(f"Invalid BCC address: {address}", status=400)

    payloads = _build_email_payloads(quiz_uuid, quiz, requested_ids, reply_to, bcc)
    return _json_success(
        {
            "quiz_uuid": quiz_uuid,
            "count": len(payloads),
            "messages": payloads,
        }
    )


@emails_bp.route("/quizzes/<quiz_uuid>/emails/send", methods=["POST"])
@_require_auth
def send_quiz_emails(quiz_uuid: str):
    quiz, error = _ensure_quiz(quiz_uuid)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    requested_ids = data.get("student_ids")
    if requested_ids is not None and not isinstance(requested_ids, list):
        return _json_error("student_ids must be a list.", status=400)

    reply_to = data.get("reply_to")
    bcc = data.get("bcc", [])
    if reply_to and not is_valid_email(reply_to):
        return _json_error("reply_to must be a valid email.", status=400)
    if not isinstance(bcc, list):
        return _json_error("bcc must be a list of email addresses.", status=400)
    for address in bcc:
        if not is_valid_email(address):
            return _json_error(f"Invalid BCC address: {address}", status=400)

    try:
        config = EmailConfig.from_env()
    except KeyError:
        return _json_error("Email configuration is incomplete.", status=503)
    except ValueError as exc:
        return _json_error(str(exc), status=503)

    payloads = _build_email_payloads(quiz_uuid, quiz, requested_ids, reply_to, bcc)
    total = len(payloads)
    sent = 0
    failures: List[Dict[str, Any]] = []

    for index, message in enumerate(payloads, start=1):
        request_payload = EmailRequest(
            to=[message["email"]],
            subject=message["subject"],
            body=message["body"],
            reply_to=reply_to,
            bcc=bcc,
            attachments=[Path(message["attachment_path"])] if message["attachment_path"] else [],
        )
        try:
            send_email(config, request_payload)
            sent += 1
        except Exception as exc:  # pragma: no cover - external dependency
            failures.append(
                {
                    "student_id": message["student_id"],
                    "email": message["email"],
                    "error": str(exc),
                }
            )
        if index < total:
            time.sleep(5)

    result = {
        "sent": sent,
        "total": total,
        "failed": failures,
        "completed_at": to_isoformat(current_timestamp()),
    }
    return _json_success(result)


@emails_bp.route("/support/requests", methods=["POST"])
@_require_auth
def submit_support_request():
    data = request.get_json(silent=True) or {}
    sender_email = (data.get("email") or "").strip()
    subject = (data.get("subject") or "Support request").strip()
    message_body = (data.get("message") or "").strip()

    if sender_email and not is_valid_email(sender_email):
        return _json_error("email must be valid.", status=400)
    if not message_body:
        return _json_error("message is required.", status=400)

    try:
        config = EmailConfig.from_env()
    except KeyError:
        return _json_error("Email configuration is incomplete.", status=503)
    except ValueError as exc:
        return _json_error(str(exc), status=503)

    support_address = current_app.config.get("SUPPORT_EMAIL") or config.from_address
    if not support_address:
        return _json_error("Support email address is not configured.", status=503)

    full_body = (
        f"Support request submitted at {to_isoformat(current_timestamp())}\n\n"
        f"From: {sender_email or 'Unknown'}\n"
        f"User UUID: {g.current_user.get('user_uuid')}\n"
        f"Email: {g.current_user.get('email')}\n\n"
        f"Message:\n{message_body}"
    )

    request_payload = EmailRequest(
        to=[support_address],
        subject=subject or "Support request",
        body=full_body,
        reply_to=sender_email or None,
        bcc=[],
        attachments=[],
    )

    try:
        send_email(config, request_payload)
    except Exception as exc:  # pragma: no cover - external dependency
        return _json_error(f"Failed to submit support request: {exc}", status=502)

    return _json_success({"message": "Support request submitted."}, status=202)
