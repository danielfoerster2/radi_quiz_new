def analyze_bulk_pdf( threshold=0.15):

    csv_path = session_dir / "list.csv"

    # Convert scanned PDF pages to PNG images
    subprocess.run(
        ["pdftoppm", "-png", "-r", "300", pdf_path.name, "scans/page"],
        check=True,
        cwd=session_dir,
    )

    cmd_prepare = [
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
    subprocess.run(cmd_prepare, check=True, cwd=session_dir)
    subprocess.run(
        ["auto-multiple-choice", "meptex", "--src", "DOC-calage.xy", "--data", "./data/",],
        check=True,
        cwd=session_dir,
    )
    png_files = sorted(str(p.resolve()) for p in scans_dir.glob("page-*.png"))
    subprocess.run(
        [
            "auto-multiple-choice",
            "analyse",
            "--projet",
            "./",
            "--tol-marque",
            "0.2",
            *png_files,
        ],
        check=True,
        cwd=session_dir,
    )
    subprocess.run(
        [
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
        ],
        check=True,
        cwd=session_dir,
    )
    subprocess.run(
        [
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
        ],
        check=True,
        cwd=session_dir,
    )
    # Export ODS (for download) and CSV (for parsing)
    subprocess.run(
        [
            "auto-multiple-choice",
            "export",
            "--data",
            "./data/",
            "--module",
            "ods",
            "--fich-noms",
            "list.csv",
            "--o",
            "notes.ods",
            "-option-out",
            "stats",
            "--sort",
            "n",
            "--useall",
            "1",
        ],
        check=True,
        cwd=session_dir,
    )
    subprocess.run(
        [
            "auto-multiple-choice",
            "export",
            "--data",
            "./data/",
            "--module",
            "CSV",
            "--fich-noms",
            "list.csv",
            "--o",
            "notes.csv",
            "-option-out",
            "stats",
            "--sort",
            "n",
            "--useall",
            "1",
        ],
        check=True,
        cwd=session_dir,
    )
    corrections_dir = session_dir / "cr/corrections/pdf"
    corrections_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "auto-multiple-choice",
            "annotate",
            "--project",
            str(session_dir.resolve()),
            "--data",
            "./data/",
            "--subject",
            "subjet.pdf",
            "--compose",
            "2",
            "--corrected",
            "correction.pdf",
            "--names-file",
            "list.csv",
            "--filename-model",
            "(N).pdf",
            "--sort",
            "n",
            "--position",
            "marges",
        ],
        check=True,
        cwd=session_dir,
    )

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w") as zipf:
        for pdf_file in (session_dir / "cr" / "corrections" / "pdf").glob("*.pdf"):
            zipf.write(pdf_file, pdf_file.name)

    boxes = _extract_boxes(session_dir, threshold)
    db_path = data_dir / 'capture.sqlite'

    connw = sqlite3.connect(str(db_path))
    curw = connw.cursor()
    ids0 = [int(e['zoneid']) for e in boxes.get('unchecked', [])]
    ids1 = [int(e['zoneid']) for e in boxes.get('checked', [])]
    if ids0:
        placeholders = ','.join('?' for _ in ids0)
        curw.execute(f"UPDATE capture_zone SET manual = 0 WHERE zoneid IN ({placeholders})", ids0)
    if ids1:
        placeholders = ','.join('?' for _ in ids1)
        curw.execute(f"UPDATE capture_zone SET manual = 1 WHERE zoneid IN ({placeholders})", ids1)
    connw.commit()
    connw.close()

    return


