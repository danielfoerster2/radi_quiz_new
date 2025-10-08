import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../services/api";
import { LinkCTA } from "../components/LinkCTA";
import { QuizTabs } from "../components/QuizTabs";
import "./QuizCompilationPage.css";

type QuizResponse = {
  quiz: {
    quiz_uuid: string;
    quiz_title: string;
    quiz_state: string;
    number_of_questions?: number;
    random_question_order?: boolean | 0 | 1;
    random_answer_order?: boolean | 0 | 1;
    two_up_printing?: boolean | 0 | 1;
  };
};

type AIReview = {
  grammar?: string;
  facts?: string;
  latex?: string;
};

const toBool = (value: boolean | 0 | 1 | undefined): boolean => {
  if (value === undefined) return false;
  if (typeof value === "boolean") return value;
  return value === 1;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export const QuizCompilationPage = () => {
  const { quizId } = useParams<{ quizId: string }>();
  const [quiz, setQuiz] = useState<QuizResponse["quiz"] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isGeneratingLatex, setIsGeneratingLatex] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [studentCopies, setStudentCopies] = useState<number>(30);
  const [aiReview, setAiReview] = useState<AIReview | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const [randomQuestionOrder, setRandomQuestionOrder] = useState(false);
  const [randomAnswerOrder, setRandomAnswerOrder] = useState(false);
  const [twoUpPrinting, setTwoUpPrinting] = useState(false);

  const questionCount = useMemo(() => quiz?.number_of_questions ?? 0, [quiz]);

  const loadQuiz = async () => {
    if (!quizId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<QuizResponse>(`/quizzes/${quizId}`, { method: "GET" });
      setQuiz(data.quiz);
      setRandomQuestionOrder(toBool(data.quiz.random_question_order));
      setRandomAnswerOrder(toBool(data.quiz.random_answer_order));
      setTwoUpPrinting(toBool(data.quiz.two_up_printing));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de récupérer les informations du quiz."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadQuiz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  const appendEvent = (message: string) => {
    setEvents((prev) => [message, ...prev].slice(0, 10));
  };

  const handlePrepareSession = async () => {
    if (!quizId) return;
    setIsPreparing(true);
    setStatus(null);
    setError(null);
    try {
      await apiFetch(`/quizzes/${quizId}/amc/session`, { method: "POST" });
      appendEvent("Session AMC prête.");
      setStatus("Session AMC initialisée.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "La préparation a échoué.");
    } finally {
      setIsPreparing(false);
    }
  };

  const handleGenerateLatex = async () => {
    if (!quizId) return;
    setIsGeneratingLatex(true);
    setStatus(null);
    setError(null);
    try {
      await apiFetch(`/quizzes/${quizId}/amc/latex`, { method: "POST" });
      appendEvent("sujet.tex généré.");
      setStatus("Fichier LaTeX généré.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "La génération du LaTeX a échoué.");
    } finally {
      setIsGeneratingLatex(false);
    }
  };

  const handleDownload = async (endpoint: string, filename: string) => {
    if (!quizId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/quizzes/${quizId}${endpoint}`, {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Téléchargement impossible.");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Le téléchargement a échoué.");
    }
  };

  const handleVerify = async () => {
    if (!quizId) return;
    setVerifyLoading(true);
    setStatus(null);
    setError(null);
    try {
      const response = await apiFetch<{ results: AIReview }>(
        `/quizzes/${quizId}/ai/verify-subject`,
        { method: "POST" },
      );
      setAiReview(response.results);
      appendEvent("Analyse IA terminée.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "La vérification IA a échoué.");
    } finally {
      setVerifyLoading(false);
    }
  };

  const persistCompileOptions = async () => {
    if (!quizId) return;
    await apiFetch(`/quizzes/${quizId}`, {
      method: "PUT",
      json: {
        random_question_order: randomQuestionOrder ? 1 : 0,
        random_answer_order: randomAnswerOrder ? 1 : 0,
        two_up_printing: twoUpPrinting ? 1 : 0,
      },
    });
  };

  const handleCompile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!quizId) return;
    setIsCompiling(true);
    setStatus(null);
    setError(null);
    try {
      await persistCompileOptions();
      await apiFetch(`/quizzes/${quizId}/amc/compile`, {
        method: "POST",
      });
      appendEvent("Compilation AMC terminée.");
      setStatus("Compilation réussie. Les exports sont prêts.");
      const updatedQuiz = await apiFetch<QuizResponse>(`/quizzes/${quizId}`, {
        method: "GET",
      });
      setQuiz(updatedQuiz.quiz);
    } catch (err) {
      setError(err instanceof Error ? err.message : "La compilation a échoué.");
    } finally {
      setIsCompiling(false);
    }
  };

  if (isLoading || !quiz) {
    return (
      <div className="quiz-compilation__loading">
        <p>Chargement…</p>
      </div>
    );
  }

  const isLocked = quiz.quiz_state === "locked";
  const hasQuestions = questionCount > 0;

  return (
    <div className="quiz-compilation">
      <header className="quiz-compilation__header">
        <div>
          <span className="quiz-compilation__eyebrow">Quiz AMC</span>
          <h1>Compilation & exports</h1>
          <p>
            Préparez la session AMC, générez le LaTeX, vérifiez-le avec l'IA et produisez les PDF sujets et
            corrigés.
          </p>
        </div>
        <LinkCTA href="/dashboard" variant="ghost">
          Retour
        </LinkCTA>
      </header>

      <QuizTabs active="compile" />

      {status && <div className="quiz-compilation__notice quiz-compilation__notice--success">{status}</div>}
      {error && <div className="quiz-compilation__notice quiz-compilation__notice--error">{error}</div>}

      <main className="quiz-compilation__layout">
        <section className="quiz-compilation__panel">
          <h2>Préparation</h2>
          <p>Assurez-vous que la session AMC est prête avant de générer le LaTeX.</p>
          <button
            className="quiz-compilation__button"
            onClick={handlePrepareSession}
            disabled={isPreparing || !hasQuestions}
          >
            {isPreparing ? "Préparation…" : "Préparer la session AMC"}
          </button>
          <p className="quiz-compilation__hint">
            {hasQuestions
              ? "Une session AMC est nécessaire pour lancer les commandes prepare et compile."
              : "Ajoutez au moins une question avant de préparer la session."}
          </p>
        </section>

        <section className="quiz-compilation__panel">
          <h2>Génération LaTeX</h2>
          <div className="quiz-compilation__actions">
            <button
              className="quiz-compilation__button"
              onClick={handleGenerateLatex}
              disabled={isGeneratingLatex || !hasQuestions}
            >
              {isGeneratingLatex ? "Génération…" : "Générer sujet.tex"}
            </button>
            <button
              className="quiz-compilation__button quiz-compilation__button--ghost"
              onClick={() => handleDownload("/amc/latex", "sujet.tex")}
              disabled={!hasQuestions}
            >
              Télécharger sujet.tex
            </button>
          </div>
          <button
            className="quiz-compilation__button quiz-compilation__button--ghost"
            onClick={handleVerify}
            disabled={verifyLoading || !hasQuestions}
          >
            {verifyLoading ? "Analyse IA…" : "Vérifier avec l'IA"}
          </button>
          {aiReview && (
            <div className="quiz-compilation__ai">
              <h3>Résultats IA</h3>
              <div className="quiz-compilation__ai-grid">
                <article>
                  <h4>Orthographe & style</h4>
                  <pre>{aiReview.grammar || "Aucun retour."}</pre>
                </article>
                <article>
                  <h4>Exactitude factuelle</h4>
                  <pre>{aiReview.facts || "Aucun retour."}</pre>
                </article>
                <article>
                  <h4>LaTeX & AMC</h4>
                  <pre>{aiReview.latex || "Aucun retour."}</pre>
                </article>
              </div>
            </div>
          )}
        </section>

        <section className="quiz-compilation__panel">
          <h2>Compilation & exports PDF</h2>
          <form className="quiz-compilation__form" onSubmit={handleCompile}>
            <label>
              Nombre d'exemplaires à préparer (indicatif)
              <input
                type="number"
                min={1}
                value={studentCopies}
                onChange={(event) => setStudentCopies(Number(event.target.value))}
              />
            </label>
            <label className="quiz-compilation__switch">
              <input
                type="checkbox"
                checked={randomQuestionOrder}
                onChange={(event) => setRandomQuestionOrder(event.target.checked)}
              />
              Aléatoire des questions
            </label>
            <label className="quiz-compilation__switch">
              <input
                type="checkbox"
                checked={randomAnswerOrder}
                onChange={(event) => setRandomAnswerOrder(event.target.checked)}
              />
              Aléatoire des réponses
            </label>
            <label className="quiz-compilation__switch">
              <input
                type="checkbox"
                checked={twoUpPrinting}
                onChange={(event) => setTwoUpPrinting(event.target.checked)}
              />
              Impression 2 pages par feuille
            </label>
            <button className="quiz-compilation__button" type="submit" disabled={isCompiling || !hasQuestions}>
              {isCompiling ? "Compilation…" : "Lancer la compilation"}
            </button>
          </form>
          <div className="quiz-compilation__actions">
            <button
              className="quiz-compilation__button quiz-compilation__button--ghost"
              onClick={() => handleDownload("/amc/exports/sujet.pdf", "sujet.pdf")}
            >
              Télécharger sujet.pdf
            </button>
            <button
              className="quiz-compilation__button quiz-compilation__button--ghost"
              onClick={() => handleDownload("/amc/exports/reponses.pdf", "reponses.pdf")}
            >
              Télécharger corrigé.pdf
            </button>
          </div>
        </section>

        <aside className="quiz-compilation__panel quiz-compilation__log">
          <h2>Journal</h2>
          <ol>
            {events.length === 0 ? (
              <li>Aucun événement enregistré pour le moment.</li>
            ) : (
              events.map((event, index) => <li key={index}>{event}</li>)
            )}
          </ol>
        </aside>
      </main>

      <footer className="quiz-compilation__footer">
        <p>
          Quiz {quiz.quiz_title || "(sans titre)"} – {questionCount} question(s) – État : {" "}
          {isLocked ? "Verrouillé" : "Ouvert"}
        </p>
      </footer>
    </div>
  );
};
