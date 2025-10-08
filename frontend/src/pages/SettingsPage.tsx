import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../services/api";
import { LinkCTA } from "../components/LinkCTA";
import "./SettingsPage.css";

type ProfileResponse = {
  email: string;
  first_name: string;
  last_name: string;
};

type DefaultsResponse = {
  institution_name: string;
  student_instructions: string;
  coding_explanation: string;
  email_subject: string;
  email_body: string;
  quiz_language: string;
};

type EmailChangeResponse = {
  message: string;
};

type GenericResponse = {
  message: string;
};

type ExportResponse = {
  message: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

const initialProfile = {
  email: "",
  first_name: "",
  last_name: "",
};

const initialDefaults = {
  institution_name: "",
  student_instructions: "",
  coding_explanation: "",
  email_subject: "",
  email_body: "",
  quiz_language: "fr",
};

export const SettingsPage = () => {
  const [profile, setProfile] = useState(initialProfile);
  const [defaults, setDefaults] = useState(initialDefaults);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isUpdatingDefaults, setIsUpdatingDefaults] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isRequestingEmailChange, setIsRequestingEmailChange] = useState(false);
  const [isExportingData, setIsExportingData] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [profileData, defaultsData] = await Promise.all([
          apiFetch<ProfileResponse>("/me", { method: "GET" }),
          apiFetch<DefaultsResponse>("/me/defaults", { method: "GET" }),
        ]);
        setProfile(profileData);
        setDefaults(defaultsData);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Impossible de charger les paramètres."
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsUpdatingProfile(true);
    setError(null);
    setStatus(null);
    try {
      await apiFetch<ProfileResponse>("/me", {
        method: "PUT",
        json: {
          first_name: profile.first_name,
          last_name: profile.last_name,
        },
      });
      setStatus("Profil mis à jour.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "La mise à jour du profil a échoué."
      );
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleDefaultsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsUpdatingDefaults(true);
    setError(null);
    setStatus(null);
    try {
      await apiFetch<DefaultsResponse>("/me/defaults", {
        method: "PUT",
        json: defaults,
      });
      setStatus("Paramètres par défaut enregistrés.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "La mise à jour des paramètres a échoué."
      );
    } finally {
      setIsUpdatingDefaults(false);
    }
  };

  const handlePasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const currentPassword = (form.elements.namedItem("current_password") as HTMLInputElement).value;
    const newPassword = (form.elements.namedItem("new_password") as HTMLInputElement).value;
    const confirmPassword = (form.elements.namedItem("confirm_password") as HTMLInputElement).value;

    if (newPassword !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setIsChangingPassword(true);
    setError(null);
    setStatus(null);
    try {
      await apiFetch<GenericResponse>("/me/password", {
        method: "POST",
        json: {
          current_password: currentPassword,
          new_password: newPassword,
        },
      });
      setStatus("Mot de passe mis à jour.");
      form.reset();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "La mise à jour du mot de passe a échoué."
      );
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleEmailChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const newEmail = (form.elements.namedItem("new_email") as HTMLInputElement).value.trim();
    setIsRequestingEmailChange(true);
    setError(null);
    setStatus(null);
    try {
      const response = await apiFetch<EmailChangeResponse>("/me/email-change", {
        method: "POST",
        json: { new_email: newEmail },
      });
      setStatus(response.message || "Un code de vérification a été envoyé.");
      form.reset();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "La demande de changement d'email a échoué."
      );
    } finally {
      setIsRequestingEmailChange(false);
    }
  };

  const handleExportData = async () => {
    setIsExportingData(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch(`${API_BASE_URL}/me/export`, {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Échec de l'export.");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "radi-quiz-workspace.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setStatus("Archive téléchargée.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'exporter vos données.");
    } finally {
      setIsExportingData(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (
      !window.confirm(
        "Cette action est irréversible. Vos quiz, classes et fichiers AMC seront supprimés. Confirmez-vous la suppression ?",
      )
    ) {
      return;
    }
    setIsDeletingAccount(true);
    setError(null);
    setStatus(null);
    try {
      await apiFetch<GenericResponse>("/me", {
        method: "DELETE",
      });
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "La suppression a échoué.");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  if (isLoading) {
    return (
      <div className="settings__loading">
        <p>Chargement des paramètres…</p>
      </div>
    );
  }

  return (
    <div className="settings">
      <header className="settings__header">
        <div>
          <h1>Paramètres</h1>
          <p>Gérez vos informations personnelles et les paramètres par défaut des quiz.</p>
        </div>
        <LinkCTA href="/dashboard" variant="ghost">
          Retour au tableau de bord
        </LinkCTA>
      </header>

      {status && <div className="settings__notice settings__notice--success">{status}</div>}
      {error && <div className="settings__notice settings__notice--error">{error}</div>}

      <main className="settings__grid">
        <section className="settings__card">
          <h2>Informations du profil</h2>
          <p className="settings__lead">
            Mettez à jour les informations affichées dans vos emails et exportations.
          </p>
          <form className="settings__form" onSubmit={handleProfileSubmit}>
            <label>
              Prénom
              <input
                type="text"
                value={profile.first_name}
                onChange={(event) =>
                  setProfile((prev) => ({ ...prev, first_name: event.target.value }))
                }
              />
            </label>
            <label>
              Nom
              <input
                type="text"
                value={profile.last_name}
                onChange={(event) =>
                  setProfile((prev) => ({ ...prev, last_name: event.target.value }))
                }
              />
            </label>
            <label>
              Adresse email (lecture seule)
              <input type="email" value={profile.email} disabled />
            </label>
            <button className="settings__button" type="submit" disabled={isUpdatingProfile}>
              {isUpdatingProfile ? "Enregistrement…" : "Enregistrer"}
            </button>
          </form>
        </section>

        <section className="settings__card">
          <h2>Paramètres des quiz</h2>
          <p className="settings__lead">
            Ces informations sont utilisées pour pré-remplir chaque nouveau quiz.
          </p>
          <form className="settings__form" onSubmit={handleDefaultsSubmit}>
            <label>
              Établissement
              <input
                type="text"
                value={defaults.institution_name}
                onChange={(event) =>
                  setDefaults((prev) => ({ ...prev, institution_name: event.target.value }))
                }
              />
            </label>
            <label>
              Instructions aux étudiants
              <textarea
                rows={4}
                value={defaults.student_instructions}
                onChange={(event) =>
                  setDefaults((prev) => ({ ...prev, student_instructions: event.target.value }))
                }
              />
            </label>
            <label>
              Explication du codage
              <textarea
                rows={3}
                value={defaults.coding_explanation}
                onChange={(event) =>
                  setDefaults((prev) => ({ ...prev, coding_explanation: event.target.value }))
                }
              />
            </label>
            <label>
              Sujet de l'email de résultats
              <input
                type="text"
                value={defaults.email_subject}
                onChange={(event) =>
                  setDefaults((prev) => ({ ...prev, email_subject: event.target.value }))
                }
              />
            </label>
            <label>
              Corps de l'email de résultats
              <textarea
                rows={4}
                value={defaults.email_body}
                onChange={(event) =>
                  setDefaults((prev) => ({ ...prev, email_body: event.target.value }))
                }
              />
            </label>
            <label>
              Langue par défaut
              <select
                value={defaults.quiz_language}
                onChange={(event) =>
                  setDefaults((prev) => ({ ...prev, quiz_language: event.target.value }))
                }
              >
                <option value="fr">Français</option>
                <option value="en">Anglais</option>
              </select>
            </label>
            <button className="settings__button" type="submit" disabled={isUpdatingDefaults}>
              {isUpdatingDefaults ? "Enregistrement…" : "Enregistrer"}
            </button>
          </form>
        </section>

        <section className="settings__card">
          <h2>Changer de mot de passe</h2>
          <form className="settings__form" onSubmit={handlePasswordChange}>
            <label>
              Mot de passe actuel
              <input type="password" name="current_password" required />
            </label>
            <label>
              Nouveau mot de passe
              <input type="password" name="new_password" required />
            </label>
            <label>
              Confirmer le mot de passe
              <input type="password" name="confirm_password" required />
            </label>
            <button className="settings__button" type="submit" disabled={isChangingPassword}>
              {isChangingPassword ? "Mise à jour…" : "Mettre à jour"}
            </button>
          </form>
        </section>

        <section className="settings__card">
          <h2>Changer d'adresse email</h2>
          <p className="settings__lead">
            Nous vous enverrons un code de vérification sur la nouvelle adresse pour confirmer le changement.
          </p>
          <form className="settings__form" onSubmit={handleEmailChange}>
            <label>
              Nouvelle adresse email
              <input type="email" name="new_email" required />
            </label>
            <button className="settings__button" type="submit" disabled={isRequestingEmailChange}>
              {isRequestingEmailChange ? "Envoi en cours…" : "Envoyer le code"}
            </button>
          </form>
        </section>

        <section className="settings__card">
          <h2>Exporter mes données</h2>
          <p className="settings__lead">
            Téléchargez une archive ZIP contenant vos classes, quiz et fichiers AMC.
          </p>
          <button
            className="settings__button"
            type="button"
            onClick={handleExportData}
            disabled={isExportingData}
          >
            {isExportingData ? "Préparation…" : "Télécharger l'archive"}
          </button>
        </section>

        <section className="settings__card settings__card--danger">
          <h2>Supprimer mon compte</h2>
          <p className="settings__lead">
            Cette action est définitive. Vos données seront supprimées et vous serez déconnecté.
          </p>
          <button
            className="settings__button settings__button--danger"
            type="button"
            onClick={handleDeleteAccount}
            disabled={isDeletingAccount}
          >
            {isDeletingAccount ? "Suppression…" : "Supprimer mon compte"}
          </button>
        </section>
      </main>
    </div>
  );
};
