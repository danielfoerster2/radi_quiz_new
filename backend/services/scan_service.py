from __future__ import annotations

import base64
import sqlite3
import subprocess
from pathlib import Path
from typing import Dict, List, Tuple


def convert_pdf_to_png(session_dir: Path, pdf_path: Path) -> List[Path]:
    scans_dir = session_dir / "scans"
    scans_dir.mkdir(exist_ok=True, parents=True)
    cmd = ["pdftoppm", "-png", "-r", "300", str(pdf_path.resolve()), "page"]
    subprocess.run(cmd, check=True, cwd=scans_dir)
    return sorted(scans_dir.glob("page-*.png"))


def run_analysis(session_dir: Path, threshold: float) -> None:
    _amc_prepare(session_dir)
    _amc_meptex(session_dir)
    _amc_analyse(session_dir)
    _amc_note(session_dir, threshold)
    _amc_association(session_dir)
    _amc_export(session_dir, "ods", "notes.ods")
    _amc_export(session_dir, "CSV", "notes.csv")


def recalc_annotations(session_dir: Path, threshold: float) -> None:
    _amc_note(session_dir, threshold)
    _amc_export(session_dir, "ods", "notes.ods")
    _amc_export(session_dir, "CSV", "notes.csv")
    _amc_annotate(session_dir)


def load_checkbox_status(session_dir: Path, *, threshold: float) -> Dict[str, List[Dict[str, float]]]:
    db_path = session_dir / "data" / "analysis.sqlite"
    if not db_path.exists():
        raise FileNotFoundError(db_path)

    connection = sqlite3.connect(db_path)
    cursor = connection.cursor()
    cursor.execute("SELECT student, page, checkbox, ratio FROM boxes")
    checked: List[Dict[str, float]] = []
    unchecked: List[Dict[str, float]] = []
    for student, page, checkbox, ratio in cursor.fetchall():
        entry = {
            "student": student,
            "page": page,
            "checkbox": checkbox,
            "ratio": ratio,
        }
        if ratio >= threshold:
            checked.append(entry)
        else:
            unchecked.append(entry)
    connection.close()
    return {"checked": checked, "unchecked": unchecked}


def get_page_image(session_dir: Path, student: str, page: str) -> Tuple[str, str]:
    image_path = session_dir / "cr" / "page-images" / student / f"{page}.jpg"
    if not image_path.exists():
        raise FileNotFoundError(image_path)
    data = image_path.read_bytes()
    encoded = base64.b64encode(data).decode("ascii")
    return encoded, image_path.name


def _amc_prepare(session_dir: Path) -> None:
    cmd = [
        "auto-multiple-choice",
        "prepare",
        "--mode",
        "b",
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


def _amc_meptex(session_dir: Path) -> None:
    cmd = [
        "auto-multiple-choice",
        "meptex",
        "--src",
        "DOC-calage.xy",
        "--data",
        "./data/",
    ]
    subprocess.run(cmd, check=True, cwd=session_dir)


def _amc_analyse(session_dir: Path) -> None:
    scans = sorted((session_dir / "scans").glob("page-*.png"))
    cmd = [
        "auto-multiple-choice",
        "analyse",
        "--projet",
        "./",
        "--tol-marque",
        "0.2",
        *[str(p) for p in scans],
    ]
    subprocess.run(cmd, check=True, cwd=session_dir)


def _amc_note(session_dir: Path, threshold: float) -> None:
    cmd = [
        "auto-multiple-choice",
        "note",
        "--data",
        "./data/",
        "--seuil",
        str(threshold),
        "--grain",
        "0.001",
        "-arrondi",
        "s",
        "--notemin",
        "0.0",
        "--notemax",
        "20.0",
    ]
    subprocess.run(cmd, check=True, cwd=session_dir)


def _amc_association(session_dir: Path) -> None:
    cmd = [
        "auto-multiple-choice",
        "association-auto",
        "--data",
        "./data/",
        "--notes-id",
        "etu",
        "--liste",
        "list.csv",
        "--liste-key",
        "id",
    ]
    subprocess.run(cmd, check=True, cwd=session_dir)


def _amc_export(session_dir: Path, module: str, destination: str) -> None:
    cmd = [
        "auto-multiple-choice",
        "export",
        "--data",
        "./data/",
        "--module",
        module,
        "--fich-noms",
        "list.csv",
        "--o",
        destination,
        "-option-out",
        "stats",
        "--sort",
        "n",
        "--useall",
        "1",
    ]
    subprocess.run(cmd, check=True, cwd=session_dir)


def _amc_annotate(session_dir: Path) -> None:
    cmd = [
        "auto-multiple-choice",
        "annotate",
        "--data",
        "./data/",
        "--subject",
        "sujet.pdf",
        "--corrected",
        "correction.pdf",
        "--names-file",
        "list.csv",
        "--position",
        "marges",
    ]
    subprocess.run(cmd, check=True, cwd=session_dir)


__all__ = [
    "convert_pdf_to_png",
    "run_analysis",
    "recalc_annotations",
    "load_checkbox_status",
    "get_page_image",
]
