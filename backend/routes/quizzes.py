from __future__ import annotations

import shutil
import sqlite3
from functools import wraps
from pathlib import Path
from typing import Any, Dict, Optional

from flask import Blueprint, current_app, g, jsonify, request

from ..utils import current_timestamp, generate_uuid, to_isoformat
from ..workspace import (
    DEFAULT_STUDENT_INSTRUCTIONS,
    ensure_quiz_workspace,
    provision_user_workspace,
)


quizzes_bp = Blueprint("quizzes", __name__)

QUIZ_COLUMNS = [
    "quiz_uuid",
    "quiz_title",
    "creation_date",
    "quiz_state",
    "id_coding",
    "number_of_questions",
    "institution_name",
    "student_instructions",
    "coding_explanation",
    "email_subject",
    "email_body",
    "class_title",
    "date_of_quiz",
    "duration",
    "quiz_language",
    "random_question_order",
    "random_answer_order",
    "two_up_printing",
]

BOOLEAN_FIELDS = {
    "random_question_order",
    "random_answer_order",
    "two_up_printing",
}

DEFAULT_QUIZ_TITLE = "Nouveau quiz"


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


def _quizes_db_path() -> Path:
    return _workspace_path() / "quizes.sqlite"


def _ensure_quizes_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS quizes (
            quiz_uuid TEXT PRIMARY KEY,
            quiz_title TEXT,
            creation_date TEXT,
            quiz_state TEXT,
            id_coding TEXT,
            number_of_questions INTEGER,
            institution_name TEXT,
            student_instructions TEXT,
            coding_explanation TEXT,
            email_subject TEXT,
            email_body TEXT,
            class_title TEXT,
            date_of_quiz TEXT,
            duration TEXT,
            quiz_language TEXT,
            random_question_order INTEGER,
            random_answer_order INTEGER,
            two_up_printing INTEGER
        )
        """
    )
    conn.commit()


def _get_connection() -> sqlite3.Connection:
    path = _quizes_db_path()
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    _ensure_quizes_table(conn)
    return conn


def _ensure_defaults() -> Dict[str, Any]:
    defaults_path = _workspace_path() / "user_defaults.sqlite"
    with sqlite3.connect(defaults_path) as defaults_conn:
        defaults_conn.row_factory = sqlite3.Row
        defaults_conn.execute(
            """
            CREATE TABLE IF NOT EXISTS defaults (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                first_name TEXT,
                last_name TEXT,
                institution_name TEXT,
                student_instructions TEXT,
                coding_explanation TEXT,
                email_subject TEXT,
                email_body TEXT,
                quiz_language TEXT
            )
            """
        )
        defaults_conn.commit()
        row = defaults_conn.execute("SELECT * FROM defaults WHERE id = 1").fetchone()
        if row is None:
            defaults_conn.execute(
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
            defaults_conn.commit()
            row = defaults_conn.execute("SELECT * FROM defaults WHERE id = 1").fetchone()
        return dict(row)


def _row_to_quiz(row: sqlite3.Row) -> Dict[str, Any]:
    quiz = {key: row[key] for key in QUIZ_COLUMNS if key in row.keys()}
    quiz["number_of_questions"] = quiz.get("number_of_questions") or 0
    for field in BOOLEAN_FIELDS:
        quiz[field] = bool(quiz.get(field))
    return quiz


def _fetch_quiz(conn: sqlite3.Connection, quiz_uuid: str) -> Optional[Dict[str, Any]]:
    row = conn.execute(
        "SELECT * FROM quizes WHERE quiz_uuid = ?",
        (quiz_uuid,),
    ).fetchone()
    if row is None:
        return None
    return _row_to_quiz(row)


@quizzes_bp.route("/quizzes", methods=["GET"])
@_require_auth
def list_quizzes():
    conn = _get_connection()
    rows = conn.execute(
        "SELECT * FROM quizes ORDER BY creation_date DESC"
    ).fetchall()
    quizzes = [_row_to_quiz(row) for row in rows]
    return _json_success({"quizzes": quizzes})


@quizzes_bp.route("/quizzes", methods=["POST"])
@_require_auth
def create_quiz():
    data = request.get_json(silent=True) or {}
    quiz_title = (data.get("quiz_title") or "").strip() or DEFAULT_QUIZ_TITLE
    class_title = (data.get("class_title") or "").strip()
    now = current_timestamp()
    creation_date = to_isoformat(now)
    quiz_uuid = generate_uuid()

    conn = _get_connection()
    defaults = _ensure_defaults()

    payload = {
        "quiz_uuid": quiz_uuid,
        "quiz_title": quiz_title,
        "creation_date": creation_date,
        "quiz_state": "unlocked",
        "id_coding": (data.get("id_coding") or "8"),
        "number_of_questions": int(data.get("number_of_questions") or 0),
        "institution_name": data.get("institution_name") or defaults.get("institution_name", ""),
        "student_instructions": data.get("student_instructions") or defaults.get("student_instructions", ""),
        "coding_explanation": data.get("coding_explanation") or defaults.get("coding_explanation", ""),
        "email_subject": data.get("email_subject") or defaults.get("email_subject", ""),
        "email_body": data.get("email_body") or defaults.get("email_body", ""),
        "class_title": class_title,
        "date_of_quiz": data.get("date_of_quiz") or "",
        "duration": data.get("duration") or "",
        "quiz_language": data.get("quiz_language") or defaults.get("quiz_language", "fr"),
        "random_question_order": 1 if data.get("random_question_order") else 0,
        "random_answer_order": 1 if data.get("random_answer_order") else 0,
        "two_up_printing": 1 if data.get("two_up_printing") else 0,
    }

    conn.execute(
        f"""
        INSERT INTO quizes ({", ".join(QUIZ_COLUMNS)})
        VALUES ({", ".join(["?"] * len(QUIZ_COLUMNS))})
        """,
        [payload[column] for column in QUIZ_COLUMNS],
    )
    conn.commit()

    workspace = _workspace_path()
    ensure_quiz_workspace(workspace, quiz_uuid)

    quiz = _fetch_quiz(conn, quiz_uuid)
    return _json_success({"quiz": quiz}, status=201)


@quizzes_bp.route("/quizzes/<quiz_uuid>", methods=["GET"])
@_require_auth
def get_quiz(quiz_uuid: str):
    conn = _get_connection()
    quiz = _fetch_quiz(conn, quiz_uuid)
    if not quiz:
        return _json_error("Quiz not found.", status=404)
    return _json_success({"quiz": quiz})


@quizzes_bp.route("/quizzes/<quiz_uuid>", methods=["PUT"])
@_require_auth
def update_quiz(quiz_uuid: str):
    conn = _get_connection()
    if not _fetch_quiz(conn, quiz_uuid):
        return _json_error("Quiz not found.", status=404)

    data = request.get_json(silent=True) or {}
    updates: Dict[str, Any] = {}

    for field in QUIZ_COLUMNS:
        if field == "quiz_uuid" or field == "creation_date":
            continue
        if field in data:
            value = data[field]
            if field == "number_of_questions":
                try:
                    value = int(value)
                except (TypeError, ValueError):
                    return _json_error("number_of_questions must be an integer.", status=400)
            elif field in BOOLEAN_FIELDS:
                value = 1 if value else 0
            updates[field] = value

    if not updates:
        return _json_error("No fields to update.", status=400)

    assignments = ", ".join(f"{key} = ?" for key in updates.keys())
    conn.execute(
        f"UPDATE quizes SET {assignments} WHERE quiz_uuid = ?",
        list(updates.values()) + [quiz_uuid],
    )
    conn.commit()

    quiz = _fetch_quiz(conn, quiz_uuid)
    return _json_success({"quiz": quiz})


@quizzes_bp.route("/quizzes/<quiz_uuid>", methods=["DELETE"])
@_require_auth
def delete_quiz(quiz_uuid: str):
    conn = _get_connection()
    quiz = _fetch_quiz(conn, quiz_uuid)
    if not quiz:
        return _json_error("Quiz not found.", status=404)

    conn.execute("DELETE FROM quizes WHERE quiz_uuid = ?", (quiz_uuid,))
    conn.commit()

    quiz_path = _workspace_path() / quiz_uuid
    if quiz_path.exists():
        shutil.rmtree(quiz_path, ignore_errors=True)

    return _json_success({"message": "Quiz deleted."})


@quizzes_bp.route("/quizzes/<quiz_uuid>/duplicate", methods=["POST"])
@_require_auth
def duplicate_quiz(quiz_uuid: str):
    conn = _get_connection()
    quiz = _fetch_quiz(conn, quiz_uuid)
    if not quiz:
        return _json_error("Quiz not found.", status=404)

    data = request.get_json(silent=True) or {}
    new_uuid = generate_uuid()
    new_title = (data.get("quiz_title") or "").strip()
    if not new_title:
        original_title = quiz.get("quiz_title") or DEFAULT_QUIZ_TITLE
        new_title = f"{original_title} (copie)"

    now = to_isoformat(current_timestamp())

    clone = quiz.copy()
    clone.update(
        {
            "quiz_uuid": new_uuid,
            "quiz_title": new_title,
            "creation_date": now,
            "quiz_state": "unlocked",
        }
    )
    clone["random_question_order"] = 1 if clone["random_question_order"] else 0
    clone["random_answer_order"] = 1 if clone["random_answer_order"] else 0
    clone["two_up_printing"] = 1 if clone["two_up_printing"] else 0

    conn.execute(
        f"""
        INSERT INTO quizes ({", ".join(QUIZ_COLUMNS)})
        VALUES ({", ".join(["?"] * len(QUIZ_COLUMNS))})
        """,
        [clone[column] for column in QUIZ_COLUMNS],
    )
    conn.commit()

    workspace = _workspace_path()
    source_dir = workspace / quiz_uuid
    target_dir = workspace / new_uuid
    if source_dir.exists():
        shutil.copytree(source_dir, target_dir)
    ensure_quiz_workspace(workspace, new_uuid)

    duplicated = _fetch_quiz(conn, new_uuid)
    return _json_success({"quiz": duplicated}, status=201)


@quizzes_bp.route("/quizzes/<quiz_uuid>/lock", methods=["POST"])
@_require_auth
def lock_quiz(quiz_uuid: str):
    conn = _get_connection()
    quiz = _fetch_quiz(conn, quiz_uuid)
    if not quiz:
        return _json_error("Quiz not found.", status=404)
    if quiz.get("quiz_state") == "locked":
        return _json_success({"quiz": quiz, "message": "Quiz already locked."})

    conn.execute(
        "UPDATE quizes SET quiz_state = ? WHERE quiz_uuid = ?",
        ("locked", quiz_uuid),
    )
    conn.commit()
    quiz = _fetch_quiz(conn, quiz_uuid)
    return _json_success({"quiz": quiz})


@quizzes_bp.route("/quizzes/<quiz_uuid>/unlock", methods=["POST"])
@_require_auth
def unlock_quiz(quiz_uuid: str):
    conn = _get_connection()
    quiz = _fetch_quiz(conn, quiz_uuid)
    if not quiz:
        return _json_error("Quiz not found.", status=404)

    conn.execute(
        "UPDATE quizes SET quiz_state = ? WHERE quiz_uuid = ?",
        ("unlocked", quiz_uuid),
    )
    conn.commit()
    quiz = _fetch_quiz(conn, quiz_uuid)
    return _json_success({"quiz": quiz})
