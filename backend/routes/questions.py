from __future__ import annotations

import hashlib
import json
import random
import sqlite3
from functools import wraps
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

from flask import Blueprint, current_app, g, jsonify, request

from ..services.ai_service import generate_questions as ai_generate_questions
from ..utils import current_timestamp, generate_uuid, to_isoformat
from ..workspace import ensure_quiz_workspace, provision_user_workspace


questions_bp = Blueprint("questions", __name__)

DEFAULT_SUBJECT_TITLE = "Nouvelle section"


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


def _get_quiz_metadata(quiz_uuid: str) -> Optional[Dict[str, Any]]:
    path = _quizes_db_path()
    with sqlite3.connect(path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM quizes WHERE quiz_uuid = ?",
            (quiz_uuid,),
        ).fetchone()
    if not row:
        return None
    return dict(row)


def _ensure_quiz_exists(quiz_uuid: str):
    quiz = _get_quiz_metadata(quiz_uuid)
    if not quiz:
        return None, _json_error("Quiz not found.", status=404)
    return quiz, None


def _ensure_quiz_unlocked(quiz: Dict[str, Any]):
    if quiz.get("quiz_state") != "unlocked":
        return _json_error("Quiz is locked.", status=409)
    return None


def _quiz_directory(quiz_uuid: str) -> Path:
    workspace = _workspace_path()
    ensure_quiz_workspace(workspace, quiz_uuid)
    return workspace / quiz_uuid


def _illustrations_dir(quiz_uuid: str) -> Path:
    directory = _quiz_directory(quiz_uuid) / "illustrations"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _store_illustration(quiz_uuid: str, filename: str, data: bytes) -> str:
    extension = (Path(filename).suffix or "").lower()
    if extension not in {".png", ".jpg", ".jpeg"}:
        raise ValueError("Only PNG and JPG images are supported.")
    if extension == ".jpeg":
        extension = ".jpg"
    digest = hashlib.md5(data).hexdigest()
    stored_name = f"{digest}{extension}"
    path = _illustrations_dir(quiz_uuid) / stored_name
    path.write_bytes(data)
    return stored_name


def _remove_illustration_if_unused(quiz_uuid: str, filename: Optional[str]) -> None:
    if not filename:
        return
    with _open_questions_conn(quiz_uuid) as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM questions WHERE illustration_filename = ?",
            (filename,),
        ).fetchone()[0]
    if count:
        return
    illustration_path = _illustrations_dir(quiz_uuid) / filename
    if illustration_path.exists():
        illustration_path.unlink()


