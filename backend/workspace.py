from __future__ import annotations

import sqlite3
from pathlib import Path

DEFAULT_STUDENT_INSTRUCTIONS = (
    "Aucun document n'est autorisé. L'usage de la calculatrice est interdit. "
    "Les questions faisant apparaître le symbole ♣ peuvent présenter zéro, une ou plusieurs "
    "bonnes réponses. Les autres ont une unique bonne réponse."
)


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


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
    "mark_workspace_encrypted",
    "mark_workspace_decrypted",
    "is_workspace_encrypted",
]
