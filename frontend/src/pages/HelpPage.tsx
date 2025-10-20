import { FormEvent, useMemo, useState } from "react";
import type { User } from "../App";
import { parseJson } from "../utils/api";
import "./HelpPage.css";

type HelpPageProps = {
  user: User;
  onBack: () => void;
  onLogout: () => void;
  onNavigateSettings: () => void;
};

type Question = {
  question: string;
  answer: string;
};

type GuidanceSection = {
  title: string;
  bullets: string[];
};

type SupportCategory = "question" | "feature" | "bug";

const defaultSubject: Record<SupportCategory, string> = {
  question: "Support - Question",
  feature: "Support - Demande de fonctionnalité",
  bug: "Support - Signalement de bug",
};

const HelpPage = ({ user, onBack, onLogout, onNavigateSettings }: HelpPageProps) => {
  const guidance = useMemo<GuidanceSection[]>(
    () => [
      {
        title: "Prise en main",
        bullets: [
          "Créez un quiz depuis le tableau de bord puis complétez ses métadonnées dans l’onglet Généralités.",
          "Ajoutez des questions par sujet, générez les PDF avec AMC, puis verrouillez le quiz avant la correction.",
          "Analysez les copies scannées depuis l’onglet Corriger pour obtenir les notes et envoyer les résultats.",
        ],
      },
      {
        title: "Listes d’étudiants",
        bullets: [
          "Importez ou éditez vos classes dans Paramètres > Listes d’étudiants.",
          "Associez une classe à un quiz depuis l’onglet Généralités pour préparer l’envoi des résultats.",
        ],
      },
      {
        title: "Sécurité et sessions",
        bullets: [
          "Votre espace est chiffré lorsque vous êtes hors ligne; reconnectez-vous pour le déverrouiller.",
          "Mettez à jour votre email ou votre mot de passe dans l’onglet Paramètres.",
        ],
      },
    ],
    []
  );

  const questions = useMemo<Question[]>(
    () => [
      {
        question: "Comment réordonner les questions ou les sujets ?",
        answer:
          "Dans l’onglet Questions d’un quiz, faites glisser les sujets et questions. La numérotation est recalculée automatiquement.",
      },
      {
        question: "Puis-je modifier un quiz après l’avoir verrouillé ?",
        answer:
          "Oui, en le déverrouillant depuis le tableau de bord. Attention : les PDF générés seront invalidés et devront être recréés.",
      },
      {
        question: "Comment envoyer les résultats aux étudiants ?",
        answer:
          "Après l’analyse des copies, ouvrez l’onglet Corriger et utilisez la section ‘Envoyer les corrections par e-mail’.",
      },
      {
        question: "Comment signaler un bug ou proposer une idée ?",
        answer:
          "Utilisez le formulaire ci-dessous pour contacter notre équipe ou écrivez à support depuis Paramètres.",
      },
    ],
    []
  );

  const [category, setCategory] = useState<SupportCategory>("question");
  const [email, setEmail] = useState(user.email || "");
  const [subject, setSubject] = useState(defaultSubject["question"]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCategoryChange = (value: SupportCategory) => {
    setCategory(value);
    setSubject((prev) => {
      const defaults = Object.values(defaultSubject);
      return !prev.trim() || defaults.includes(prev) ? defaultSubject[value] : prev;
    });
  };

  const handleSupportSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setError("Le message est requis.");
      return;
    }
    setSending(true);
    setStatus(null);
    setError(null);
    try {
      const response = await fetch("/emails/support/requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          subject: subject.trim() || defaultSubject[category],
          message: trimmedMessage,
        }),
      });
      const data = await parseJson<{ error?: string; message?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.error ?? "Impossible d'envoyer la demande.");
      }
      setStatus(data?.message ?? "Message envoyé. Nous reviendrons vers vous rapidement.");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="help app-page">
      <header className="help__hero app-hero">
        <div className="help__hero-content app-hero__content">
          <div className="help__hero-headline app-hero__headline">
            <span className="help__eyebrow app-eyebrow">Radi Quiz</span>
            <h1>Centre d’aide</h1>
            <p>
              Retrouvez les étapes clés pour préparer vos évaluations, recherchez des réponses rapides et contactez notre
              équipe support en cas de besoin.
            </p>
          </div>
          <div className="help__hero-actions app-hero__actions">
            <button className="app-button app-button--secondary" onClick={onBack}>
              Retour au tableau de bord
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

      <main className="help__main app-main">
        <section className="help__section app-card">
          <div className="help__section-header">
            <h2>Guides rapides</h2>
            <p>Suivez ces étapes pour maîtriser les principaux workflows de Radi Quiz.</p>
          </div>
          <div className="help__guides">
            {guidance.map((section) => (
              <article key={section.title} className="help__card">
                <h3>{section.title}</h3>
                <ul>
                  {section.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="help__section app-card">
          <div className="help__section-header">
            <h2>Questions fréquentes</h2>
            <p>Trouvez rapidement des réponses aux questions les plus courantes.</p>
          </div>
          <div className="help__faq">
            {questions.map((qa) => (
              <details key={qa.question} className="help__faq-item">
                <summary>{qa.question}</summary>
                <p>{qa.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="help__section help__section--contact app-card">
          <div className="help__section-header">
            <h2>Contactez le support</h2>
            <p>
              Une question plus spécifique ? Envoyez-nous un message en précisant le type de demande et le plus de
              détails possible.
            </p>
          </div>
          <form className="help__form" onSubmit={handleSupportSubmit}>
            <div className="help__form-row">
              <label className="help__field">
                <span>Catégorie</span>
                <select value={category} onChange={(event) => handleCategoryChange(event.target.value as SupportCategory)}>
                  <option value="question">Question</option>
                  <option value="feature">Demande de fonctionnalité</option>
                  <option value="bug">Signalement de bug</option>
                </select>
              </label>
              <label className="help__field">
                <span>Adresse e-mail</span>
                <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="exemple@universite.fr" />
              </label>
            </div>
            <label className="help__field">
              <span>Objet</span>
              <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder={defaultSubject[category]} />
            </label>
            <label className="help__field help__field--wide">
              <span>Message</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={6}
                placeholder="Décrivez votre question, votre idée ou le bug rencontré."
                required
              />
            </label>
            <div className="help__actions">
              <button className="app-button app-button--primary" type="submit" disabled={sending}>
                Envoyer
              </button>
            </div>
            {status ? <div className="app-status">{status}</div> : null}
            {error ? <div className="app-error">{error}</div> : null}
          </form>
        </section>
      </main>
    </div>
  );
};

export default HelpPage;
