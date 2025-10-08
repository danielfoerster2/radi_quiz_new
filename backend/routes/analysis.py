from __future__ import annotations

import csv
import json
import sqlite3
import subprocess
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from flask import Blueprint, current_app, g, jsonify, request, send_file

from ..services import amc_compile_service, scan_service
from ..services.ai_service import extract_student_name
from ..utils import current_timestamp, to_isoformat
from ..workspace import ensure_quiz_workspace, provision_user_workspace


analysis_bp = Blueprint("analysis", __name__)


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


def _session_dir(quiz_uuid: str) -> Path:
    return _quiz_dir(quiz_uuid) / "amc_session"


def _status_path(quiz_uuid: str) -> Path:
    return _session_dir(quiz_uuid) / "analysis_status.json"


def _overrides_path(quiz_uuid: str) -> Path:
    return _session_dir(quiz_uuid) / "analysis_overrides.json"


def _quizes_db(quiz_uuid: str) -> Path:
    return _workspace_path() / "quizes.sqlite"


def _fetch_quiz(quiz_uuid: str) -> Optional[Dict[str, Any]]:
    path = _quizes_db(quiz_uuid)
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


def _write_status(quiz_uuid: str, payload: Dict[str, Any]) -> None:
    path = _status_path(quiz_uuid)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)


def _read_status(quiz_uuid: str) -> Dict[str, Any]:
    path = _status_path(quiz_uuid)
    if not path.exists():
        return {
            "status": "idle",
            "updated_at": None,
            "threshold": 0.5,
        }
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {
            "status": "idle",
            "updated_at": None,
            "threshold": 0.5,
        }


def _read_overrides(quiz_uuid: str) -> Dict[str, Any]:
    path = _overrides_path(quiz_uuid)
    if not path.exists():
        return {"overrides": [], "updated_at": None}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"overrides": [], "updated_at": None}


def _write_overrides(quiz_uuid: str, overrides: List[Dict[str, Any]]) -> None:
    data = {
        "overrides": overrides,
        "updated_at": to_isoformat(current_timestamp()),
    }
    path = _overrides_path(quiz_uuid)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _apply_overrides(base: Dict[str, List[Dict[str, Any]]], overrides: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    combined: Dict[Tuple[str, str, str], Dict[str, Any]] = {}

    for entry in base.get("checked", []):
        key = (str(entry["student"]), str(entry["page"]), str(entry["checkbox"]))
        combined[key] = {**entry, "checked": True}

    for entry in base.get("unchecked", []):
        key = (str(entry["student"]), str(entry["page"]), str(entry["checkbox"]))
        combined[key] = {**entry, "checked": False}

    for override in overrides:
        key = (str(override["student"]), str(override["page"]), str(override["checkbox"]))
        entry = combined.get(
            key,
            {
                "student": override["student"],
                "page": override["page"],
                "checkbox": override["checkbox"],
                "ratio": None,
            },
        )
        entry["checked"] = bool(override.get("checked"))
        entry["overridden"] = True
        combined[key] = entry

    checked: List[Dict[str, Any]] = []
    unchecked: List[Dict[str, Any]] = []
    for entry in combined.values():
        payload = dict(entry)
        is_checked = payload.pop("checked", False)
        if is_checked:
            checked.append(payload)
        else:
            unchecked.append(payload)

    return {"checked": checked, "unchecked": unchecked}


def _load_student_roster(quiz_uuid: str) -> List[Dict[str, str]]:
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


@analysis_bp.route("/quizzes/<quiz_uuid>/uploads/copies", methods=["POST"])
@_require_auth
def upload_copies(quiz_uuid: str):
    quiz, error = _ensure_quiz(quiz_uuid)
    if error:
        return error

    upload = request.files.get("file")
    if upload is None:
        return _json_error("PDF file upload is required.", status=400)

    if not upload.filename.lower().endswith(".pdf"):
        return _json_error("Only PDF uploads are supported.", status=400)

    session_dir = _session_dir(quiz_uuid)
    session_dir.mkdir(parents=True, exist_ok=True)
    amc_compile_service.ensure_workspace(session_dir)
    target_pdf = session_dir / "uploaded_student_copies.pdf"
    upload.save(target_pdf)

    try:
        images = scan_service.convert_pdf_to_png(session_dir, target_pdf)
    except subprocess.CalledProcessError as exc:  # pragma: no cover - external tool
        return _json_error(f"Failed to convert PDF: {exc}", status=500)

    status = _read_status(quiz_uuid)
    status.update(
        {
            "status": "copies_uploaded",
            "updated_at": to_isoformat(current_timestamp()),
            "pages": len(images),
        }
    )
    _write_status(quiz_uuid, status)

    return _json_success({"message": "Copies uploaded.", "page_count": len(images)})


@analysis_bp.route("/quizzes/<quiz_uuid>/roster", methods=["PUT"])
@_require_auth
def update_roster(quiz_uuid: str):
    quiz, error = _ensure_quiz(quiz_uuid)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    students = data.get("students")
    if not isinstance(students, list):
        return _json_error("students must be a list.", status=400)

    cleaned: List[Dict[str, str]] = []
    for index, entry in enumerate(students):
        if not isinstance(entry, dict):
            return _json_error(f"Student entry at index {index} must be an object.", status=400)
        cleaned.append(
            {
                "id": str(entry.get("id") or "").strip(),
                "nom": str(entry.get("nom") or "").strip(),
                "prenom": str(entry.get("prenom") or "").strip(),
                "email": str(entry.get("email") or "").strip(),
            }
        )

    quiz_dir = _quiz_dir(quiz_uuid)
    roster_path = quiz_dir / "list.csv"
    roster_path.parent.mkdir(parents=True, exist_ok=True)
    with roster_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["id", "nom", "prenom", "email"])
        writer.writeheader()
        for entry in cleaned:
            writer.writerow(entry)

    session_dir = _session_dir(quiz_uuid)
    session_dir.mkdir(parents=True, exist_ok=True)
    amc_compile_service.ensure_workspace(session_dir)
    amc_compile_service.write_student_list(session_dir, cleaned)

    status = _read_status(quiz_uuid)
    status.update(
        {
            "status": status.get("status", "idle"),
            "updated_at": to_isoformat(current_timestamp()),
            "student_count": len(cleaned),
        }
    )
    _write_status(quiz_uuid, status)

    return _json_success({"message": "Roster updated.", "student_count": len(cleaned)})


