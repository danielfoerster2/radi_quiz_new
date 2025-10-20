import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { parseJson } from "../utils/api";
import "./QuizQuestionsTab.css";

type QuestionType = "simple" | "multiple-choice" | "open";

type Answer = {
  answer_uuid: string;
  answer_option: string;
  correct: boolean;
  answer_order: number;
};

type Question = {
  question_uuid: string;
  question_text: string;
  question_type: QuestionType;
  subject_uuid: string;
  points: number;
  question_number: number;
  illustration_filename: string | null;
  illustration_width: number | null;
  number_of_lines: number | null;
  answers: Answer[];
};

type Subject = {
  subject_uuid: string;
  subject_title: string;
  sort_order: number;
  questions: Question[];
};

type QuestionsTabProps = {
  quizUuid: string;
  userUuid: string;
  isLocked: boolean;
  onQuizUpdated: () => Promise<void> | void;
};

type NewQuestionState = {
  subjectChoice: string;
  subjectTitle: string;
  questionText: string;
  questionType: QuestionType;
  points: string;
  numberOfLines: string;
};

type UpdateAnswerOptions = {
  silent?: boolean;
};

const questionTypeOptions: { value: QuestionType; label: string }[] = [
  { value: "simple", label: "Question simple (une réponse juste)" },
  { value: "multiple-choice", label: "QCM (plusieurs réponses justes)" },
  { value: "open", label: "Réponse ouverte" },
];

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const normalizeSubjects = (input?: any[]): Subject[] =>
  (input ?? []).map((subject) => ({
    subject_uuid: subject.subject_uuid,
    subject_title: subject.subject_title,
    sort_order: subject.sort_order,
    questions: (subject.questions ?? []).map((question: any) => {
      const rawPoints = question.points;
      const parsedPoints =
        typeof rawPoints === "number" ? rawPoints : Number.parseFloat(rawPoints ?? "0");

      const rawWidth = question.illustration_width;
      const parsedWidth =
        rawWidth === null || rawWidth === undefined
          ? null
          : (() => {
              const widthValue = typeof rawWidth === "number" ? rawWidth : Number.parseFloat(String(rawWidth));
              return Number.isNaN(widthValue) ? null : widthValue;
            })();

      const rawLines = question.number_of_lines;
      const parsedLines =
        rawLines === null || rawLines === undefined
          ? null
          : (() => {
              const linesValue = typeof rawLines === "number" ? rawLines : Number.parseInt(String(rawLines), 10);
              return Number.isNaN(linesValue) ? null : linesValue;
            })();

      return {
        question_uuid: question.question_uuid,
        question_text: question.question_text ?? "",
        question_type: (question.question_type ?? "simple") as QuestionType,
        subject_uuid: question.subject_uuid,
        points: Number.isNaN(parsedPoints) ? 0 : parsedPoints,
        question_number: question.question_number ?? 0,
        illustration_filename: question.illustration_filename ?? null,
        illustration_width: parsedWidth,
        number_of_lines: parsedLines,
        answers: (question.answers ?? []).map((answer: any) => ({
          answer_uuid: answer.answer_uuid,
          answer_option: answer.answer_option ?? "",
          correct: Boolean(answer.correct),
          answer_order: answer.answer_order ?? 0,
        })),
      };
    }),
  }));

