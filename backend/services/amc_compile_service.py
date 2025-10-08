from __future__ import annotations

import csv
import shutil
import subprocess
from pathlib import Path
from typing import Sequence


def ensure_workspace(session_dir: Path) -> None:
    session_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / "data").mkdir(exist_ok=True)
    (session_dir / "scans").mkdir(exist_ok=True)
    (session_dir / "exports").mkdir(exist_ok=True)


def write_student_list(session_dir: Path, students: Sequence[dict]) -> Path:
    list_path = session_dir / "list.csv"
    with list_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["id", "nom", "prenom", "email"])
        writer.writeheader()
        for entry in students:
            writer.writerow(
                {
                    "id": entry["id"],
                    "nom": entry["nom"],
                    "prenom": entry["prenom"],
                    "email": entry["email"],
                }
            )
    return list_path


def copy_illustrations(session_dir: Path, illustration_dir: Path) -> None:
    target = session_dir / "illustrations"
    target.mkdir(exist_ok=True)
    if not illustration_dir.exists():
        return
    for item in illustration_dir.iterdir():
        if item.is_file():
            shutil.copy(item, target / item.name)


def run_prepare(session_dir: Path) -> None:
    cmd = [
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
    ]
    subprocess.run(cmd, check=True, cwd=session_dir)


def run_compile(session_dir: Path) -> None:
    cmd = [
        "auto-multiple-choice",
        "compile",
        "--data",
        "./data/",
        "--subject",
        "sujet.pdf",
    ]
    subprocess.run(cmd, check=True, cwd=session_dir)


def export_results(session_dir: Path) -> None:
    exports = [
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
    ]
    for cmd in exports:
        subprocess.run(cmd, check=True, cwd=session_dir)


__all__ = [
    "ensure_workspace",
    "write_student_list",
    "copy_illustrations",
    "run_prepare",
    "run_compile",
    "export_results",
]