def _extract_boxes(session_dir: Path):
    """Extract checkbox images and classification from capture.sqlite into UI-friendly structure."""
    data_dir = session_dir / 'data'
    checked_boxes = []
    unchecked_boxes = []
    db_path = data_dir / 'capture.sqlite'
    pages_used = set()
    page_sizes = {}


    conn = sqlite3.connect(str(db_path))
    cur = conn.cursor()
    cur.execute("""
        SELECT zoneid, black, total, imagedata, student, page, manual
        FROM capture_zone
        WHERE imagedata IS NOT NULL
    """)

    for zoneid, black, total, blob, student, page, manual in cur:
        ratio = float(black) / float(total)
        # Ensure output is PNG base64
        with PIL.Image.open(io.BytesIO(blob)) as img:
            out = io.BytesIO()
            img.save(out, format='PNG')
            png_bytes = out.getvalue()
        # Try to attach page image (copied into session dir)
        src_page = session_dir / 'cr' / f'page-{student}-{page}.jpg'
        if src_page.name not in pages_used:
            pages_used.add(src_page.name)
            with PIL.Image.open(src_page) as pimg:
                page_sizes[src_page.name] = pimg.size  # (w,h)
        page_w, page_h = page_sizes.get(src_page.name, (1, 1))
        # Retrieve polygon corners for this zone
        cur2 = conn.cursor()
        cur2.execute(
            "SELECT x, y, corner FROM capture_position WHERE zoneid = ?",
            (zoneid,),
        )
        pts = []  # list of (corner, x, y)
        for x, y, corner in cur2:
            # normalize
            nx = float(x) / float(page_w)
            ny = float(y) / float(page_h)
            pts.append((corner, nx, ny))

        # Order corners: TL(4), TR(3), BR(2), BL(1)
        order = {4: 0, 3: 1, 2: 2, 1: 3}
        pts_sorted = sorted(pts, key=lambda t: order.get(int(t[0])))
        poly = [{'x': p[1], 'y': p[2], 'corner': int(p[0])} for p in pts_sorted]
        entry = {
            'ratio': ratio,
            'image': base64.b64encode(png_bytes).decode('utf-8'),
            'pageImage': f'cr/page-{student}-{page}.jpg',
            'poly': poly,
        }

        if ratio >= threshold:
            checked_boxes.append(entry)
        else:
            unchecked_boxes.append(entry)
    conn.close()
    unchecked_boxes.sort(key=lambda e: e['ratio'])
    checked_boxes.sort(key=lambda e: e['ratio'], reverse=True)
    return {"checked": checked_boxes, "unchecked": unchecked_boxes}



def _run_amc_note_export_annotate(session_dir: Path):
    # Recompute grades
    subprocess.run(
        [
            "auto-multiple-choice",
            "note",
            "--data",
            "./data/",
            "--seuil",
            "0.15",
            "--grain",
            "0.001",
            "-arrondi",
            "s",
            "--notemin",
            "0.0",
            "--notemax",
            "20.0",
        ],
        check=True,
        cwd=session_dir,
    )

    # Export to ODS
    subprocess.run(
        [
            "auto-multiple-choice",
            "export",
            "--data",
            "./data/",
            "--module",
            "ods",
            "--fich-noms",
            "list.csv",
            "--o",
            "notes.ods",
            "-option-out",
            "stats",
            "--sort",
            "n",
            "--useall",
            "1",
        ],
        check=True,
        cwd=session_dir,
    )

    # Export to CSV
    subprocess.run(
        [
            "auto-multiple-choice",
            "export",
            "--data",
            "./data/",
            "--module",
            "CSV",
            "--fich-noms",
            "list.csv",
            "--o",
            "notes.csv",
            "-option-out",
            "stats",
            "--sort",
            "n",
            "--useall",
            "1",
        ],
        check=True,
        cwd=session_dir,
    )

    # Re-annotate PDFs
    subprocess.run(
        [
            "auto-multiple-choice",
            "annotate",
            "--project",
            str(session_dir.resolve()),
            "--data",
            "./data/",
            "--subject",
            "subjet.pdf",
            "--compose",
            "2",
            "--corrected",
            "correction.pdf",
            "--names-file",
            "list.csv",
            "--filename-model",
            "(N).pdf",
            "--sort",
            "n",
            "--position",
            "marges",
        ],
        check=True,
        cwd=session_dir,
    )


def associations()
    # Build association data (internal student number -> detected id, name image)
    assoc_db_path = data_dir / 'association.sqlite'
    if assoc_db_path.exists():
        conn_a = sqlite3.connect(str(assoc_db_path))
        cur_a = conn_a.cursor()
        cur_a.execute("SELECT student, manual, auto FROM association_association")
        rows = cur_a.fetchall()
        conn_a.close()
        for student_num, manual_id, auto_id in rows:


