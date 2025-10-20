import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "../App";
import { parseJson } from "../utils/api";
import QuestionsTab from "./QuizQuestionsTab";
import "./QuizPage.css";

type Quiz = {
  quiz_uuid: string;
  quiz_title: string;
  creation_date: string;
  quiz_state: string;
  id_coding: string | number | null;
  number_of_questions: number;
  institution_name: string;
  student_instructions: string;
  coding_explanation: string;
  email_subject: string;
  email_body: string;
  class_title: string;
  date_of_quiz: string;
  duration: string;
  quiz_language: string;
  random_question_order: boolean;
  random_answer_order: boolean;
  two_up_printing: boolean;
};

type QuizPageProps = {
  user: User;
  quizUuid: string;
  onBack: () => void;
  onLogout: () => void;
  onNavigateSettings: () => void;
  onNavigateHelp: () => void;
};

type QuizForm = {
  quiz_title: string;
  institution_name: string;
  class_title: string;
  date_of_quiz: string;
  duration: string;
  student_instructions: string;
  quiz_language: string;
  id_coding_enabled: boolean;
  id_coding_digits: string;
  coding_explanation: string;
  random_question_order: boolean;
  random_answer_order: boolean;
  two_up_printing: boolean;
};

type ClassOption = {
  list_uuid: string;
  class_title: string;
};

type QuizTab = "generalities" | "questions" | "subject" | "evaluation";

const languages = [
  { value: "fr", label: "Français" },
  { value: "en", label: "Anglais" },
];

