
def generate_quiz_amc_pdf(...):
    csv_lines = ["id,nom,prenom"]
    for i in range(1, n + 1):
        csv_lines.append(f"{i:04d},last,first")
    csv_path = session_dir / "list.csv"
    csv_path.write_text("\n".join(csv_lines) + "\n", encoding="utf-8")

    for question in quiz.questions:
        if question.image_path:
            shutil.copy(question.image_path, session_dir)

    scans_dir = session_dir / "scans"
    scans_dir.mkdir(exist_ok=True)
    data_dir = session_dir / "data"
    data_dir.mkdir(exist_ok=True)

    cmd_prepare = [
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
    subprocess.run(cmd_prepare, check=True, cwd=session_dir)

    return