@analysis_bp.route("/quizzes/<quiz_uuid>/analysis", methods=["POST"])
@_require_auth
def run_analysis(quiz_uuid: str):
    quiz, error = _ensure_quiz(quiz_uuid)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    threshold = data.get("threshold", 0.5)
    try:
        threshold_value = float(threshold)
    except (TypeError, ValueError):
        return _json_error("threshold must be numeric.", status=400)

    session_dir = _session_dir(quiz_uuid)
    amc_compile_service.ensure_workspace(session_dir)
    if not (session_dir / "sujet.tex").exists():
        return _json_error("sujet.tex missing from AMC session. Compile before analysis.", status=400)
    if not any((session_dir / "scans").glob("page-*.png")):
        return _json_error("No scan images found. Upload copies first.", status=400)

    status = {
        "status": "running",
        "updated_at": to_isoformat(current_timestamp()),
        "threshold": threshold_value,
    }
    _write_status(quiz_uuid, status)

    try:
        scan_service.run_analysis(session_dir, threshold_value)
    except subprocess.CalledProcessError as exc:  # pragma: no cover - external tool
        status.update(
            {
                "status": "failed",
                "error": str(exc),
                "updated_at": to_isoformat(current_timestamp()),
            }
        )
        _write_status(quiz_uuid, status)
        return _json_error(f"Analysis failed: {exc}", status=500)

    roster = _load_student_roster(quiz_uuid)
    status.update(
        {
            "status": "completed",
            "updated_at": to_isoformat(current_timestamp()),
            "threshold": threshold_value,
            "student_count": len(roster),
        }
    )
    _write_status(quiz_uuid, status)

    return _json_success({"message": "Analysis completed.", "status": status})


@analysis_bp.route("/quizzes/<quiz_uuid>/analysis/status", methods=["GET"])
@_require_auth
def get_analysis_status(quiz_uuid: str):
    quiz, error = _ensure_quiz(quiz_uuid)
    if error:
        return error
    status = _read_status(quiz_uuid)
    return _json_success({"status": status})


@analysis_bp.route("/quizzes/<quiz_uuid>/analysis/checkboxes", methods=["GET"])
@_require_auth
def get_checkboxes(quiz_uuid: str):
    quiz, error = _ensure_quiz(quiz_uuid)
    if error:
        return error

    status = _read_status(quiz_uuid)
    if status.get("status") not in {"completed"}:
        return _json_error("Analysis has not completed.", status=409)

    session_dir = _session_dir(quiz_uuid)
    threshold_value = float(status.get("threshold", 0.5))
    overrides = _read_overrides(quiz_uuid).get("overrides", [])
    try:
        base = scan_service.load_checkbox_status(session_dir, threshold=threshold_value)
    except FileNotFoundError:
        return _json_error("Checkbox data not available.", status=404)

    payload = _apply_overrides(base, overrides)
    payload["threshold"] = threshold_value
    payload["overrides"] = overrides
    return _json_success(payload)


