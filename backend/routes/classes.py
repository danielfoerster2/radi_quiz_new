from __future__ import annotations

import csv
import json
import sqlite3
from functools import wraps
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from flask import (
    Blueprint,
    current_app,
    g,
    jsonify,
    request,
    send_file,
)

from ..utils import current_timestamp, generate_uuid, is_valid_email, to_isoformat
from ..workspace import provision_user_workspace


classes_bp = Blueprint("classes", __name__)

ROSTER_HEADERS = ["id", "nom", "prenom", "email"]


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


def _classes_db_path() -> Path:
    return _workspace_path() / "classes.sqlite"


def _ensure_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS classes (
            list_uuid TEXT PRIMARY KEY,
            class_title TEXT NOT NULL,
            student_list TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT
        )
        """
    )
    conn.commit()


def _get_connection() -> sqlite3.Connection:
    path = _classes_db_path()
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    _ensure_table(conn)
    return conn


def _class_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    manifest: Dict[str, Any] = {}
    student_list_raw = row["student_list"] if "student_list" in row.keys() else None
    if student_list_raw:
        try:
            manifest = json.loads(student_list_raw)
        except json.JSONDecodeError:
            manifest = {}

    return {
        "list_uuid": row["list_uuid"],
        "class_title": row["class_title"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "student_manifest": manifest,
    }


def _roster_path(list_uuid: str) -> Path:
    return _workspace_path() / f"{list_uuid}.csv"


def _ensure_roster_file(list_uuid: str) -> Path:
    roster = _roster_path(list_uuid)
    if not roster.exists():
        roster.parent.mkdir(parents=True, exist_ok=True)
        with roster.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=ROSTER_HEADERS)
            writer.writeheader()
    return roster


def _read_roster(list_uuid: str) -> List[Dict[str, str]]:
    roster = _ensure_roster_file(list_uuid)
    students: List[Dict[str, str]] = []
    with roster.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            students.append({header: (row.get(header) or "").strip() for header in ROSTER_HEADERS})
    return students


def _write_roster(list_uuid: str, students: Iterable[Dict[str, Any]]) -> None:
    roster = _ensure_roster_file(list_uuid)
    with roster.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=ROSTER_HEADERS)
        writer.writeheader()
        for entry in students:
            writer.writerow(
                {
                    "id": (entry.get("id") or "").strip(),
                    "nom": (entry.get("nom") or "").strip(),
                    "prenom": (entry.get("prenom") or "").strip(),
                    "email": (entry.get("email") or "").strip(),
                }
            )


def _validate_roster_entries(students: Iterable[Dict[str, Any]]) -> List[Dict[str, str]]:
    validated: List[Dict[str, str]] = []
    for index, entry in enumerate(students):
        if not isinstance(entry, dict):
            raise ValueError(f"Student entry at index {index} must be an object.")
        student = {
            "id": str(entry.get("id") or "").strip(),
            "nom": str(entry.get("nom") or "").strip(),
            "prenom": str(entry.get("prenom") or "").strip(),
            "email": str(entry.get("email") or "").strip(),
        }
        email = student["email"]
        if email and not is_valid_email(email):
            raise ValueError(f"Invalid email for student '{student['nom']} {student['prenom']}'.")
        validated.append(student)
    return validated


def _update_student_manifest(conn: sqlite3.Connection, list_uuid: str, students: List[Dict[str, str]]) -> None:
    manifest = {
        "student_count": len(students),
        "last_updated": to_isoformat(current_timestamp()),
    }
    conn.execute(
        """
        UPDATE classes
        SET student_list = ?, updated_at = ?
        WHERE list_uuid = ?
        """,
        (
            json.dumps(manifest),
            manifest["last_updated"],
            list_uuid,
        ),
    )
    conn.commit()


def _fetch_class(conn: sqlite3.Connection, list_uuid: str) -> Optional[Dict[str, Any]]:
    row = conn.execute(
        "SELECT * FROM classes WHERE list_uuid = ?",
        (list_uuid,),
    ).fetchone()
    if row:
        return _class_row_to_dict(row)
    return None


@classes_bp.route("/classes", methods=["GET"])
@_require_auth
def list_classes():
    conn = _get_connection()
    rows = conn.execute(
        "SELECT * FROM classes ORDER BY created_at ASC"
    ).fetchall()
    classes: List[Dict[str, Any]] = []
    for row in rows:
        data = _class_row_to_dict(row)
        roster = _read_roster(row["list_uuid"])
        data["student_count"] = len(roster)
        classes.append(data)
    return _json_success({"classes": classes})


@classes_bp.route("/classes", methods=["POST"])
@_require_auth
def create_class():
    data = request.get_json(silent=True) or {}
    class_title = (data.get("class_title") or "").strip()
    if not class_title:
        return _json_error("class_title is required.", status=400)

    list_uuid = generate_uuid()
    now = to_isoformat(current_timestamp())

    conn = _get_connection()
    conn.execute(
        """
        INSERT INTO classes (list_uuid, class_title, student_list, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            list_uuid,
            class_title,
            json.dumps({"student_count": 0, "last_updated": now}),
            now,
            now,
        ),
    )
    conn.commit()

    _ensure_roster_file(list_uuid)

    result = _fetch_class(conn, list_uuid)
    result["student_count"] = 0
    return _json_success({"class": result}, status=201)