const QuizPage = ({
  user,
  quizUuid,
  onBack,
  onLogout,
  onNavigateSettings,
  onNavigateHelp,
}: QuizPageProps) => {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [form, setForm] = useState<QuizForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [activeTab, setActiveTab] = useState<QuizTab>("generalities");

  const isLocked = quiz?.quiz_state === "locked";

  const loadQuiz = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/quizzes/${quizUuid}`, { credentials: "include" });
      if (!response.ok) {
        const data = await parseJson<{ error?: string }>(response);
        throw new Error(data?.error ?? "Impossible de charger le quiz.");
      }
      const data = await parseJson<{ quiz?: Quiz }>(response);
      if (!data?.quiz) {
        throw new Error("Quiz introuvable.");
      }
      const quizData: Quiz = {
        ...data.quiz,
        random_question_order: Boolean(data.quiz.random_question_order),
        random_answer_order: Boolean(data.quiz.random_answer_order),
        two_up_printing: Boolean(data.quiz.two_up_printing),
      };
      setQuiz(quizData);
      setForm({
        quiz_title: quizData.quiz_title || "",
        institution_name: quizData.institution_name || "",
        class_title: quizData.class_title || "",
        date_of_quiz: quizData.date_of_quiz ? quizData.date_of_quiz.slice(0, 10) : "",
        duration: quizData.duration || "",
        student_instructions: quizData.student_instructions || "",
        quiz_language: quizData.quiz_language || "fr",
        id_coding_enabled: quizData.id_coding !== null && quizData.id_coding !== undefined && String(quizData.id_coding) !== "-1",
        id_coding_digits:
          quizData.id_coding !== null && quizData.id_coding !== undefined && String(quizData.id_coding) !== "-1"
            ? String(quizData.id_coding)
            : "8",
        coding_explanation: quizData.coding_explanation || "",
        random_question_order: quizData.random_question_order,
        random_answer_order: quizData.random_answer_order,
        two_up_printing: quizData.two_up_printing,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [quizUuid]);

  const loadClasses = useCallback(async () => {
    try {
      const response = await fetch("/classes", { credentials: "include" });
      if (!response.ok) {
        return;
      }
      const data = await parseJson<{ classes?: any[] }>(response);
      const options = data?.classes?.map((item) => ({
        list_uuid: item.list_uuid,
        class_title: item.class_title,
      }));
      if (options) {
        setClasses(options);
      }
    } catch (err) {
      console.warn("Unable to load classes", err);
    }
  }, []);

  useEffect(() => {
    void loadQuiz();
    void loadClasses();
  }, [loadQuiz, loadClasses]);

  const handleFieldChange = (key: keyof QuizForm) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => (prev ? { ...prev, [key]: event.target.value } : prev));
  };

  const handleToggleChange = (key: keyof QuizForm) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => (prev ? { ...prev, [key]: event.target.checked } : prev));
  };

  const handleIdCodingToggle = (event: ChangeEvent<HTMLInputElement>) => {
    const enabled = event.target.checked;
    setForm((prev) =>
      prev
        ? {
            ...prev,
            id_coding_enabled: enabled,
            id_coding_digits: enabled ? prev.id_coding_digits || "8" : prev.id_coding_digits,
          }
        : prev
    );
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;
    if (form.id_coding_enabled && (!form.id_coding_digits || Number.isNaN(Number(form.id_coding_digits)))) {
      setError("Indiquez le nombre de chiffres pour le codage des copies.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        quiz_title: form.quiz_title.trim() || "",
        institution_name: form.institution_name.trim(),
        class_title: form.class_title.trim(),
        date_of_quiz: form.date_of_quiz || "",
        duration: form.duration.trim(),
        student_instructions: form.student_instructions,
        quiz_language: form.quiz_language,
        id_coding: form.id_coding_enabled ? String(Number(form.id_coding_digits) || 8) : "-1",
        coding_explanation: form.id_coding_enabled ? form.coding_explanation : "",
        random_question_order: form.random_question_order,
        random_answer_order: form.random_answer_order,
        two_up_printing: form.two_up_printing,
      };
      const response = await fetch(`/quizzes/${quizUuid}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await parseJson<{ quiz?: Quiz; error?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.error ?? "Impossible d'enregistrer les modifications.");
      }
      if (data?.quiz) {
        const updatedQuiz: Quiz = {
          ...data.quiz,
          random_question_order: Boolean(data.quiz.random_question_order),
          random_answer_order: Boolean(data.quiz.random_answer_order),
          two_up_printing: Boolean(data.quiz.two_up_printing),
        };
        setQuiz(updatedQuiz);
        setForm((prev) =>
          prev
            ? {
                ...prev,
                id_coding_digits:
                  updatedQuiz.id_coding !== null && updatedQuiz.id_coding !== undefined && String(updatedQuiz.id_coding) !== "-1"
                    ? String(updatedQuiz.id_coding)
                    : prev.id_coding_digits,
              }
            : prev
        );
      }
      setMessage("Modifications enregistrées.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const headerBadge = useMemo(() => {
    if (!quiz) return null;
    return quiz.quiz_state === "locked" ? <span className="app-badge app-badge--danger">Verrouillé</span> : <span className="app-badge app-badge--success">En édition</span>;
  }, [quiz]);

  const tabDescription = useMemo(() => {
    if (activeTab === "generalities") {
      return "Gérez les informations générales de votre quiz. Ces paramètres alimentent AMC et les communications envoyées aux étudiants.";
    }
    if (activeTab === "questions") {
      return "Rédigez vos questions, organisez-les par sections et préparez les réponses pour la compilation AMC.";
    }
    return "Fonctionnalité en cours de développement.";
  }, [activeTab]);

  if (loading || !form || !quiz) {
    return (
      <div className="quiz quiz--loading">
        <div className="quiz__spinner" />
        <p>Chargement du quiz…</p>
      </div>
    );
  }

  return (
    <div className="quiz app-page">
      <header className="quiz__hero app-hero">
        <div className="quiz__hero-content app-hero__content">
          <div className="quiz__hero-headline app-hero__headline">
            <span className="quiz__eyebrow app-eyebrow">Radi Quiz</span>
            <div className="quiz__title-row">
              <h1>{form.quiz_title || "Sans titre"}</h1>
              {headerBadge}
            </div>
            <p>{tabDescription}</p>
          </div>
          <div className="quiz__hero-actions app-hero__actions">
            <button className="app-button app-button--secondary" onClick={onBack}>
              Retour au tableau de bord
            </button>
            <button className="app-button app-button--secondary" onClick={onNavigateSettings}>
              Paramètres
            </button>
            <button className="app-button app-button--secondary" onClick={onNavigateHelp}>
              Centre d'aide
            </button>
            <button className="app-button app-button--secondary" onClick={onLogout}>
              Déconnexion
            </button>
          </div>
        </div>
        <nav className="quiz__tabs" aria-label="Navigation Quiz">
          <button
            type="button"
            className={`quiz__tab${activeTab === "generalities" ? " quiz__tab--active" : ""}`}
            onClick={() => setActiveTab("generalities")}
          >
            Généralités
          </button>
          <button
            type="button"
            className={`quiz__tab${activeTab === "questions" ? " quiz__tab--active" : ""}`}
            onClick={() => setActiveTab("questions")}
          >
            Questions
          </button>
          <button type="button" className="quiz__tab" disabled>
            Sujet
          </button>
          <button type="button" className="quiz__tab" disabled>
            Corriger
          </button>
        </nav>
      </header>

      <main className="quiz__main app-main">
        {activeTab === "generalities" ? (
          <section className="quiz__section app-card">
            <form className="quiz__form" onSubmit={handleSave}>
              <div className="quiz__grid">
                <label className="quiz__field">
                  <span>Titre du quiz</span>
                  <input value={form.quiz_title} onChange={handleFieldChange("quiz_title")} placeholder="Ex : Contrôle continu 2" />
                </label>
                <label className="quiz__field">
                  <span>Établissement</span>
                  <input value={form.institution_name} onChange={handleFieldChange("institution_name")} placeholder="Votre établissement" />
                </label>
              </div>

              <label className="quiz__field">
                <span>Classe / groupe</span>
                <input
                  list="quiz-class-options"
                  value={form.class_title}
                  onChange={handleFieldChange("class_title")}
                  placeholder="Ex : L3 Mathématiques"
                />
                <datalist id="quiz-class-options">
                  {classes.map((option) => (
                    <option key={option.list_uuid} value={option.class_title} />
                  ))}
                </datalist>
                <small>Sélectionnez une classe existante ou saisissez-en une nouvelle.</small>
              </label>

              <div className="quiz__grid">
                <label className="quiz__field">
                  <span>Date de l'évaluation</span>
                  <input type="date" value={form.date_of_quiz} onChange={handleFieldChange("date_of_quiz")} />
                </label>
                <label className="quiz__field">
                  <span>Durée</span>
                  <input value={form.duration} onChange={handleFieldChange("duration")} placeholder="Ex : 1h30" />
                </label>
                <label className="quiz__field">
                  <span>Langue du sujet</span>
                  <select value={form.quiz_language} onChange={handleFieldChange("quiz_language")}>
                    {languages.map((lang) => (
                      <option key={lang.value} value={lang.value}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="quiz__field">
                <span>Instructions pour les étudiants</span>
                <textarea
                  rows={5}
                  value={form.student_instructions}
                  onChange={handleFieldChange("student_instructions")}
                />
              </label>

              <fieldset className="quiz__fieldset">
                <legend>Codage des copies</legend>
                <label className="quiz__toggle">
                  <input type="checkbox" checked={form.id_coding_enabled} onChange={handleIdCodingToggle} />
                  <span>Activer le codage des identifiants</span>
                </label>
                {form.id_coding_enabled ? (
                  <div className="quiz__grid">
                    <label className="quiz__field">
                      <span>Nombre de chiffres</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={form.id_coding_digits}
                        onChange={handleFieldChange("id_coding_digits")}
                      />
                    </label>
                    <label className="quiz__field quiz__field--wide">
                      <span>Instructions de codage</span>
                      <textarea
                        rows={3}
                        value={form.coding_explanation}
                        onChange={handleFieldChange("coding_explanation")}
                        placeholder="Expliquer aux étudiants comment remplir la grille."
                      />
                    </label>
                  </div>
                ) : (
                  <p className="quiz__hint">Le codage est désactivé. Les étudiants écriront uniquement leur nom sur la copie.</p>
                )}
              </fieldset>

              <fieldset className="quiz__fieldset quiz__fieldset--inline">
                <legend>Compilation</legend>
                <label className="quiz__toggle">
                  <input
                    type="checkbox"
                    checked={form.random_question_order}
                    onChange={handleToggleChange("random_question_order")}
                  />
                  <span>Randomiser l'ordre des questions lors de la compilation</span>
                </label>
                <label className="quiz__toggle">
                  <input
                    type="checkbox"
                    checked={form.random_answer_order}
                    onChange={handleToggleChange("random_answer_order")}
                  />
                  <span>Randomiser l'ordre des réponses</span>
                </label>
                <label className="quiz__toggle">
                  <input
                    type="checkbox"
                    checked={form.two_up_printing}
                    onChange={handleToggleChange("two_up_printing")}
                  />
                  <span>Impression deux pages par feuille (2-up)</span>
                </label>
              </fieldset>

              <div className="quiz__summary">
                <div>
                  <span className="quiz__summary-label">Questions</span>
                  <span className="quiz__summary-value">{quiz.number_of_questions}</span>
                </div>
                <div>
                  <span className="quiz__summary-label">Créé le</span>
                  <span className="quiz__summary-value">{new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(new Date(quiz.creation_date))}</span>
                </div>
              </div>

              <div className="quiz__actions">
                <button className="app-button app-button--primary" type="submit" disabled={saving}>
                  Enregistrer
                </button>
              </div>
              {message ? <div className="app-status">{message}</div> : null}
              {error ? <div className="app-error">{error}</div> : null}
              {isLocked ? (
                <div className="app-warning">
                  Le quiz est verrouillé. Certaines actions (ajout de questions, compilation) sont limitées tant qu'il n'est pas déverrouillé.
                </div>
              ) : null}
            </form>
          </section>
        ) : null}
        {activeTab === "questions" ? (
          <QuestionsTab
            quizUuid={quizUuid}
            userUuid={user.user_uuid}
            isLocked={isLocked}
            onQuizUpdated={loadQuiz}
          />
        ) : null}
      </main>
    </div>
  );
};

export default QuizPage;
