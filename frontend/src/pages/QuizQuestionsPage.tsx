import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../services/api";
import { LinkCTA } from "../components/LinkCTA";
import { QuizTabs } from "../components/QuizTabs";
import "./QuizQuestionsPage.css";

type Answer = {
  answer_uuid: string;
  answer_option: string;
  correct: boolean;
  answer_order: number;
};

type Question = {
  question_uuid: string;
  question_text: string;
  question_type: "simple" | "multiple-choice" | "open" | string;
  points?: number;
  subject_uuid: string;
  question_number: number;
  answers: Answer[];
};

type Subject = {
  subject_uuid: string;
  subject_title: string;
  questions: Question[];
};

type QuestionsResponse = {
  quiz_uuid: string;
  quiz_state: string;
  subjects: Subject[];
};

type CreateQuestionPayload = {
  question_text: string;
  question_type: string;
  points?: number;
  subject_uuid?: string;
  subject_title?: string;
  answers?: Array<{ answer_option: string; correct: boolean }>;
};

type CreateQuestionResponse = {
  question: Question;
};

type AnswerResponse = {
  answer: Answer;
};

type AnswersResponse = {
  answers: Answer[];
};

const questionTypes: Array<{ label: string; value: string }> = [
  { label: "QCM simple", value: "simple" },
  { label: "QCM multiple", value: "multiple-choice" },
  { label: "Réponse ouverte", value: "open" },
];

const buildOrderPayload = (subjects: Subject[]) =>
  subjects.map((subject) => ({
    subject_uuid: subject.subject_uuid,
    question_uuids: subject.questions.map((question) => question.question_uuid),
  }));