@classes_bp.route("/classes/<list_uuid>", methods=["GET"])
@_require_auth
def get_class(list_uuid: str):
    conn = _get_connection()
    class_data = _fetch_class(conn, list_uuid)
    if not class_data:
        return _json_error("Class not found.", status=404)

    roster = _read_roster(list_uuid)
    class_data["students"] = roster
    class_data["student_count"] = len(roster)
    return _json_success({"class": class_data})


@classes_bp.route("/classes/<list_uuid>", methods=["PUT"])
@_require_auth
def update_class(list_uuid: str):
    data = request.get_json(silent=True) or {}
    class_title = data.get("class_title")
    if class_title is not None:
        class_title = class_title.strip()

    if not class_title:
        return _json_error("class_title is required.", status=400)

    conn = _get_connection()
    existing = _fetch_class(conn, list_uuid)
    if not existing:
        return _json_error("Class not found.", status=404)

    now = to_isoformat(current_timestamp())
    conn.execute(
        "UPDATE classes SET class_title = ?, updated_at = ? WHERE list_uuid = ?",
        (class_title, now, list_uuid),
    )
    conn.commit()

    updated = _fetch_class(conn, list_uuid)
    roster = _read_roster(list_uuid)
    updated["student_count"] = len(roster)
    return _json_success({"class": updated})


@classes_bp.route("/classes/<list_uuid>/students", methods=["PUT"])
@_require_auth
def update_students(list_uuid: str):
    conn = _get_connection()
    if not _fetch_class(conn, list_uuid):
        return _json_error("Class not found.", status=404)

    data = request.get_json(silent=True) or {}
    students_data = data.get("students")
    if students_data is None:
        return _json_error("students array is required.", status=400)

    try:
        students = _validate_roster_entries(students_data)
    except ValueError as exc:
        return _json_error(str(exc), status=400)

    _write_roster(list_uuid, students)
    _update_student_manifest(conn, list_uuid, students)

    return _json_success({"students": students, "student_count": len(students)})


@classes_bp.route("/classes/<list_uuid>/students/import", methods=["POST"])
@_require_auth
def import_students(list_uuid: str):
    conn = _get_connection()
    if not _fetch_class(conn, list_uuid):
        return _json_error("Class not found.", status=404)

    upload = request.files.get("file")
    if upload is None:
        return _json_error("CSV file upload is required.", status=400)

    try:
        stream = upload.stream.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        return _json_error("Unable to decode CSV file; use UTF-8 encoding.", status=400)

    reader = csv.DictReader(stream.splitlines())
    fieldnames = reader.fieldnames or []
    missing_headers = [header for header in ROSTER_HEADERS if header not in fieldnames]
    if missing_headers:
        return _json_error(
            f"CSV missing required headers: {', '.join(missing_headers)}.",
            status=400,
        )

    students: List[Dict[str, Any]] = []
    for row in reader:
        students.append(row)

    try:
        validated = _validate_roster_entries(students)
    except ValueError as exc:
        return _json_error(str(exc), status=400)

    _write_roster(list_uuid, validated)
    _update_student_manifest(conn, list_uuid, validated)

    return _json_success({"students": validated, "student_count": len(validated)})


@classes_bp.route("/classes/<list_uuid>/students", methods=["GET"])
@_require_auth
def download_students(list_uuid: str):
    conn = _get_connection()
    if not _fetch_class(conn, list_uuid):
        return _json_error("Class not found.", status=404)

    roster = _ensure_roster_file(list_uuid)
    return send_file(
        roster,
        as_attachment=True,
        download_name=f"{list_uuid}.csv",
        mimetype="text/csv",
        max_age=0,
    )


@classes_bp.route("/classes/<list_uuid>", methods=["DELETE"])
@_require_auth
def delete_class(list_uuid: str):
    conn = _get_connection()
    existing = _fetch_class(conn, list_uuid)
    if not existing:
        return _json_error("Class not found.", status=404)

    conn.execute("DELETE FROM classes WHERE list_uuid = ?", (list_uuid,))
    conn.commit()

    roster = _roster_path(list_uuid)
    if roster.exists():
        roster.unlink()

    return _json_success({"message": "Class deleted."})
