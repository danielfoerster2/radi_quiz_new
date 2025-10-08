import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../services/api";
import { LinkCTA } from "../components/LinkCTA";
import { QuizTabs } from "../components/QuizTabs";
import "./QuizSubjectsPage.css";

type Question = {
  question_uuid: string;
};

type Subject = {
  subject_uuid: string;
  subject_title: string;
  questions: Question[];
};

type QuestionsResponse = {
  subjects: Subject[];
};

type OrderPayload = {
  subject_uuids: string[];
};

type CreatePayload = {
  question_text: string;
  question_type: string;
  points?: number;
  subject_title: string;
  answers?: Array<{ answer_option: string; correct: boolean }>;
};

const questionTypes = [
  { label: "QCM simple", value: "simple" },
  { label: "QCM multiple", value: "multiple-choice" },
  { label: "Réponse ouverte", value: "open" },
];

export const QuizSubjectsPage = () => {
  const { quizId } = useParams<{ quizId: string }>();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [form, setForm] = useState({
    subject_title: "",
    question_text: "",
    question_type: "open",
    points: 1,
    answers: [
      { answer_option: "Réponse 1", correct: true },
      { answer_option: "Réponse 2", correct: false },
    ],
  });

  const loadSubjects = async () => {
    if (!quizId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<QuestionsResponse>(`/quizzes/${quizId}/questions`, {
        method: "GET",
      });
      setSubjects(data.subjects ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger les sujets."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  const subjectCount = useMemo(() => subjects.length, [subjects]);

  const handleAddAnswerField = () => {
    setForm((prev) => ({
      ...prev,
      answers: [...prev.answers, { answer_option: "", correct: false }],
    }));
  };

  const handleAnswerChange = (index: number, field: "answer_option" | "correct", value: unknown) => {
    setForm((prev) => ({
      ...prev,
      answers: prev.answers.map((answer, idx) =>
        idx === index ? { ...answer, [field]: field === "correct" ? Boolean(value) : value } : answer,
      ),
    }));
  };

  const handleCreateSubject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!quizId) return;
    if (!form.subject_title.trim()) {
      setError("Le titre du sujet est requis.");
      return;
    }

    setIsSaving(true);
    setStatus(null);
    setError(null);
    try {
      const payload: CreatePayload = {
        subject_title: form.subject_title.trim(),
        question_text: form.question_text.trim() || "Nouvelle question",
        question_type: form.question_type,
        points: Number(form.points) || 0,
      };
      if (form.question_type !== "open") {
        payload.answers = form.answers
          .filter((answer) => answer.answer_option.trim())
          .map((answer) => ({
            answer_option: answer.answer_option.trim(),
            correct: !!answer.correct,
          }));
        if (!payload.answers?.length) {
          payload.answers = [
            { answer_option: "Réponse 1", correct: true },
            { answer_option: "Réponse 2", correct: false },
          ];
        }
      }

      await apiFetch(`/quizzes/${quizId}/questions`, {
        method: "POST",
        json: payload,
      });
      setStatus("Sujet créé. Ajoutez d'autres questions dans l'onglet Questions.");
      setForm({
        subject_title: "",
        question_text: "",
        question_type: form.question_type,
        points: form.points,
        answers: [
          { answer_option: "Réponse 1", correct: true },
          { answer_option: "Réponse 2", correct: false },
        ],
      });
      void loadSubjects();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "La création du sujet a échoué."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleReorder = async (subjectUuid: string, direction: "up" | "down") => {
    setIsReordering(true);
    setError(null);
    setStatus(null);
    setSubjects((prev) => {
      const index = prev.findIndex((subject) => subject.subject_uuid === subjectUuid);
      if (index === -1) return prev;
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      const updated = [...prev];
      const [removed] = updated.splice(index, 1);
      updated.splice(newIndex, 0, removed);
      void persistOrder(updated);
      return updated;
    });
  };

  const persistOrder = async (ordered: Subject[]) => {
    if (!quizId) return;
    try {
      await apiFetch(`/quizzes/${quizId}/subjects/order`, {
        method: "PATCH",
        json: {
          subject_uuids: ordered.map((subject) => subject.subject_uuid),
        } satisfies OrderPayload,
      });
      setStatus("Ordre des sujets mis à jour.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "La mise à jour de l'ordre a échoué."
      );
    } finally {
      setIsReordering(false);
    }
  };

  return (
    <div className="quiz-subjects">
      <header className="quiz-subjects__header">
        <div>
          <span className="quiz-subjects__eyebrow">Quiz AMC</span>
          <h1>Sujets</h1>
          <p>Créez de nouvelles sections et organisez vos sujets avant de rédiger les questions.</p>
        </div>
        <LinkCTA href="/dashboard" variant="ghost">
          Retour
        </LinkCTA>
      </header>

      <QuizTabs active="subjects" />

      {status && <div className="quiz-subjects__notice quiz-subjects__notice--success">{status}</div>}
      {error && <div className="quiz-subjects__notice quiz-subjects__notice--error">{error}</div>}

      <main className="quiz-subjects__layout">
        <section className="quiz-subjects__panel">
          <h2>Sujets existants</h2>
          {isLoading ? (
            <p>Chargement…</p>
          ) : subjectCount === 0 ? (
            <p>Aucun sujet pour ce quiz. Créez-en un nouveau pour commencer.</p>
          ) : (
            <ul className="quiz-subjects__list">
              {subjects.map((subject, index) => (
                <li key={subject.subject_uuid}>
                  <div className="quiz-subjects__item">
                    <div>
                      <h3>{subject.subject_title || "Sans titre"}</h3>
                      <p>{subject.questions.length} question(s)</p>
                    </div>
                    <div className="quiz-subjects__item-actions">
                      <button onClick={() => handleReorder(subject.subject_uuid, "up")} disabled={index === 0 || isReordering}>
                        ↑
                      </button>
                      <button
                        onClick={() => handleReorder(subject.subject_uuid, "down")}
                        disabled={index === subjects.length - 1 || isReordering}
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="quiz-subjects__panel">
          <h2>Créer un nouveau sujet</h2>
          <form className="quiz-subjects__form" onSubmit={handleCreateSubject}>
            <label>
              Titre du sujet
              <input
                type="text"
                value={form.subject_title}
                onChange={(event) => setForm((prev) => ({ ...prev, subject_title: event.target.value }))}
                placeholder="Ex : Chapitre 2 — Probabilités"
                required
              />
            </label>
            <label>
              Première question (facultatif)
              <textarea
                rows={3}
                value={form.question_text}
                onChange={(event) => setForm((prev) => ({ ...prev, question_text: event.target.value }))}
                placeholder="Écrivez une première question à associer au sujet."
              />
            </label>
            <div className="quiz-subjects__inline">
              <label>
                Type de question
                <select
                  value={form.question_type}
                  onChange={(event) => setForm((prev) => ({ ...prev, question_type: event.target.value }))}
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
                  value={form.points}
                  onChange={(event) => setForm((prev) => ({ ...prev, points: Number(event.target.value) }))}
                />
              </label>
            </div>

            {form.question_type !== "open" && (
              <div className="quiz-subjects__answers">
                <h3>Réponses proposées</h3>
                {form.answers.map((answer, index) => (
                  <div key={index} className="quiz-subjects__answer-field">
                    <input
                      type="text"
                      value={answer.answer_option}
                      onChange={(event) => handleAnswerChange(index, "answer_option", event.target.value)}
                      placeholder={`Réponse ${index + 1}`}
                    />
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(answer.correct)}
                        onChange={(event) => handleAnswerChange(index, "correct", event.target.checked)}
                      />
                      Correcte
                    </label>
                  </div>
                ))}
                <button type="button" className="quiz-subjects__secondary" onClick={handleAddAnswerField}>
                  Ajouter une réponse
                </button>
              </div>
            )}

            <button className="quiz-subjects__primary" type="submit" disabled={isSaving}>
              {isSaving ? "Création…" : "Créer le sujet"}
            </button>
          </form>
          <p className="quiz-subjects__hint">
            Vous pourrez ajouter d'autres questions et réponses depuis l'onglet Questions.
          </p>
        </section>
      </main>
    </div>
  );
};
