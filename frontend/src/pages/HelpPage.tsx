import "./HelpPage.css";
import { LinkCTA } from "../components/LinkCTA";

const faq = [
  {
    question: "Comment importer une liste d'étudiants ?",
    answer:
      "Rendez-vous dans l'onglet Classes, créez une nouvelle classe ou ouvrez-en une existante, puis utilisez l'action \"Importer un fichier CSV\". Les colonnes id, nom, prenom et email sont reconnues automatiquement.",
  },
  {
    question: "Comment générer les sujets AMC ?",
    answer:
      "Depuis le tableau de bord, ouvrez votre quiz puis utilisez l'étape \"Compilation & exports\". Radi Quiz prépare le projet AMC, génère sujet.tex et exécute automatiquement les commandes prepare / compile / export.",
  },
  {
    question: "Puis-je envoyer les corrections par email ?",
    answer:
      "Oui : après l'analyse des copies, rendez-vous dans l'onglet Emails & support du quiz pour prévisualiser chaque message, personnaliser le texte et déclencher l'envoi séquentiel des corrections.",
  },
];

const resources = [
  {
    title: "Documentation AMC",
    description: "Consultez la documentation officielle d'Auto Multiple Choice pour comprendre les commandes et les options avancées.",
    href: "https://www.auto-multiple-choice.net/",
  },
  {
    title: "Modèle de CSV étudiants",
    description: "Téléchargez un exemple de fichier CSV prêt à l'emploi pour renseigner vos listes d'étudiants.",
    href: "/assets/examples/student-list.csv",
  },
  {
    title: "Guide Radi Quiz",
    description: "Un guide pas-à-pas pour créer un quiz, lancer la compilation et analyser les copies scannées.",
    href: "https://radiquiz.app/guide",
  },
];

export const HelpPage = () => {
  return (
    <div className="help">
      <header className="help__hero">
        <div>
          <h1>Centre d'aide</h1>
          <p>Retrouvez les réponses aux questions les plus fréquentes et contactez notre équipe de support.</p>
        </div>
        <LinkCTA href="mailto:support@radiquiz.app" variant="primary">
          Contacter le support
        </LinkCTA>
      </header>

      <section className="help__section">
        <h2>Questions fréquentes</h2>
        <div className="help__faq">
          {faq.map((item) => (
            <article key={item.question} className="help__faq-item">
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="help__section">
        <h2>Ressources utiles</h2>
        <div className="help__resource-grid">
          {resources.map((resource) => (
            <article key={resource.title} className="help__resource-card">
              <h3>{resource.title}</h3>
              <p>{resource.description}</p>
              <a href={resource.href} target="_blank" rel="noreferrer">
                Ouvrir la ressource
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="help__section help__section--cta">
        <div className="help__cta-card">
          <div>
            <h2>Besoin d'un accompagnement personnalisé ?</h2>
            <p>
              Planifiez une session de prise en main avec un membre de l'équipe pour configurer vos imports, générer les sujets et lancer l'analyse des copies.
            </p>
          </div>
          <LinkCTA href="mailto:support@radiquiz.app" variant="ghost">
            Planifier une session
          </LinkCTA>
        </div>
      </section>
    </div>
  );
};
