import { useCallback, useEffect, useState } from "react";
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
  onNavigateHelp: () => void;
  onOpenQuiz: (quizUuid: string) => void;
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

const DashboardPage = ({ user, onLogout, onNavigateSettings, onNavigateHelp, onOpenQuiz }: DashboardPageProps) => {
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
      const created = data?.quiz;
      const quizTitle = created?.quiz_title ?? "Nouveau quiz";
      setStatusMessage(`Quiz « ${quizTitle} » créé.`);
      if (created) {
        onOpenQuiz(created.quiz_uuid);
      }
    });
  }, [runAction, onOpenQuiz]);

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
    <div className="dashboard app-page">
      <header className="app-hero">
        <div className="app-hero__content">
          <div className="app-hero__headline">
            <span className="app-eyebrow">Radi Quiz</span>
            <h1>Bienvenue, {user.email}</h1>
            <p>
              Créez, dupliquez et suivez vos sujets AMC depuis un seul espace. Tous vos quizzes et ressources restent
              chiffrés tant que vous êtes déconnecté.
            </p>
          </div>
          <div className="app-hero__actions">
            <button className="app-button app-button--primary" onClick={handleCreateQuiz} disabled={actionBusy}>
              Nouveau quiz
            </button>
            <button className="app-button app-button--secondary" onClick={onNavigateHelp}>
              Centre d'aide
            </button>
            <button className="app-button app-button--secondary" onClick={onNavigateSettings}>
              Paramètres
            </button>
            <button className="app-button app-button--secondary" onClick={onLogout}>
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        {statusMessage ? <div className="app-status">{statusMessage}</div> : null}
        {errorMessage ? <div className="app-error">{errorMessage}</div> : null}

        <section className="dashboard__quizzes app-card" aria-live="polite">
          <div className="dashboard__quizzes-header app-toolbar">
            <h2 className="app-section-title">Vos quizzes</h2>
            <button onClick={loadQuizzes} className="app-button app-button--secondary" disabled={loading || actionBusy}>
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
                    <div className="dashboard__item-header">
                      <div>
                        <h3>{quiz.quiz_title || "Sans titre"}</h3>
                        <p className="dashboard__item-subtitle">
                          Créé le {formatDate(quiz.creation_date)} · {quiz.number_of_questions} question
                          {quiz.number_of_questions > 1 ? "s" : ""}
                        </p>
                      </div>
                      <span className={`app-badge ${isLocked ? "app-badge--danger" : "app-badge--success"}`}>
                        {isLocked ? "Verrouillé" : "En édition"}
                      </span>
                    </div>
                    <div className="dashboard__actions">
                      <button
                        className="app-button app-button--ghost"
                        onClick={() => onOpenQuiz(quiz.quiz_uuid)}
                        disabled={actionBusy}
                      >
                        Ouvrir
                      </button>
                      <button
                        className="app-button app-button--ghost"
                        onClick={() => handleDuplicateQuiz(quiz)}
                        disabled={actionBusy}
                      >
                        Dupliquer
                      </button>
                      <button
                        className="app-button app-button--ghost"
                        onClick={() => handleDeleteQuiz(quiz)}
                        disabled={actionBusy}
                      >
                        Supprimer
                      </button>
                      {isLocked ? (
                        <button
                          className="app-button app-button--ghost"
                          onClick={() => handleUnlockQuiz(quiz)}
                          disabled={actionBusy}
                        >
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
