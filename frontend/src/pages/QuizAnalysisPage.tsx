import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../services/api";
import { LinkCTA } from "../components/LinkCTA";
import { QuizTabs } from "../components/QuizTabs";
import "./QuizAnalysisPage.css";

type StatusPayload = {
  status: string;
  updated_at?: string;
  threshold?: number;
  student_count?: number;
};

type StatusResponse = {
  status: StatusPayload;
};

type CheckboxEntry = {
  student: string;
  page: string;
  checkbox: string;
  ratio: number;
  overridden?: boolean;
};

type OverrideEntry = {
  student: string;
  page: string;
  checkbox: string;
  checked: boolean;
};

type CheckboxResponse = {
  checked: CheckboxEntry[];
  unchecked: CheckboxEntry[];
  threshold: number;
  overrides?: OverrideEntry[];
};

type AssociationsResponse = {
  associations: AssociationEntry[];
};

type AssociationEntry = {
  student: number;
  copy: number;
  manual: string | null;
  auto: string | null;
};

type NotesResponse = {
  notes: Array<Record<string, string>>;
};

type TranscriptionResponse = {
  results: Array<{ student: string; prenom: string; nom: string; raw: string }>;
};

type QuizResponse = {
  quiz: {
    quiz_title: string;
    quiz_state: string;
  };
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

const clampThreshold = (value: number) => Math.min(1, Math.max(0, value));

export const QuizAnalysisPage = () => {
  const { quizId } = useParams<{ quizId: string }>();
  const [quiz, setQuiz] = useState<QuizResponse["quiz"] | null>(null);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [checked, setChecked] = useState<CheckboxEntry[]>([]);
  const [unchecked, setUnchecked] = useState<CheckboxEntry[]>([]);
  const [overrides, setOverrides] = useState<OverrideEntry[]>([]);
  const [threshold, setThreshold] = useState(0.5);
  const [associations, setAssociations] = useState<AssociationEntry[]>([]);
  const [notes, setNotes] = useState<Array<Record<string, string>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isRunningAnalysis, setIsRunningAnalysis] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [savingAssociations, setSavingAssociations] = useState(false);
  const [uploadingCopies, setUploadingCopies] = useState(false);
  const [downloadingCorrections, setDownloadingCorrections] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const isLocked = quiz?.quiz_state === "locked";
  const analysisCompleted = status?.status === "completed";

  const loadData = async () => {
    if (!quizId) return;
    setLoading(true);
    setError(null);
    try {
      const [quizData, statusData] = await Promise.all([
        apiFetch<QuizResponse>(`/quizzes/${quizId}`, { method: "GET" }),
        apiFetch<StatusResponse>(`/quizzes/${quizId}/analysis/status`, { method: "GET" }).catch(
          () => ({ status: { status: "idle", threshold: 0.5 } }),
        ),
      ]);
      setQuiz(quizData.quiz);
      setStatus(statusData.status);
      if (statusData.status.threshold !== undefined) {
        setThreshold(statusData.status.threshold);
      }
      if (statusData.status.status === "completed") {
        await Promise.all([
          loadCheckboxes(),
          loadAssociations(),
          loadNotes(),
        ]);
      } else {
        setChecked([]);
        setUnchecked([]);
        setAssociations([]);
        setNotes([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les données.");
    } finally {
      setLoading(false);
    }
  };

  const loadCheckboxes = async () => {
    if (!quizId) return;
    try {
      const data = await apiFetch<CheckboxResponse>(
        `/quizzes/${quizId}/analysis/checkboxes`,
        { method: "GET" },
      );
      setChecked(data.checked ?? []);
      setUnchecked(data.unchecked ?? []);
      setOverrides(data.overrides ?? []);
      if (data.threshold !== undefined) {
        setThreshold(data.threshold);
      }
    } catch (err) {
      // Ignore while waiting for analysis
    }
  };

  const loadAssociations = async () => {
    if (!quizId) return;
    try {
      const data = await apiFetch<AssociationsResponse>(
        `/quizzes/${quizId}/analysis/associations`,
        { method: "GET" },
      );
      setAssociations(data.associations ?? []);
    } catch (err) {
      // optional
    }
  };

  const loadNotes = async () => {
    if (!quizId) return;
    try {
      const data = await apiFetch<NotesResponse>(
        `/quizzes/${quizId}/analysis/notes`,
        { method: "GET" },
      );
      setNotes(data.notes ?? []);
    } catch (err) {
      // optional
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  const handleUploadCopies = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!quizId) return;
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingCopies(true);
    setError(null);
    setNotice(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE_URL}/quizzes/${quizId}/uploads/copies`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Échec de l'upload.");
      }
      setNotice("Copies téléchargées. Vous pouvez lancer l'analyse.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec du téléversement des copies.");
    } finally {
      setUploadingCopies(false);
      event.target.value = "";
    }
  };

  const handleStartAnalysis = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!quizId) return;
    setIsRunningAnalysis(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/quizzes/${quizId}/analysis`, {
        method: "POST",
        json: { threshold },
      });
      setNotice("Analyse lancée. Actualisez dans quelques instants.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec du lancement de l'analyse.");
    } finally {
      setIsRunningAnalysis(false);
    }
  };

  const handleRecalculate = async () => {
    if (!quizId) return;
    setIsRecalculating(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/quizzes/${quizId}/analysis/recalculate`, { method: "POST" });
      setNotice("Recalcul terminé.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Le recalcul a échoué.");
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleSaveAssociations = async () => {
    if (!quizId) return;
    setSavingAssociations(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/quizzes/${quizId}/analysis/associations`, {
        method: "PATCH",
        json: { associations },
      });
      setNotice("Associations mises à jour.");
      await loadAssociations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "La mise à jour des associations a échoué.");
    } finally {
      setSavingAssociations(false);
    }
  };

  const handleDownloadCorrections = async () => {
    if (!quizId) return;
    setDownloadingCorrections(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/quizzes/${quizId}/analysis/corrections.zip`, {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Échec du téléchargement.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "corrections.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec du téléchargement des corrections.");
    } finally {
      setDownloadingCorrections(false);
    }
  };

  const updateOverride = async (entry: CheckboxEntry, checkedTarget: boolean) => {
    if (!quizId) return;
    const key = `${entry.student}-${entry.page}-${entry.checkbox}`;
    const nextOverrides = [...overrides];
    const existingIndex = nextOverrides.findIndex(
      (override) => `${override.student}-${override.page}-${override.checkbox}` === key,
    );
    if (existingIndex >= 0) {
      nextOverrides[existingIndex] = { ...nextOverrides[existingIndex], checked: checkedTarget };
    } else {
      nextOverrides.push({
        student: entry.student,
        page: entry.page,
        checkbox: entry.checkbox,
        checked: checkedTarget,
      });
    }
    setOverrides(nextOverrides);
    try {
      await apiFetch(`/quizzes/${quizId}/analysis/checkboxes`, {
        method: "PATCH",
        json: {
          threshold,
          overrides: nextOverrides,
        },
      });
      if (checkedTarget) {
        setChecked((prev) => [entry, ...prev.filter((item) => `${item.student}-${item.page}-${item.checkbox}` !== key)]);
        setUnchecked((prev) => prev.filter((item) => `${item.student}-${item.page}-${item.checkbox}` !== key));
      } else {
        setUnchecked((prev) => [entry, ...prev.filter((item) => `${item.student}-${item.page}-${item.checkbox}` !== key)]);
        setChecked((prev) => prev.filter((item) => `${item.student}-${item.page}-${item.checkbox}` !== key));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de mettre à jour le statut de la case.");
    }
  };

  const handleThresholdApply = async () => {
    if (!quizId) return;
    try {
      await apiFetch(`/quizzes/${quizId}/analysis/checkboxes`, {
        method: "PATCH",
        json: {
          threshold,
        },
      });
      setNotice("Seuil mis à jour.");
      await loadCheckboxes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la mise à jour du seuil.");
    }
  };

  const handleTranscribe = async () => {
    if (!quizId) return;
    setTranscribing(true);
    setError(null);
    setNotice(null);
    try {
      const missing = associations
        .filter((entry) => !entry.manual || entry.manual.trim().length === 0)
        .map((entry) => entry.student.toString());
      if (missing.length === 0) {
        setNotice("Aucune transcription nécessaire.");
        return;
      }
      const response = await apiFetch<TranscriptionResponse>(
        `/quizzes/${quizId}/analysis/associations/transcribe_names`,
        { method: "POST", json: { students: missing } },
      );
      setAssociations((prev) =>
        prev.map((entry) => {
          const match = response.results.find((item) => item.student === entry.student.toString());
          if (!match) return entry;
          return {
            ...entry,
            manual: `${match.nom.toUpperCase()} ${match.prenom}`.trim(),
          };
        }),
      );
      setNotice("Transcription IA terminée. Vérifiez et enregistrez les associations.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "La transcription IA a échoué.");
    } finally {
      setTranscribing(false);
    }
  };

  const summaryColumns = useMemo(() => (notes[0] ? Object.keys(notes[0]) : []), [notes]);

  if (!quizId) {
    return null;
  }

  if (loading) {
    return (
      <div className="quiz-analysis__loading">
        <p>Chargement des données…</p>
      </div>
    );
  }

  return (
    <div className="quiz-analysis">
      <header className="quiz-analysis__header">
        <div>
          <span className="quiz-analysis__eyebrow">Quiz AMC</span>
          <h1>Analyse & corrections</h1>
          <p>
            Téléversez les copies scannées, lancez l'analyse AMC, ajustez les associations et générez les
            corrections personnalisées.
          </p>
        </div>
        <LinkCTA href="/dashboard" variant="ghost">
          Retour
        </LinkCTA>
      </header>

      <QuizTabs active="analysis" />

      {notice && <div className="quiz-analysis__notice quiz-analysis__notice--success">{notice}</div>}
      {error && <div className="quiz-analysis__notice quiz-analysis__notice--error">{error}</div>}

      <main className="quiz-analysis__layout">
        <section className="quiz-analysis__panel quiz-analysis__actions">
          <h2>Étapes principales</h2>
          <div className="quiz-analysis__action-group">
            <label className="quiz-analysis__upload">
              <span>Copies scannées (PDF)</span>
              <input type="file" accept="application/pdf" onChange={handleUploadCopies} />
            </label>
            <form className="quiz-analysis__form" onSubmit={handleStartAnalysis}>
              <label>
                Seuil de détection ({Math.round(threshold * 100)}%)
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={threshold}
                  onChange={(event) => setThreshold(clampThreshold(Number(event.target.value)))}
                />
              </label>
              <div className="quiz-analysis__form-actions">
                <button type="submit" disabled={isRunningAnalysis || !isLocked}>
                  {isRunningAnalysis ? "Analyse en cours…" : "Lancer l'analyse"}
                </button>
                <button
                  type="button"
                  onClick={handleThresholdApply}
                  disabled={!analysisCompleted}
                  className="quiz-analysis__secondary"
                >
                  Appliquer le seuil
                </button>
              </div>
            </form>
            <button
              onClick={handleRecalculate}
              disabled={!analysisCompleted || isRecalculating}
              className="quiz-analysis__button"
            >
              {isRecalculating ? "Recalcul…" : "Recalculer les notes"}
            </button>
            <button
              onClick={handleDownloadCorrections}
              disabled={!analysisCompleted || downloadingCorrections}
              className="quiz-analysis__button quiz-analysis__button--ghost"
            >
              {downloadingCorrections ? "Téléchargement…" : "Télécharger les corrections"}
            </button>
            <p className="quiz-analysis__hint">
              État actuel : {status?.status ?? "idle"} • Dernière mise à jour : {status?.updated_at ?? "—"}
            </p>
          </div>
        </section>

        <section className="quiz-analysis__panel quiz-analysis__checkboxes">
          <div className="quiz-analysis__panel-header">
            <h2>Cases détectées</h2>
            <p>Vérifiez les cases incertaines et corrigez-les manuellement.</p>
          </div>
          {analysisCompleted ? (
            <div className="quiz-analysis__checkbox-grid">
              <div>
                <h3>À vérifier ({unchecked.length})</h3>
                <ul>
                  {unchecked.map((entry) => (
                    <li key={`${entry.student}-${entry.page}-${entry.checkbox}`}>
                      <span>
                        Étudiant #{entry.student} – Page {entry.page} – Case {entry.checkbox} ({
                          Math.round(entry.ratio * 100)
                        }
                        %)
                      </span>
                      <button onClick={() => updateOverride(entry, true)}>Marquer comme cochée</button>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Validées ({checked.length})</h3>
                <ul>
                  {checked.map((entry) => (
                    <li key={`${entry.student}-${entry.page}-${entry.checkbox}`}>
                      <span>
                        Étudiant #{entry.student} – Page {entry.page} – Case {entry.checkbox}
                      </span>
                      <button onClick={() => updateOverride(entry, false)}>Annuler</button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p>Les cases seront disponibles après la première analyse.</p>
          )}
        </section>

        <section className="quiz-analysis__panel quiz-analysis__associations">
          <div className="quiz-analysis__panel-header">
            <h2>Association des étudiants</h2>
            <p>Ajustez les correspondances entre copies et étudiants.</p>
          </div>
          {analysisCompleted ? (
            <>
              <button
                className="quiz-analysis__secondary"
                onClick={handleTranscribe}
                disabled={transcribing}
              >
                {transcribing ? "Transcription…" : "Transcrire les noms manuscrits"}
              </button>
              <table>
                <thead>
                  <tr>
                    <th>Étudiant#</th>
                    <th>ID détecté</th>
                    <th>Association manuelle</th>
                  </tr>
                </thead>
                <tbody>
                  {associations.map((entry) => (
                    <tr key={entry.student}>
                      <td>{entry.student}</td>
                      <td>{entry.auto ?? "—"}</td>
                      <td>
                        <input
                          type="text"
                          value={entry.manual ?? ""}
                          onChange={(event) =>
                            setAssociations((prev) =>
                              prev.map((item) =>
                                item.student === entry.student
                                  ? { ...item, manual: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          placeholder="Nom manuel"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                className="quiz-analysis__button"
                onClick={handleSaveAssociations}
                disabled={savingAssociations}
              >
                {savingAssociations ? "Enregistrement…" : "Enregistrer les associations"}
              </button>
            </>
          ) : (
            <p>Les associations seront affichées après l'analyse.</p>
          )}
        </section>

        <section className="quiz-analysis__panel quiz-analysis__summary">
          <div className="quiz-analysis__panel-header">
            <h2>Notes synthétiques</h2>
            <p>Exportez ou consultez les notes calculées par AMC.</p>
          </div>
          {analysisCompleted && notes.length > 0 ? (
            <div className="quiz-analysis__table-wrapper">
              <table>
                <thead>
                  <tr>
                    {summaryColumns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {notes.map((row, index) => (
                    <tr key={index}>
                      {summaryColumns.map((column) => (
                        <td key={column}>{row[column] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Les notes apparaîtront une fois l'analyse terminée.</p>
          )}
        </section>
      </main>
    </div>
  );
};
