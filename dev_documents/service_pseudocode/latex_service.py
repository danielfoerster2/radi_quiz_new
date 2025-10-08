def escape_latex(text: str) -> str:
    """Escape LaTeX special characters while preserving math segments.

    Preserves content inside: $...$, $$...$$, \( ... \), \[ ... \].
    """
    if not text:
        return ""

    mapping = {
        '&': r'\&',
        '%': r'\%',
        '$': r'\$',
        '#': r'\#',
        '_': r'\_',
        '{': r'\{',
        '}': r'\}',
        '~': r'\textasciitilde{}',
        '^': r'\textasciicircum{}',
        '\\': r'\textbackslash{}',
    }

    # Regex to match math segments (avoids escaped delimiters)
    math_pattern = re.compile(
        r"(?s)(?<!\\)\$\$(.+?)\$\$|(?<!\\)\$(.+?)\$(?!\$)|\\\((.+?)\\\)|\\\[(.+?)\\\]"
    )

    esc_re = re.compile('|'.join(re.escape(key) for key in mapping.keys()))

    def escape_chunk(chunk: str) -> str:
        return esc_re.sub(lambda m: mapping[m.group(0)], chunk)

    out = []
    last = 0
    for m in math_pattern.finditer(text):
        s, e = m.span()
        if s > last:
            out.append(escape_chunk(text[last:s]))
        out.append(text[s:e])  # keep math as-is
        last = e
    if last < len(text):
        out.append(escape_chunk(text[last:]))

    return ''.join(out)


