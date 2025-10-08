from __future__ import annotations

import sqlite3
from pathlib import Path


def _ensure_file(path: Path, content: str) -> None:
    _ensure_parent(path)
    if not path.exists():
        path.write_text(content, encoding="utf-8")

DEFAULT_STUDENT_INSTRUCTIONS = (
    "Aucun document n'est autorisé. L'usage de la calculatrice est interdit. "
    "Les questions faisant apparaître le symbole ♣ peuvent présenter zéro, une ou plusieurs "
    "bonnes réponses. Les autres ont une unique bonne réponse."
)


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _ensure_columns(conn: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    missing = {col: definition for col, definition in columns.items() if col not in existing}
    for column, definition in missing.items():
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
    if missing:
        conn.commit()


def _create_user_defaults(path: Path) -> None:
    _ensure_parent(path)
    with sqlite3.connect(path) as conn:
        conn.execute(
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
        conn.execute("DELETE FROM defaults")
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


def _create_classes_db(path: Path) -> None:
    _ensure_parent(path)
    with sqlite3.connect(path) as conn:
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


def _create_quizes_db(path: Path) -> None:
    _ensure_parent(path)
    with sqlite3.connect(path) as conn:
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


def provision_user_workspace(root: Path, user_uuid: str) -> Path:
    workspace = root / user_uuid
    workspace.mkdir(parents=True, exist_ok=True)
    _create_user_defaults(workspace / "user_defaults.sqlite")
    _create_classes_db(workspace / "classes.sqlite")
    _create_quizes_db(workspace / "quizes.sqlite")
    return workspace


def quiz_directory(workspace: Path, quiz_uuid: str) -> Path:
    return workspace / quiz_uuid


def _create_subjects_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS subjects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_uuid TEXT NOT NULL UNIQUE,
            subject_title TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    _ensure_columns(
        conn,
        "subjects",
        {
            "sort_order": "INTEGER NOT NULL DEFAULT 0",
            "created_at": "TEXT",
            "updated_at": "TEXT",
        },
    )


def _create_questions_db(path: Path) -> None:
    with sqlite3.connect(path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                question_uuid TEXT NOT NULL,
                question_text TEXT NOT NULL,
                question_type TEXT NOT NULL,
                subject_title TEXT,
                subject_uuid TEXT,
                points REAL,
                question_number INTEGER,
                illustration_filename TEXT,
                illustration_width REAL,
                number_of_lines INTEGER,
                created_at TEXT,
                updated_at TEXT
            )
            """
        )
        conn.commit()
        _ensure_columns(
            conn,
            "questions",
            {
                "question_type": "TEXT",
                "subject_uuid": "TEXT",
                "points": "REAL",
                "question_number": "INTEGER",
                "illustration_filename": "TEXT",
                "illustration_width": "REAL",
                "number_of_lines": "INTEGER",
                "created_at": "TEXT",
                "updated_at": "TEXT",
            },
        )
        _create_subjects_table(conn)


def _create_answers_db(path: Path) -> None:
    with sqlite3.connect(path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS answers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                answer_uuid TEXT NOT NULL UNIQUE,
                question_uuid TEXT NOT NULL,
                answer_option TEXT NOT NULL,
                correct INTEGER NOT NULL DEFAULT 0,
                answer_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT,
                updated_at TEXT
            )
            """
        )
        conn.commit()
        _ensure_columns(
            conn,
            "answers",
            {
                "answer_uuid": "TEXT",
                "answer_order": "INTEGER",
                "created_at": "TEXT",
                "updated_at": "TEXT",
            },
        )


def ensure_quiz_workspace(workspace: Path, quiz_uuid: str) -> Path:
    quiz_path = quiz_directory(workspace, quiz_uuid)
    quiz_path.mkdir(parents=True, exist_ok=True)
    (quiz_path / "illustrations").mkdir(exist_ok=True)
    (quiz_path / "amc_session").mkdir(exist_ok=True)

    list_path = quiz_path / "list.csv"
    _ensure_file(list_path, "id,nom,prenom,email\n")

    _create_questions_db(quiz_path / "questions.sqlite")
    _create_answers_db(quiz_path / "answers.sqlite")
    return quiz_path


def workspace_marker(workspace: Path) -> Path:
    return workspace / ".encrypted"


def mark_workspace_encrypted(workspace: Path) -> None:
    marker = workspace_marker(workspace)
    marker.write_text("encrypted")


def mark_workspace_decrypted(workspace: Path) -> None:
    marker = workspace_marker(workspace)
    if marker.exists():
        marker.unlink()


def is_workspace_encrypted(workspace: Path) -> bool:
    return workspace_marker(workspace).exists()


__all__ = [
    "DEFAULT_STUDENT_INSTRUCTIONS",
    "provision_user_workspace",
    "quiz_directory",
    "ensure_quiz_workspace",
    "mark_workspace_encrypted",
    "mark_workspace_decrypted",
    "is_workspace_encrypted",
]
