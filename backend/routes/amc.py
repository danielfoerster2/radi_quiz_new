from __future__ import annotations

import csv
import shutil
import sqlite3
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

from flask import Blueprint, current_app, g, jsonify, request, send_file

from ..services import amc_compile_service
from ..services.amc_latex_service import generate_subject_latex
from ..services.ai_service import review_subject
from ..utils import current_timestamp, generate_uuid, to_isoformat
from ..workspace import ensure_quiz_workspace, provision_user_workspace


amc_bp = Blueprint("amc", __name__)


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


def _quizes_db_path() -> Path:
    return _workspace_path() / "quizes.sqlite"


def _quiz_directory(quiz_uuid: str) -> Path:
    workspace = _workspace_path()
    ensure_quiz_workspace(workspace, quiz_uuid)
    return workspace / quiz_uuid


def _amc_session_dir(quiz_uuid: str) -> Path:
    return _quiz_directory(quiz_uuid) / "amc_session"


def _fetch_quiz(quiz_uuid: str) -> Optional[Dict[str, Any]]:
    path = _quizes_db_path()
    with sqlite3.connect(path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM quizes WHERE quiz_uuid = ?",
            (quiz_uuid,),
        ).fetchone()
        if row is None:
            return None
        return dict(row)


def _ensure_quiz(quiz_uuid: str):
    quiz = _fetch_quiz(quiz_uuid)
    if quiz is None:
        return None, _json_error("Quiz not found.", status=404)
    return quiz, None


def _ensure_unlocked(quiz: Dict[str, Any]):
    if quiz.get("quiz_state") != "unlocked":
        return _json_error("Quiz is locked.", status=409)
    return None


def _questions_db_path(quiz_uuid: str) -> Path:
    return _quiz_directory(quiz_uuid) / "questions.sqlite"


def _answers_db_path(quiz_uuid: str) -> Path:
    return _quiz_directory(quiz_uuid) / "answers.sqlite"