def _open_questions_conn(quiz_uuid: str) -> sqlite3.Connection:
    path = _quiz_directory(quiz_uuid) / "questions.sqlite"
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def _open_answers_conn(quiz_uuid: str) -> sqlite3.Connection:
    path = _quiz_directory(quiz_uuid) / "answers.sqlite"
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_subjects(conn: sqlite3.Connection) -> List[sqlite3.Row]:
    subjects = conn.execute(
        "SELECT * FROM subjects ORDER BY sort_order ASC, created_at ASC"
    ).fetchall()
    if subjects:
        return subjects

    subject_uuid = generate_uuid()
    timestamp = to_isoformat(current_timestamp())
    conn.execute(
        """
        INSERT INTO subjects (subject_uuid, subject_title, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (subject_uuid, DEFAULT_SUBJECT_TITLE, 1, timestamp, timestamp),
    )
    conn.commit()
    return conn.execute(
        "SELECT * FROM subjects ORDER BY sort_order ASC, created_at ASC"
    ).fetchall()


def _assign_missing_subjects(conn: sqlite3.Connection, default_subject_uuid: str) -> None:
    conn.execute(
        "UPDATE questions SET subject_uuid = ? WHERE subject_uuid IS NULL OR subject_uuid = ''",
        (default_subject_uuid,),
    )
    conn.commit()


def _load_subject_map(subjects: Iterable[sqlite3.Row]) -> Dict[str, sqlite3.Row]:
    return {subject["subject_uuid"]: subject for subject in subjects}


def _serialize_answer(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "answer_uuid": row["answer_uuid"],
        "answer_option": row["answer_option"],
        "correct": bool(row["correct"]),
        "answer_order": row["answer_order"],
    }


def _shuffle_answers(answers: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    shuffled = [dict(answer) for answer in answers]
    random.shuffle(shuffled)
    return shuffled


def _serialize_question(row: sqlite3.Row, answers: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "question_uuid": row["question_uuid"],
        "question_text": row["question_text"],
        "question_type": row["question_type"],
        "subject_uuid": row["subject_uuid"],
        "points": row["points"] if row["points"] is not None else 0,
        "question_number": row["question_number"],
        "illustration_filename": row["illustration_filename"],
        "illustration_width": row["illustration_width"],
        "number_of_lines": row["number_of_lines"],
        "answers": answers,
    }


def _refresh_question_count(quiz_uuid: str) -> None:
    with _open_questions_conn(quiz_uuid) as questions_conn:
        count = questions_conn.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
    with sqlite3.connect(_quizes_db_path()) as conn:
        conn.execute(
            "UPDATE quizes SET number_of_questions = ? WHERE quiz_uuid = ?",
            (count, quiz_uuid),
        )
        conn.commit()


def _next_question_number(conn: sqlite3.Connection) -> int:
    value = conn.execute(
        "SELECT COALESCE(MAX(question_number), 0) FROM questions"
    ).fetchone()[0]
    return int(value or 0) + 1


def _next_subject_order(conn: sqlite3.Connection) -> int:
    value = conn.execute(
        "SELECT COALESCE(MAX(sort_order), 0) FROM subjects"
    ).fetchone()[0]
    return int(value or 0) + 1


def _next_answer_order(conn: sqlite3.Connection, question_uuid: str) -> int:
    value = conn.execute(
        "SELECT COALESCE(MAX(answer_order), 0) FROM answers WHERE question_uuid = ?",
        (question_uuid,),
    ).fetchone()[0]
    return int(value or 0) + 1


def _get_subject(conn: sqlite3.Connection, subject_uuid: str) -> Optional[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM subjects WHERE subject_uuid = ?",
        (subject_uuid,),
    ).fetchone()


def _create_subject(conn: sqlite3.Connection, title: str) -> Dict[str, Any]:
    subject_uuid = generate_uuid()
    sort_order = _next_subject_order(conn)
    timestamp = to_isoformat(current_timestamp())
    conn.execute(
        """
        INSERT INTO subjects (subject_uuid, subject_title, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (subject_uuid, title, sort_order, timestamp, timestamp),
    )
    conn.commit()
    row = _get_subject(conn, subject_uuid)
    return dict(row)


def _get_subject_or_create(conn: sqlite3.Connection, subject_uuid: Optional[str], subject_title: Optional[str]) -> Dict[str, Any]:
    subjects = _ensure_subjects(conn)
    subject_map = _load_subject_map(subjects)

    if subject_uuid and subject_uuid in subject_map:
        return dict(subject_map[subject_uuid])

    if subject_uuid and subject_uuid not in subject_map:
        raise ValueError("Subject not found.")

    if subject_title:
        return _create_subject(conn, subject_title.strip() or DEFAULT_SUBJECT_TITLE)

    # No subject specified; use first existing subject
    return dict(subjects[0])


def _load_answers_map(answers_conn: sqlite3.Connection) -> Dict[str, List[Dict[str, Any]]]:
    rows = answers_conn.execute(
        "SELECT * FROM answers ORDER BY answer_order ASC, id ASC"
    ).fetchall()
    mapping: Dict[str, List[Dict[str, Any]]] = {}
    for row in rows:
        mapping.setdefault(row["question_uuid"], []).append(_serialize_answer(row))
    return mapping


def _list_subjects_with_questions(quiz_uuid: str) -> List[Dict[str, Any]]:
    with _open_questions_conn(quiz_uuid) as questions_conn:
        subjects = _ensure_subjects(questions_conn)
        default_subject_uuid = subjects[0]["subject_uuid"]

        _assign_missing_subjects(questions_conn, default_subject_uuid)
        subject_map = _load_subject_map(subjects)

        question_rows = questions_conn.execute(
            """
            SELECT * FROM questions
            ORDER BY question_number ASC, id ASC
            """
        ).fetchall()

    with _open_answers_conn(quiz_uuid) as answers_conn:
        answers_map = _load_answers_map(answers_conn)

    subjects_payload: Dict[str, Dict[str, Any]] = {}
    for subject in subject_map.values():
        subjects_payload[subject["subject_uuid"]] = {
            "subject_uuid": subject["subject_uuid"],
            "subject_title": subject["subject_title"],
            "sort_order": subject["sort_order"],
            "questions": [],
        }

    for row in question_rows:
        subject_uuid = row["subject_uuid"]
        if subject_uuid not in subjects_payload:
            subjects_payload[subject_uuid] = {
                "subject_uuid": subject_uuid,
                "subject_title": DEFAULT_SUBJECT_TITLE,
                "sort_order": len(subjects_payload) + 1,
                "questions": [],
            }
        answers = answers_map.get(row["question_uuid"], [])
        subjects_payload[subject_uuid]["questions"].append(_serialize_question(row, answers))

    ordered_subjects = sorted(
        subjects_payload.values(),
        key=lambda item: (item["sort_order"], item["subject_title"].lower()),
    )
    return ordered_subjects


@questions_bp.route("/quizzes/<quiz_uuid>/questions", methods=["GET"])
@_require_auth
def get_questions(quiz_uuid: str):
    quiz, error = _ensure_quiz_exists(quiz_uuid)
    if error:
        return error

    subjects = _list_subjects_with_questions(quiz_uuid)
    return _json_success({"quiz_uuid": quiz_uuid, "quiz_state": quiz.get("quiz_state"), "subjects": subjects})


@questions_bp.route("/quizzes/<quiz_uuid>/questions", methods=["POST"])
@_require_auth
def create_question(quiz_uuid: str):
    quiz, error = _ensure_quiz_exists(quiz_uuid)
    if error:
        return error
    if (err := _ensure_quiz_unlocked(quiz)) is not None:
        return err

    data = request.get_json(silent=True) or {}
    question_text = (data.get("question_text") or "").strip()
    question_type = (data.get("question_type") or "").strip()
    if not question_text:
        return _json_error("question_text is required.", status=400)
    if not question_type:
        return _json_error("question_type is required.", status=400)

    points_value = data.get("points")
    if points_value is None:
        points = 1.0
    else:
        try:
            points = float(points_value)
        except (TypeError, ValueError):
            return _json_error("points must be a number.", status=400)

    subject_uuid = data.get("subject_uuid")
    subject_title = data.get("subject_title")

    now_iso = to_isoformat(current_timestamp())
    question_uuid = generate_uuid()

    with _open_questions_conn(quiz_uuid) as questions_conn:
        try:
            subject = _get_subject_or_create(questions_conn, subject_uuid, subject_title)
        except ValueError as exc:
            return _json_error(str(exc), status=400)

        question_number = _next_question_number(questions_conn)
        questions_conn.execute(
            """
            INSERT INTO questions (
                question_uuid,
                question_text,
                question_type,
                subject_uuid,
                points,
                question_number,
                illustration_filename,
                illustration_width,
                number_of_lines,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                question_uuid,
                question_text,
                question_type,
                subject["subject_uuid"],
                points,
                question_number,
                data.get("illustration_filename"),
                data.get("illustration_width"),
                data.get("number_of_lines"),
                now_iso,
                now_iso,
            ),
        )
        questions_conn.commit()

    answers_payload = []
    answers_input = data.get("answers") or []
    if not isinstance(answers_input, list):
        return _json_error("answers must be a list.", status=400)

    with _open_answers_conn(quiz_uuid) as answers_conn:
        order = 0
        for entry in answers_input:
            if not isinstance(entry, dict):
                return _json_error("Each answer must be an object.", status=400)
            option = (entry.get("answer_option") or "").strip()
            if not option:
                return _json_error("answer_option is required for each answer.", status=400)
            correct = bool(entry.get("correct"))
            order += 1
            answer_uuid = generate_uuid()
            answers_conn.execute(
                """
                INSERT INTO answers (
                    answer_uuid,
                    question_uuid,
                    answer_option,
                    correct,
                    answer_order,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    answer_uuid,
                    question_uuid,
                    option,
                    1 if correct else 0,
                    order,
                    now_iso,
                    now_iso,
                ),
            )
            answers_payload.append(
                {
                    "answer_uuid": answer_uuid,
                    "answer_option": option,
                    "correct": correct,
                    "answer_order": order,
                }
            )
        answers_conn.commit()

    _refresh_question_count(quiz_uuid)
    with _open_questions_conn(quiz_uuid) as questions_conn:
        row = questions_conn.execute(
            "SELECT * FROM questions WHERE question_uuid = ?",
            (question_uuid,),
        ).fetchone()
    question_payload = _serialize_question(row, answers_payload)
    return _json_success({"question": question_payload}, status=201)


def _update_question_fields(question_uuid: str, payload: Dict[str, Any], questions_conn: sqlite3.Connection) -> Optional[str]:
    allowed_fields = {
        "question_text",
        "question_type",
        "subject_uuid",
        "points",
        "illustration_filename",
        "illustration_width",
        "number_of_lines",
    }
    updates = {}
    for key, value in payload.items():
        if key not in allowed_fields:
            continue
        if key == "question_text" and not (value or "").strip():
            return "question_text cannot be empty."
        if key == "question_type" and not (value or "").strip():
            return "question_type cannot be empty."
        if key == "points" and value is not None:
            try:
                value = float(value)
            except (TypeError, ValueError):
                return "points must be a number."
        updates[key] = value

    if not updates:
        return "No fields to update."

    updates["updated_at"] = to_isoformat(current_timestamp())
    assignments = ", ".join(f"{field} = ?" for field in updates.keys())
    questions_conn.execute(
        f"UPDATE questions SET {assignments} WHERE question_uuid = ?",
        list(updates.values()) + [question_uuid],
    )
    questions_conn.commit()
    return None


@questions_bp.route("/quizzes/<quiz_uuid>/questions/<question_uuid>", methods=["PUT"])
@_require_auth
def update_question(quiz_uuid: str, question_uuid: str):
    quiz, error = _ensure_quiz_exists(quiz_uuid)
    if error:
        return error
    if (err := _ensure_quiz_unlocked(quiz)) is not None:
        return err

    data = request.get_json(silent=True) or {}

    with _open_questions_conn(quiz_uuid) as questions_conn:
        row = questions_conn.execute(
            "SELECT * FROM questions WHERE question_uuid = ?",
            (question_uuid,),
        ).fetchone()
        if not row:
            return _json_error("Question not found.", status=404)

        if "subject_uuid" in data:
            subject_uuid = data.get("subject_uuid")
            if subject_uuid:
                if not _get_subject(questions_conn, subject_uuid):
                    return _json_error("Subject not found.", status=404)
            else:
                data.pop("subject_uuid")

        message = _update_question_fields(question_uuid, data, questions_conn)
        if message:
            return _json_error(message, status=400)

        updated_row = questions_conn.execute(
            "SELECT * FROM questions WHERE question_uuid = ?",
            (question_uuid,),
        ).fetchone()

    with _open_answers_conn(quiz_uuid) as answers_conn:
        answers_map = _load_answers_map(answers_conn)

    answers = answers_map.get(question_uuid, [])
    question_payload = _serialize_question(updated_row, answers)
    return _json_success({"question": question_payload})


@questions_bp.route("/quizzes/<quiz_uuid>/questions/<question_uuid>", methods=["DELETE"])
@_require_auth
def delete_question(quiz_uuid: str, question_uuid: str):
    quiz, error = _ensure_quiz_exists(quiz_uuid)
    if error:
        return error
    if (err := _ensure_quiz_unlocked(quiz)) is not None:
        return err

    with _open_questions_conn(quiz_uuid) as questions_conn:
        row = questions_conn.execute(
            "SELECT * FROM questions WHERE question_uuid = ?",
            (question_uuid,),
        ).fetchone()
        if not row:
            return _json_error("Question not found.", status=404)

        illustration_filename = row["illustration_filename"]

        questions_conn.execute(
            "DELETE FROM questions WHERE question_uuid = ?",
            (question_uuid,),
        )
        questions_conn.commit()

        remaining = questions_conn.execute(
            "SELECT question_uuid FROM questions ORDER BY question_number ASC, id ASC"
        ).fetchall()
        new_number = 1
        for remaining_row in remaining:
            questions_conn.execute(
                "UPDATE questions SET question_number = ?, updated_at = ? WHERE question_uuid = ?",
                (new_number, to_isoformat(current_timestamp()), remaining_row["question_uuid"]),
            )
            new_number += 1
        questions_conn.commit()

    with _open_answers_conn(quiz_uuid) as answers_conn:
        answers_conn.execute(
            "DELETE FROM answers WHERE question_uuid = ?",
            (question_uuid,),
        )
        answers_conn.commit()

    _remove_illustration_if_unused(quiz_uuid, illustration_filename)
    _refresh_question_count(quiz_uuid)
    return _json_success({"message": "Question deleted."})


@questions_bp.route("/quizzes/<quiz_uuid>/questions/order", methods=["PATCH"])
@_require_auth
def reorder_questions(quiz_uuid: str):
    quiz, error = _ensure_quiz_exists(quiz_uuid)
    if error:
        return error
    if (err := _ensure_quiz_unlocked(quiz)) is not None:
        return err

    data = request.get_json(silent=True) or {}
    subjects_payload = data.get("subjects")
    if not isinstance(subjects_payload, list):
        return _json_error("subjects must be a list.", status=400)

    with _open_questions_conn(quiz_uuid) as questions_conn:
        subjects = _ensure_subjects(questions_conn)
        subject_map = _load_subject_map(subjects)

        questions_rows = questions_conn.execute(
            "SELECT question_uuid FROM questions"
        ).fetchall()
        existing_questions = {row["question_uuid"] for row in questions_rows}

        provided_questions: set[str] = set()
        ordered_pairs: List[tuple[str, str]] = []

        for subject_entry in subjects_payload:
            if not isinstance(subject_entry, dict):
                return _json_error("Each subject must be an object.", status=400)
            subject_uuid = subject_entry.get("subject_uuid")
            if not subject_uuid or subject_uuid not in subject_map:
                return _json_error("Unknown subject_uuid in ordering payload.", status=400)
            question_uuids = subject_entry.get("question_uuids") or []
            if not isinstance(question_uuids, list):
                return _json_error("question_uuids must be a list.", status=400)
            for question_uuid in question_uuids:
                if question_uuid not in existing_questions:
                    return _json_error("Unknown question_uuid in ordering payload.", status=400)
                ordered_pairs.append((question_uuid, subject_uuid))
                provided_questions.add(question_uuid)

        if provided_questions != existing_questions:
            return _json_error("Ordering payload must reference every existing question exactly once.", status=400)

        position = 1
        timestamp = to_isoformat(current_timestamp())
        for question_uuid, subject_uuid in ordered_pairs:
            questions_conn.execute(
                """
                UPDATE questions
                SET subject_uuid = ?, question_number = ?, updated_at = ?
                WHERE question_uuid = ?
                """,
                (subject_uuid, position, timestamp, question_uuid),
            )
            position += 1
        questions_conn.commit()

    subjects = _list_subjects_with_questions(quiz_uuid)
    return _json_success({"subjects": subjects})


@questions_bp.route("/quizzes/<quiz_uuid>/subjects/order", methods=["PATCH"])
@_require_auth
def reorder_subjects(quiz_uuid: str):
    quiz, error = _ensure_quiz_exists(quiz_uuid)
    if error:
        return error
    if (err := _ensure_quiz_unlocked(quiz)) is not None:
        return err

    data = request.get_json(silent=True) or {}
    subject_uuids = data.get("subject_uuids")
    if not isinstance(subject_uuids, list):
        return _json_error("subject_uuids must be a list.", status=400)

    with _open_questions_conn(quiz_uuid) as questions_conn:
        subjects = _ensure_subjects(questions_conn)
        subject_map = _load_subject_map(subjects)

        if set(subject_uuids) != set(subject_map.keys()):
            return _json_error("subject_uuids must match existing subjects.", status=400)

        timestamp = to_isoformat(current_timestamp())
        order = 1
        for subject_uuid in subject_uuids:
            questions_conn.execute(
                "UPDATE subjects SET sort_order = ?, updated_at = ? WHERE subject_uuid = ?",
                (order, timestamp, subject_uuid),
            )
            order += 1
        questions_conn.commit()

    subjects = _list_subjects_with_questions(quiz_uuid)
    return _json_success({"subjects": subjects})


@questions_bp.route("/quizzes/<quiz_uuid>/questions/<question_uuid>/answers", methods=["POST"])
@_require_auth
def create_answer(quiz_uuid: str, question_uuid: str):
    quiz, error = _ensure_quiz_exists(quiz_uuid)
    if error:
        return error
    if (err := _ensure_quiz_unlocked(quiz)) is not None:
        return err

    data = request.get_json(silent=True) or {}
    answer_option = (data.get("answer_option") or "").strip()
    if not answer_option:
        return _json_error("answer_option is required.", status=400)
    correct = bool(data.get("correct"))

    with _open_questions_conn(quiz_uuid) as questions_conn:
        question = questions_conn.execute(
            "SELECT * FROM questions WHERE question_uuid = ?",
            (question_uuid,),
        ).fetchone()
        if not question:
            return _json_error("Question not found.", status=404)

    with _open_answers_conn(quiz_uuid) as answers_conn:
        order = _next_answer_order(answers_conn, question_uuid)
        now_iso = to_isoformat(current_timestamp())
        answer_uuid = generate_uuid()
        answers_conn.execute(
            """
            INSERT INTO answers (
                answer_uuid,
                question_uuid,
                answer_option,
                correct,
                answer_order,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                answer_uuid,
                question_uuid,
                answer_option,
                1 if correct else 0,
                order,
                now_iso,
                now_iso,
            ),
        )
        answers_conn.commit()

    answer_payload = {
        "answer_uuid": answer_uuid,
        "answer_option": answer_option,
        "correct": correct,
        "answer_order": order,
    }
    return _json_success({"answer": answer_payload}, status=201)


@questions_bp.route(
    "/quizzes/<quiz_uuid>/questions/<question_uuid>/answers/<answer_uuid>",
    methods=["PUT"],
)
@_require_auth
def update_answer(quiz_uuid: str, question_uuid: str, answer_uuid: str):
    quiz, error = _ensure_quiz_exists(quiz_uuid)
    if error:
        return error
    if (err := _ensure_quiz_unlocked(quiz)) is not None:
        return err

    data = request.get_json(silent=True) or {}

    with _open_questions_conn(quiz_uuid) as questions_conn:
        question = questions_conn.execute(
            "SELECT 1 FROM questions WHERE question_uuid = ?",
            (question_uuid,),
        ).fetchone()
        if not question:
            return _json_error("Question not found.", status=404)

    with _open_answers_conn(quiz_uuid) as answers_conn:
        row = answers_conn.execute(
            "SELECT * FROM answers WHERE answer_uuid = ? AND question_uuid = ?",
            (answer_uuid, question_uuid),
        ).fetchone()
        if not row:
            return _json_error("Answer not found.", status=404)

        updates = {}
        if "answer_option" in data:
            option = (data.get("answer_option") or "").strip()
            if not option:
                return _json_error("answer_option cannot be empty.", status=400)
            updates["answer_option"] = option
        if "correct" in data:
            updates["correct"] = 1 if data.get("correct") else 0
        if "answer_order" in data:
            try:
                updates["answer_order"] = int(data.get("answer_order"))
            except (TypeError, ValueError):
                return _json_error("answer_order must be an integer.", status=400)

        if not updates:
            return _json_error("No fields to update.", status=400)

        updates["updated_at"] = to_isoformat(current_timestamp())
        assignments = ", ".join(f"{field} = ?" for field in updates.keys())
        answers_conn.execute(
            f"UPDATE answers SET {assignments} WHERE answer_uuid = ?",
            list(updates.values()) + [answer_uuid],
        )
        answers_conn.commit()

        updated_row = answers_conn.execute(
            "SELECT * FROM answers WHERE answer_uuid = ?",
            (answer_uuid,),
        ).fetchone()

    answer_payload = _serialize_answer(updated_row)
    return _json_success({"answer": answer_payload})


@questions_bp.route(
    "/quizzes/<quiz_uuid>/questions/<question_uuid>/answers/<answer_uuid>",
    methods=["DELETE"],
)
@_require_auth
def delete_answer(quiz_uuid: str, question_uuid: str, answer_uuid: str):
    quiz, error = _ensure_quiz_exists(quiz_uuid)
    if error:
        return error
    if (err := _ensure_quiz_unlocked(quiz)) is not None:
        return err

    with _open_answers_conn(quiz_uuid) as answers_conn:
        row = answers_conn.execute(
            "SELECT * FROM answers WHERE answer_uuid = ? AND question_uuid = ?",
            (answer_uuid, question_uuid),
        ).fetchone()
        if not row:
            return _json_error("Answer not found.", status=404)

        answers_conn.execute(
            "DELETE FROM answers WHERE answer_uuid = ?",
            (answer_uuid,),
        )

        remaining = answers_conn.execute(
            """
            SELECT answer_uuid FROM answers
            WHERE question_uuid = ?
            ORDER BY answer_order ASC, id ASC
            """,
            (question_uuid,),
        ).fetchall()
        order = 1
        timestamp = to_isoformat(current_timestamp())
        for remaining_row in remaining:
            answers_conn.execute(
                "UPDATE answers SET answer_order = ?, updated_at = ? WHERE answer_uuid = ?",
                (order, timestamp, remaining_row["answer_uuid"]),
            )
            order += 1
        answers_conn.commit()

    return _json_success({"message": "Answer deleted."})


@questions_bp.route(
    "/quizzes/<quiz_uuid>/questions/<question_uuid>/answers/order", methods=["PATCH"]
)
@_require_auth
def reorder_answers(quiz_uuid: str, question_uuid: str):
    quiz, error = _ensure_quiz_exists(quiz_uuid)
    if error:
        return error
    if (err := _ensure_quiz_unlocked(quiz)) is not None:
        return err

    data = request.get_json(silent=True) or {}
    answer_uuids = data.get("answer_uuids")
    if not isinstance(answer_uuids, list) or not answer_uuids:
        return _json_error("answer_uuids must be a non-empty list.", status=400)

    with _open_answers_conn(quiz_uuid) as answers_conn:
        rows = answers_conn.execute(
            "SELECT answer_uuid FROM answers WHERE question_uuid = ?",
            (question_uuid,),
        ).fetchall()
        existing = [row["answer_uuid"] for row in rows]
        if set(existing) != set(answer_uuids):
            return _json_error("answer_uuids must match existing answers.", status=400)

        timestamp = to_isoformat(current_timestamp())
        order_map = {answer_uuid: index + 1 for index, answer_uuid in enumerate(answer_uuids)}
        for answer_uuid, order in order_map.items():
            answers_conn.execute(
                "UPDATE answers SET answer_order = ?, updated_at = ? WHERE answer_uuid = ?",
                (order, timestamp, answer_uuid),
            )
        answers_conn.commit()

        updated_rows = answers_conn.execute(
            """
            SELECT * FROM answers
            WHERE question_uuid = ?
            ORDER BY answer_order ASC, id ASC
            """,
            (question_uuid,),
        ).fetchall()

    serialized = [_serialize_answer(row) for row in updated_rows]
    return _json_success({"answers": serialized})


@questions_bp.route(
    "/quizzes/<quiz_uuid>/questions/<question_uuid>/illustration",
    methods=["POST"],
)
@_require_auth
def upload_illustration(quiz_uuid: str, question_uuid: str):
    quiz, error = _ensure_quiz_exists(quiz_uuid)
    if error:
        return error
    if (err := _ensure_quiz_unlocked(quiz)) is not None:
        return err

    uploaded = request.files.get("file")
    if uploaded is None or not uploaded.filename:
        return _json_error("Image file upload is required.", status=400)

    data = uploaded.read()
    if not data:
        return _json_error("Uploaded file is empty.", status=400)

    try:
        stored_name = _store_illustration(quiz_uuid, uploaded.filename, data)
    except ValueError as exc:
        return _json_error(str(exc), status=400)

    width_value = request.form.get("width")
    illustration_width = None
    if width_value not in {None, ""}:
        try:
            illustration_width = float(width_value)
        except ValueError:
            return _json_error("width must be numeric.", status=400)

    with _open_questions_conn(quiz_uuid) as questions_conn:
        row = questions_conn.execute(
            "SELECT illustration_filename FROM questions WHERE question_uuid = ?",
            (question_uuid,),
        ).fetchone()
        if not row:
            return _json_error("Question not found.", status=404)

        previous_filename = row["illustration_filename"]
        timestamp = to_isoformat(current_timestamp())
        questions_conn.execute(
            """
            UPDATE questions
            SET illustration_filename = ?, illustration_width = ?, updated_at = ?
            WHERE question_uuid = ?
            """,
            (stored_name, illustration_width, timestamp, question_uuid),
        )
        questions_conn.commit()

    if previous_filename and previous_filename != stored_name:
        _remove_illustration_if_unused(quiz_uuid, previous_filename)

    return _json_success(
        {
            "message": "Illustration uploaded.",
            "filename": stored_name,
            "illustration_width": illustration_width,
        },
        status=201,
    )


@questions_bp.route(
    "/quizzes/<quiz_uuid>/questions/<question_uuid>/illustration",
    methods=["DELETE"],
)
@_require_auth
def delete_illustration(quiz_uuid: str, question_uuid: str):
    quiz, error = _ensure_quiz_exists(quiz_uuid)
    if error:
        return error
    if (err := _ensure_quiz_unlocked(quiz)) is not None:
        return err

    with _open_questions_conn(quiz_uuid) as questions_conn:
        row = questions_conn.execute(
            "SELECT illustration_filename FROM questions WHERE question_uuid = ?",
            (question_uuid,),
        ).fetchone()
        if not row:
            return _json_error("Question not found.", status=404)

        if not row["illustration_filename"]:
            return _json_error("No illustration to delete.", status=404)

        filename = row["illustration_filename"]
        timestamp = to_isoformat(current_timestamp())
        questions_conn.execute(
            """
            UPDATE questions
            SET illustration_filename = NULL, illustration_width = NULL, updated_at = ?
            WHERE question_uuid = ?
            """,
            (timestamp, question_uuid),
        )
        questions_conn.commit()

    _remove_illustration_if_unused(quiz_uuid, filename)
    return _json_success({"message": "Illustration removed."})


@questions_bp.route("/quizzes/<quiz_uuid>/ai/questions", methods=["POST"])
@_require_auth
def generate_ai_questions_route(quiz_uuid: str):
    quiz, error = _ensure_quiz_exists(quiz_uuid)
    if error:
        return error
    if (err := _ensure_quiz_unlocked(quiz)) is not None:
        return err

    data = request.get_json(silent=True) or {}
    required_fields = ["topic", "language", "difficulty", "question_type", "quantity"]
    missing = [field for field in required_fields if not data.get(field)]
    if missing:
        return _json_error(f"Missing fields: {', '.join(missing)}.", status=400)

    try:
        quantity = int(data["quantity"])
    except (TypeError, ValueError):
        return _json_error("quantity must be an integer.", status=400)
    if quantity <= 0:
        return _json_error("quantity must be positive.", status=400)

    supplemental_context = data.get("supplemental_context") or ""
    subject_uuid = data.get("subject_uuid")
    subject_title = data.get("subject_title")

    try:
        ai_response = ai_generate_questions(
            topic=data["topic"],
            language=data["language"],
            difficulty=data["difficulty"],
            question_type=data["question_type"],
            quantity=quantity,
            supplemental_context=supplemental_context,
        )
    except Exception as exc:  # pragma: no cover - network dependency
        return _json_error(f"AI generation failed: {exc}", status=502)

    try:
        parsed = json.loads(ai_response)
    except json.JSONDecodeError:
        return _json_error("AI response was not valid JSON.", status=502)

    questions_data = parsed.get("questions")
    if not isinstance(questions_data, list) or not questions_data:
        return _json_error("AI response missing questions array.", status=502)

    inserted_ids: List[str] = []
    now_iso = to_isoformat(current_timestamp())

    with _open_questions_conn(quiz_uuid) as questions_conn, _open_answers_conn(
        quiz_uuid
    ) as answers_conn:
        try:
            subject = _get_subject_or_create(
                questions_conn, subject_uuid, subject_title
            )
        except ValueError as exc:
            return _json_error(str(exc), status=400)

        for item in questions_data:
            question_text = (item.get("question_text") or "").strip()
            if not question_text:
                continue
            question_type = (item.get("question_type") or data["question_type"]).strip()
            points_value = item.get("points")
            if points_value is None:
                points = 1.0 if question_type != "open" else 0.0
            else:
                try:
                    points = float(points_value)
                except (TypeError, ValueError):
                    points = 1.0

            number_of_lines = item.get("number_of_lines")
            if number_of_lines is None:
                number_of_lines = 5 if question_type == "open" else None
            else:
                try:
                    number_of_lines = int(number_of_lines)
                except (TypeError, ValueError):
                    number_of_lines = 5 if question_type == "open" else None

            question_uuid = generate_uuid()
            question_number = _next_question_number(questions_conn)
            questions_conn.execute(
                """
                INSERT INTO questions (
                    question_uuid,
                    question_text,
                    question_type,
                    subject_uuid,
                    points,
                    question_number,
                    illustration_filename,
                    illustration_width,
                    number_of_lines,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    question_uuid,
                    question_text,
                    question_type,
                    subject["subject_uuid"],
                    points,
                    question_number,
                    None,
                    None,
                    number_of_lines,
                    now_iso,
                    now_iso,
                ),
            )

            answers = item.get("answers") or []
            if question_type != "open" and not answers:
                answers = []
            shuffled = _shuffle_answers(answers)
            order = 1
            for answer in shuffled:
                option_text = (
                    answer.get("text")
                    or answer.get("answer_option")
                    or ""
                ).strip()
                if not option_text:
                    continue
                correct = bool(answer.get("is_correct") or answer.get("correct"))
                answer_uuid = generate_uuid()
                answers_conn.execute(
                    """
                    INSERT INTO answers (
                        answer_uuid,
                        question_uuid,
                        answer_option,
                        correct,
                        answer_order,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        answer_uuid,
                        question_uuid,
                        option_text,
                        1 if correct else 0,
                        order,
                        now_iso,
                        now_iso,
                    ),
                )
                order += 1

            inserted_ids.append(question_uuid)

        questions_conn.commit()
        answers_conn.commit()

    if not inserted_ids:
        return _json_error("AI generation did not produce usable questions.", status=502)

    _refresh_question_count(quiz_uuid)

    serialized: List[Dict[str, Any]] = []
    with _open_questions_conn(quiz_uuid) as questions_conn:
        question_rows = []
        for question_id in inserted_ids:
            row = questions_conn.execute(
                "SELECT * FROM questions WHERE question_uuid = ?",
                (question_id,),
            ).fetchone()
            if row:
                question_rows.append(row)
    with _open_answers_conn(quiz_uuid) as answers_conn:
        answers_map = _load_answers_map(answers_conn)

    for row in question_rows:
        serialized.append(
            _serialize_question(row, answers_map.get(row["question_uuid"], []))
        )

    return _json_success({"questions": serialized}, status=201)
