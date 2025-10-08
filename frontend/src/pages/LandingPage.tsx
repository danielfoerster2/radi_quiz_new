import { FeatureCard } from "../components/FeatureCard";
import { StepCard } from "../components/StepCard";
import { LinkCTA } from "../components/LinkCTA";
import "./LandingPage.css";

const features = [
  {
    title: "Création guidée",
    description:
      "Assemblez vos questionnaires AMC avec des modèles prêts à l'emploi, la traduction instantanée et l'import de listes étudiants.",
    icon: "🧭",
  },
  {
    title: "Compilation automatique",
    description:
      "Générez sujets, corrigés et mailings en un clic tout en profitant des commandes AMC exécutées sur notre infrastructure.",
    icon: "⚙️",
  },
  {
    title: "Analyse assistée",
    description:
      "Traitez les copies scannées, visualisez les cases détectées et envoyez des corrections personnalisées par e-mail.",
    icon: "📊",
  },
];

const steps = [
  {
    step: "1",
    title: "Préparez",
    description:
      "Importez votre liste d'étudiants, créez un premier quiz et paramétrez vos options par défaut.",
  },
  {
    step: "2",
    title: "Diffusez",
    description:
      "Générez automatiquement les sujets, imprimez-les ou partagez-les en PDF, puis organisez votre examen.",
  },
  {
    step: "3",
    title: "Corrigez",
    description:
      "Analysez les copies, ajustez les associations et envoyez les résultats accompagnés du corrigé.",
  },
];

export const LandingPage = () => {
  return (
    <div className="landing">
      <header className="landing__hero">
        <nav className="landing__nav">
          <span className="landing__logo">Radi Quiz</span>
          <div className="landing__nav-actions">
            <LinkCTA href="/login" variant="ghost">
              Se connecter
            </LinkCTA>
            <LinkCTA href="/register" variant="primary">
              Créer un compte
            </LinkCTA>
          </div>
        </nav>
        <div className="landing__hero-content">
          <div className="landing__hero-copy">
            <h1>Créez, compilez et corrigez vos QCM en toute sérénité.</h1>
            <p>
              Radi Quiz combine Auto Multiple Choice, l'automatisation et l'assistance
              IA pour vous accompagner à chaque étape : conception des sujets,
              génération des corrigés, analyse des copies et diffusion des résultats.
            </p>
            <div className="landing__cta-group">
              <LinkCTA href="/register" variant="primary">
                Démarrer gratuitement
              </LinkCTA>
              <LinkCTA href="#how-it-works" variant="ghost">
                Découvrir le flux de travail
              </LinkCTA>
            </div>
            <span className="landing__hero-meta">
              Sans carte bancaire &middot; Hébergement en Europe &middot; Support francophone
            </span>
          </div>
          <div className="landing__hero-card">
            <div className="landing__stats">
              <div>
                <strong>15 min</strong>
                <span>pour préparer un questionnaire complet</span>
              </div>
              <div>
                <strong>+40%</strong>
                <span>de temps gagné sur la correction des copies</span>
              </div>
            </div>
            <div className="landing__preview">
              <span>Actions rapides</span>
              <ul>
                <li>+ Nouveau quiz AMC</li>
                <li>Importer une liste d'étudiants</li>
                <li>Lancer l'analyse des copies</li>
              </ul>
            </div>
          </div>
        </div>
      </header>

      <section className="landing__features" id="features">
        <h2>Pourquoi choisir Radi Quiz ?</h2>
        <p className="landing__section-lead">
          Une plateforme unique pour préparer vos évaluations, automatiser la
          production des sujets et accélérer la correction.
        </p>
        <div className="landing__feature-grid">
          {features.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </section>

      <section className="landing__workflow" id="how-it-works">
        <h2>Votre workflow AMC, simplifié</h2>
        <p className="landing__section-lead">
          Radi Quiz orchestre pour vous toutes les étapes critiques : vous restez
          maître du contenu, nous gérons l'automatisation.
        </p>
        <div className="landing__step-grid">
          {steps.map((step) => (
            <StepCard key={step.step} {...step} />
          ))}
        </div>
      </section>

      <section className="landing__cta-section">
        <div className="landing__cta-card">
          <div>
            <h2>Prêt à lancer votre prochain quiz AMC&nbsp;?</h2>
            <p>
              Créez un compte gratuit, importez vos sujets existants et profitez
              des assistants IA pour générer de nouvelles questions en quelques
              secondes.
            </p>
          </div>
          <div className="landing__cta-actions">
            <LinkCTA href="/register" variant="primary">
              Créer un compte gratuit
            </LinkCTA>
            <LinkCTA href="/login" variant="ghost">
              J'ai déjà un compte
            </LinkCTA>
          </div>
        </div>
      </section>

      <footer className="landing__footer">
        <span>&copy; {new Date().getFullYear()} Radi Quiz. Tous droits réservés.</span>
        <div className="landing__footer-links">
          <a href="mailto:support@radiquiz.app">Support</a>
          <a href="#features">Fonctionnalités</a>
          <a href="#how-it-works">Processus</a>
        </div>
      </footer>
    </div>
  );
};
