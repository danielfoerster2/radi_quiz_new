import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../services/api";
import { LinkCTA } from "../components/LinkCTA";
import "./QuizGeneralitiesPage.css";

type QuizPayload = {
  quiz_uuid: string;
  quiz_title: string;
  quiz_state: string;
  creation_date?: string;
  number_of_questions?: number;
  class_title?: string;
  institution_name?: string;
  student_instructions?: string;
  coding_explanation?: string;
  email_subject?: string;
  email_body?: string;
  id_coding?: string;
  date_of_quiz?: string;
  duration?: string;
  quiz_language?: string;
  random_question_order?: boolean | 0 | 1;
  random_answer_order?: boolean | 0 | 1;
  two_up_printing?: boolean | 0 | 1;
};

type QuizResponse = {
  quiz: QuizPayload;
};

type UpdateResponse = {
  quiz: QuizPayload;
};

type LockResponse = {
  quiz: QuizPayload;
  message?: string;
};

const booleanFrom = (value: boolean | 0 | 1 | undefined): boolean => {
  if (value === undefined) return false;
  if (typeof value === "boolean") return value;
  return value === 1;
};

const formatDateTime = (value?: string) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const QuizGeneralitiesPage = () => {
  const { quizId } = useParams<{ quizId: string }>();
  const [quiz, setQuiz] = useState<QuizPayload | null>(null);
  const [form, setForm] = useState<QuizPayload | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocking, setIsLocking] = useState(false);

  const loadQuiz = async () => {
    if (!quizId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<QuizResponse>(`/quizzes/${quizId}`, { method: "GET" });
      setQuiz(data.quiz);
      setForm(data.quiz);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible de charger les informations du quiz."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadQuiz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  const handleChange = (field: keyof QuizPayload, value: unknown) => {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleToggle = (field: keyof QuizPayload) => {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            [field]: !booleanFrom(prev[field] as boolean | 0 | 1),
          }
        : prev,
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!quizId || !form) return;
    setIsSaving(true);
    setStatus(null);
    setError(null);
    try {
      const payload: QuizPayload = {
        quiz_title: form.quiz_title,
        class_title: form.class_title,
        institution_name: form.institution_name,
        student_instructions: form.student_instructions,
        coding_explanation: form.coding_explanation,
        email_subject: form.email_subject,
        email_body: form.email_body,
        id_coding: form.id_coding,
        date_of_quiz: form.date_of_quiz,
        duration: form.duration,
        quiz_language: form.quiz_language,
        random_question_order: booleanFrom(form.random_question_order) ? 1 : 0,
        random_answer_order: booleanFrom(form.random_answer_order) ? 1 : 0,
        two_up_printing: booleanFrom(form.two_up_printing) ? 1 : 0,
      } as QuizPayload;

      const response = await apiFetch<UpdateResponse>(`/quizzes/${quizId}`, {
        method: "PUT",
        json: payload,
      });
      setForm(response.quiz);
      setQuiz(response.quiz);
      setStatus("Paramètres enregistrés.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "La mise à jour du quiz a échoué."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleLockToggle = async () => {
    if (!quizId || !quiz) return;
    setIsLocking(true);
    setStatus(null);
    setError(null);
    try {
      const endpoint = quiz.quiz_state === "locked" ? "unlock" : "lock";
      const response = await apiFetch<LockResponse>(`/quizzes/${quizId}/${endpoint}`, {
        method: "POST",
      });
      setQuiz(response.quiz);
      setForm(response.quiz);
      setStatus(response.message || "État du quiz mis à jour.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible de modifier l'état du quiz."
      );
    } finally {
      setIsLocking(false);
    }
  };

  const isLocked = useMemo(() => booleanFrom(quiz?.quiz_state === "locked"), [quiz]);

  if (isLoading || !form) {
    return (
      <div className="quiz-generalities__loading">
        <p>Chargement des informations du quiz…</p>
      </div>
    );
  }

  return (
    <div className="quiz-generalities">
      <header className="quiz-generalities__header">
        <div>
          <span className="quiz-generalities__eyebrow">Quiz AMC</span>
          <h1>{form.quiz_title || "Sans titre"}</h1>
          <p>
            Générez vos sujets, configurez les paramètres par défaut et verrouillez le quiz une fois la
            compilation finalisée.
          </p>
        </div>
        <div className="quiz-generalities__header-actions">
          <LinkCTA href="/dashboard" variant="ghost">
            Retour
          </LinkCTA>
          <button
            className={`quiz-generalities__lock ${isLocked ? "quiz-generalities__lock--locked" : ""}`}
            onClick={handleLockToggle}
            disabled={isLocking}
          >
            {isLocking
              ? "Mise à jour…"
              : isLocked
              ? "Déverrouiller le quiz"
              : "Verrouiller le quiz"}
          </button>
        </div>
      </header>

      <nav className="quiz-generalities__tabs" aria-label="Navigation des sections du quiz">
        <span className="quiz-generalities__tab quiz-generalities__tab--active">Généralités</span>
        <span className="quiz-generalities__tab">Questions</span>
        <span className="quiz-generalities__tab">Compilation</span>
        <span className="quiz-generalities__tab">Analyse</span>
        <span className="quiz-generalities__tab">Emails</span>
      </nav>

      {status && <div className="quiz-generalities__notice quiz-generalities__notice--success">{status}</div>}
      {error && <div className="quiz-generalities__notice quiz-generalities__notice--error">{error}</div>}

      <main className="quiz-generalities__layout">
        <section className="quiz-generalities__panel">
          <h2>Informations principales</h2>
          <form className="quiz-generalities__form" onSubmit={handleSubmit}>
            <label>
              Titre du quiz
              <input
                type="text"
                value={form.quiz_title || ""}
                onChange={(event) => handleChange("quiz_title", event.target.value)}
              />
            </label>
            <label>
              Classe associée
              <input
                type="text"
                value={form.class_title || ""}
                onChange={(event) => handleChange("class_title", event.target.value)}
              />
            </label>
            <div className="quiz-generalities__grid">
              <label>
                Date du quiz
                <input
                  type="date"
                  value={form.date_of_quiz || ""}
                  onChange={(event) => handleChange("date_of_quiz", event.target.value)}
                />
              </label>
              <label>
                Durée
                <input
                  type="text"
                  placeholder="Ex: 2h00"
                  value={form.duration || ""}
                  onChange={(event) => handleChange("duration", event.target.value)}
                />
              </label>
              <label>
                Langue du quiz
                <select
                  value={form.quiz_language || "fr"}
                  onChange={(event) => handleChange("quiz_language", event.target.value)}
                >
                  <option value="fr">Français</option>
                  <option value="en">Anglais</option>
                </select>
              </label>
              <label>
                Codage des copies
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={form.id_coding || "8"}
                  onChange={(event) => handleChange("id_coding", event.target.value)}
                />
              </label>
            </div>

            <label>
              Instructions aux étudiants
              <textarea
                rows={4}
                value={form.student_instructions || ""}
                onChange={(event) => handleChange("student_instructions", event.target.value)}
              />
            </label>

            <label>
              Explication du codage
              <textarea
                rows={3}
                value={form.coding_explanation || ""}
                onChange={(event) => handleChange("coding_explanation", event.target.value)}
              />
            </label>

            <fieldset className="quiz-generalities__toggles">
              <legend>Aléatoire</legend>
              <label className="quiz-generalities__switch">
                <input
                  type="checkbox"
                  checked={booleanFrom(form.random_question_order)}
                  onChange={() => handleToggle("random_question_order")}
                />
                <span>Aléatoire des questions</span>
              </label>
              <label className="quiz-generalities__switch">
                <input
                  type="checkbox"
                  checked={booleanFrom(form.random_answer_order)}
                  onChange={() => handleToggle("random_answer_order")}
                />
                <span>Aléatoire des réponses</span>
              </label>
              <label className="quiz-generalities__switch">
                <input
                  type="checkbox"
                  checked={booleanFrom(form.two_up_printing)}
                  onChange={() => handleToggle("two_up_printing")}
                />
                <span>Impression 2 pages par feuille</span>
              </label>
            </fieldset>

            <div className="quiz-generalities__actions">
              <button className="quiz-generalities__submit" type="submit" disabled={isSaving}>
                {isSaving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </form>
        </section>

        <aside className="quiz-generalities__aside">
          <section className="quiz-generalities__panel">
            <h3>Résumé</h3>
            <dl className="quiz-generalities__summary">
              <div>
                <dt>État</dt>
                <dd>{quiz?.quiz_state === "locked" ? "Verrouillé" : "Ouvert"}</dd>
              </div>
              <div>
                <dt>Date de création</dt>
                <dd>{formatDateTime(quiz?.creation_date)}</dd>
              </div>
              <div>
                <dt>Nombre de questions</dt>
                <dd>{quiz?.number_of_questions ?? 0}</dd>
              </div>
              <div>
                <dt>Classe associée</dt>
                <dd>{quiz?.class_title || "—"}</dd>
              </div>
            </dl>
          </section>

          <section className="quiz-generalities__panel">
            <h3>Emails de résultats</h3>
            <label>
              Sujet
              <input
                type="text"
                value={form.email_subject || ""}
                onChange={(event) => handleChange("email_subject", event.target.value)}
              />
            </label>
            <label>
              Corps du message
              <textarea
                rows={4}
                value={form.email_body || ""}
                onChange={(event) => handleChange("email_body", event.target.value)}
              />
            </label>
            <p className="quiz-generalities__hint">
              Placeholders disponibles : {"{"}prenom{"}"}, {"{"}nom{"}"}, {"{"}grade{"}"}, {"{"}quiz_title{"}"}
            </p>
          </section>
        </aside>
      </main>
    </div>
  );
};