def generate_quiz_latex()

    topic_ids: Dict[str, str] = {topic: uuid.uuid4().hex for topic in quiz.topics}

    amc_opts = ["noshufflegroups", "bloc", quiz.language]
    if not quiz.shuffle_answers:
        amc_opts.append("ordre")

    latex_lines = [
        r"\documentclass[12pt,a4paper]{article}",
        r"\usepackage[utf8x]{inputenc}",
        r"\usepackage[T1]{fontenc}",
        r"\usepackage{graphicx}",
        r"\usepackage{amsmath}",
        r"\usepackage{amsfonts}",
        r"\usepackage{float}",
        r"\usepackage{csvsimple}",
        r"\usepackage[" + ",".join(amc_opts) + "]{automultiplechoice}"
        r"\usepackage{afterpage}",
        r"\DeclareUnicodeCharacter{2660}{\ensuremath{\spadesuit}}",
        r"\DeclareUnicodeCharacter{2663}{\ensuremath{\clubsuit}}",
        r"\DeclareUnicodeCharacter{2665}{\ensuremath{\heartsuit}}",
        r"\DeclareUnicodeCharacter{2666}{\ensuremath{\diamondsuit}}",
        r"\setlength{\parindent}{0cm}",
        r"\newcommand{\entete}{{\bf %s \hfill %s\\ %s}}" % (
            escape_latex(quiz.institution_name or ""),
            escape_latex(quiz.quiz_date or ""),
            escape_latex(quiz.class_title or ""),
        ),
        r"",
        r"\newcommand\blankpage{",
        r"    \null",
        r"    \thispagestyle{empty}",
        r"    \addtocounter{page}{-1}",
        r"    \newpage}",
        r"",
        r"\AMCrandomseed{1515}",
        r"",
        r"\newcommand{\sujet}{",
        r"",
        r"",
        r"\entete",
        r"\vspace{3ex}",
        r"",
        r"",
        r"\exemplaire{1}{",
    ]

    if quiz.student_id_digits > 0:
        r"{\setlength{\parindent}{0pt}\hspace*{\fill}\AMCcodeGridInt{etu}{%d}\hspace*{\fill}" % quiz.student_id_digits,
        r"\begin{minipage}[b]{6.5cm}",
        r"\hspace{0pt plus 1cm} %s" % escape_latex(quiz.student_id_instructions),
    else:
        r"{\setlength{\parindent}{0pt}",
        r"\begin{minipage}[b]{12cm}",

        r"",
        r"\vspace{3ex}",
        r"",
        r"\hfill\champnom{\fbox{",
        r"    \begin{minipage}{.9\linewidth}",
        r"      Nom et prénom :",
        r"",
        r"      \vspace*{.5cm}\dotfill",
        r"",
        r"      \vspace*{.5cm}\dotfill",
        r"      \vspace*{1mm}",
        r"    \end{minipage}",
        r"  }}\hfill\vspace{5ex}\end{minipage}\hspace*{\fill}",
        r"",
        r"}",


    latex_lines.extend([
        r"",
        r"\vspace*{.5cm}",
        r"\begin{minipage}{.4\linewidth}",
        r"  \centering\large\bf",
        r"{%s}" % escape_latex(quiz.title or ""),
        r"\end{minipage}",
    if quiz.time_limit:
        r"\\begin{center}\\large\\bfseries Durée: %d minutes\\end{center}" % int(quiz.time_limit))
    else:
        r"\begin{center}\em",
        r"{%s}" % escape_latex(quiz.student_instructions or ""),
        r"\end{center}",
        r"\vspace{1ex}",
    ])

    for topic in ordered_topics:
        esc = escape_latex(topic)
        if len(ordered_topics) > 1:
            latex_lines.append(f"\\section{{{esc}}}")
        latex_lines.append(f"\\restituegroupe{{{topic_ids[topic]}}}")

    latex_lines.append("")
    if amc_add_pages is not None:
        latex_lines.append(rf"\AMCaddpagesto{{{int(amc_add_pages)}}}")
    latex_lines.extend([
        r"\AMCcleardoublepage",
        r"\AMCassociation{\id}",
        r"}",
        r"}",
        r"",
        r"\begin{document}",
        r"",
        r"\def\AMCformQuestion#1{{\sc Question #1 :}}",
        r"",
        (r"\setdefaultgroupmode{withoutreplacement}" if bool(options.get('shuffle_questions')) else r"\setdefaultgroupmode{fixed}"),
        r"",
    ])

    for topic in quiz.topics:
        for question in topics.get(topic, []):
            if question.type == "single":
                env = "question"
            elif question.type == "multiple-choice":
                env = "questionmult"
            else:
                env = "open"

            latex_lines.append(f"\\element{{{topic_ids[topic]}}}{{")
            if question.type == "single" or question.type == "multiple-choice":
                latex_lines.append(f"\\begin{{{env}}}{{{question.label}}}\\bareme{{b={question.points}}}")
            else:
                latex_lines.append(f"\\begin{{{env}}}{{{question.label}}}")
            latex_lines.append(escape_latex(question.text))

            if question.img_path:
                latex_lines.extend([
                    r"  \begin{figure}[H]",
                    r"  \centering",
                    rf"  \includegraphics[width={question.image_width/100}\textwidth]{{{question.image_path}}}",
                    r"  \end{figure}",
                ])
            if question.type == "single" or question.type == "multiple-choice":
                total_chars = len("".join(question.answers))
                n_answers = len(question.answers)
                if (total_chars + n_answers * 7) < 47:
                    answers_env = "reponseshoriz"
                else:
                    answers_env = "reponses"
                latex_lines.append(fr"\begin{{{answers_env}}}")
                for answer in answers_list:
                    cmd = "\\bonne" if answer.is_correct else "\\mauvaise"
                    latex_lines.append(f"  {cmd}{{{escape_latex(answer.text)}}}")
                latex_lines.append(fr"\end{{{answers_env}}}")
                latex_lines.append(f"\\end{{{env}}}")
                latex_lines.append(r"}")
            else
               latex_lines.append("\AMCOpen{lines={question.n_lines}}"
               latex_lines.append("{\wrongchoice[W]{W}\scoring{0}\wrongchoice[P]{P}\scoring{question.points/2}\correctchoice[C]{C}\scoring{question.points}}")

    latex_lines.extend([
        r"",
        r"\csvreader[head to column names]{liste.csv}{}{\sujet}",
        r"\end{document}",
    ])

    return "\n".join(latex_lines)


