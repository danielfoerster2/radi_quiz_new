import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../services/api";
import { LinkCTA } from "../components/LinkCTA";
import "./DashboardPage.css";

type QuizSummary = {
  quiz_uuid: string;
  quiz_title: string;
  quiz_state: "locked" | "unlocked" | string;
  creation_date?: string;
  number_of_questions?: number;
};

type QuizResponse = {
  quizzes: QuizSummary[];
};

type CreateQuizResponse = {
  quiz: QuizSummary;
};

const formatDate = (value?: string) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }
  return parsed.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const DashboardPage = () => {
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const loadQuizzes = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<QuizResponse>("/quizzes", {
        method: "GET",
      });
      setQuizzes(data.quizzes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les quiz.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadQuizzes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateQuiz = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const payload = await apiFetch<CreateQuizResponse>("/quizzes", {
        method: "POST",
        json: {
          quiz_title: "Nouveau quiz",
        },
      });
      setQuizzes((prev) => [payload.quiz, ...prev]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "La création du quiz a échoué. Réessayez plus tard.",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const unlockedCount = useMemo(
    () => quizzes.filter((quiz) => quiz.quiz_state !== "locked").length,
    [quizzes],
  );
  const lockedCount = useMemo(
    () => quizzes.filter((quiz) => quiz.quiz_state === "locked").length,
    [quizzes],
  );

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div>
          <h1>Tableau de bord</h1>
          <p>Surveillez vos quiz AMC, vos classes et vos actions récentes.</p>
        </div>
        <div className="dashboard__header-actions">
          <LinkCTA href="/classes" variant="ghost">
            Gérer les classes
          </LinkCTA>
          <button
            className="dashboard__primary-button"
            onClick={handleCreateQuiz}
            disabled={isCreating}
          >
            {isCreating ? "Création en cours…" : "Créer un nouveau quiz"}
          </button>
        </div>
      </header>

      {error && <div className="dashboard__alert">{error}</div>}

      <section className="dashboard__stats">
        <div className="dashboard__stat-card">
          <span className="dashboard__stat-label">Quiz actifs</span>
          <strong>{unlockedCount}</strong>
          <span className="dashboard__stat-helper">Prêts pour la prochaine session</span>
        </div>
        <div className="dashboard__stat-card">
          <span className="dashboard__stat-label">Quiz verrouillés</span>
          <strong>{lockedCount}</strong>
          <span className="dashboard__stat-helper">Sécurisés après compilation</span>
        </div>
        <div className="dashboard__stat-card">
          <span className="dashboard__stat-label">Total</span>
          <strong>{quizzes.length}</strong>
          <span className="dashboard__stat-helper">Tous les quiz créés</span>
        </div>
      </section>

      <main className="dashboard__content">
        <section className="dashboard__panel">
          <div className="dashboard__panel-header">
            <h2>Vos quiz récents</h2>
            <button className="dashboard__link" onClick={loadQuizzes} disabled={isLoading}>
              Rafraîchir
            </button>
          </div>
          {isLoading ? (
            <div className="dashboard__placeholder">Chargement des quiz…</div>
          ) : quizzes.length === 0 ? (
            <div className="dashboard__placeholder">
              <p>Aucun quiz pour le moment.</p>
              <p>Créez un premier quiz ou importez vos sujets existants.</p>
            </div>
          ) : (
            <table className="dashboard__table">
              <thead>
                <tr>
                  <th>Titre</th>
                  <th>État</th>
                  <th>Questions</th>
                  <th>Création</th>
                </tr>
              </thead>
              <tbody>
                {quizzes.map((quiz) => (
                  <tr key={quiz.quiz_uuid}>
                    <td>
                      <a className="dashboard__table-link" href={`/quizzes/${quiz.quiz_uuid}`}>
                        {quiz.quiz_title || "Sans titre"}
                      </a>
                    </td>
                    <td>
                      <span
                        className={`dashboard__badge dashboard__badge--${
                          quiz.quiz_state === "locked" ? "locked" : "active"
                        }`}
                      >
                        {quiz.quiz_state === "locked" ? "Verrouillé" : "Ouvert"}
                      </span>
                    </td>
                    <td>{quiz.number_of_questions ?? 0}</td>
                    <td>{formatDate(quiz.creation_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <aside className="dashboard__sidebar">
          <section className="dashboard__panel">
            <h3>Actions rapides</h3>
            <ul className="dashboard__quick-actions">
              <li>
                <LinkCTA href="/quizzes" variant="ghost">
                  Voir tous les quiz
                </LinkCTA>
              </li>
              <li>
                <LinkCTA href="/quizzes/import" variant="ghost">
                  Importer des sujets AMC
                </LinkCTA>
              </li>
              <li>
                <LinkCTA href="/analysis" variant="ghost">
                  Lancer l'analyse des copies
                </LinkCTA>
              </li>
            </ul>
          </section>

          <section className="dashboard__panel">
            <h3>Support et ressources</h3>
            <ul className="dashboard__resource-list">
              <li>
                <a href="mailto:support@radiquiz.app">Contacter le support</a>
              </li>
              <li>
                <a href="https://radiquiz.app/guide" target="_blank" rel="noreferrer">
                  Guide d'utilisation AMC
                </a>
              </li>
              <li>
                <a href="/emails/preview">Prévisualiser les e-mails de résultats</a>
              </li>
            </ul>
          </section>
        </aside>
      </main>
    </div>
  );
};