@analysis_bp.route("/quizzes/<quiz_uuid>/analysis/checkboxes", methods=["PATCH"])
@_require_auth
def update_checkboxes(quiz_uuid: str):
    quiz, error = _ensure_quiz(quiz_uuid)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    status = _read_status(quiz_uuid)

    threshold = data.get("threshold", status.get("threshold", 0.5))
    try:
        threshold_value = float(threshold)
    except (TypeError, ValueError):
        return _json_error("threshold must be numeric.", status=400)

    overrides_input = data.get("overrides")
    if overrides_input is not None:
        if not isinstance(overrides_input, list):
            return _json_error("overrides must be a list.", status=400)
        cleaned: List[Dict[str, Any]] = []
        for entry in overrides_input:
            if not isinstance(entry, dict):
                return _json_error("Each override must be an object.", status=400)
            cleaned.append(
                {
                    "student": str(entry.get("student") or "").strip(),
                    "page": str(entry.get("page") or "").strip(),
                    "checkbox": str(entry.get("checkbox") or "").strip(),
                    "checked": bool(entry.get("checked", False)),
                }
            )
        _write_overrides(quiz_uuid, cleaned)

    session_dir = _session_dir(quiz_uuid)
    try:
        base = scan_service.load_checkbox_status(session_dir, threshold=threshold_value)
    except FileNotFoundError:
        return _json_error("Checkbox data not available.", status=404)

    overrides = _read_overrides(quiz_uuid).get("overrides", [])
    payload = _apply_overrides(base, overrides)

    status.update(
        {
            "threshold": threshold_value,
            "updated_at": to_isoformat(current_timestamp()),
        }
    )
    _write_status(quiz_uuid, status)

    payload["threshold"] = threshold_value
    payload["overrides"] = overrides
    return _json_success(payload)


@analysis_bp.route("/quizzes/<quiz_uuid>/analysis/page-images/<student>/<page>", methods=["GET"])
@_require_auth
def get_page_image(quiz_uuid: str, student: str, page: str):
    quiz, error = _ensure_quiz(quiz_uuid)
    if error:
        return error

    session_dir = _session_dir(quiz_uuid)
    try:
        encoded, filename = scan_service.get_page_image(session_dir, student, page)
    except FileNotFoundError:
        return _json_error("Page image not found.", status=404)

    return _json_success({"filename": filename, "data": encoded})


def _association_db_path(quiz_uuid: str) -> Path:
    return _session_dir(quiz_uuid) / "data" / "association.sqlite"


def _capture_db_path(quiz_uuid: str) -> Path:
    return _session_dir(quiz_uuid) / "data" / "capture.sqlite"


@analysis_bp.route("/quizzes/<quiz_uuid>/analysis/associations", methods=["GET"])
@_require_auth
def get_associations(quiz_uuid: str):
    quiz, error = _ensure_quiz(quiz_uuid)
    if error:
        return error

    db_path = _association_db_path(quiz_uuid)
    if not db_path.exists():
        return _json_error("Association data not available.", status=404)

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT student, copy, manual, auto FROM association_association ORDER BY student ASC"
        ).fetchall()
        associations = [dict(row) for row in rows]

    return _json_success({"associations": associations})


@analysis_bp.route("/quizzes/<quiz_uuid>/analysis/associations", methods=["PATCH"])
@_require_auth
def update_associations(quiz_uuid: str):
    quiz, error = _ensure_quiz(quiz_uuid)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    updates = data.get("associations")
    if not isinstance(updates, list):
        return _json_error("associations must be a list.", status=400)

    db_path = _association_db_path(quiz_uuid)
    if not db_path.exists():
        return _json_error("Association data not available.", status=404)

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        for entry in updates:
            if not isinstance(entry, dict):
                return _json_error("Each association update must be an object.", status=400)
            student = entry.get("student")
            manual = entry.get("manual")
            if student is None:
                return _json_error("student is required for association updates.", status=400)
            conn.execute(
                "UPDATE association_association SET manual = ? WHERE student = ?",
                (manual, student),
            )
        conn.commit()

    capture_path = _capture_db_path(quiz_uuid)
    if capture_path.exists():
        with sqlite3.connect(capture_path) as capture_conn:
            for entry in updates:
                student = entry.get("student")
                if student is None:
                    continue
                capture_conn.execute(
                    """
                    UPDATE capture_page
                    SET timestamp_annotate = 0, timestamp_manual = 0
                    WHERE student = ?
                    """,
                    (student,),
                )
            capture_conn.commit()

    return get_associations(quiz_uuid)


