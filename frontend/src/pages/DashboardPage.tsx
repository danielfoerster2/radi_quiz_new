import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "../App";
import { parseJson } from "../utils/api";
import "./DashboardPage.css";

type Quiz = {
  quiz_uuid: string;
  quiz_title: string;
  creation_date: string;
  quiz_state: string;
  number_of_questions: number;
};

type DashboardPageProps = {
  user: User;
  onLogout: () => void;
  onNavigateSettings: () => void;
};

const formatDate = (iso: string | null | undefined) => {
  if (!iso) {
    return "—";
  }
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const DashboardPage = ({ user, onLogout, onNavigateSettings }: DashboardPageProps) => {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadQuizzes = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/quizzes", {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Impossible de récupérer les quizzes.");
      }
      const data = await parseJson<{ quizzes?: Quiz[] }>(response);
      setQuizzes(data?.quizzes || []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQuizzes();
  }, [loadQuizzes]);

  const runAction = useCallback(
    async (fn: () => Promise<void>) => {
      setActionBusy(true);
      setStatusMessage(null);
      setErrorMessage(null);
      try {
        await fn();
        await loadQuizzes();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setActionBusy(false);
      }
    },
    [loadQuizzes]
  );

  const handleCreateQuiz = useCallback(() => {
    runAction(async () => {
      const response = await fetch("/quizzes", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        throw new Error("La création du quiz a échoué.");
      }
      const data = await parseJson<{ quiz?: Quiz }>(response);
      const quizTitle = data?.quiz?.quiz_title ?? "Nouveau quiz";
      setStatusMessage(`Quiz « ${quizTitle} » créé.`);
    });
  }, [runAction]);

  const handleDuplicateQuiz = useCallback(
    (quiz: Quiz) => {
      const suggestion = `${quiz.quiz_title || "Quiz"} (copie)`;
      const requestedTitle = window.prompt("Titre du quiz dupliqué :", suggestion);
      if (requestedTitle === null) {
        return;
      }
      const title = requestedTitle.trim();
      runAction(async () => {
        const response = await fetch(`/quizzes/${quiz.quiz_uuid}/duplicate`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ quiz_title: title }),
        });
        if (!response.ok) {
          throw new Error("La duplication a échoué.");
        }
        await parseJson(response);
        setStatusMessage(`Quiz copié sous le nom « ${title || suggestion} ».`);
      });
    },
    [runAction]
  );

  const handleDeleteQuiz = useCallback(
    (quiz: Quiz) => {
      const confirmed = window.confirm(
        `Supprimer définitivement « ${quiz.quiz_title || "Quiz"} » ? Cette action est irréversible.`
      );
      if (!confirmed) {
        return;
      }
      runAction(async () => {
        const response = await fetch(`/quizzes/${quiz.quiz_uuid}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("La suppression a échoué.");
        }
        await parseJson(response);
        setStatusMessage(`Quiz « ${quiz.quiz_title || "Quiz"} » supprimé.`);
      });
    },
    [runAction]
  );

  const handleUnlockQuiz = useCallback(
    (quiz: Quiz) => {
      const confirmed = window.confirm(
        `Déverrouiller ce quiz ? Les PDF existants seront invalidés et une recompilation sera nécessaire.`
      );
      if (!confirmed) {
        return;
      }
      runAction(async () => {
        const response = await fetch(`/quizzes/${quiz.quiz_uuid}/unlock`, {
          method: "POST",
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Impossible de déverrouiller ce quiz.");
        }
        await parseJson(response);
        setStatusMessage(`Quiz « ${quiz.quiz_title || "Quiz"} » déverrouillé.`);
      });
    },
    [runAction]
  );

  const isEmpty = !loading && quizzes.length === 0;

  return (
    <div className="dashboard">
      <header className="dashboard__hero">
        <div className="dashboard__hero-content">
          <div className="dashboard__hero-headline">
            <span className="dashboard__eyebrow">Radi Quiz</span>
            <h1>Bienvenue, {user.email}</h1>
            <p>
              Créez, dupliquez et suivez vos sujets AMC depuis un seul espace. Tous vos quizzes et ressources
              restent chiffrés tant que vous êtes déconnecté.
            </p>
          </div>
          <div className="dashboard__hero-actions">
            <button className="dashboard__primary" onClick={handleCreateQuiz} disabled={actionBusy}>
              Nouveau quiz
            </button>
            <button className="dashboard__secondary" onClick={onNavigateSettings}>
              Paramètres
            </button>
            <button className="dashboard__secondary" onClick={onLogout}>
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard__main">
        {statusMessage ? <div className="dashboard__status">{statusMessage}</div> : null}
        {errorMessage ? <div className="dashboard__error">{errorMessage}</div> : null}

        <section className="dashboard__quizzes" aria-live="polite">
          <div className="dashboard__quizzes-header">
            <h2>Vos quizzes</h2>
            <button onClick={loadQuizzes} className="dashboard__refresh" disabled={loading || actionBusy}>
              Actualiser
            </button>
          </div>

          {loading ? (
            <div className="dashboard__placeholder">Chargement des quizzes…</div>
          ) : isEmpty ? (
            <div className="dashboard__placeholder">
              Aucun quiz pour le moment. Lancez-vous en créant votre premier sujet !
            </div>
          ) : (
            <ul className="dashboard__list">
              {quizzes.map((quiz) => {
                const isLocked = quiz.quiz_state === "locked";
                return (
                  <li key={quiz.quiz_uuid} className="dashboard__list-item">
                    <div className="dashboard__list-header">
                      <h3>{quiz.quiz_title || "Sans titre"}</h3>
                      <span
                        className={`dashboard__badge ${
                          isLocked ? "dashboard__badge--locked" : "dashboard__badge--unlocked"
                        }`}
                      >
                        {isLocked ? "Verrouillé" : "En édition"}
                      </span>
                    </div>
                    <dl className="dashboard__meta">
                      <div>
                        <dt>Créé le</dt>
                        <dd>{formatDate(quiz.creation_date)}</dd>
                      </div>
                      <div>
                        <dt>Questions</dt>
                        <dd>{quiz.number_of_questions}</dd>
                      </div>
                      <div>
                        <dt>Identifiant</dt>
                        <dd className="dashboard__quiz-id">{quiz.quiz_uuid}</dd>
                      </div>
                    </dl>
                    <div className="dashboard__actions">
                      <button onClick={() => handleDuplicateQuiz(quiz)} disabled={actionBusy}>
                        Dupliquer
                      </button>
                      <button onClick={() => handleDeleteQuiz(quiz)} disabled={actionBusy}>
                        Supprimer
                      </button>
                      {isLocked ? (
                        <button onClick={() => handleUnlockQuiz(quiz)} disabled={actionBusy}>
                          Déverrouiller
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
};

export default DashboardPage;
