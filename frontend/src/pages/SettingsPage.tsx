import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "../App";
import { parseJson } from "../utils/api";
import "./SettingsPage.css";

type Defaults = {
  institution_name: string;
  student_instructions: string;
  coding_explanation: string;
  email_subject: string;
  email_body: string;
  quiz_language: string;
};

type InstructorProfile = {
  first_name: string;
  last_name: string;
  email: string;
};

type ClassSummary = {
  list_uuid: string;
  class_title: string;
  student_count: number;
  created_at?: string;
  updated_at?: string;
};

type Student = {
  id: string;
  nom: string;
  prenom: string;
  email: string;
};

type ClassDetailState = {
  loading: boolean;
  error: string | null;
  classTitle: string;
  students: Student[];
  dirty: boolean;
  saving: boolean;
};

type SettingsPageProps = {
  user: User;
  onBack: () => void;
  onLogout: () => void;
  onUserUpdate: (user: Partial<User>) => void;
  onNavigateHelp: () => void;
};

const DEFAULT_INSTRUCTIONS =
  "Aucun document n'est autorisé. L’usage de la calculatrice est interdit. Les questions faisant apparaître le symbole ♣ peuvent présenter zéro, une ou plusieurs bonnes réponses. Les autres ont une unique bonne réponse.";

const emptyDefaults: Defaults = {
  institution_name: "",
  student_instructions: DEFAULT_INSTRUCTIONS,
  coding_explanation: "",
  email_subject: "",
  email_body: "",
  quiz_language: "fr",
};

