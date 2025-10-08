import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../services/api";
import { LinkCTA } from "../components/LinkCTA";
import { QuizTabs } from "../components/QuizTabs";
import "./QuizEmailsPage.css";

type QuizResponse = {
  quiz: {
    quiz_uuid: string;
    quiz_title: string;
    email_subject: string;
    email_body: string;
  };
};

type PreviewResponse = {
  quiz_uuid: string;
  count: number;
  messages: PreviewMessage[];
};

type PreviewMessage = {
  student_id: string;
  email: string;
  subject: string;
  body: string;
  grade: string;
  attachment_path: string | null;
  attachment_exists: boolean;
};

type SendResponse = {
  sent: number;
  total: number;
  failed: Array<{ student_id: string; email: string; error: string }>;
};

type PreviewOptions = {
  student_ids: string[];
  reply_to: string;
  bcc: string[];
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export const QuizEmailsPage = () => {
  const { quizId } = useParams<{ quizId: string }>();
  const [quiz, setQuiz] = useState<QuizResponse["quiz"] | null>(null);
  const [replyTo, setReplyTo] = useState("");
  const [bcc, setBcc] = useState("");
  const [studentFilter, setStudentFilter] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const filteredMessages = useMemo(() => {
    if (!preview?.messages) return [];
    if (!studentFilter.trim()) return preview.messages;
    const term = studentFilter.trim().toLowerCase();
    return preview.messages.filter((message) =>
      message.student_id.toLowerCase().includes(term) ||
      message.email.toLowerCase().includes(term),
    );
  }, [preview?.messages, studentFilter]);

  const loadQuiz = async () => {
    if (!quizId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<QuizResponse>(`/quizzes/${quizId}`, { method: "GET" });
      setQuiz(data.quiz);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger le quiz.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadQuiz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  const handlePreview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!quizId) return;
    setPreviewLoading(true);
    setError(null);
    setStatus(null);
    try {
      const options: PreviewOptions = {
        student_ids: [],
        reply_to: replyTo.trim(),
        bcc: bcc
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      };
      const response = await apiFetch<PreviewResponse>(
        `/quizzes/${quizId}/emails/preview`,
        {
          method: "POST",
          json: options,
        },
      );
      setPreview(response);
      setStatus(`Prévisualisation générée pour ${response.count} message(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de générer la prévisualisation.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSend = async () => {
    if (!quizId) return;
    setSending(true);
    setError(null);
    setStatus(null);
    try {
      const response = await apiFetch<SendResponse>(
        `/quizzes/${quizId}/emails/send`,
        {
          method: "POST",
          json: {
            student_ids: [],
            reply_to: replyTo.trim(),
            bcc: bcc
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          },
        },
      );
      setStatus(`Emails envoyés : ${response.sent}/${response.total}`);
      if (response.failed.length > 0) {
        setError(
          `Échecs: ${response.failed
            .map((failure) => `${failure.student_id} (${failure.email})`)
            .join(", " )}`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "L'envoi des emails a échoué.");
    } finally {
      setSending(false);
    }
  };

  const handleDownloadAttachment = async (message: PreviewMessage) => {
    if (!quizId || !message.attachment_path) return;
    try {
      const response = await fetch(`${API_BASE_URL}/quizzes/${quizId}/analysis/corrections.zip`, {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Téléchargement impossible.");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "corrections.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du téléchargement.");
    }
  };

  if (loading || !quiz) {
    return (
      <div className="quiz-emails__loading">
        <p>Chargement…</p>
      </div>
    );
  }

  return (
    <div className="quiz-emails">
      <header className="quiz-emails__header">
        <div>
          <span className="quiz-emails__eyebrow">Quiz AMC</span>
          <h1>Diffusion des résultats</h1>
          <p>Prévisualisez et envoyez les emails contenant les notes et corrections personnalisées.</p>
        </div>
        <LinkCTA href="/dashboard" variant="ghost">
          Retour
        </LinkCTA>
      </header>

      <QuizTabs active="emails" />

      {status && <div className="quiz-emails__notice quiz-emails__notice--success">{status}</div>}
      {error && <div className="quiz-emails__notice quiz-emails__notice--error">{error}</div>}

      <main className="quiz-emails__layout">
        <section className="quiz-emails__panel">
          <h2>Prévisualisation</h2>
          <form className="quiz-emails__form" onSubmit={handlePreview}>
            <label>
              Reply-To (optionnel)
              <input
                type="email"
                placeholder="support@votredomaine.fr"
                value={replyTo}
                onChange={(event) => setReplyTo(event.target.value)}
              />
            </label>
            <label>
              BCC (séparer par des virgules)
              <input
                type="text"
                placeholder="direction@example.com, archives@example.com"
                value={bcc}
                onChange={(event) => setBcc(event.target.value)}
              />
            </label>
            <button className="quiz-emails__button" type="submit" disabled={previewLoading}>
              {previewLoading ? "Prévisualisation…" : "Générer la prévisualisation"}
            </button>
          </form>

          <div className="quiz-emails__meta">
            <span>Titre du quiz : {quiz.quiz_title || "(sans titre)"}</span>
            <span>Dernière prévisualisation : {preview?.count ?? 0} message(s)</span>
          </div>
        </section>

        <section className="quiz-emails__panel">
          <h2>Messages prêts à l'envoi</h2>
          {preview && preview.messages.length > 0 ? (
            <>
              <div className="quiz-emails__filters">
                <label>
                  Filtrer par étudiant / email
                  <input
                    type="text"
                    value={studentFilter}
                    onChange={(event) => setStudentFilter(event.target.value)}
                    placeholder="Ex: 0001 ou prénom"
                  />
                </label>
              </div>
              <div className="quiz-emails__messages">
                {filteredMessages.map((message) => (
                  <article key={message.student_id} className="quiz-emails__message-card">
                    <header>
                      <h3>Étudiant #{message.student_id}</h3>
                      <span>{message.email}</span>
                    </header>
                    <dl>
                      <div>
                        <dt>Objet</dt>
                        <dd>{message.subject}</dd>
                      </div>
                      <div>
                        <dt>Corps d'email</dt>
                        <dd>
                          <pre>{message.body}</pre>
                        </dd>
                      </div>
                      <div>
                        <dt>Note</dt>
                        <dd>{message.grade}</dd>
                      </div>
                      <div>
                        <dt>Correction PDF</dt>
                        <dd>
                          {message.attachment_exists ? (
                            <button
                              className="quiz-emails__link"
                              type="button"
                              onClick={() => handleDownloadAttachment(message)}
                            >
                              Télécharger la correction
                            </button>
                          ) : (
                            <span>Non disponible</span>
                          )}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
              <button
                className="quiz-emails__button quiz-emails__button--primary"
                onClick={handleSend}
                disabled={sending}
              >
                {sending ? "Envoi en cours…" : "Envoyer les emails"}
              </button>
            </>
          ) : (
            <p>Aucun message prêt pour le moment. Générez une prévisualisation.</p>
          )}
        </section>
      </main>
    </div>
  );
};