def _ensure_subjects(conn: sqlite3.Connection) -> List[sqlite3.Row]:
    rows = conn.execute(
        "SELECT * FROM subjects ORDER BY sort_order ASC, created_at ASC"
    ).fetchall()
    if rows:
        return rows
    subject_uuid = generate_uuid()
    timestamp = to_isoformat(current_timestamp())
    conn.execute(
        """
        INSERT INTO subjects (subject_uuid, subject_title, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (subject_uuid, "Nouvelle section", 1, timestamp, timestamp),
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


def _load_question_data(quiz_uuid: str) -> List[Dict[str, Any]]:
    questions_path = _questions_db_path(quiz_uuid)
    answers_path = _answers_db_path(quiz_uuid)

    with sqlite3.connect(questions_path) as q_conn:
        q_conn.row_factory = sqlite3.Row
        subjects = _ensure_subjects(q_conn)
        subject_map = {row["subject_uuid"]: row["subject_title"] for row in subjects}
        default_subject_uuid = subjects[0]["subject_uuid"]
        _assign_missing_subjects(q_conn, default_subject_uuid)
        question_rows = q_conn.execute(
            """
            SELECT *
            FROM questions
            ORDER BY question_number ASC, id ASC
            """
        ).fetchall()

    with sqlite3.connect(answers_path) as a_conn:
        a_conn.row_factory = sqlite3.Row
        answer_rows = a_conn.execute(
            """
            SELECT *
            FROM answers
            ORDER BY question_uuid ASC, answer_order ASC, id ASC
            """
        ).fetchall()

    answers_map: Dict[str, List[Dict[str, Any]]] = {}
    for row in answer_rows:
        answers_map.setdefault(row["question_uuid"], []).append(
            {
                "text": row["answer_option"],
                "is_correct": bool(row["correct"]),
                "answer_order": row["answer_order"],
            }
        )

    questions: List[Dict[str, Any]] = []
    for row in question_rows:
        subject_uuid = row["subject_uuid"] or default_subject_uuid
        subject_title = subject_map.get(subject_uuid, "Nouvelle section")
        answers = answers_map.get(row["question_uuid"], [])
        question_number = row["question_number"] or (len(questions) + 1)
        questions.append(
            {
                "question_uuid": row["question_uuid"],
                "question_text": row["question_text"],
                "question_type": row["question_type"],
                "subject_uuid": subject_uuid,
                "subject_title": subject_title,
                "points": row["points"] if row["points"] is not None else 0,
                "question_number": question_number,
                "illustration_filename": row["illustration_filename"],
                "illustration_width": row["illustration_width"],
                "number_of_lines": row["number_of_lines"] or 5,
                "answers": answers,
            }
        )
    return questions


def _load_roster(list_path: Path) -> List[Dict[str, str]]:
    if not list_path.exists():
        return []
    with list_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        students: List[Dict[str, str]] = []
        for row in reader:
            students.append(
                {
                    "id": (row.get("id") or "").strip(),
                    "nom": (row.get("nom") or "").strip(),
                    "prenom": (row.get("prenom") or "").strip(),
                    "email": (row.get("email") or "").strip(),
                }
            )
        return students


def _write_log(log_path: Path, content: str) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(content)
        if not content.endswith("\n"):
            handle.write("\n")


def _run_command(cmd: List[str], cwd: Path, log_path: Path) -> None:
    log_lines = [
        "",
        f"$ {' '.join(cmd)}",
    ]
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        log_lines.append(str(exc))
        _write_log(log_path, "\n".join(log_lines))
        raise RuntimeError(f"Command not found: {cmd[0]}") from exc

    log_lines.append(result.stdout or "")
    if result.stderr:
        log_lines.append(result.stderr)
    log_lines.append(f"[exit {result.returncode}]")
    _write_log(log_path, "\n".join(log_lines))
    if result.returncode != 0:
        raise RuntimeError(f"Command {' '.join(cmd)} failed with exit code {result.returncode}.")


@amc_bp.route("/quizzes/<quiz_uuid>/amc/session", methods=["POST"])
@_require_auth
def ensure_amc_session(quiz_uuid: str):
    quiz, error = _ensure_quiz(quiz_uuid)
    if error:
        return error

    session_dir = _amc_session_dir(quiz_uuid)
    amc_compile_service.ensure_workspace(session_dir)

    quiz_dir = _quiz_directory(quiz_uuid)

    list_path = quiz_dir / "list.csv"
    students = _load_roster(list_path)
    amc_compile_service.write_student_list(session_dir, students)

    amc_compile_service.copy_illustrations(
        session_dir,
        quiz_dir / "illustrations",
    )

    sujet_source = quiz_dir / "sujet.tex"
    if sujet_source.exists():
        shutil.copyfile(sujet_source, session_dir / "sujet.tex")

    return _json_success(
        {
            "message": "AMC session prepared.",
            "student_count": len(students),
            "session_dir": str(session_dir),
        },
        status=201,
    )


@amc_bp.route("/quizzes/<quiz_uuid>/amc/latex", methods=["POST"])
@_require_auth
def generate_latex(quiz_uuid: str):
    quiz, error = _ensure_quiz(quiz_uuid)
    if error:
        return error
    if (err := _ensure_unlocked(quiz)) is not None:
        return err

    questions = _load_question_data(quiz_uuid)
    if not questions:
        return _json_error("No questions available for LaTeX generation.", status=400)

    meta = {
        "quiz_title": quiz.get("quiz_title") or "Quiz",
        "institution_name": quiz.get("institution_name") or "",
        "student_instructions": quiz.get("student_instructions") or "",
        "random_question_order": bool(quiz.get("random_question_order")),
        "random_answer_order": bool(quiz.get("random_answer_order")),
        "id_coding": quiz.get("id_coding") or "8",
    }
    latex_source = generate_subject_latex(meta, questions)

    quiz_dir = _quiz_directory(quiz_uuid)
    sujet_path = quiz_dir / "sujet.tex"
    sujet_path.write_text(latex_source, encoding="utf-8")

    session_dir = _amc_session_dir(quiz_uuid)
    session_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / "sujet.tex").write_text(latex_source, encoding="utf-8")

    return _json_success({"message": "sujet.tex regenerated.", "path": str(sujet_path)})


@amc_bp.route("/quizzes/<quiz_uuid>/amc/latex", methods=["GET"])
@_require_auth
def download_latex(quiz_uuid: str):
    quiz, error = _ensure_quiz(quiz_uuid)
    if error:
        return error

    sujet_path = _quiz_directory(quiz_uuid) / "sujet.tex"
    if not sujet_path.exists():
        return _json_error("sujet.tex not found. Generate it first.", status=404)

    return send_file(
        sujet_path,
        as_attachment=True,
        download_name="sujet.tex",
        mimetype="application/x-tex",
        max_age=0,
    )


@amc_bp.route("/quizzes/<quiz_uuid>/amc/compile", methods=["POST"])
@_require_auth
def compile_quiz(quiz_uuid: str):
    quiz, error = _ensure_quiz(quiz_uuid)
    if error:
        return error
    if (err := _ensure_unlocked(quiz)) is not None:
        return err

    quiz_dir = _quiz_directory(quiz_uuid)
    sujet_path = quiz_dir / "sujet.tex"
    if not sujet_path.exists():
        return _json_error("sujet.tex not found. Generate LaTeX before compiling.", status=400)

    session_dir = _amc_session_dir(quiz_uuid)
    amc_compile_service.ensure_workspace(session_dir)
    shutil.copyfile(sujet_path, session_dir / "sujet.tex")

    students = _load_roster(quiz_dir / "list.csv")
    amc_compile_service.write_student_list(session_dir, students)
    amc_compile_service.copy_illustrations(session_dir, quiz_dir / "illustrations")

    log_path = session_dir / "compile.log"
    log_path.write_text(
        f"Compilation started at {to_isoformat(current_timestamp())}\n",
        encoding="utf-8",
    )

    try:
        _run_command(
            [
                "auto-multiple-choice",
                "prepare",
                "--mode",
                "s",
                "sujet.tex",
                "--out-sujet",
                "sujet.pdf",
                "--out-corrige",
                "correction.pdf",
                "--data",
                "./data/",
                "--out-calage",
                "DOC-calage.xy",
                "--with",
                "pdflatex",
            ],
            session_dir,
            log_path,
        )
        _run_command(
            [
                "auto-multiple-choice",
                "compile",
                "--data",
                "./data/",
                "--subject",
                "sujet.pdf",
            ],
            session_dir,
            log_path,
        )
        _run_command(
            [
                "auto-multiple-choice",
                "export",
                "--data",
                "./data/",
                "--module",
                "sujet",
                "--fich-noms",
                "list.csv",
                "--o",
                "exports/sujet.pdf",
            ],
            session_dir,
            log_path,
        )
        _run_command(
            [
                "auto-multiple-choice",
                "export",
                "--data",
                "./data/",
                "--module",
                "corrige",
                "--fich-noms",
                "list.csv",
                "--o",
                "exports/reponses.pdf",
            ],
            session_dir,
            log_path,
        )
    except RuntimeError as exc:
        _write_log(
            log_path,
            f"Compilation failed at {to_isoformat(current_timestamp())}: {exc}",
        )
        return _json_error(str(exc), status=500)

    _write_log(
        log_path,
        f"Compilation completed successfully at {to_isoformat(current_timestamp())}",
    )

    exports_dir = session_dir / "exports"
    sujet_export = exports_dir / "sujet.pdf"
    corrige_export = exports_dir / "reponses.pdf"

    return _json_success(
        {
            "message": "Compilation completed.",
            "exports": {
                "sujet": sujet_export.exists(),
                "reponses": corrige_export.exists(),
            },
            "log_path": str(log_path),
        }
    )


@amc_bp.route("/quizzes/<quiz_uuid>/amc/exports/<filename>", methods=["GET"])
@_require_auth
def download_export(quiz_uuid: str, filename: str):
    quiz, error = _ensure_quiz(quiz_uuid)
    if error:
        return error

    if filename not in {"sujet.pdf", "reponses.pdf"}:
        return _json_error("Unknown export requested.", status=400)

    export_path = _amc_session_dir(quiz_uuid) / "exports" / filename
    if not export_path.exists():
        return _json_error("Export not found. Compile the quiz first.", status=404)

    mimetype = "application/pdf"
    return send_file(
        export_path,
        as_attachment=True,
        download_name=filename,
        mimetype=mimetype,
        max_age=0,
    )


@amc_bp.route("/quizzes/<quiz_uuid>/amc/logs", methods=["GET"])
@_require_auth
def get_compile_logs(quiz_uuid: str):
    quiz, error = _ensure_quiz(quiz_uuid)
    if error:
        return error

    log_path = _amc_session_dir(quiz_uuid) / "compile.log"
    if not log_path.exists():
        return _json_error("No compile logs available.", status=404)

    content = log_path.read_text(encoding="utf-8")
    return _json_success({"logs": content})


@amc_bp.route("/quizzes/<quiz_uuid>/ai/verify-subject", methods=["POST"])
@_require_auth
def ai_verify_subject(quiz_uuid: str):
    quiz, error = _ensure_quiz(quiz_uuid)
    if error:
        return error

    sujet_path = _quiz_directory(quiz_uuid) / "sujet.tex"
    if not sujet_path.exists():
        return _json_error("sujet.tex not found. Generate it before requesting AI review.", status=404)

    latex_source = sujet_path.read_text(encoding="utf-8")
    language = quiz.get("quiz_language") or "fr"

    try:
        result = review_subject(latex_source=latex_source, language=language)
    except Exception as exc:  # pragma: no cover - network dependency
        return _json_error(f"AI review failed: {exc}", status=502)

    return _json_success({"results": result})
