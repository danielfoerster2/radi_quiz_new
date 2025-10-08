from __future__ import annotations

from typing import Any, Dict, Iterable, List, Tuple


LATEX_ESCAPES = {
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
    "\\": r"\textbackslash{}",
}


def escape_latex(value: str) -> str:
    if not value:
        return ""
    pieces: List[str] = []
    for char in value:
        pieces.append(LATEX_ESCAPES.get(char, char))
    return "".join(pieces)


def _amc_options(meta: Dict[str, Any]) -> str:
    opts: List[str] = []
    if not meta["random_question_order"]:
        opts.append("noshufflegroups")
    if not meta["random_answer_order"]:
        opts.append("ordre")
    opts.append("bloc")
    return ",".join(opts)


def _group_questions(questions: Iterable[Dict[str, Any]]) -> List[Tuple[str, str, List[Dict[str, Any]]]]:
    grouped: Dict[str, Dict[str, Any]] = {}
    for question in questions:
        subject_uuid = question["subject_uuid"]
        subject_title = question["subject_title"]
        entry = grouped.setdefault(subject_uuid, {"title": subject_title, "items": []})
        entry["items"].append(question)
    ordered: List[Tuple[str, str, List[Dict[str, Any]]]] = []
    for subject_uuid, data in grouped.items():
        ordered.append((subject_uuid, data["title"], data["items"]))
    return ordered


def generate_subject_latex(meta: Dict[str, Any], questions: Iterable[Dict[str, Any]]) -> str:
    lines: List[str] = [
        r"\documentclass[12pt,a4paper]{article}",
        r"\usepackage[utf8]{inputenc}",
        r"\usepackage[T1]{fontenc}",
        r"\usepackage{graphicx}",
        r"\usepackage{amsmath}",
        r"\usepackage[" + _amc_options(meta) + r"]{automultiplechoice}",
        r"\setlength{\parindent}{0pt}",
        r"",
        r"\begin{document}",
        r"",
        r"\begin{center}",
        rf"  \Large\textbf{{{escape_latex(meta['quiz_title'])}}}",
        r"\end{center}",
        r"",
    ]

    institution = meta["institution_name"]
    if institution:
        lines.extend(
            [
                r"\noindent",
                rf"{{\small {escape_latex(institution)}}}",
                r"",
            ]
        )

    instructions = meta["student_instructions"]
    if instructions:
        lines.extend(
            [
                r"\vspace{1em}",
                rf"\textit{{{escape_latex(instructions)}}}",
                r"",
            ]
        )

    id_digits = int(meta["id_coding"])
    if id_digits:
        lines.append(rf"\AMCcodeGridInt{{etu}}{{{id_digits}}}")
        lines.append("")

    subject_blocks = _group_questions(questions)

    for subject_uuid, subject_title, items in subject_blocks:
        lines.append(rf"\element{{{subject_uuid}}}{{")
        if subject_title:
            lines.append(rf"\section*{{{escape_latex(subject_title)}}}")
        for question in items:
            lines.extend(_render_question(question))
        lines.append(r"}")
        lines.append("")

    lines.extend(
        [
            r"",
            r"\end{document}",
            r"",
        ]
    )
    return "\n".join(lines)


def _render_question(question: Dict[str, Any]) -> List[str]:
    number = question["question_number"]
    points = question["points"]
    text = escape_latex(question["question_text"])
    question_type = question["question_type"]
    image_path = question["illustration_filename"]
    image_width = question["illustration_width"]
    answers = question["answers"]
    lines: List[str] = []

    if question_type == "open":
        lines.append(rf"\begin{{question}}{{{number}}}")
        lines.append(text)
        line_count = int(question["number_of_lines"])
        lines.append(rf"\AMCOpen{{lines={line_count}}}")
        lines.append(r"\end{question}")
        return lines

    env = "question"
    if question_type == "multiple-choice":
        env = "questionmult"
    lines.append(rf"\begin{{{env}}}{{{number}}}")
    if points is not None:
        lines.append(rf"\bareme{{b={points}}}")
    lines.append(text)

    if image_path:
        width_ratio = float(image_width) / 100.0
        lines.extend(
            [
                r"\begin{figure}[h]",
                r"  \centering",
                rf"  \includegraphics[width={width_ratio}\linewidth]{{{escape_latex(str(image_path))}}}",
                r"\end{figure}",
            ]
        )

    if answers:
        lines.append(r"\begin{reponses}")
        for answer in answers:
            cmd = r"\bonne" if answer["is_correct"] else r"\mauvaise"
            text_answer = escape_latex(answer["text"])
            lines.append(f"  {cmd}{{{text_answer}}}")
        lines.append(r"\end{reponses}")
    lines.append(rf"\end{{{env}}}")
    return lines


__all__ = ["generate_subject_latex", "escape_latex"]