@analysis_bp.route(
    "/quizzes/<quiz_uuid>/analysis/associations/transcribe_names", methods=["POST"]
)
@_require_auth
def transcribe_names(quiz_uuid: str):
    quiz, error = _ensure_quiz(quiz_uuid)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    students_input = data.get("students")
    if not isinstance(students_input, list) or not students_input:
        return _json_error("students must be a non-empty list.", status=400)

    session_dir = _session_dir(quiz_uuid)
    language = quiz.get("quiz_language") or "fr"

    normalized_ids: List[str] = []
    for entry in students_input:
        student_id = str(entry).strip()
        if not student_id:
            return _json_error("Student identifiers must be non-empty.", status=400)
        image_path = session_dir / "cr" / f"name-{student_id}.jpg"
        if not image_path.exists():
            return _json_error(
                f"Handwriting image not found for student {student_id}.", status=404
            )
        normalized_ids.append(student_id)

    results: List[Dict[str, Any]] = []
    for student_id in normalized_ids:
        image_path = session_dir / "cr" / f"name-{student_id}.jpg"
        try:
            ai_response = extract_student_name(str(image_path), language=language)
        except Exception as exc:  # pragma: no cover - external dependency
            return _json_error(f"Transcription failed: {exc}", status=502)

        try:
            parsed = json.loads(ai_response)
        except json.JSONDecodeError:
            parsed = {}

        prenom = (parsed.get("prenom") or "").strip()
        nom = (parsed.get("nom") or "").strip()

        results.append(
            {
                "student": student_id,
                "prenom": prenom,
                "nom": nom,
                "raw": ai_response,
            }
        )

    return _json_success({"results": results})


@analysis_bp.route("/quizzes/<quiz_uuid>/analysis/recalculate", methods=["POST"])
@_require_auth
def recalc_analysis(quiz_uuid: str):
    quiz, error = _ensure_quiz(quiz_uuid)
    if error:
        return error

    status = _read_status(quiz_uuid)
    if status.get("status") not in {"completed"}:
        return _json_error("Run the full analysis before recalculating.", status=409)

    threshold_value = float(status.get("threshold", 0.5))
    session_dir = _session_dir(quiz_uuid)

    try:
        scan_service.recalc_annotations(session_dir, threshold_value)
    except subprocess.CalledProcessError as exc:  # pragma: no cover - external tool
        return _json_error(f"Recalculation failed: {exc}", status=500)

    status.update(
        {
            "status": "completed",
            "updated_at": to_isoformat(current_timestamp()),
            "recalculated_at": to_isoformat(current_timestamp()),
        }
    )
    _write_status(quiz_uuid, status)

    return _json_success({"message": "Recalculation completed.", "status": status})


@analysis_bp.route("/quizzes/<quiz_uuid>/analysis/notes", methods=["GET"])
@_require_auth
def get_notes(quiz_uuid: str):
    quiz, error = _ensure_quiz(quiz_uuid)
    if error:
        return error

    notes_path = _session_dir(quiz_uuid) / "notes.csv"
    if not notes_path.exists():
        return _json_error("notes.csv not found. Run analysis first.", status=404)

    with notes_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = [dict(row) for row in reader]

    return _json_success({"notes": rows})


@analysis_bp.route("/quizzes/<quiz_uuid>/analysis/corrections.zip", methods=["GET"])
@_require_auth
def download_corrections_zip(quiz_uuid: str):
    quiz, error = _ensure_quiz(quiz_uuid)
    if error:
        return error

    corrections_dir = _session_dir(quiz_uuid) / "cr" / "corrections" / "pdf"
    if not corrections_dir.exists():
        return _json_error("Corrections not available. Run analysis and recalculation first.", status=404)

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for pdf_file in corrections_dir.glob("*.pdf"):
            archive.write(pdf_file, arcname=pdf_file.name)
    buffer.seek(0)

    return send_file(
        buffer,
        mimetype="application/zip",
        as_attachment=True,
        download_name="corrections.zip",
    )