export const QuizQuestionsPage = () => {
  const { quizId } = useParams<{ quizId: string }>();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newQuestion, setNewQuestion] = useState({
    question_text: "",
    question_type: "simple",
    points: 1,
    answers: [
      { answer_option: "", correct: true }
    ],
    subject_uuid: "",
    subject_title: "",
  });

  const loadQuestions = async () => {
    if (!quizId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<QuestionsResponse>(`/quizzes/${quizId}/questions`, {
        method: "GET",
      });
      setSubjects(data.subjects ?? []);
      if (data.subjects.length && !selectedSubject) {
        setSelectedSubject(data.subjects[0].subject_uuid);
      }
      setStatus(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger les questions."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  const currentSubject = useMemo(
    () => subjects.find((subject) => subject.subject_uuid === selectedSubject) ?? null,
    [subjects, selectedSubject],
  );

  const currentQuestion = useMemo(() => {
    if (!currentSubject || !selectedQuestion) return null;
    return (
      currentSubject.questions.find(
        (question) => question.question_uuid === selectedQuestion,
      ) ?? null
    );
  }, [currentSubject, selectedQuestion]);

  const updateSubjects = (updater: (prev: Subject[]) => Subject[]) => {
    setSubjects((prev) => updater(prev));
  };

  const handleQuestionCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!quizId) return;
    setIsCreating(true);
    setError(null);
    setStatus(null);

    const payload: CreateQuestionPayload = {
      question_text: newQuestion.question_text.trim(),
      question_type: newQuestion.question_type,
      points: Number(newQuestion.points) || 0,
      answers: newQuestion.answers?.filter((answer) => answer.answer_option.trim()) ?? [],
    };

    if (newQuestion.subject_uuid) {
      payload.subject_uuid = newQuestion.subject_uuid;
    } else if (newQuestion.subject_title.trim()) {
      payload.subject_title = newQuestion.subject_title.trim();
    }

    if (!payload.question_text) {
      setError("Le texte de la question est requis.");
      setIsCreating(false);
      return;
    }

    try {
      const response = await apiFetch<CreateQuestionResponse>(
        `/quizzes/${quizId}/questions`,
        {
          method: "POST",
          json: payload,
        },
      );
      const newInserted = response.question;
      updateSubjects((prev) => {
        const exists = prev.some((subject) => subject.subject_uuid === newInserted.subject_uuid);
        if (!exists) {
          return [
            ...prev,
            {
              subject_uuid: newInserted.subject_uuid,
              subject_title: "Nouvelle section",
              questions: [newInserted],
            },
          ];
        }
        return prev.map((subject) =>
          subject.subject_uuid === newInserted.subject_uuid
            ? {
                ...subject,
                questions: [newInserted, ...subject.questions],
              }
            : subject,
        );
      });
      setStatus("Question ajoutée.");
      setNewQuestion({
        question_text: "",
        question_type: newQuestion.question_type,
        points: newQuestion.points,
        answers: [{ answer_option: "", correct: true }],
        subject_uuid: newQuestion.subject_uuid,
        subject_title: "",
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "La création de la question a échoué."
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleSelectQuestion = (question: Question) => {
    setSelectedSubject(question.subject_uuid);
    setSelectedQuestion(question.question_uuid);
  };

  const handleDeleteQuestion = async () => {
    if (!quizId || !currentQuestion) return;
    try {
      await apiFetch(`/quizzes/${quizId}/questions/${currentQuestion.question_uuid}`, {
        method: "DELETE",
      });
      updateSubjects((prev) =>
        prev
          .map((subject) =>
            subject.subject_uuid === currentQuestion.subject_uuid
              ? {
                  ...subject,
                  questions: subject.questions.filter(
                    (question) => question.question_uuid !== currentQuestion.question_uuid,
                  ),
                }
              : subject,
          )
          .filter((subject) => subject.questions.length > 0),
      );
      setSelectedQuestion(null);
      setStatus("Question supprimée.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "La suppression de la question a échoué."
      );
    }
  };

  const handleMoveQuestion = async (
    subjectUuid: string,
    questionUuid: string,
    direction: "up" | "down",
  ) => {
    updateSubjects((prev) => {
      const updated = prev.map((subject) => {
        if (subject.subject_uuid !== subjectUuid) return subject;
        const index = subject.questions.findIndex(
          (question) => question.question_uuid === questionUuid,
        );
        if (index === -1) return subject;
        const newQuestions = [...subject.questions];
        const newIndex = direction === "up" ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= newQuestions.length) return subject;
        const [removed] = newQuestions.splice(index, 1);
        newQuestions.splice(newIndex, 0, removed);
        return { ...subject, questions: newQuestions };
      });
      void persistOrder(updated);
      return updated;
    });
  };

  const persistOrder = async (updatedSubjects: Subject[]) => {
    if (!quizId) return;
    try {
      await apiFetch(`/quizzes/${quizId}/questions/order`, {
        method: "PATCH",
        json: { subjects: buildOrderPayload(updatedSubjects) },
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "La mise à jour de l'ordre des questions a échoué."
      );
    }
  };

  const handleAddAnswerField = () => {
    setNewQuestion((prev) => ({
      ...prev,
      answers: [...(prev.answers ?? []), { answer_option: "", correct: false }],
    }));
  };

  const handleNewAnswerChange = (index: number, field: "answer_option" | "correct", value: unknown) => {
    setNewQuestion((prev) => ({
      ...prev,
      answers: prev.answers?.map((answer, idx) =>
        idx === index ? { ...answer, [field]: field === "correct" ? Boolean(value) : value } : answer,
      ),
    }));
  };

  const handleCreateAnswer = async () => {
    if (!quizId || !currentQuestion) return;
    try {
      const response = await apiFetch<AnswerResponse>(
        `/quizzes/${quizId}/questions/${currentQuestion.question_uuid}/answers`,
        {
          method: "POST",
          json: { answer_option: "Nouvelle réponse", correct: false },
        },
      );
      updateSubjects((prev) =>
        prev.map((subject) =>
          subject.subject_uuid === currentQuestion.subject_uuid
            ? {
                ...subject,
                questions: subject.questions.map((question) =>
                  question.question_uuid === currentQuestion.question_uuid
                    ? { ...question, answers: [...question.answers, response.answer] }
                    : question,
                ),
              }
            : subject,
        ),
      );
      setStatus("Réponse ajoutée.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "L'ajout de la réponse a échoué."
      );
    }
  };

  const handleDeleteAnswer = async (answerUuid: string) => {
    if (!quizId || !currentQuestion) return;
    try {
      await apiFetch(`/quizzes/${quizId}/questions/${currentQuestion.question_uuid}/answers/${answerUuid}`, {
        method: "DELETE",
      });
      updateSubjects((prev) =>
        prev.map((subject) =>
          subject.subject_uuid === currentQuestion.subject_uuid
            ? {
                ...subject,
                questions: subject.questions.map((question) =>
                  question.question_uuid === currentQuestion.question_uuid
                    ? {
                        ...question,
                        answers: question.answers.filter((answer) => answer.answer_uuid !== answerUuid),
                      }
                    : question,
                ),
              }
            : subject,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "La suppression de la réponse a échoué."
      );
    }
  };

  const handleAnswerUpdate = async (answer: Answer, updates: Partial<Answer>) => {
    if (!quizId || !currentQuestion) return;
    try {
      const response = await apiFetch<AnswerResponse>(
        `/quizzes/${quizId}/questions/${currentQuestion.question_uuid}/answers/${answer.answer_uuid}`,
        {
          method: "PUT",
          json: {
            answer_option: updates.answer_option ?? answer.answer_option,
            correct: updates.correct ?? answer.correct,
          },
        },
      );
      updateSubjects((prev) =>
        prev.map((subject) =>
          subject.subject_uuid === currentQuestion.subject_uuid
            ? {
                ...subject,
                questions: subject.questions.map((question) =>
                  question.question_uuid === currentQuestion.question_uuid
                    ? {
                        ...question,
                        answers: question.answers.map((existing) =>
                          existing.answer_uuid === answer.answer_uuid ? response.answer : existing,
                        ),
                      }
                    : question,
                ),
              }
            : subject,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "La mise à jour de la réponse a échoué."
      );
    }
  };

  const handleAnswerOrder = async (answerUuid: string, direction: "up" | "down") => {
    if (!quizId || !currentQuestion) return;
    const answers = currentQuestion.answers;
    const index = answers.findIndex((answer) => answer.answer_uuid === answerUuid);
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || newIndex < 0 || newIndex >= answers.length) return;
    const reordered = [...answers];
    const [removed] = reordered.splice(index, 1);
    reordered.splice(newIndex, 0, removed);

    try {
      await apiFetch<AnswersResponse>(
        `/quizzes/${quizId}/questions/${currentQuestion.question_uuid}/answers/order`,
        {
          method: "PATCH",
          json: { answer_uuids: reordered.map((answer) => answer.answer_uuid) },
        },
      );
      updateSubjects((prev) =>
        prev.map((subject) =>
          subject.subject_uuid === currentQuestion.subject_uuid
            ? {
                ...subject,
                questions: subject.questions.map((question) =>
                  question.question_uuid === currentQuestion.question_uuid
                    ? { ...question, answers: reordered }
                    : question,
                ),
              }
            : subject,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "La mise à jour de l'ordre des réponses a échoué."
      );
    }
  };

  return (
    <div className="quiz-questions">
      <header className="quiz-questions__header">
        <div>
          <span className="quiz-questions__eyebrow">Quiz AMC</span>
          <h1>Questions et sujets</h1>
          <p>Organisez vos sujets, ajoutez de nouvelles questions et préparez vos réponses correctes.</p>
        </div>
        <LinkCTA href="/dashboard" variant="ghost">
          Retour
        </LinkCTA>
      </header>

      <QuizTabs active="questions" />

      {status && <div className="quiz-questions__notice quiz-questions__notice--success">{status}</div>}
      {error && <div className="quiz-questions__notice quiz-questions__notice--error">{error}</div>}

      <main className="quiz-questions__layout">
        <section className="quiz-questions__panel quiz-questions__subjects">
          <h2>Sujets et questions</h2>
          {isLoading ? (
            <p>Chargement…</p>
          ) : subjects.length === 0 ? (
            <p>Aucun sujet pour le moment. Ajoutez une première question pour créer un sujet.</p>
          ) : (
            <div className="quiz-questions__list">
              {subjects.map((subject) => (
                <div key={subject.subject_uuid} className="quiz-questions__subject">
                  <div className="quiz-questions__subject-header">
                    <button
                      className={`quiz-questions__subject-button ${
                        subject.subject_uuid === selectedSubject ? "quiz-questions__subject-button--active" : ""
                      }`}
                      onClick={() => {
                        setSelectedSubject(subject.subject_uuid);
                        setSelectedQuestion(null);
                      }}
                    >
                      {subject.subject_title || "Sans titre"}
                    </button>
                  </div>
                  <ul className="quiz-questions__question-list">
                    {subject.questions.map((question, index) => (
                      <li key={question.question_uuid}>
                        <button
                          className={`quiz-questions__question-button ${
                            question.question_uuid === selectedQuestion
                              ? "quiz-questions__question-button--active"
                              : ""
                          }`}
                          onClick={() => handleSelectQuestion(question)}
                        >
                          <span className="quiz-questions__question-number">Q{question.question_number}</span>
                          <span className="quiz-questions__question-text">
                            {question.question_text.slice(0, 64) || "Sans titre"}
                          </span>
                        </button>
                        <div className="quiz-questions__question-actions">
                          <button
                            onClick={() => handleMoveQuestion(subject.subject_uuid, question.question_uuid, "up")}
                            disabled={index === 0}
                          >
                            ↑
                          </button>
                          <button
                            onClick={() =>
                              handleMoveQuestion(subject.subject_uuid, question.question_uuid, "down")
                            }
                            disabled={index === subject.questions.length - 1}
                          >
                            ↓
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="quiz-questions__panel quiz-questions__editor">
          <h2>Nouvelle question</h2>
          <form className="quiz-questions__form" onSubmit={handleQuestionCreate}>
            <label>
              Texte de la question
              <textarea
                rows={3}
                value={newQuestion.question_text}
                onChange={(event) =>
                  setNewQuestion((prev) => ({ ...prev, question_text: event.target.value }))
                }
                required
              />
            </label>
            <div className="quiz-questions__inline">
              <label>
                Type
                <select
                  value={newQuestion.question_type}
                  onChange={(event) =>
                    setNewQuestion((prev) => ({ ...prev, question_type: event.target.value }))
                  }
                >
                  {questionTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Points
                <input
                  type="number"
                  min={0}
                  step="0.25"
                  value={newQuestion.points}
                  onChange={(event) =>
                    setNewQuestion((prev) => ({ ...prev, points: Number(event.target.value) }))
                  }
                />
              </label>
            </div>
            <label>
              Associer à un sujet existant
              <select
                value={newQuestion.subject_uuid}
                onChange={(event) =>
                  setNewQuestion((prev) => ({ ...prev, subject_uuid: event.target.value }))
                }
              >
                <option value="">Créer un nouveau sujet</option>
                {subjects.map((subject) => (
                  <option key={subject.subject_uuid} value={subject.subject_uuid}>
                    {subject.subject_title || "Sans titre"}
                  </option>
                ))}
              </select>
            </label>
            {!newQuestion.subject_uuid && (
              <label>
                Titre du nouveau sujet
                <input
                  type="text"
                  value={newQuestion.subject_title}
                  onChange={(event) =>
                    setNewQuestion((prev) => ({ ...prev, subject_title: event.target.value }))
                  }
                  placeholder="Ex: Chapitre 1"
                />
              </label>
            )}

            {newQuestion.question_type !== "open" && (
              <div className="quiz-questions__answers">
                <h3>Réponses proposées</h3>
                {newQuestion.answers?.map((answer, index) => (
                  <div key={index} className="quiz-questions__answer-field">
                    <input
                      type="text"
                      value={answer.answer_option}
                      onChange={(event) =>
                        handleNewAnswerChange(index, "answer_option", event.target.value)
                      }
                      placeholder={`Réponse ${index + 1}`}
                    />
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(answer.correct)}
                        onChange={(event) => handleNewAnswerChange(index, "correct", event.target.checked)}
                      />
                      Correcte
                    </label>
                  </div>
                ))}
                <button
                  type="button"
                  className="quiz-questions__secondary"
                  onClick={handleAddAnswerField}
                >
                  Ajouter une réponse
                </button>
              </div>
            )}

            <button className="quiz-questions__primary" type="submit" disabled={isCreating}>
              {isCreating ? "Ajout…" : "Ajouter la question"}
            </button>
          </form>
        </section>

        <aside className="quiz-questions__panel quiz-questions__details">
          {currentQuestion ? (
            <div className="quiz-questions__question-detail">
              <header>
                <h2>
                  Question {currentQuestion.question_number} – {currentQuestion.question_type}
                </h2>
                <button className="quiz-questions__danger" onClick={handleDeleteQuestion}>
                  Supprimer la question
                </button>
              </header>
              <p className="quiz-questions__question-text-full">{currentQuestion.question_text}</p>

              <section className="quiz-questions__answers-list">
                <h3>Réponses</h3>
                <button className="quiz-questions__secondary" onClick={handleCreateAnswer}>
                  Ajouter une réponse
                </button>
                <ul>
                  {currentQuestion.answers.map((answer, index) => (
                    <li key={answer.answer_uuid}>
                      <input
                        type="text"
                        value={answer.answer_option}
                        onChange={(event) =>
                          handleAnswerUpdate(answer, { answer_option: event.target.value })
                        }
                      />
                      <label>
                        <input
                          type="checkbox"
                          checked={answer.correct}
                          onChange={(event) =>
                            handleAnswerUpdate(answer, { correct: event.target.checked })
                          }
                        />
                        Correcte
                      </label>
                      <div className="quiz-questions__answer-actions">
                        <button onClick={() => handleAnswerOrder(answer.answer_uuid, "up")} disabled={index === 0}>
                          ↑
                        </button>
                        <button
                          onClick={() => handleAnswerOrder(answer.answer_uuid, "down")}
                          disabled={index === currentQuestion.answers.length - 1}
                        >
                          ↓
                        </button>
                        <button onClick={() => handleDeleteAnswer(answer.answer_uuid)}>✕</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          ) : (
            <div className="quiz-questions__empty">Sélectionnez une question pour afficher les détails.</div>
          )}
        </aside>
      </main>
    </div>
  );
};