const QuestionCard = ({
  question,
  subjects,
  isLocked,
  quizUuid,
  userUuid,
  onUpdateQuestion,
  onDeleteQuestion,
  onReorderQuestion,
  onAddAnswer,
  onUpdateAnswer,
  onDeleteAnswer,
  onReorderAnswers,
  onUploadIllustration,
  onDeleteIllustration,
  focusNewQuestionOnSubject,
}: {
  question: Question;
  subjects: Subject[];
  isLocked: boolean;
  quizUuid: string;
  userUuid: string;
  onUpdateQuestion: (questionUuid: string, payload: Record<string, unknown>, message?: string) => Promise<boolean>;
  onDeleteQuestion: (questionUuid: string) => Promise<boolean>;
  onReorderQuestion: (subjectUuid: string, questionUuid: string, direction: -1 | 1) => Promise<boolean>;
  onAddAnswer: (questionUuid: string, answerOption: string, correct: boolean) => Promise<boolean>;
  onUpdateAnswer: (questionUuid: string, answerUuid: string, payload: Record<string, unknown>, options?: UpdateAnswerOptions) => Promise<boolean>;
  onDeleteAnswer: (questionUuid: string, answerUuid: string) => Promise<boolean>;
  onReorderAnswers: (questionUuid: string, nextOrder: string[], message?: string) => Promise<boolean>;
  onUploadIllustration: (questionUuid: string, file: File, width?: number) => Promise<boolean>;
  onDeleteIllustration: (questionUuid: string) => Promise<boolean>;
  focusNewQuestionOnSubject: (subjectUuid: string) => void;
}) => {
  const [draftText, setDraftText] = useState(question.question_text);
  const [draftType, setDraftType] = useState<QuestionType>(question.question_type);
  const [draftSubject, setDraftSubject] = useState(question.subject_uuid);
  const [draftPoints, setDraftPoints] = useState(question.points.toString());
  const [draftLines, setDraftLines] = useState(question.number_of_lines ? question.number_of_lines.toString() : "");
  const [draftWidth, setDraftWidth] = useState(question.illustration_width != null ? String(question.illustration_width) : "");
  const [newAnswerText, setNewAnswerText] = useState("");
  const [newAnswerCorrect, setNewAnswerCorrect] = useState(false);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [savingAnswer, setSavingAnswer] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setDraftText(question.question_text);
    setDraftType(question.question_type);
    setDraftSubject(question.subject_uuid);
    setDraftPoints(question.points.toString());
    setDraftLines(question.number_of_lines ? question.number_of_lines.toString() : "");
    setDraftWidth(question.illustration_width != null ? String(question.illustration_width) : "");
    setAnswerDrafts(
      question.answers.reduce<Record<string, string>>((acc, answer) => {
        acc[answer.answer_uuid] = answer.answer_option;
        return acc;
      }, {})
    );
    setNewAnswerText("");
    setNewAnswerCorrect(false);
  }, [question]);

  const handleQuestionTypeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextType = event.target.value as QuestionType;
    setDraftType(nextType);
    if (nextType === "open" && !draftLines) {
      setDraftLines("5");
    }
  };

  const handleSubjectChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setDraftSubject(event.target.value);
  };

  const handleSaveQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLocked) {
      return;
    }
    const payload: Record<string, unknown> = {};
    const trimmedText = draftText.trim();
    if (!trimmedText) {
      return;
    }
    if (trimmedText !== question.question_text) {
      payload.question_text = trimmedText;
    }
    if (draftType !== question.question_type) {
      payload.question_type = draftType;
    }
    if (draftSubject !== question.subject_uuid) {
      payload.subject_uuid = draftSubject;
    }
    const parsedPoints = Number.parseFloat(draftPoints);
    if (!Number.isNaN(parsedPoints) && parsedPoints !== question.points) {
      payload.points = parsedPoints;
    }
    if (draftType === "open") {
      const parsedLines = Number.parseInt(draftLines || "0", 10);
      if (!Number.isNaN(parsedLines) && parsedLines > 0 && parsedLines !== question.number_of_lines) {
        payload.number_of_lines = parsedLines;
      }
    } else if (question.number_of_lines != null) {
      payload.number_of_lines = null;
    }
    if (draftWidth !== (question.illustration_width != null ? String(question.illustration_width) : "")) {
      if (!draftWidth) {
        payload.illustration_width = null;
      } else {
        const parsedWidth = Number.parseFloat(draftWidth);
        if (!Number.isNaN(parsedWidth)) {
          payload.illustration_width = parsedWidth;
        }
      }
    }

    if (Object.keys(payload).length === 0) {
      return;
    }

    setSavingQuestion(true);
    await onUpdateQuestion(question.question_uuid, payload, "Question mise à jour.");
    setSavingQuestion(false);
  };

  const handleDeleteQuestion = async () => {
    if (isLocked) return;
    const confirmed = window.confirm("Supprimer cette question ? Cette action est irréversible.");
    if (!confirmed) return;
    await onDeleteQuestion(question.question_uuid);
  };

  const handleAnswerTextChange = (answerUuid: string, value: string) => {
    setAnswerDrafts((prev) => ({ ...prev, [answerUuid]: value }));
  };

  const handleSaveAnswer = async (answer: Answer) => {
    if (isLocked) return;
    const text = (answerDrafts[answer.answer_uuid] ?? "").trim();
    if (!text) {
      return;
    }
    const payload: Record<string, unknown> = {};
    if (text !== answer.answer_option) {
      payload.answer_option = text;
    }
    if (Object.keys(payload).length === 0) {
      return;
    }
    setSavingAnswer(answer.answer_uuid);
    await onUpdateAnswer(question.question_uuid, answer.answer_uuid, payload);
    setSavingAnswer(null);
  };

  const handleToggleCorrect = async (answer: Answer, nextCorrect: boolean) => {
    if (isLocked) return;
    setSavingAnswer(answer.answer_uuid);
    if (question.question_type === "simple" && nextCorrect) {
      for (const other of question.answers) {
        if (other.answer_uuid !== answer.answer_uuid && other.correct) {
          await onUpdateAnswer(question.question_uuid, other.answer_uuid, { correct: false }, { silent: true });
        }
      }
    }
    await onUpdateAnswer(question.question_uuid, answer.answer_uuid, { correct: nextCorrect });
    setSavingAnswer(null);
  };

  const handleDeleteAnswer = async (answer: Answer) => {
    if (isLocked) return;
    const confirmed = window.confirm("Supprimer cette réponse ?");
    if (!confirmed) return;
    setSavingAnswer(answer.answer_uuid);
    await onDeleteAnswer(question.question_uuid, answer.answer_uuid);
    setSavingAnswer(null);
  };

  const moveAnswer = async (answer: Answer, direction: -1 | 1) => {
    if (isLocked) return;
    const answers = question.answers;
    const index = answers.findIndex((item) => item.answer_uuid === answer.answer_uuid);
    if (index === -1) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= answers.length) return;
    const reordered = [...answers];
    reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, answer);
    await onReorderAnswers(
      question.question_uuid,
      reordered.map((item) => item.answer_uuid),
      "Ordre des réponses mis à jour."
    );
  };

  const handleAddAnswer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLocked) return;
    const text = newAnswerText.trim();
    if (!text) {
      return;
    }
    await onAddAnswer(question.question_uuid, text, newAnswerCorrect);
    setNewAnswerText("");
    setNewAnswerCorrect(false);
  };

  const moveQuestion = async (direction: -1 | 1) => {
    if (isLocked) return;
    await onReorderQuestion(question.subject_uuid, question.question_uuid, direction);
  };

  const handleUploadIllustration = async (event: ChangeEvent<HTMLInputElement>) => {
    if (isLocked) return;
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      window.alert("L'illustration dépasse la taille maximale de 5 Mo.");
      event.target.value = "";
      return;
    }
    setUploading(true);
    const width = draftWidth ? Number.parseFloat(draftWidth) : undefined;
    await onUploadIllustration(question.question_uuid, file, width);
    setUploading(false);
    event.target.value = "";
  };

  const handleRemoveIllustration = async () => {
    if (isLocked) return;
    if (!question.illustration_filename) return;
    const confirmed = window.confirm("Retirer l'illustration de cette question ?");
    if (!confirmed) return;
    await onDeleteIllustration(question.question_uuid);
  };

  const illustrationPath = useMemo(() => {
    if (!question.illustration_filename) {
      return null;
    }
    return `/storage/users/${userUuid}/${quizUuid}/illustrations/${question.illustration_filename}`;
  }, [question.illustration_filename, quizUuid, userUuid]);

  return (
    <article className="quiz-questions__question">
      <header className="quiz-questions__question-header">
        <div className="quiz-questions__question-heading">
          <span className="quiz-questions__question-number">Q{question.question_number}</span>
          <span className="quiz-questions__question-type">{questionTypeOptions.find((opt) => opt.value === question.question_type)?.label ?? ""}</span>
        </div>
        <div className="quiz-questions__question-actions">
          <button type="button" className="quiz-questions__icon-button" onClick={() => moveQuestion(-1)} disabled={isLocked} aria-label="Déplacer la question vers le haut">
            ↑
          </button>
          <button type="button" className="quiz-questions__icon-button" onClick={() => moveQuestion(1)} disabled={isLocked} aria-label="Déplacer la question vers le bas">
            ↓
          </button>
          <button type="button" className="quiz-questions__text-button" onClick={handleDeleteQuestion} disabled={isLocked}>
            Supprimer
          </button>
        </div>
      </header>

      <form className="quiz-questions__question-form" onSubmit={handleSaveQuestion}>
        <label className="quiz-questions__field">
          <span>Énoncé</span>
          <textarea
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            disabled={isLocked}
            rows={5}
            required
          />
        </label>

        <div className="quiz-questions__grid">
          <label className="quiz-questions__field">
            <span>Type</span>
            <select value={draftType} onChange={handleQuestionTypeChange} disabled={isLocked}>
              {questionTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="quiz-questions__field">
            <span>Points</span>
            <input
              type="number"
              step="0.25"
              min={0}
              value={draftPoints}
              onChange={(event) => setDraftPoints(event.target.value)}
              disabled={isLocked}
              required
            />
          </label>
          <label className="quiz-questions__field">
            <span>Section</span>
            <select value={draftSubject} onChange={handleSubjectChange} disabled={isLocked}>
              {subjects.map((subject) => (
                <option key={subject.subject_uuid} value={subject.subject_uuid}>
                  {subject.subject_title}
                </option>
              ))}
            </select>
          </label>
        </div>

        {draftType === "open" ? (
          <label className="quiz-questions__field">
            <span>Nombre de lignes pour la réponse</span>
            <input
              type="number"
              min={1}
              value={draftLines}
              onChange={(event) => setDraftLines(event.target.value)}
              disabled={isLocked}
            />
          </label>
        ) : null}

        <div className="quiz-questions__illustration">
          <div className="quiz-questions__illustration-inputs">
            <label className="quiz-questions__field">
              <span>Largeur (cm) affichée dans le sujet</span>
              <input
                type="number"
                step="0.1"
                min={0}
                value={draftWidth}
                onChange={(event) => setDraftWidth(event.target.value)}
                disabled={isLocked}
              />
            </label>
            <label className="quiz-questions__upload">
              <span>Illustration (PNG, JPG, ≤ 5 Mo)</span>
              <input type="file" accept=".png,.jpg,.jpeg" onChange={handleUploadIllustration} disabled={isLocked || uploading} />
            </label>
          </div>
          {question.illustration_filename ? (
            <div className="quiz-questions__illustration-preview">
              <div>
                <strong>Illustration actuelle</strong>
                <p>{question.illustration_filename}</p>
                {illustrationPath ? (
                  <a className="quiz-questions__text-button" href={illustrationPath} target="_blank" rel="noreferrer">
                    Ouvrir l'image
                  </a>
                ) : null}
              </div>
              <button type="button" className="quiz-questions__text-button" onClick={handleRemoveIllustration} disabled={isLocked || uploading}>
                Retirer
              </button>
            </div>
          ) : null}
        </div>

        <div className="quiz-questions__form-actions">
          <button type="submit" className="app-button app-button--primary" disabled={isLocked || savingQuestion}>
            Enregistrer la question
          </button>
          <button
            type="button"
            className="app-button app-button--secondary"
            onClick={() => focusNewQuestionOnSubject(question.subject_uuid)}
          >
            Ajouter une question après celle-ci
          </button>
        </div>
      </form>

      <section className="quiz-questions__answers">
        <header className="quiz-questions__answers-header">
          <h3>Réponses</h3>
          <span>{question.answers.length} option{question.answers.length > 1 ? "s" : ""}</span>
        </header>
        <ul className="quiz-questions__answers-list">
          {question.answers.map((answer, index) => (
            <li key={answer.answer_uuid} className="quiz-questions__answer">
              <div className="quiz-questions__answer-order">#{index + 1}</div>
              <div className="quiz-questions__answer-content">
                <label className="quiz-questions__checkbox">
                  <input
                    type="checkbox"
                    checked={answer.correct}
                    onChange={(event) => handleToggleCorrect(answer, event.target.checked)}
                    disabled={isLocked || savingAnswer === answer.answer_uuid}
                  />
                  <span>Bonne réponse</span>
                </label>
                <textarea
                  value={answerDrafts[answer.answer_uuid] ?? answer.answer_option}
                  onChange={(event) => handleAnswerTextChange(answer.answer_uuid, event.target.value)}
                  disabled={isLocked || savingAnswer === answer.answer_uuid}
                  rows={2}
                />
                <div className="quiz-questions__answer-actions">
                  <button
                    type="button"
                    className="quiz-questions__icon-button"
                    onClick={() => moveAnswer(answer, -1)}
                    disabled={isLocked || index === 0}
                    aria-label="Déplacer la réponse vers le haut"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="quiz-questions__icon-button"
                    onClick={() => moveAnswer(answer, 1)}
                    disabled={isLocked || index === question.answers.length - 1}
                    aria-label="Déplacer la réponse vers le bas"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="quiz-questions__text-button"
                    onClick={() => handleSaveAnswer(answer)}
                    disabled={isLocked || savingAnswer === answer.answer_uuid}
                  >
                    Enregistrer
                  </button>
                  <button
                    type="button"
                    className="quiz-questions__text-button"
                    onClick={() => handleDeleteAnswer(answer)}
                    disabled={isLocked || savingAnswer === answer.answer_uuid}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <form className="quiz-questions__new-answer" onSubmit={handleAddAnswer}>
          <label className="quiz-questions__field quiz-questions__field--stacked">
            <span>Nouvelle réponse</span>
            <textarea
              value={newAnswerText}
              onChange={(event) => setNewAnswerText(event.target.value)}
              disabled={isLocked}
              rows={2}
              placeholder="Proposez un énoncé de réponse."
            />
          </label>
          <label className="quiz-questions__checkbox">
            <input
              type="checkbox"
              checked={newAnswerCorrect}
              onChange={(event) => setNewAnswerCorrect(event.target.checked)}
              disabled={isLocked}
            />
            <span>Bonne réponse</span>
          </label>
          <button type="submit" className="app-button app-button--secondary" disabled={isLocked}>
            Ajouter la réponse
          </button>
        </form>
      </section>
    </article>
  );
};

const QuestionsTab = ({ quizUuid, userUuid, isLocked, onQuizUpdated }: QuestionsTabProps) => {
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatingQuestion, setCreatingQuestion] = useState(false);
  const [newQuestion, setNewQuestion] = useState<NewQuestionState>({
    subjectChoice: "",
    subjectTitle: "",
    questionText: "",
    questionType: "simple",
    points: "1",
    numberOfLines: "5",
  });

  const fetchSubjects = useCallback(async (): Promise<Subject[]> => {
    const response = await fetch(`/quizzes/${quizUuid}/questions`, {
      method: "GET",
      credentials: "include",
    });
    const data = await parseJson<{ subjects?: any[]; error?: string }>(response);
    if (!response.ok) {
      throw new Error(data?.error ?? "Impossible de charger les questions.");
    }
    return normalizeSubjects(data?.subjects);
  }, [quizUuid]);

  const loadSubjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await fetchSubjects();
      setSubjects(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les questions.");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [fetchSubjects]);

  useEffect(() => {
    void loadSubjects();
  }, [loadSubjects]);

  useEffect(() => {
    setNewQuestion((prev) => {
      if (prev.subjectChoice || subjects.length === 0) {
        return prev;
      }
      return { ...prev, subjectChoice: subjects[0].subject_uuid };
    });
  }, [subjects]);

  const subjectById = useMemo(() => {
    return subjects.reduce<Record<string, Subject>>((acc, subject) => {
      acc[subject.subject_uuid] = subject;
      return acc;
    }, {});
  }, [subjects]);

  const handleNewQuestionField = (key: keyof NewQuestionState) => (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const value = event.target.value;
    setNewQuestion((prev) => {
      if (key === "questionType") {
        const type = value as QuestionType;
        return {
          ...prev,
          questionType: type,
          numberOfLines: type === "open" ? prev.numberOfLines || "5" : "",
        };
      }
      if (key === "subjectChoice") {
        return {
          ...prev,
          subjectChoice: value,
          subjectTitle: value === "__new__" ? prev.subjectTitle : "",
        };
      }
      return { ...prev, [key]: value };
    });
  };

  const resetNewQuestionForm = useCallback(() => {
    setNewQuestion((prev) => ({
      subjectChoice: prev.subjectChoice,
      subjectTitle: "",
      questionText: "",
      questionType: "simple",
      points: "1",
      numberOfLines: "5",
    }));
  }, []);

  const refreshSubjects = useCallback(
    async (message?: string) => {
    try {
      const updated = await fetchSubjects();
      setSubjects(updated);
      if (message) {
        setStatus(message);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de mettre à jour la liste des questions.");
      setStatus(null);
    }
  },
  [fetchSubjects]
);

  const handleCreateQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLocked || creatingQuestion) {
      return;
    }
    const trimmed = newQuestion.questionText.trim();
    if (!trimmed) {
      setError("Renseignez l'énoncé de la nouvelle question.");
      return;
    }
    const targetSubject =
      newQuestion.subjectChoice && subjectById[newQuestion.subjectChoice]
        ? subjectById[newQuestion.subjectChoice]
        : null;
    const subjectLabel =
      newQuestion.subjectChoice === "__new__"
        ? (newQuestion.subjectTitle.trim() || "Nouvelle section")
        : targetSubject?.subject_title ?? "Section";
    const payload: Record<string, unknown> = {
      question_text: trimmed,
      question_type: newQuestion.questionType,
    };
    const pointsValue = Number.parseFloat(newQuestion.points || "0");
    if (!Number.isNaN(pointsValue)) {
      payload.points = pointsValue;
    }
    if (newQuestion.subjectChoice === "__new__") {
      const subjectTitle = newQuestion.subjectTitle.trim();
      if (!subjectTitle) {
        setError("Indiquez le titre de la nouvelle section.");
        return;
      }
      payload.subject_title = subjectTitle;
    } else if (newQuestion.subjectChoice) {
      payload.subject_uuid = newQuestion.subjectChoice;
    }
    if (newQuestion.questionType === "open") {
      const linesValue = Number.parseInt(newQuestion.numberOfLines || "0", 10);
      if (Number.isNaN(linesValue) || linesValue <= 0) {
        setError("Indiquez un nombre de lignes valide pour la réponse ouverte.");
        return;
      }
      payload.number_of_lines = linesValue;
    }

    setCreatingQuestion(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch(`/quizzes/${quizUuid}/questions`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await parseJson<{ question?: Question; error?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.error ?? "Impossible de créer la question.");
      }
      await refreshSubjects(`Question ajoutée dans « ${subjectLabel} ».`);
      resetNewQuestionForm();
      if (onQuizUpdated) {
        await onQuizUpdated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de créer la question.");
      setStatus(null);
    } finally {
      setCreatingQuestion(false);
    }
  };

  const updateQuestion = useCallback(
    async (questionUuid: string, payload: Record<string, unknown>, message?: string) => {
      if (isLocked || Object.keys(payload).length === 0) {
        return false;
      }
      try {
        const response = await fetch(`/quizzes/${quizUuid}/questions/${questionUuid}`, {
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const data = await parseJson<{ question?: Question; error?: string }>(response);
        if (!response.ok) {
          throw new Error(data?.error ?? "Impossible de mettre à jour la question.");
        }
        await refreshSubjects(message);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Impossible de mettre à jour la question.");
        setStatus(null);
        return false;
      }
    },
    [isLocked, quizUuid, refreshSubjects]
  );

  const deleteQuestion = useCallback(
    async (questionUuid: string) => {
      if (isLocked) {
        return false;
      }
      try {
        const response = await fetch(`/quizzes/${quizUuid}/questions/${questionUuid}`, {
          method: "DELETE",
          credentials: "include",
        });
        const data = await parseJson<{ error?: string }>(response);
        if (!response.ok) {
          throw new Error(data?.error ?? "Impossible de supprimer la question.");
        }
        await refreshSubjects("Question supprimée.");
        if (onQuizUpdated) {
          await onQuizUpdated();
        }
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Impossible de supprimer la question.");
        setStatus(null);
        return false;
      }
    },
    [isLocked, quizUuid, refreshSubjects, onQuizUpdated]
  );

  const reorderSubjects = useCallback(
    async (subjectUuid: string, direction: -1 | 1) => {
      if (isLocked) return false;
      const currentIndex = subjects.findIndex((item) => item.subject_uuid === subjectUuid);
      if (currentIndex === -1) return false;
      const targetIndex = currentIndex + direction;
      if (targetIndex < 0 || targetIndex >= subjects.length) {
        return false;
      }
      const reordered = [...subjects];
      const [moved] = reordered.splice(currentIndex, 1);
      reordered.splice(targetIndex, 0, moved);

      try {
        const response = await fetch(`/quizzes/${quizUuid}/subjects/order`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subject_uuids: reordered.map((subject) => subject.subject_uuid),
          }),
        });
        const data = await parseJson<{ subjects?: any[]; error?: string }>(response);
        if (!response.ok) {
          throw new Error(data?.error ?? "Impossible de réordonner les sections.");
        }
        setSubjects(normalizeSubjects(data?.subjects));
        setStatus("Sections réordonnées.");
        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Impossible de réordonner les sections.");
        setStatus(null);
        return false;
      }
    },
    [isLocked, subjects, quizUuid]
  );

  const reorderQuestions = useCallback(
    async (subjectUuid: string, questionUuid: string, direction: -1 | 1) => {
      if (isLocked) return false;
      const subjectIndex = subjects.findIndex((subject) => subject.subject_uuid === subjectUuid);
      if (subjectIndex === -1) return false;
      const subject = subjects[subjectIndex];
      const questionIndex = subject.questions.findIndex((question) => question.question_uuid === questionUuid);
      if (questionIndex === -1) return false;

      let targetSubjectIndex = subjectIndex;
      let targetPosition = questionIndex + direction;

      if (targetPosition < 0) {
        if (subjectIndex === 0) return false;
        targetSubjectIndex = subjectIndex - 1;
        targetPosition = subjects[targetSubjectIndex].questions.length;
      } else if (targetPosition >= subject.questions.length) {
        if (subjectIndex === subjects.length - 1) return false;
        targetSubjectIndex = subjectIndex + 1;
        targetPosition = 0;
      }

      const layout = subjects.map((item) => ({
        subject_uuid: item.subject_uuid,
        question_uuids: item.questions.map((question) => question.question_uuid),
      }));

      layout[subjectIndex].question_uuids.splice(questionIndex, 1);
      layout[targetSubjectIndex].question_uuids.splice(targetPosition, 0, questionUuid);

      try {
        const response = await fetch(`/quizzes/${quizUuid}/questions/order`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subjects: layout,
          }),
        });
        const data = await parseJson<{ subjects?: any[]; error?: string }>(response);
        if (!response.ok) {
          throw new Error(data?.error ?? "Impossible de réordonner les questions.");
        }
        setSubjects(normalizeSubjects(data?.subjects));
        setStatus("Questions réordonnées.");
        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Impossible de réordonner les questions.");
        setStatus(null);
        return false;
      }
    },
    [isLocked, subjects, quizUuid]
  );

  const addAnswer = useCallback(
    async (questionUuid: string, answerOption: string, correct: boolean) => {
      if (isLocked) return false;
      try {
        const response = await fetch(`/quizzes/${quizUuid}/questions/${questionUuid}/answers`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            answer_option: answerOption,
            correct,
          }),
        });
        const data = await parseJson<{ answer?: Answer; error?: string }>(response);
        if (!response.ok) {
          throw new Error(data?.error ?? "Impossible d'ajouter la réponse.");
        }
        await refreshSubjects("Réponse ajoutée.");
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Impossible d'ajouter la réponse.");
        setStatus(null);
        return false;
      }
    },
    [isLocked, quizUuid, refreshSubjects]
  );

  const updateAnswer = useCallback(
    async (questionUuid: string, answerUuid: string, payload: Record<string, unknown>, options: UpdateAnswerOptions = {}) => {
      if (isLocked) return false;
      try {
        const response = await fetch(`/quizzes/${quizUuid}/questions/${questionUuid}/answers/${answerUuid}`, {
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const data = await parseJson<{ answer?: Answer; error?: string }>(response);
        if (!response.ok) {
          throw new Error(data?.error ?? "Impossible de mettre à jour la réponse.");
        }
        if (!options.silent) {
          await refreshSubjects("Réponse mise à jour.");
        }
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Impossible de mettre à jour la réponse.");
        if (!options.silent) {
          setStatus(null);
        }
        return false;
      }
    },
    [isLocked, quizUuid, refreshSubjects]
  );

  const deleteAnswer = useCallback(
    async (questionUuid: string, answerUuid: string) => {
      if (isLocked) return false;
      try {
        const response = await fetch(`/quizzes/${quizUuid}/questions/${questionUuid}/answers/${answerUuid}`, {
          method: "DELETE",
          credentials: "include",
        });
        const data = await parseJson<{ error?: string }>(response);
        if (!response.ok) {
          throw new Error(data?.error ?? "Impossible de supprimer la réponse.");
        }
        await refreshSubjects("Réponse supprimée.");
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Impossible de supprimer la réponse.");
        setStatus(null);
        return false;
      }
    },
    [isLocked, quizUuid, refreshSubjects]
  );

  const reorderAnswers = useCallback(
    async (questionUuid: string, answerOrder: string[], message?: string) => {
      if (isLocked) return false;
      try {
        const response = await fetch(`/quizzes/${quizUuid}/questions/${questionUuid}/answers/order`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            answer_uuids: answerOrder,
          }),
        });
        const data = await parseJson<{ answers?: any[]; error?: string }>(response);
        if (!response.ok) {
          throw new Error(data?.error ?? "Impossible de réordonner les réponses.");
        }
        await refreshSubjects(message ?? "Ordre des réponses mis à jour.");
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Impossible de réordonner les réponses.");
        setStatus(null);
        return false;
      }
    },
    [isLocked, quizUuid, refreshSubjects]
  );

  const uploadIllustration = useCallback(
    async (questionUuid: string, file: File, width?: number) => {
      if (isLocked) return false;
      try {
        const formData = new FormData();
        formData.append("file", file);
        if (width != null && !Number.isNaN(width)) {
          formData.append("width", String(width));
        }
        const response = await fetch(`/quizzes/${quizUuid}/questions/${questionUuid}/illustration`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        const data = await parseJson<{ message?: string; error?: string }>(response);
        if (!response.ok) {
          throw new Error(data?.error ?? "Impossible de téléverser l'illustration.");
        }
        await refreshSubjects("Illustration mise à jour.");
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Impossible de téléverser l'illustration.");
        setStatus(null);
        return false;
      }
    },
    [isLocked, quizUuid, refreshSubjects]
  );

  const removeIllustration = useCallback(
    async (questionUuid: string) => {
      if (isLocked) return false;
      try {
        const response = await fetch(`/quizzes/${quizUuid}/questions/${questionUuid}/illustration`, {
          method: "DELETE",
          credentials: "include",
        });
        const data = await parseJson<{ message?: string; error?: string }>(response);
        if (!response.ok) {
          throw new Error(data?.error ?? "Impossible de retirer l'illustration.");
        }
        await refreshSubjects("Illustration supprimée.");
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Impossible de retirer l'illustration.");
        setStatus(null);
        return false;
      }
    },
    [isLocked, quizUuid, refreshSubjects]
  );

  const focusNewQuestionOnSubject = useCallback((subjectUuid: string) => {
    setNewQuestion((prev) => ({
      ...prev,
      subjectChoice: subjectUuid,
      subjectTitle: "",
    }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (loading) {
    return (
      <section className="quiz__section quiz-questions__loading">
        <div className="quiz__spinner" />
        <p>Chargement des questions…</p>
      </section>
    );
  }

  return (
    <section className="quiz__section quiz-questions">
      <header className="quiz-questions__intro">
        <h2>Questions et réponses</h2>
        <p>
          Ajoutez vos questions, organisez-les par sections et préparez leurs réponses pour la génération AMC. Les modifications sont
          enregistrées question par question.
        </p>
      </header>

      <form className="quiz-questions__new-question app-card" onSubmit={handleCreateQuestion}>
        <h3>Ajouter une question</h3>
        <div className="quiz-questions__grid">
          <label className="quiz-questions__field">
            <span>Section</span>
            <select value={newQuestion.subjectChoice} onChange={handleNewQuestionField("subjectChoice")} disabled={isLocked}>
              {subjects.map((subject) => (
                <option key={subject.subject_uuid} value={subject.subject_uuid}>
                  {subject.subject_title}
                </option>
              ))}
              <option value="__new__">Créer une nouvelle section…</option>
            </select>
          </label>
          {newQuestion.subjectChoice === "__new__" ? (
            <label className="quiz-questions__field">
              <span>Nom de la nouvelle section</span>
              <input
                value={newQuestion.subjectTitle}
                onChange={handleNewQuestionField("subjectTitle")}
                placeholder="Ex : Partie A — Calcul différentiel"
                disabled={isLocked}
                required
              />
            </label>
          ) : null}
          <label className="quiz-questions__field">
            <span>Type de question</span>
            <select value={newQuestion.questionType} onChange={handleNewQuestionField("questionType")} disabled={isLocked}>
              {questionTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="quiz-questions__field">
            <span>Points</span>
            <input
              type="number"
              min={0}
              step="0.25"
              value={newQuestion.points}
              onChange={handleNewQuestionField("points")}
              disabled={isLocked}
              required
            />
          </label>
          {newQuestion.questionType === "open" ? (
            <label className="quiz-questions__field">
              <span>Nombre de lignes</span>
              <input
                type="number"
                min={1}
                value={newQuestion.numberOfLines}
                onChange={handleNewQuestionField("numberOfLines")}
                disabled={isLocked}
              />
            </label>
          ) : null}
        </div>

        <label className="quiz-questions__field">
          <span>Énoncé de la question</span>
          <textarea
            rows={4}
            value={newQuestion.questionText}
            onChange={handleNewQuestionField("questionText")}
            placeholder="Saisissez l'énoncé de la question à ajouter."
            disabled={isLocked}
            required
          />
        </label>

        <div className="quiz-questions__form-actions">
          <button type="submit" className="app-button app-button--primary" disabled={isLocked || creatingQuestion}>
            Ajouter la question
          </button>
        </div>
      </form>

      {status ? <div className="app-status">{status}</div> : null}
      {error ? <div className="app-error">{error}</div> : null}
      {isLocked ? (
        <div className="app-warning">
          Le quiz est verrouillé. La modification des questions et réponses est désactivée tant qu'il n'est pas déverrouillé.
        </div>
      ) : null}

      <div className="quiz-questions__subjects">
        {subjects.map((subject, index) => (
          <section key={subject.subject_uuid} className="quiz-questions__subject app-card">
            <header className="quiz-questions__subject-header">
              <div>
                <h3>{subject.subject_title}</h3>
                <p>{subject.questions.length} question{subject.questions.length > 1 ? "s" : ""}</p>
              </div>
              <div className="quiz-questions__subject-actions">
                <button
                  type="button"
                  className="quiz-questions__icon-button"
                  onClick={() => reorderSubjects(subject.subject_uuid, -1)}
                  disabled={isLocked || index === 0}
                  aria-label="Déplacer la section vers le haut"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="quiz-questions__icon-button"
                  onClick={() => reorderSubjects(subject.subject_uuid, 1)}
                  disabled={isLocked || index === subjects.length - 1}
                  aria-label="Déplacer la section vers le bas"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="quiz-questions__text-button"
                  onClick={() => focusNewQuestionOnSubject(subject.subject_uuid)}
                  disabled={isLocked}
                >
                  Ajouter une question
                </button>
              </div>
            </header>

            {subject.questions.length === 0 ? (
              <div className="quiz-questions__empty">Aucune question dans cette section.</div>
            ) : (
              subject.questions.map((question) => (
                <QuestionCard
                  key={question.question_uuid}
                  question={question}
                  subjects={subjects}
                  isLocked={isLocked}
                  quizUuid={quizUuid}
                  userUuid={userUuid}
                  onUpdateQuestion={updateQuestion}
                  onDeleteQuestion={deleteQuestion}
                  onReorderQuestion={reorderQuestions}
                  onAddAnswer={addAnswer}
                  onUpdateAnswer={updateAnswer}
                  onDeleteAnswer={deleteAnswer}
                  onReorderAnswers={reorderAnswers}
                  onUploadIllustration={uploadIllustration}
                  onDeleteIllustration={removeIllustration}
                  focusNewQuestionOnSubject={focusNewQuestionOnSubject}
                />
              ))
            )}
          </section>
        ))}
      </div>
    </section>
  );
};

export default QuestionsTab;