const SettingsPage = ({ user, onBack, onLogout, onUserUpdate, onNavigateHelp }: SettingsPageProps) => {
  const [profile, setProfile] = useState<InstructorProfile>({
    first_name: "",
    last_name: "",
    email: user.email,
  });
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);

  const [defaults, setDefaults] = useState<Defaults>(emptyDefaults);
  const [defaultsMessage, setDefaultsMessage] = useState<string | null>(null);
  const [defaultsError, setDefaultsError] = useState<string | null>(null);
  const [defaultsBusy, setDefaultsBusy] = useState(false);

  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [classesError, setClassesError] = useState<string | null>(null);
  const [classDetails, setClassDetails] = useState<Record<string, ClassDetailState>>({});
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  const [classCreationTitle, setClassCreationTitle] = useState("");
  const [classCreationFile, setClassCreationFile] = useState<File | null>(null);
  const [classCreationBusy, setClassCreationBusy] = useState(false);
  const [classCreationError, setClassCreationError] = useState<string | null>(null);

  const [emailChangeMessage, setEmailChangeMessage] = useState<string | null>(null);
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null);
  const [emailRequestBusy, setEmailRequestBusy] = useState(false);
  const [emailVerifyBusy, setEmailVerifyBusy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");

  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);

  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const response = await fetch("/account/me", { credentials: "include" });
      if (!response.ok) {
        throw new Error("Impossible de charger le profil.");
      }
      const data = await parseJson<{ email?: string; first_name?: string; last_name?: string }>(response);
      setProfile({
        first_name: data?.first_name ?? "",
        last_name: data?.last_name ?? "",
        email: data?.email ?? user.email,
      });
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : String(error));
    }
  }, [user.email]);

  const loadDefaults = useCallback(async () => {
    try {
      const response = await fetch("/account/me/defaults", { credentials: "include" });
      if (!response.ok) {
        throw new Error("Impossible de charger les paramètres par défaut.");
      }
      const data = await parseJson<Defaults>(response);
      setDefaults({
        ...emptyDefaults,
        ...(data || {}),
      });
    } catch (error) {
      setDefaultsError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const loadClasses = useCallback(async () => {
    setClassesLoading(true);
    setClassesError(null);
    try {
      const response = await fetch("/classes", { credentials: "include" });
      if (!response.ok) {
        throw new Error("Impossible de récupérer les classes.");
      }
      const data = await parseJson<{ classes?: any[] }>(response);
      const summaries =
        data?.classes?.map((item) => ({
          list_uuid: item.list_uuid,
          class_title: item.class_title,
          student_count: item.student_count ?? 0,
          created_at: item.created_at,
          updated_at: item.updated_at,
        })) ?? [];
      setClasses(summaries);
    } catch (error) {
      setClassesError(error instanceof Error ? error.message : String(error));
    } finally {
      setClassesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
    void loadDefaults();
    void loadClasses();
  }, [loadProfile, loadDefaults, loadClasses]);

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileBusy(true);
    setProfileMessage(null);
    setProfileError(null);
    try {
      const response = await fetch("/account/me", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: profile.first_name,
          last_name: profile.last_name,
        }),
      });
      if (!response.ok) {
        const data = await parseJson<{ error?: string }>(response);
        throw new Error(data?.error ?? "Impossible de mettre à jour le profil.");
      }
      setProfileMessage("Profil mis à jour.");
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : String(error));
    } finally {
      setProfileBusy(false);
    }
  };

  const handleDefaultsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDefaultsBusy(true);
    setDefaultsMessage(null);
    setDefaultsError(null);
    try {
      const response = await fetch("/account/me/defaults", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(defaults),
      });
      if (!response.ok) {
        const data = await parseJson<{ error?: string }>(response);
        throw new Error(data?.error ?? "Impossible d'enregistrer les paramètres.");
      }
      const data = await parseJson<Defaults>(response);
      if (data) {
        setDefaults(data);
      }
      setDefaultsMessage("Paramètres enregistrés.");
    } catch (error) {
      setDefaultsError(error instanceof Error ? error.message : String(error));
    } finally {
      setDefaultsBusy(false);
    }
  };

  const toggleClassExpanded = (listUuid: string) => {
    setExpandedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(listUuid)) {
        next.delete(listUuid);
      } else {
        next.add(listUuid);
      }
      return next;
    });
  };

  const loadClassDetail = useCallback(
    async (listUuid: string) => {
      setClassDetails((prev) => ({
        ...prev,
        [listUuid]: prev[listUuid]
          ? { ...prev[listUuid], loading: true, error: null }
          : { loading: true, error: null, classTitle: "", students: [], dirty: false, saving: false },
      }));
      try {
        const response = await fetch(`/classes/${listUuid}`, { credentials: "include" });
        if (!response.ok) {
          const data = await parseJson<{ error?: string }>(response);
          throw new Error(data?.error ?? "Impossible de charger la classe.");
        }
        const data = await parseJson<{ class?: any }>(response);
        const classData = data?.class;
        const students: Student[] =
          classData?.students?.map((student: any) => ({
            id: student.id ?? "",
            nom: student.nom ?? "",
            prenom: student.prenom ?? "",
            email: student.email ?? "",
          })) ?? [];
        setClassDetails((prev) => ({
          ...prev,
          [listUuid]: {
            loading: false,
            error: null,
            classTitle: classData?.class_title ?? "",
            students,
            dirty: false,
            saving: false,
          },
        }));
      } catch (error) {
        setClassDetails((prev) => ({
          ...prev,
          [listUuid]: {
            loading: false,
            error: error instanceof Error ? error.message : String(error),
            classTitle: prev[listUuid]?.classTitle ?? "",
            students: prev[listUuid]?.students ?? [],
            dirty: prev[listUuid]?.dirty ?? false,
            saving: false,
          },
        }));
      }
    },
    []
  );

  useEffect(() => {
    expandedClasses.forEach((listUuid) => {
      if (!classDetails[listUuid] || (!classDetails[listUuid].loading && classDetails[listUuid].students.length === 0)) {
        void loadClassDetail(listUuid);
      }
    });
  }, [expandedClasses, classDetails, loadClassDetail]);

  const handleClassTitleChange = (listUuid: string, value: string) => {
    setClassDetails((prev) => {
      const current = prev[listUuid];
      if (!current) return prev;
      return {
        ...prev,
        [listUuid]: { ...current, classTitle: value, dirty: true },
      };
    });
  };

  const handleStudentChange = (listUuid: string, index: number, field: keyof Student, value: string) => {
    setClassDetails((prev) => {
      const current = prev[listUuid];
      if (!current) return prev;
      const students = current.students.map((student, i) =>
        i === index ? { ...student, [field]: value } : student
      );
      return {
        ...prev,
        [listUuid]: { ...current, students, dirty: true },
      };
    });
  };

  const handleAddStudent = (listUuid: string) => {
    setClassDetails((prev) => {
      const current = prev[listUuid];
      if (!current) return prev;
      return {
        ...prev,
        [listUuid]: {
          ...current,
          students: [...current.students, { id: "", nom: "", prenom: "", email: "" }],
          dirty: true,
        },
      };
    });
  };

  const handleRemoveStudent = (listUuid: string, index: number) => {
    setClassDetails((prev) => {
      const current = prev[listUuid];
      if (!current) return prev;
      const students = current.students.filter((_, i) => i !== index);
      return {
        ...prev,
        [listUuid]: { ...current, students, dirty: true },
      };
    });
  };

  const saveClassChanges = async (listUuid: string) => {
    const state = classDetails[listUuid];
    if (!state || state.saving) return;
    setClassDetails((prev) => ({
      ...prev,
      [listUuid]: { ...state, saving: true, error: null },
    }));
    try {
      const titleResponse = await fetch(`/classes/${listUuid}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ class_title: state.classTitle }),
      });
      if (!titleResponse.ok) {
        const data = await parseJson<{ error?: string }>(titleResponse);
        throw new Error(data?.error ?? "Impossible de mettre à jour le nom de la classe.");
      }

      const studentsResponse = await fetch(`/classes/${listUuid}/students`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ students: state.students }),
      });
      if (!studentsResponse.ok) {
        const data = await parseJson<{ error?: string }>(studentsResponse);
        throw new Error(data?.error ?? "Impossible d'enregistrer les étudiants.");
      }

      const studentsData = await parseJson<{ student_count?: number }>(studentsResponse);
      setClassDetails((prev) => ({
        ...prev,
        [listUuid]: { ...state, dirty: false, saving: false },
      }));
      setClasses((prev) =>
        prev.map((item) =>
          item.list_uuid === listUuid
            ? { ...item, class_title: state.classTitle, student_count: studentsData?.student_count ?? state.students.length }
            : item
        )
      );
    } catch (error) {
      setClassDetails((prev) => ({
        ...prev,
        [listUuid]: {
          ...state,
          saving: false,
          error: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  };

  const handleClassFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setClassCreationFile(file);
  };

  const handleClassCreation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!classCreationTitle.trim()) {
      setClassCreationError("Le nom de la classe est requis.");
      return;
    }
    setClassCreationBusy(true);
    setClassCreationError(null);
    try {
      const createResponse = await fetch("/classes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ class_title: classCreationTitle.trim() }),
      });
      if (!createResponse.ok) {
        const data = await parseJson<{ error?: string }>(createResponse);
        throw new Error(data?.error ?? "La création de la classe a échoué.");
      }
      const createData = await parseJson<{ class?: any }>(createResponse);
      const newClass = createData?.class;
      if (classCreationFile && newClass) {
        const formData = new FormData();
        formData.append("file", classCreationFile);
        const importResponse = await fetch(`/classes/${newClass.list_uuid}/students/import`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        if (!importResponse.ok) {
          const data = await parseJson<{ error?: string }>(importResponse);
          throw new Error(data?.error ?? "L'import du fichier CSV a échoué.");
        }
      }
      await loadClasses();
      setClassCreationTitle("");
      setClassCreationFile(null);
    } catch (error) {
      setClassCreationError(error instanceof Error ? error.message : String(error));
    } finally {
      setClassCreationBusy(false);
    }
  };

  const handleClassDelete = async (summary: ClassSummary) => {
    const confirmed = window.confirm(
      `Supprimer définitivement la classe « ${summary.class_title} » et ses étudiants ?`
    );
    if (!confirmed) return;
    try {
      const response = await fetch(`/classes/${summary.list_uuid}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const data = await parseJson<{ error?: string }>(response);
        throw new Error(data?.error ?? "La suppression de la classe a échoué.");
      }
      setClasses((prev) => prev.filter((item) => item.list_uuid !== summary.list_uuid));
      setClassDetails((prev) => {
        const { [summary.list_uuid]: _, ...rest } = prev;
        return rest;
      });
      setExpandedClasses((prev) => {
        const next = new Set(prev);
        next.delete(summary.list_uuid);
        return next;
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  const handleClassDownload = async (listUuid: string) => {
    window.open(`/classes/${listUuid}/students`, "_blank", "noopener");
  };

  const handleClassImport = async (listUuid: string, file: File | null) => {
    if (!file) return;
    const state = classDetails[listUuid];
    setClassDetails((prev) => ({
      ...prev,
      [listUuid]: state
        ? { ...state, saving: true, error: null }
        : { loading: false, error: null, classTitle: "", students: [], dirty: false, saving: true },
    }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/classes/${listUuid}/students/import`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) {
        const data = await parseJson<{ error?: string }>(response);
        throw new Error(data?.error ?? "L'import du fichier CSV a échoué.");
      }
      const data = await parseJson<{ students?: Student[]; student_count?: number }>(response);
      setClassDetails((prev) => ({
        ...prev,
        [listUuid]: {
          loading: false,
          error: null,
          classTitle: state?.classTitle ?? "",
          students: data?.students ?? [],
          dirty: false,
          saving: false,
        },
      }));
      setClasses((prev) =>
        prev.map((item) =>
          item.list_uuid === listUuid
            ? { ...item, student_count: data?.student_count ?? data?.students?.length ?? 0 }
            : item
        )
      );
    } catch (error) {
      setClassDetails((prev) => ({
        ...prev,
        [listUuid]: {
          ...state,
          saving: false,
          error: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  };

  const handleEmailChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailRequestBusy(true);
    setEmailChangeMessage(null);
    setEmailChangeError(null);
    try {
      const form = event.currentTarget;
      const formData = new FormData(form);
      const newEmail = (formData.get("new_email") as string) || "";
      const response = await fetch("/account/me/email-change", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_email: newEmail.trim() }),
      });
      const data = await parseJson<{ error?: string; message?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.error ?? "Impossible d'envoyer le code de vérification.");
      }
      setPendingEmail(newEmail.trim());
      setEmailChangeMessage(data?.message ?? "Code de vérification envoyé.");
      form.reset();
    } catch (error) {
      setEmailChangeError(error instanceof Error ? error.message : String(error));
    } finally {
      setEmailRequestBusy(false);
    }
  };

  const handleEmailVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!verificationCode.trim()) {
      setEmailChangeError("Le code de vérification est requis.");
      return;
    }
    setEmailVerifyBusy(true);
    setEmailChangeError(null);
    try {
      const response = await fetch("/account/me/email-change/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verification_code: verificationCode.trim() }),
      });
      const data = await parseJson<{ error?: string; message?: string; email?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.error ?? "Le code de vérification est invalide.");
      }
      setEmailChangeMessage(data?.message ?? "Adresse e-mail mise à jour.");
      if (data && typeof data.email === "string" && data.email.trim()) {
        const nextEmail = data.email.trim();
        onUserUpdate({ email: nextEmail });
        setProfile((prev) => ({ ...prev, email: nextEmail }));
      }
      setVerificationCode("");
      setPendingEmail("");
    } catch (error) {
      setEmailChangeError(error instanceof Error ? error.message : String(error));
    } finally {
      setEmailVerifyBusy(false);
    }
  };

  const handlePasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const currentPassword = (formData.get("current_password") as string) || "";
    const newPassword = (formData.get("new_password") as string) || "";
    const confirmPassword = (formData.get("confirm_password") as string) || "";
    if (newPassword !== confirmPassword) {
      setPasswordError("Les mots de passe ne correspondent pas.");
      return;
    }
    setPasswordBusy(true);
    setPasswordError(null);
    setPasswordMessage(null);
    try {
      const response = await fetch("/account/me/password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      const data = await parseJson<{ error?: string; message?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.error ?? "Impossible de mettre à jour le mot de passe.");
      }
      setPasswordMessage(data?.message ?? "Mot de passe mis à jour.");
      form.reset();
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : String(error));
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleDownloadData = () => {
    window.open("/account/me/export", "_blank", "noopener");
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "Êtes-vous sûr de vouloir supprimer votre compte ? Toutes vos données seront perdues définitivement."
    );
    if (!confirmed) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const response = await fetch("/account/me", {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const data = await parseJson<{ error?: string }>(response);
        throw new Error(data?.error ?? "La suppression du compte a échoué.");
      }
      await parseJson(response);
      onLogout();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error));
      setDeleteBusy(false);
    }
  };

  const localeDate = useCallback((value?: string) => {
    if (!value) return "—";
    try {
      return new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value));
    } catch {
      return value;
    }
  }, []);

  const sortedClasses = useMemo(
    () => [...classes].sort((a, b) => a.class_title.localeCompare(b.class_title, "fr")),
    [classes]
  );

  return (
    <div className="settings app-page">
      <header className="settings__hero app-hero">
        <div className="settings__hero-content app-hero__content">
          <div className="settings__hero-headline app-hero__headline">
            <span className="settings__eyebrow app-eyebrow">Radi Quiz</span>
            <h1>Paramètres du compte</h1>
            <p>
              Personnalisez votre établissement, maintenez vos listes d’étudiants et gérez vos informations
              d’instructeur. Toutes les modifications sont synchronisées avec votre espace sécurisé.
            </p>
          </div>
          <div className="settings__hero-actions app-hero__actions">
            <button className="app-button app-button--secondary" onClick={onBack}>
              Retour au tableau de bord
            </button>
            <button className="app-button app-button--secondary" onClick={onNavigateHelp}>
              Centre d'aide
            </button>
            <button className="app-button app-button--secondary" onClick={onLogout}>
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="settings__main app-main">
        <section className="settings__section app-card">
          <div className="settings__section-header">
            <h2>Informations de l’instructeur</h2>
            <p>
              Ces informations sont utilisées pour personnaliser vos communications et vos exports AMC.
            </p>
          </div>
          <form className="settings__form" onSubmit={handleProfileSubmit}>
            <div className="settings__grid">
              <label className="settings__field">
                <span>Prénom</span>
                <input
                  value={profile.first_name}
                  onChange={(event) =>
                    setProfile((prev) => ({ ...prev, first_name: event.target.value }))
                  }
                />
              </label>
              <label className="settings__field">
                <span>Nom</span>
                <input
                  value={profile.last_name}
                  onChange={(event) =>
                    setProfile((prev) => ({ ...prev, last_name: event.target.value }))
                  }
                />
              </label>
              <label className="settings__field settings__field--wide">
                <span>Adresse e-mail</span>
                <input value={profile.email} readOnly />
              </label>
            </div>
            <div className="settings__actions">
              <button className="app-button app-button--primary settings__primary" type="submit" disabled={profileBusy}>
                Enregistrer le profil
              </button>
            </div>
            {profileMessage ? <div className="app-status">{profileMessage}</div> : null}
            {profileError ? <div className="app-error">{profileError}</div> : null}
          </form>
        </section>

        <section className="settings__section app-card">
          <div className="settings__section-header">
            <h2>Paramètres généraux des quizzes</h2>
            <p>
              Ces valeurs sont appliquées par défaut lors de la création d’un nouveau quiz. Vous pouvez toujours les
              ajuster par quiz depuis la page correspondante.
            </p>
          </div>
          <form className="settings__form" onSubmit={handleDefaultsSubmit}>
            <label className="settings__field settings__field--wide">
              <span>Établissement</span>
              <input
                value={defaults.institution_name}
                onChange={(event) =>
                  setDefaults((prev) => ({ ...prev, institution_name: event.target.value }))
                }
              />
            </label>
            <label className="settings__field settings__field--wide">
              <span>Instructions aux étudiants</span>
              <textarea
                value={defaults.student_instructions}
                onChange={(event) =>
                  setDefaults((prev) => ({ ...prev, student_instructions: event.target.value }))
                }
                rows={4}
              />
            </label>
            <label className="settings__field settings__field--wide">
              <span>Explication du codage</span>
              <textarea
                value={defaults.coding_explanation}
                onChange={(event) =>
                  setDefaults((prev) => ({ ...prev, coding_explanation: event.target.value }))
                }
                rows={3}
              />
            </label>
            <div className="settings__grid">
              <label className="settings__field">
                <span>Langue par défaut</span>
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
              <label className="settings__field">
                <span>Sujet du courriel de résultats</span>
                <input
                  value={defaults.email_subject}
                  onChange={(event) =>
                    setDefaults((prev) => ({ ...prev, email_subject: event.target.value }))
                  }
                />
              </label>
            </div>
            <label className="settings__field settings__field--wide">
              <span>Corps du courriel de résultats</span>
              <textarea
                value={defaults.email_body}
                onChange={(event) =>
                  setDefaults((prev) => ({ ...prev, email_body: event.target.value }))
                }
                rows={6}
              />
              <small>
                Vous pouvez utiliser des placeholders comme <code>{"{student_name}"}</code>,{" "}
                <code>{"{quiz_title}"}</code> ou <code>{"{grade}"}</code>.
              </small>
            </label>
            <div className="settings__actions">
              <button className="app-button app-button--primary settings__primary" type="submit" disabled={defaultsBusy}>
                Enregistrer les paramètres
              </button>
            </div>
            {defaultsMessage ? <div className="app-status">{defaultsMessage}</div> : null}
            {defaultsError ? <div className="app-error">{defaultsError}</div> : null}
          </form>
        </section>

        <section className="settings__section app-card">
          <div className="settings__section-header">
            <h2>Listes d’étudiants</h2>
            <p>
              Gérez vos classes et les listes d’étudiants associées. Importez des fichiers CSV (colonnes obligatoires :
              <code>id</code>, <code>nom</code>, <code>prenom</code>, <code>email</code>).
            </p>
          </div>

          <form className="settings__form settings__form--inline" onSubmit={handleClassCreation}>
            <label className="settings__field">
              <span>Nom de la classe</span>
              <input
                value={classCreationTitle}
                onChange={(event) => setClassCreationTitle(event.target.value)}
                placeholder="Ex : L3 Mathématiques"
              />
            </label>
            <label className="settings__field">
              <span>Importer un CSV (optionnel)</span>
              <input type="file" accept=".csv" onChange={handleClassFileChange} />
            </label>
            <div className="settings__actions">
              <button className="app-button app-button--primary settings__primary" type="submit" disabled={classCreationBusy}>
                Ajouter une classe
              </button>
            </div>
            {classCreationError ? <div className="app-error">{classCreationError}</div> : null}
          </form>

          {classesLoading ? (
            <div className="settings__placeholder">Chargement des classes…</div>
          ) : classesError ? (
            <div className="app-error">{classesError}</div>
          ) : sortedClasses.length === 0 ? (
            <div className="settings__placeholder">Aucune classe pour le moment.</div>
          ) : (
            <ul className="settings__class-list">
              {sortedClasses.map((classItem) => {
                const state = classDetails[classItem.list_uuid];
                const isExpanded = expandedClasses.has(classItem.list_uuid);
                return (
                  <li key={classItem.list_uuid} className="settings__class-item">
                    <header className="settings__class-header">
                      <button
                        type="button"
                        className="settings__class-toggle"
                        onClick={() => toggleClassExpanded(classItem.list_uuid)}
                      >
                        <span>{classItem.class_title}</span>
                        <span className="settings__class-meta">
                          {classItem.student_count} étudiant{classItem.student_count > 1 ? "s" : ""}
                        </span>
                        <span className="settings__class-meta">{localeDate(classItem.updated_at)}</span>
                      </button>
                      <div className="settings__class-actions">
                        <button
                          type="button"
                          className="app-button app-button--ghost"
                          onClick={() => handleClassDownload(classItem.list_uuid)}
                        >
                          Télécharger CSV
                        </button>
                        <label className="settings__upload">
                          Importer CSV
                          <input
                            type="file"
                            accept=".csv"
                            onChange={(event) =>
                              handleClassImport(classItem.list_uuid, event.target.files?.[0] ?? null)
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="app-button app-button--danger"
                          onClick={() => handleClassDelete(classItem)}
                        >
                          Supprimer
                        </button>
                      </div>
                    </header>
                    {isExpanded ? (
                      <div className="settings__class-body">
                        {state?.error ? <div className="app-error">{state.error}</div> : null}
                        {state?.loading ? (
                          <div className="settings__placeholder">Chargement…</div>
                        ) : state ? (
                          <>
                            <label className="settings__field settings__field--wide">
                              <span>Nom de la classe</span>
                              <input
                                value={state.classTitle}
                                onChange={(event) =>
                                  handleClassTitleChange(classItem.list_uuid, event.target.value)
                                }
                              />
                            </label>
                            <div className="settings__roster">
                              <div className="settings__roster-header">
                                <h3>Étudiants</h3>
                                <button
                                  type="button"
                                  className="app-button app-button--secondary"
                                  onClick={() => handleAddStudent(classItem.list_uuid)}
                                  disabled={state.saving}
                                >
                                  Ajouter un étudiant
                                </button>
                              </div>
                              <div className="settings__roster-table">
                                <div className="settings__roster-row settings__roster-row--head">
                                  <span>ID</span>
                                  <span>Nom</span>
                                  <span>Prénom</span>
                                  <span>Email</span>
                                  <span />
                                </div>
                                {state.students.map((student, index) => (
                                  <div key={`${classItem.list_uuid}-${index}`} className="settings__roster-row">
                                    <input
                                      value={student.id}
                                      onChange={(event) =>
                                        handleStudentChange(classItem.list_uuid, index, "id", event.target.value)
                                      }
                                    />
                                    <input
                                      value={student.nom}
                                      onChange={(event) =>
                                        handleStudentChange(classItem.list_uuid, index, "nom", event.target.value)
                                      }
                                    />
                                    <input
                                      value={student.prenom}
                                      onChange={(event) =>
                                        handleStudentChange(classItem.list_uuid, index, "prenom", event.target.value)
                                      }
                                    />
                                    <input
                                      value={student.email}
                                      onChange={(event) =>
                                        handleStudentChange(classItem.list_uuid, index, "email", event.target.value)
                                      }
                                      placeholder="optionnel"
                                    />
                                    <button
                                      type="button"
                                      className="app-button app-button--ghost"
                                      onClick={() => handleRemoveStudent(classItem.list_uuid, index)}
                                      disabled={state.saving}
                                    >
                                      Supprimer
                                    </button>
                                  </div>
                                ))}
                                {state.students.length === 0 ? (
                                  <div className="settings__placeholder settings__placeholder--tight">
                                    Aucun étudiant pour cette classe.
                                  </div>
                                ) : null}
                              </div>
                              <div className="settings__actions">
                                <button
                                  className="app-button app-button--primary settings__primary"
                                  type="button"
                                  onClick={() => saveClassChanges(classItem.list_uuid)}
                                  disabled={state.saving || !state.dirty}
                                >
                                  Enregistrer la classe
                                </button>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="settings__placeholder">Sélectionnez une classe pour afficher les détails.</div>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="settings__section app-card">
          <div className="settings__section-header">
            <h2>Gestion de l’e-mail</h2>
            <p>
              Mettez à jour votre adresse e-mail de connexion. Un code de vérification est envoyé à la nouvelle
              adresse pour confirmer la modification.
            </p>
          </div>
          <div className="settings__double-column">
            <form className="settings__form" onSubmit={handleEmailChange}>
              <label className="settings__field settings__field--wide">
                <span>Nouvelle adresse e-mail</span>
                <input type="email" name="new_email" placeholder="exemple@universite.fr" required />
              </label>
              <div className="settings__actions">
                <button className="app-button app-button--primary settings__primary" type="submit" disabled={emailRequestBusy}>
                  Envoyer le code
                </button>
              </div>
            </form>
            <form className="settings__form" onSubmit={handleEmailVerify}>
              <label className="settings__field settings__field--wide">
                <span>Code de vérification</span>
                <input
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value)}
                  placeholder="Code reçu par e-mail"
                  required
                />
              </label>
              <div className="settings__actions">
                <button className="app-button app-button--primary settings__primary" type="submit" disabled={emailVerifyBusy}>
                  Confirmer le changement
                </button>
              </div>
            </form>
          </div>
          {pendingEmail ? (
            <div className="app-status">
              Un code a été envoyé à <strong>{pendingEmail}</strong>. Veuillez le saisir pour confirmer.
            </div>
          ) : null}
          {emailChangeMessage ? <div className="app-status">{emailChangeMessage}</div> : null}
          {emailChangeError ? <div className="app-error">{emailChangeError}</div> : null}
        </section>

        <section className="settings__section app-card">
          <div className="settings__section-header">
            <h2>Mot de passe</h2>
            <p>
              Le nouveau mot de passe doit comporter 8 à 30 caractères avec au moins une majuscule, une minuscule, un
              chiffre et un caractère spécial.
            </p>
          </div>
          <form className="settings__form settings__form--narrow" onSubmit={handlePasswordChange}>
            <label className="settings__field settings__field--wide">
              <span>Mot de passe actuel</span>
              <input type="password" name="current_password" required />
            </label>
            <label className="settings__field settings__field--wide">
              <span>Nouveau mot de passe</span>
              <input type="password" name="new_password" required minLength={8} />
            </label>
            <label className="settings__field settings__field--wide">
              <span>Confirmer le nouveau mot de passe</span>
              <input type="password" name="confirm_password" required minLength={8} />
            </label>
            <div className="settings__actions">
              <button className="app-button app-button--primary settings__primary" type="submit" disabled={passwordBusy}>
                Mettre à jour le mot de passe
              </button>
            </div>
            {passwordMessage ? <div className="app-status">{passwordMessage}</div> : null}
            {passwordError ? <div className="app-error">{passwordError}</div> : null}
          </form>
        </section>

        <section className="settings__section app-card">
          <div className="settings__section-header">
            <h2>Données et compte</h2>
            <p>
              Exportez l’intégralité de vos données ou supprimez votre compte. Cette dernière action est définitive
              et supprimera tous vos quizzes, classes et instructions.
            </p>
          </div>
          <div className="settings__form settings__form--narrow">
            <div className="settings__actions">
              <button className="app-button app-button--secondary settings__secondary" type="button" onClick={handleDownloadData}>
                Télécharger toutes mes données
              </button>
              <button
                className="app-button app-button--danger settings__danger"
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteBusy}
              >
                Supprimer mon compte
              </button>
            </div>
            {deleteError ? <div className="app-error">{deleteError}</div> : null}
          </div>
        </section>
      </main>
    </div>
  );
};

export default SettingsPage;
