import { FormEvent, useMemo, useState } from "react";
import "./LandingPage.css";

type RegisterForm = {
  email: string;
  password: string;
  confirmPassword: string;
};

type VerifyForm = {
  email: string;
  verificationCode: string;
};

type LoginForm = {
  email: string;
  password: string;
};

type ForgotForm = {
  email: string;
};

type ResetForm = {
  email: string;
  otp: string;
  newPassword: string;
  confirmNewPassword: string;
};

type AuthTab = "login" | "register" | "recovery";

const formatResponse = (data: unknown) => JSON.stringify(data, null, 2);

const features = [
  {
    title: "Flux AMC intégré",
    description:
      "Rédigez vos questions, générez les sujets PDF et analysez les copies numérisées sans quitter la console Radi.",
  },
  {
    title: "Espace dédié par enseignant",
    description:
      "Chaque compte dispose d'un espace de travail chiffré pendant les périodes d'inactivité pour plus de sérénité.",
  },
  {
    title: "Assistance IA à la demande",
    description:
      "Suggérez de nouveaux exercices, validez la sortie LaTeX et préparez des courriels personnalisés en un clic.",
  },
];

const LandingPage = () => {
  const [activeTab, setActiveTab] = useState<AuthTab>("login");

  const [registerForm, setRegisterForm] = useState<RegisterForm>({
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [registerOutput, setRegisterOutput] = useState<string | null>(null);

  const [verifyForm, setVerifyForm] = useState<VerifyForm>({
    email: "",
    verificationCode: "",
  });
  const [verifyOutput, setVerifyOutput] = useState<string | null>(null);

  const [loginForm, setLoginForm] = useState<LoginForm>({
    email: "",
    password: "",
  });
  const [loginOutput, setLoginOutput] = useState<string | null>(null);

  const [forgotForm, setForgotForm] = useState<ForgotForm>({
    email: "",
  });
  const [forgotOutput, setForgotOutput] = useState<string | null>(null);

  const [resetForm, setResetForm] = useState<ResetForm>({
    email: "",
    otp: "",
    newPassword: "",
    confirmNewPassword: "",
  });
  const [resetOutput, setResetOutput] = useState<string | null>(null);

  const tabs = useMemo(
    () => [
      {
        id: "login" as const,
        label: "Connexion",
        description: "Utilisez votre mot de passe ou un code à usage unique récent envoyé par e-mail.",
      },
      {
        id: "register" as const,
        label: "Créer un compte",
        description: "Inscrivez-vous et validez votre adresse e-mail en deux étapes rapides.",
      },
      {
        id: "recovery" as const,
        label: "Aide mot de passe",
        description: "Demandez un code à usage unique ou réinitialisez avec un code existant.",
      },
    ],
    []
  );

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (registerForm.password !== registerForm.confirmPassword) {
      setRegisterOutput("Les mots de passe ne correspondent pas.");
      return;
    }

    setRegisterOutput(null);

    try {
      const response = await fetch("/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: registerForm.email,
          password: registerForm.password,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        const message =
          response.status === 400
            ? "Le mot de passe doit comporter 8 à 30 caractères, avec une majuscule, une minuscule, un chiffre et un caractère spécial."
            : response.status === 409
            ? "Ce compte existe déjà. Veuillez vous connecter."
            : (data as { error?: string })?.error ?? "Échec de l'inscription.";
        setRegisterOutput(message);
        return;
      }

      setRegisterOutput(formatResponse(data));
    } catch (error) {
      setRegisterOutput(error instanceof Error ? error.message : String(error));
    }
  };

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setVerifyOutput(null);

    try {
      const response = await fetch("/auth/register/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: verifyForm.email,
          verification_code: verifyForm.verificationCode,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        const message =
          response.status === 400
            ? "Code de vérification invalide ou expiré."
            : response.status === 404
            ? "Compte introuvable."
            : response.status === 409
            ? "Ce compte est déjà vérifié. Vous pouvez vous connecter."
            : (data as { error?: string })?.error ?? "Échec de la vérification.";
        setVerifyOutput(message);
        return;
      }

      setVerifyOutput(formatResponse(data));
    } catch (error) {
      setVerifyOutput(error instanceof Error ? error.message : String(error));
    }
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setLoginOutput(null);

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: loginForm.email,
          password: loginForm.password,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        const requiresReset = (data as { requires_password_reset?: boolean })?.requires_password_reset;
        const message =
          response.status === 401
            ? "Adresse e-mail ou mot de passe incorrect."
            : response.status === 409 && requiresReset
            ? "Code à usage unique accepté. Veuillez réinitialiser votre mot de passe."
            : response.status === 409
            ? "Ce compte nécessite une connexion Google ou une réinitialisation de mot de passe."
            : (data as { error?: string })?.error ?? "Échec de la connexion.";
        setLoginOutput(message);
        if (response.status === 409 && requiresReset) {
          setActiveTab("recovery");
          setResetForm((prev) => ({
            ...prev,
            email: loginForm.email,
          }));
        }
        return;
      }

      setLoginOutput(formatResponse(data));
    } catch (error) {
      setLoginOutput(error instanceof Error ? error.message : String(error));
    }
  };

  const handleForgotPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setForgotOutput(null);

    try {
      const response = await fetch("/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: forgotForm.email,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        const message =
          response.status === 400
            ? "Adresse e-mail invalide."
            : (data as { error?: string })?.error ?? "Échec de la demande.";
        setForgotOutput(message);
        return;
      }

      setForgotOutput("Si le compte existe, un e-mail a été envoyé.");
      setResetOutput(null);
      setResetForm({
        email: forgotForm.email,
        otp: "",
        newPassword: "",
        confirmNewPassword: "",
      });
    } catch (error) {
      setForgotOutput(error instanceof Error ? error.message : String(error));
    }
  };

  const handleResetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!resetForm.email) {
      setResetOutput("Renseignez d'abord votre adresse e-mail dans l'étape précédente.");
      return;
    }

    if (resetForm.newPassword !== resetForm.confirmNewPassword) {
      setResetOutput("Les mots de passe ne correspondent pas.");
      return;
    }

    setResetOutput(null);

    try {
      const response = await fetch("/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: resetForm.email,
          otp: resetForm.otp,
          new_password: resetForm.newPassword,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        const backendMessage = (data as { error?: string })?.error || "";
        let message = "Échec de la réinitialisation.";
        if (response.status === 400) {
          const normalized = backendMessage.toLowerCase();
          if (normalized.includes("invalid email")) {
            message = "Adresse e-mail invalide.";
          } else if (normalized.includes("invalid or expired code")) {
            message = "Code à usage unique invalide ou expiré.";
          } else if (normalized.includes("reset request")) {
            message = "Demande de réinitialisation invalide.";
          } else if (normalized.includes("password")) {
            message =
              "Le mot de passe doit comporter 8 à 30 caractères, avec une majuscule, une minuscule, un chiffre et un caractère spécial.";
          }
        }
        setResetOutput(message);
        return;
      }

      setResetOutput("Mot de passe réinitialisé. Vous êtes connecté.");
      setResetForm((prev) => ({
        ...prev,
        otp: "",
        newPassword: "",
        confirmNewPassword: "",
      }));
      setActiveTab("login");
      setLoginForm({
        email: resetForm.email,
        password: "",
      });
      setLoginOutput("Mot de passe réinitialisé. Vous êtes connecté.");
    } catch (error) {
      setResetOutput(error instanceof Error ? error.message : String(error));
    }
  };

  const handleGoogleOAuth = () => {
    window.location.href = "/auth/login/google";
  };

  return (
    <div className="landing-page">
      <header className="landing-hero">
        <div className="landing-hero__content">
          <span className="landing-hero__eyebrow">Radi Quiz + Auto Multiple Choice</span>
          <h1>Des évaluations conçues pour les enseignants qui recherchent la précision</h1>
          <p>
            Créez vos évaluations, orchestrez la compilation AMC et restituez des copies annotées depuis un
            espace de travail unique et sécurisé. Radi conserve le flux en français par défaut tout en
            s'adaptant à vos contenus multilingues.
          </p>
          <div className="landing-hero__actions">
            <button
              type="button"
              onClick={() => setActiveTab("register")}
              className="landing-hero__primary"
            >
              Créer mon compte
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("login")}
              className="landing-hero__secondary"
            >
              Se connecter
            </button>
          </div>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-features">
          {features.map((item) => (
            <article key={item.title} className="landing-feature">
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </section>

        <section className="landing-auth" aria-label="Authentification">
          <nav className="landing-auth__tabs" aria-label="Actions du compte">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`landing-auth__tab${activeTab === tab.id ? " is-active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>{tab.label}</span>
                <small>{tab.description}</small>
              </button>
            ))}
          </nav>

          <div className="landing-auth__panel">
            {activeTab === "register" ? (
              <div className="landing-panel">
                <h2>Créez votre compte Radi Quiz</h2>
                <button type="button" onClick={handleGoogleOAuth} className="landing-panel__google">
                  <span aria-hidden="true" className="landing-panel__google-icon">
                    <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M17.64 9.2045C17.64 8.56677 17.5827 7.95227 17.4764 7.36002H9V10.845H13.8436C13.635 11.97 13.0009 12.9232 12.0477 13.561V15.8195H14.9564C16.6582 14.2523 17.64 11.945 17.64 9.2045Z"
                        fill="#4285F4"
                      />
                      <path
                        d="M8.99999 18C11.43 18 13.4672 17.1941 14.9563 15.8195L12.0477 13.561C11.2418 14.101 10.2109 14.4205 8.99999 14.4205C6.65586 14.4205 4.67175 12.8386 3.96443 10.71H0.957489V13.0414C2.43816 15.9832 5.48114 18 8.99999 18Z"
                        fill="#34A853"
                      />
                      <path
                        d="M3.96446 10.71C3.78446 10.17 3.68184 9.59334 3.68184 9C3.68184 8.40666 3.78446 7.83 3.96446 7.29V4.95866H0.95752C0.34702 6.17366 0 7.54766 0 9C0 10.4523 0.34702 11.8263 0.95752 13.0413L3.96446 10.71Z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M8.99999 3.5795C10.3213 3.5795 11.5073 4.03318 12.4405 4.92068L15.0227 2.3385C13.4636 0.8925 11.4264 0 8.99999 0C5.48114 0 2.43816 2.016 0.957489 4.9585L3.96443 7.29C4.67175 5.16136 6.65586 3.5795 8.99999 3.5795Z"
                        fill="#EA4335"
                      />
                    </svg>
                  </span>
                  Continuer avec Google
                </button>
                <div className="landing-panel__divider" role="presentation">
                  <span>ou</span>
                </div>
                <div className="landing-panel__requirements">
                  <p>Choisissez un mot de passe répondant aux critères suivants :</p>
                  <ul>
                    <li>Entre 8 et 30 caractères</li>
                    <li>Au moins une lettre majuscule et une lettre minuscule</li>
                    <li>Au moins un chiffre</li>
                    <li>Au moins un caractère spécial</li>
                  </ul>
                </div>
                <div className="landing-panel__stacked">
                  <h3 className="landing-panel__step">Étape 1 — Demander votre code</h3>
                  <form onSubmit={handleRegister}>
                    <div className="form-field">
                      <label htmlFor="register-email">Adresse e-mail</label>
                      <input
                        id="register-email"
                        type="email"
                        value={registerForm.email}
                        onChange={(event) =>
                          setRegisterForm((prev) => ({ ...prev, email: event.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="form-grid">
                      <div className="form-field">
                        <label htmlFor="register-password">Mot de passe</label>
                        <input
                          id="register-password"
                          type="password"
                          value={registerForm.password}
                          onChange={(event) =>
                            setRegisterForm((prev) => ({ ...prev, password: event.target.value }))
                          }
                          required
                          minLength={8}
                        />
                      </div>
                      <div className="form-field">
                        <label htmlFor="register-confirm">Confirmation</label>
                        <input
                          id="register-confirm"
                          type="password"
                          value={registerForm.confirmPassword}
                          onChange={(event) =>
                            setRegisterForm((prev) => ({
                              ...prev,
                              confirmPassword: event.target.value,
                            }))
                          }
                          required
                          minLength={8}
                        />
                      </div>
                    </div>
                    <button type="submit">Envoyer le code de vérification</button>
                  </form>
                  {registerOutput ? <pre className="response-block">{registerOutput}</pre> : null}
                </div>
                <div className="landing-panel__stacked">
                  <h3 className="landing-panel__step">Étape 2 — Activer votre compte</h3>
                  <form onSubmit={handleVerify}>
                    <div className="form-field">
                      <label htmlFor="verify-email">Adresse e-mail</label>
                      <input
                        id="verify-email"
                        type="email"
                        value={verifyForm.email}
                        onChange={(event) =>
                          setVerifyForm((prev) => ({ ...prev, email: event.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label htmlFor="verify-code">Code de vérification</label>
                      <input
                        id="verify-code"
                        value={verifyForm.verificationCode}
                        onChange={(event) =>
                          setVerifyForm((prev) => ({
                            ...prev,
                            verificationCode: event.target.value,
                          }))
                        }
                        required
                      />
                    </div>
                    <button type="submit">Activer le compte</button>
                  </form>
                  {verifyOutput ? <pre className="response-block">{verifyOutput}</pre> : null}
                </div>
              </div>
            ) : null}

            {activeTab === "login" ? (
              <div className="landing-panel">
                <h2>Connectez-vous à votre espace de travail</h2>
                <button type="button" onClick={handleGoogleOAuth} className="landing-panel__google">
                  <span aria-hidden="true" className="landing-panel__google-icon">
                    <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M17.64 9.2045C17.64 8.56677 17.5827 7.95227 17.4764 7.36002H9V10.845H13.8436C13.635 11.97 13.0009 12.9232 12.0477 13.561V15.8195H14.9564C16.6582 14.2523 17.64 11.945 17.64 9.2045Z"
                        fill="#4285F4"
                      />
                      <path
                        d="M8.99999 18C11.43 18 13.4672 17.1941 14.9563 15.8195L12.0477 13.561C11.2418 14.101 10.2109 14.4205 8.99999 14.4205C6.65586 14.4205 4.67175 12.8386 3.96443 10.71H0.957489V13.0414C2.43816 15.9832 5.48114 18 8.99999 18Z"
                        fill="#34A853"
                      />
                      <path
                        d="M3.96446 10.71C3.78446 10.17 3.68184 9.59334 3.68184 9C3.68184 8.40666 3.78446 7.83 3.96446 7.29V4.95866H0.95752C0.34702 6.17366 0 7.54766 0 9C0 10.4523 0.34702 11.8263 0.95752 13.0413L3.96446 10.71Z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M8.99999 3.5795C10.3213 3.5795 11.5073 4.03318 12.4405 4.92068L15.0227 2.3385C13.4636 0.8925 11.4264 0 8.99999 0C5.48114 0 2.43816 2.016 0.957489 4.9585L3.96443 7.29C4.67175 5.16136 6.65586 3.5795 8.99999 3.5795Z"
                        fill="#EA4335"
                      />
                    </svg>
                  </span>
                  Continuer avec Google
                </button>
                <div className="landing-panel__divider" role="presentation">
                  <span>ou</span>
                </div>
                <form onSubmit={handleLogin}>
                  <div className="form-field">
                    <label htmlFor="login-email">Adresse e-mail</label>
                    <input
                      id="login-email"
                      type="email"
                      value={loginForm.email}
                      onChange={(event) =>
                        setLoginForm((prev) => ({ ...prev, email: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="login-password">Mot de passe ou code unique</label>
                    <input
                      id="login-password"
                      type="password"
                      value={loginForm.password}
                      onChange={(event) =>
                        setLoginForm((prev) => ({ ...prev, password: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <button type="submit">Se connecter</button>
                </form>
                {loginOutput ? <pre className="response-block">{loginOutput}</pre> : null}
              </div>
            ) : null}

            {activeTab === "recovery" ? (
              <div className="landing-panel">
                <h2>Besoin de retrouver l'accès ?</h2>
                <form onSubmit={handleForgotPassword} className="landing-panel__stacked">
                  <fieldset>
                    <legend>Envoyer un code à usage unique</legend>
                    <div className="form-field">
                      <label htmlFor="forgot-email">Adresse e-mail</label>
                      <input
                        id="forgot-email"
                        type="email"
                        value={forgotForm.email}
                        onChange={(event) =>
                          setForgotForm((prev) => ({ ...prev, email: event.target.value }))
                        }
                        required
                      />
                    </div>
                    <button type="submit">Envoyer le code par e-mail</button>
                  </fieldset>
                  {forgotOutput ? <pre className="response-block">{forgotOutput}</pre> : null}
                </form>

                <form onSubmit={handleResetPassword} className="landing-panel__stacked">
                  <fieldset>
                    <legend>Utiliser le code à usage unique</legend>
                    <div className="form-field">
                      <label htmlFor="reset-email">Adresse e-mail</label>
                      <input
                        id="reset-email"
                        type="email"
                        value={resetForm.email}
                        required
                        readOnly
                      />
                    </div>
                    <div className="form-grid">
                      <div className="form-field">
                        <label htmlFor="reset-otp">Code à usage unique</label>
                        <input
                          id="reset-otp"
                          value={resetForm.otp}
                          onChange={(event) =>
                            setResetForm((prev) => ({ ...prev, otp: event.target.value }))
                          }
                          required
                        />
                      </div>
                      <div className="form-field">
                        <label htmlFor="reset-password">Nouveau mot de passe</label>
                        <input
                          id="reset-password"
                          type="password"
                          value={resetForm.newPassword}
                          onChange={(event) =>
                            setResetForm((prev) => ({ ...prev, newPassword: event.target.value }))
                          }
                          required
                          minLength={8}
                        />
                      </div>
                    </div>
                    <div className="form-field">
                      <label htmlFor="reset-password-confirm">Confirmer le nouveau mot de passe</label>
                      <input
                        id="reset-password-confirm"
                        type="password"
                        value={resetForm.confirmNewPassword}
                        onChange={(event) =>
                          setResetForm((prev) => ({ ...prev, confirmNewPassword: event.target.value }))
                        }
                        required
                        minLength={8}
                      />
                    </div>
                    <button type="submit">Définir le nouveau mot de passe</button>
                  </fieldset>
                  {resetOutput ? <pre className="response-block">{resetOutput}</pre> : null}
                </form>
              </div>
            ) : null}
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer__content">
          <p>
            Radi Quiz permet aux enseignants de se concentrer sur la pédagogie en automatisant la gestion des
            listes, la compilation AMC, la correction et les envois de courriels.
          </p>
          <span>Besoin d'aide ? Ouvrez un ticket depuis le centre de support après connexion.</span>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
