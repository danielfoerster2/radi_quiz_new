# System Overview

This application is a graphical web interface for the LaTeX Auto Multiple Choice (AMC) suite with AI-assisted tooling. The UI supports French by default while allowing English-language quizzes and content throughout the workflow.

## Technology Stack

- **Backend:** Python/Flask integrated with Auto Multiple Choice.
- **Frontend:** TypeScript single-page application: React + TypeScript built with Vite.
- **Persistence:** PostgreSQL for instructor accounts, plus per-user SQLite databases and file storage.

### PostgreSQL `users` table

The `users` table stores instructor authentication and verification data with the following columns:

- `email`
- `user_uuid`
- `salt`
- `salted_password_hash`
- `one_time_pwd`
- `one_time_pwd_expires_at`
- `verification_code`
- `last_active`

## Directory Structure

Each instructor (`user_uuid`) owns a directory populated:

- `user_defaults.sqlite`: columns `first_name`, `last_name`, `institution_name`, `student_instructions`, `coding_explanation`, `email_subject`, `email_body`, `quiz_language`.
- `classes.sqlite`: columns `class_title`, `student_list`.
- `quizes.sqlite`: columns `quiz_uuid`, `quiz_title`, `creation_date`, `quiz_state`, `id_coding`, `number_of_questions`, `institution_name`, `student_instructions`, `coding_explanation`, `email_subject`, `email_body`, `class_title`, `date_of_quiz`, `duration`, `quiz_language`, `random_question_order`, `random_answer_order`, `two_up_printing`.
- `{list_uuid}.csv`: one CSV per student list.
- `{quiz_uuid}/`: quiz-specific directory containing:
  - `questions.sqlite`: columns `question_uuid`, `question_text`, `question_type`, `subject_title`, `subject_uuid`, `points`, `question_number`, `illustration_filename`, `illustration_width`, `number_of_lines`.
  - `answers.sqlite`: columns `question_uuid`, `answer_option`, `correct`.
  - `list.csv`: student list.
  - `illustrations/`: image assets stored as `<md5>.png` or `<md5>.jpg`.
  - `amc_session/`: workspace used while compiling AMC documents.

## Frontend Application

### A. Landing Page

- **A1:** Present a concise description of the software.
- **A2:** Provide account-creation and login options. Login with Google should request the email address only; otherwise email verification is required.
  - **Create account (email/password):** Collect email and a password entered twice (8–30 characters; at least one uppercase letter, lowercase letter, digit, and special character). If the email is new or the existing record has `verification_code != "-1"`, create a row in `users` with generated `user_uuid`, salt, salted hash, and verification code. Send the verification code by email. After the user confirms the code, set `verification_code` to `"-1"`, create the `{user_uuid}` directory with prefilled `user_defaults.sqlite`, empty `classes.sqlite`, and empty `quizes.sqlite`, then sign the user in. If an account already exists with `verification_code == "-1"`, show an “account already exists” error.
  - **Create account (Google Sign-In):** If the email exists in `users`, proceed directly to login. Otherwise create a new record with generated `user_uuid`, set `verification_code` to `"-1"`, and create the `{user_uuid}` directory as above.
- **Login (email/password):** Compute the salted password hash and compare it with `salted_password_hash`. If it does not match, compare the entered password with `one_time_pwd` and confirm that the current time is earlier than `one_time_pwd_expires_at`. When the one-time password is valid, prompt the user to set a new password (same complexity rules), generate a new salt and hash, save both, and set `one_time_pwd_expires_at` to the current time. On successful login, set `last_active` to the current timestamp. If neither credential path succeeds, display an error.
  - **Login attempt with password on a Google-only account:** Detect the absence of password credentials (missing hash) and instruct the user to sign in with Google or trigger the password reset flow to establish credentials.
- **Login (Google Sign-In):** Authenticate with Google and log the user in when successful, updating `last_active` at the end of the flow.
- **Forgot password:** Generate a one-time password (OTP), send it by email, write it to `one_time_pwd`, and set `one_time_pwd_expires_at` to 15 minutes in the future.
- **Session activity:** Each authenticated API request updates `last_active`. When a user’s `last_active` is more than 30 minutes old, expire the session and require re-authentication. While inactive, encrypt the on-disk `{user_uuid}` directory using a service key; decrypt it only after successful login.

### B. Dashboard Page

- **B1:** “Create new quiz” button generates a new `quiz_uuid`, creates `{user_uuid}/{quiz_uuid}`, and inserts a row into `quizes.sqlite` with `quiz_uuid`, the current time as `creation_date`, `quiz_state = "unlocked"`, `id_coding = "8"`, `number_of_questions = "0"`, `quiz_language`, and `institution_name`, `student_instructions`, `coding_explanation`, `email_subject`, `email_body` copied from `user_defaults.sqlite`. The UI then navigates to section E1.
- **B2:** List available quizzes with columns `quiz_title`, `number_of_questions`, `creation_date`, `quiz_state`, and actions.
  - **Delete:** Ask for explicit confirmation (highlighting that data is unrecoverable), then remove the corresponding row from `quizes.sqlite` and delete `{user_uuid}/{quiz_uuid}`.
  - **Duplicate:** Generate a new `quiz_uuid`, copy the source quiz directory (excluding any `amc_session` subdirectory), and duplicate the database row with the new `quiz_uuid`, `quiz_state = "unlocked"`, and a fresh `creation_date`.
  - **Unlock quiz:** Available only when `quiz_state` is `"locked"`. Display a warning that unlocking invalidates any previously generated `sujet.pdf` and prevents automated correction for that version. Proceed only after explicit confirmation, then set `quiz_state` back to `"unlocked"`.

### C. Settings Page

- **C1 Global defaults:** Editable fields for institution name, student instructions (By default: “Aucun document n'est autorisé. L’usage de la calculatrice est interdit. Les questions faisant apparaître le symbole ♣ peuvent présenter zéro, une ou plusieurs bonnes réponses. Les autres ont une unique bonne réponse.”), default quiz language, email subject for grade delivery, and email body (with placeholders for student name, quiz title, grade, instructor name). Load values from `user_defaults.sqlite` and persist edits there.
- **C2 Student lists:** Display each row from `classes.sqlite` with editable `class_title` and associated student list (`{list_uuid}.csv`) if any. Show a collapsed table by default and provide a delete action that removes the corresponding CSV and database row after confirmation.
  - **Create new class:** Allow uploading a CSV (max 500 kB). Validate format, then display the editable student list containing columns `id`, `nom`, `prenom`, `email` (`email` optional). Generate a new `list_uuid`, save the file as `{list_uuid}.csv`, and insert an entry in `classes.sqlite` with `class_title` and the file reference.
  - **Edit existing class:** Persist changes to both `classes.sqlite` and the corresponding `{list_uuid}.csv`.
- **C3 Instructor details:** Editable `first_name` and `last_name`, loaded from and saved to `user_defaults.sqlite`.
- **Change email:** Collect a new email address, generate a verification code (email not stored until confirmed), and email the code. Update the `users` table `email` only after successful verification.
- **Change password:** Prompt for a new password twice (same complexity rules), generate a new salt and hash, and update the `users` record.
- **Download all my data:** Create a ZIP archive of the `{user_uuid}` directory and make it available for download.
- **Delete account:** Confirm intent, log the user out, delete `{user_uuid}`, and remove the corresponding row from `users`.

### D. Help Page

Provide detailed guidance on features and workflows, including a question-and-answer section. Offer a mechanism to contact support via `email_service` for questions, feature requests, and bugs.

### E. Quiz Page

This page uses tabs to manage quizzes.

- **E1 Generalities:** Manage quiz metadata stored in `quizes.sqlite`.
  - `quiz_title`.
  - `institution_name`.
  - `class_title`: editable text field plus dropdown populated from `classes.sqlite`.
  - `date_of_quiz`: calendar selector (French locale).
  - `duration`.
  - `student_instructions`.
  - `quiz_language`: dropdown with at least French (`fr`) and English (`en`).
  - `id_coding`: enable student ID coding by storing the number of digits and the explanation in `coding_explanation`; set `id_coding = -1` when disabled.
- **E2 Questions:** Load and persist structural data in `questions.sqlite` and answer rows in `answers.sqlite`.
  - Question attributes include `question_uuid`, `question_text`, `question_type` (`simple`, `multiple-choice`, or `open`), `subject_title`, `subject_uuid` (generated for new subjects), `points`, `question_number` (auto-managed as `Q1`, `Q2`, ... and always realigned to the current display order whenever questions or subjects are reordered or deleted), `illustration_filename`, and `illustration_width` (stores the LaTeX width to apply when rendering the illustration), and `number_of_lines` in case of `open` questions.
  - Answer options persist one row per choice in `answers.sqlite` with `question_uuid`, free-form `answer_option` text, and a boolean `correct`. Allow instructors to add, remove, and reorder options without enforcing a fixed maximum.
  - When a quiz is in the locked state, disable every question attribute input except `points`, the ability to toggle which `answers.sqlite` rows are correct, and in case of questions of type `open` the answer_option field. The preserves flexibility to adjust scoring while preventing structural edits.
  - Allow one uploading `.png`, `.jpg`, or `.jpeg` illustrations up to 5 MB for each question and a `illustration_width` to be set. Store each as `{user_uuid}/{quiz_uuid}/{image_md5_sum}.{png|jpg}`, display a thumbnail and set the `illustration_filename`, and `illustration_width` fields in `questions.sqlite`. Allow to remove an existing illustration: reset the database entries and remove the image file.
  - Support deleting and reordering questions within subjects and reordering whole subjects. This requires renumbering of questions (`question_number`); both actions are disabled when `quiz_state` is `"locked"`.
  - Provide AI-assisted question generation by uploading `.txt` or `.pdf` class material (max 5 MB) (or by simply specifying a topc), selecting difficulty (easy, average, hard), question type (simple, multiple-choice, open) and desired number of questions. Invoke `ai_service` for generation.  Disable when `quiz_state` is `"locked"`.
  - Prevent adding or removing questions once the quiz is locked.
- **E3 Create subject:** Compile and export quiz materials (available when `questions.sqlite` contains at least one question).
  - On first entry, create `{user_uuid}/{quiz_uuid}/amc_session` if needed and write `sujet.tex` generated via `amc_latex_service` using `quizes.sqlite`, `questions.sqlite`, and `answers.sqlite`.
  - **AI verify subject:** Use `ai_service` to run three prompts in parallel to review spelling/grammar, factual correctness, and LaTeX syntax of `sujet.tex`.
  - **Export AMC LaTeX file:** Allow downloading `sujet.tex`.
  - **Export PDF with answers:** Use `amc_compile_service` to build `reponses.pdf`.
  - **Export PDF for N students:** Let the instructor specify the number of students and whether to randomize question and answer order, and to print whether or not to print two pages on one (persisted as `random_question_order`, `random_answer_order` and `two_up_printing`). Compile `sujet.pdf` via `amc_compile_service`, and set `quiz_state` to `"locked"`.
- **E4 Evaluate:** Grade student submissions (available only when `quiz_state` is `"locked"`).
  - When opening a locked quiz, land on the “Corriger” tab. If a prior analysis produced `notes.csv` inside the AMC session directory (e.g., `uploads/amc_sessions/{quiz_id}`), auto-expand “Cases détectées pour vérification”, “Association des étudiants”, and “Envoyer les corrections par e-mail”.
  - Allow to upload scanned copies (`copies.pdf`, max 500 MB) to `{user_uuid}/{quiz_uuid}/amc_session/copies.pdf`.
  - Select the student list from `classes.sqlite`, upload a new list (validate format, max 500 kB), or leave it blank. Replacing the list updates `{user_uuid}/{quiz_uuid}/list.csv`.
  - Analyze copies with `amc_analyze_service`, using the uploaded PDF and `list.csv`.
  - After analysis, display detected checkboxes with unchecked items on the left (75% width) and checked items on the right. Allow manual toggling, viewing each checkbox in context, and adjusting the grayscale threshold used for detection.
  - If the student list is provided and IDs were coded (`id_coding != -1`), show handwritten name images alongside the detected IDs and the matching student names, with the option to reassign matches.
  - Otherwise, display handwritten name images with AI-transcribed names. Call `ai_service` per image to obtain the transcription and allow manual edits.
  - Offer a “Recalculer les notes” action beneath “Association des étudiants”. Triggering it re-runs `auto-multiple-choice note`, `export` (ODS and CSV), and `annotate` so grades and annotated PDFs reflect the latest checkbox and LaTeX adjustments.
  - Present a summary table built from `notes.csv` and `list.csv`, including first name, last name, student ID (if available), grade, email address (if available), and a link to the correction PDF from `cr/corrections/pdf/{student_num}.pdf`.
  - Enable sending corrected copies via email when student addresses exist. For each student, render an email preview with the personalized grade, attachment path (`cr/corrections/pdf/{student_num}.pdf`), editable `Reply-To`/`BCC`, and a confirmation step before dispatch while keeping the global subject/body templates (placeholders supported) editable at the top of the panel. Batch sends call `email_service` in sequence with a 5-second delay between messages and display a progress counter (`sent / total`).

### AI Service (`ai_service`)

- **Purpose:** Centralize all GPT-5 (with reasoning={ "effort": "low" }) interactions used for quiz generation, LaTeX QA, and handwriting transcription so the frontend and backend call a single facade.
- **Question generation:** Accepts prompt context (topic description or uploaded material digest), desired language, difficulty, question type, and quantity. Returns structured question/answer payloads; before persisting, the service shuffles answer ordering and tags the correct options to avoid positional bias.
- **Quality checks:** Exposes dedicated prompts that review `sujet.tex` for spelling/grammar, LaTeX syntax regressions, and factual inconsistencies. Responses are normalized into issue lists that map back to question numbers for UI display.
- **Handwriting OCR:** Provides `extract_student_name` and related endpoints that take handwriting crops from the AMC pipeline and respond with `{ "prenom": "...", "nom": "..." }`. The service captures confidence metadata and surfaces low-confidence cases for manual review.
- **Operational safeguards:** Enforces prompt/response size limits, retries on transient API failures, and records invocation metadata (model, latency, token counts) for observability.

### Email Service (`email_service`)

- **Purpose:** Deliver transactional email for account verification, password recovery, instructor contact, and per-student grade distributions using a unified SMTP configuration.
- **Inputs:** Receives `to`, optional `reply_to`/`bcc`, localized `subject` and `body` templates, and optional file attachments (e.g., corrected copies under `cr/corrections/pdf/{student_num}.pdf`). Supports placeholder substitution for student/instructor names, quiz titles, and grades prior to dispatch.
- **Account workflows:** Sends verification codes during registration and email changes, plus one-time passwords for the reset flow. Tracks send attempts per user to rate-limit abuse and logs delivery state back to the auth service.
- **Grade delivery:** Processes batch sends initiated from the dashboard, emitting progress updates (`sent/total`) and enforcing the five-second inter-email delay. Retries transient failures and reports per-recipient status so the UI can highlight unsent messages.
- **Support channel:** Routes instructor support requests (feature ideas, bug reports).

### AMC LaTeX Service (`amc_latex_service`)

- **Purpose:** Convert quiz metadata into an Auto Multiple Choice–compatible `sujet.tex` that can be compiled or further processed by `amc_compile_service`.
- **Inputs:** Reads quiz-level fields from `quizes.sqlite` (e.g., `quiz_title`, `institution_name`, `student_instructions`, `quiz_language`, `date_of_quiz`, `duration`, `random_question_order`, `random_answer_order`, `number_of_questions`, `id_coding`), per-question data from `{quiz_uuid}/questions.sqlite` (`question_uuid`, `question_text`, `question_type`, `subject_title`, `subject_uuid`, `points`, `question_number`, `illustration_filename`, `illustration_width`), and answer choices from `{quiz_uuid}/answers.sqlite` (`question_uuid`, `answer_option`, `correct`).
- **Header generation:** Builds document options (`\usepackage[...]{automultiplechoice}`) and AMC flags (`bloc`, `noshufflegroups`, `ordre`) based on quiz randomization preferences. Injects institution, class, and scheduling metadata into macros for the subject header, and wires up the student identification grid when `id_coding`/`number_of_questions` imply coded copies.
- **Student instructions:** Writes the `student_instructions` of `quizes.sqlite`.
- **Question rendering:** Groups questions by `subject_uuid`, assigns a deterministic internal AMC group id per subject, and emits `\element{}` blocks in the same order as `question_number`. Each question body is escaped with `escape_latex`, which preserves inline/block math segments while sanitizing other LaTeX-sensitive characters.
- **Answer options:** Selects `question`, `questionmult`, or `open` environments from AMC based on `question_type`. For single/multiple choice, compute `sum(len(answer_options)) + count(answer_options) * 7`; use `\reponseshoriz` when the result is < 47, otherwise use to `\reponses`. Label each option as `\bonne` or `\mauvaise` according to the `correct` flag stored alongside each answer in `answers.sqlite`. Open questions use `\AMCOpen` with the requested number of lines.
- **Figures:** When `illustration_filename` is set, the service inserts a `figure` environment that references the stored asset under `{quiz_uuid}/illustrations/` and scales it with `illustration_width`.

### AMC Compile Service (`amc_compile_service`)

- **Purpose:** Take the LaTeX source emitted by `amc_latex_service` and drive the Auto Multiple Choice toolchain to produce printable subjects (`sujet.pdf`), answer keys (`correction.pdf`), calibration data, and workspace artifacts for later scanning.
- **Session setup:** Works inside `{quiz_uuid}/amc_session/`. Ensures AMC-required subdirectories exist (`data/`, `scans/`, temporary `proj_amc/` copies) and synchronizes supporting assets (e.g., illustrations from `{quiz_uuid}/illustrations/`).
- **Roster handling:** Uses the quiz’s `class_title` to resolve the associated CSV from `{quiz_uuid}/list.csv` (or, when absent, synthesizes a minimal `list.csv` based on class roster data in `classes.sqlite`). Guarantees the header format AMC expects (`id,nom,prenom`) and encodes the file in UTF-8.
- **Pagination & \AMCaddpagesto:** Before the full export, compile a single individualized copy without `\AMCaddpagesto`, count the pages of the resulting PDF, then set the macro argument: `1` when the copy fits on one page, `2 * ceil(n / 2)` when multi-page without two-up printing, or `4 * ceil(n / 4)` when the “two pages on one” option is enabled.
- **Compilation command:** Invokes `auto-multiple-choice prepare --mode s` within the session directory, targeting the current `sujet.tex`. Supplies output targets (`--out-sujet sujet.pdf`, `--out-corrige correction.pdf`), the AMC data directory (`--data ./data/`), calibration file (`DOC-calage.xy`), and latex engine (`--with pdflatex`).
- **Outputs:** Writes successful builds to `{quiz_uuid}/amc_session/` and mirrors `sujet.pdf` (and optionally `correction.pdf`) back to the quiz root for API downloads. On failure, it captures the AMC log files to surface compilation errors to the frontend.
- **Two-page-on-one subjects:** When two-up printing is active, post-process `DOC-subject.pdf` with `pdfjam --landscape --nup '2x1'` so the printed subjects align with the scanning workflow.

### AMC Analyze Service (`amc_analyze_service`)

- **Purpose:** Process scanned answer sheets, reconcile them with the prepared AMC project, compute grades, and surface per-question checkbox data and annotated copies for instructors.
- **Inputs:** Requires a compiled AMC session under `{quiz_uuid}/amc_session/` (containing `sujet.tex`, `DOC-calage.xy`, `data/`, etc.), the uploaded `copies.pdf`, and the roster `list.csv`. Uses `threshold` parameters from API calls to tune the marking sensitivity.
- **Scan preparation:** Converts `copies.pdf` into page-level PNGs via `pdftoppm`, stages them under `scans/`, and reruns `auto-multiple-choice prepare --mode b` followed by `meptex` to regenerate calibration artifacts compatible with bulk analysis. When the subject was printed with two pages per sheet, first split the uploaded PDF with `pdfjam` (left/right trims, scaling) and `pdftk` to rebuild a sequential `copies.pdf`.
- **Checkbox extraction:** Reads every `capture_zone` row with non-null `imagedata` from `capture.sqlite`, converts the stored blob to PNG, and derives a fill ratio from `black / total` to pre-classify the checkbox. Joins with `capture_position` to normalize corner coordinates and prepares UI-friendly `checked`/`unchecked` lists alongside links to the source page images. Synchronizes manual overrides by writing back to `capture_zone.manual`.
- **UI integration (Cases détectées pour vérification):** Supplies the frontend with the checkbox payload that drives the collapsible “Cases détectées pour vérification” panel: two columns (“unchecked” ascending by fill ratio, “checked” descending) rendered inside a dedicated box so borderline cases naturally collect near the bottom of each column, a slider labeled “Seuil taux de noircissement” that re-runs the thresholding on demand, and per-checkbox toggle buttons that move entries between columns while highlighting manual overrides in light yellow. Clicking a checkbox requests its parent page image (`cr/page-{student}-{page}.jpg`) plus polygon coordinates reconstructed from `capture_position` so the UI can draw a bounding box.
- **Database synchronization:** After the instructor commits manual reclassifications, the service rewrites `capture_zone.manual` for every displayed checkbox (`1` for checked, `0` for unchecked) and stamps `capture_page.timestamp_manual` with the current Unix epoch, ensuring the UI, grading logic, and AMC database stay aligned.
- **Student associations:** Enumerates `name-<n>.jpg` handwriting crops from `cr/`, joins them with rows from `association.sqlite` (`association_association.student`, `auto`, `manual`) and roster entries in `list.csv` (`id`, `nom`, `prenom`) to build a complete view of recognized vs unrecognized students for the correction workflow.
- **Automated roster extraction:** While generating or refreshing `list.csv`, send each `name-<n>.jpg` to the AI service, which proxies `OpenAI().responses.create(model="gpt-5", ...)` and returns `{ "prenom": "...", "nom": "..." }`. Use `association.sqlite.auto` to fill the student ID when present; otherwise write the internal number to `association.sqlite.manual` and propagate it to the CSV.
- **UI integration (Association des étudiants):** Powers the collapsible “Association des étudiants” panel on the “Corriger” tab: each row shows the handwriting image, the automatically matched student name rendered as “LAST, First”, and the corresponding ID. Recognized students (present in `association_association`) render on a white background; unrecognized ones appear in light red and are grouped in their own section. A dropdown listing every roster entry lets instructors correct the pairing or assign an unrecognized student.
- **Association updates:** When an instructor adjusts selections, the service writes the chosen `id` into `association_association.manual` for existing rows or inserts a new row (`student`, `copy = 0`, `manual`, `auto = NULL`) for previously unrecognized students. It also zeroes `timestamp_annotate` and `timestamp_manual` in `capture.sqlite/capture_page` for the affected internal student numbers so future scans and annotations rebuild against the corrected associations.
- **Analysis pipeline:** Executes `auto-multiple-choice analyse` against the generated PNGs, then `note` to compute grades. Runs `association-auto` to map ID detections back to `list.csv`, producing `association.sqlite`.
- **Exports & annotations:** Calls AMC `export` modules (`ods`, `CSV`) to produce `notes.ods` and `notes.csv`, and runs `annotate` to generate corrected PDFs per student inside `cr/corrections/pdf`. The service packages these PDFs into a downloadable ZIP when requested by the frontend.

## Required API Endpoints

### Authentication & Sessions
- `POST /auth/register` – Create a new email/password account, issue a verification code, and stage the user workspace.
- `POST /auth/register/verify` – Confirm the emailed verification code and activate the instructor directory.
- `POST /auth/register/google` – Provision a user from a Google ID token and mark the account as verified.
- `POST /auth/login` – Authenticate by email/password, falling back to the one-time password when valid.
- `POST /auth/login/google` – Sign in with Google and refresh the session metadata.
- `POST /auth/forgot-password` – Generate and email a time-bound one-time password.
- `POST /auth/reset-password` – Validate the OTP, rotate the salt/hash, and clear the temporary credential.
- `GET /auth/session` – Return current session context and decrypt the user directory when necessary.
- `POST /auth/session/refresh` – Extend the session window and bump `last_active`.
- `POST /auth/logout` – Terminate the session, re-encrypt user storage, and clear server-side session data.

### Account & Profile
- `GET /account/me` – Fetch instructor profile details for the settings page.
- `PUT /account/me` – Update instructor name fields stored in `user_defaults.sqlite`.
- `GET /account/me/defaults` – Retrieve global quiz defaults (institution, instructions, messaging templates).
- `PUT /account/me/defaults` – Persist edits to the global defaults back to `user_defaults.sqlite`.
- `POST /account/me/email-change` – Initiate an email change by sending a verification code to the new address.
- `POST /account/me/email-change/verify` – Confirm the change and update the `users.email` column.
- `POST /account/me/password` – Change the password after validating the current credential.
- `GET /account/me/export` – Produce a ZIP archive of the instructor workspace for download.
- `DELETE /account/me` – Delete the account, associated databases, and on-disk assets.

### Classes & Rosters
- `GET /classes` – List classes with their associated roster handles.
- `POST /classes` – Create a new class entry and empty roster placeholder.
- `GET /classes/{list_uuid}` – Fetch class metadata and current roster preview.
- `PUT /classes/{list_uuid}` – Rename a class or update descriptive metadata.
- `PUT /classes/{list_uuid}/students` – Persist roster edits coming from the UI editor.
- `POST /classes/{list_uuid}/students/import` – Replace the roster by uploading a validated CSV file.
- `GET /classes/{list_uuid}/students` – Download the roster CSV for local edits.
- `DELETE /classes/{list_uuid}` – Remove a class alongside its stored CSV file.

### Quizzes
- `GET /quizzes` – Return dashboard quiz summaries with state, counts, and timestamps.
- `POST /quizzes` – Create a new quiz, generate a UUID, and seed initial metadata.
- `GET /quizzes/{quiz_uuid}` – Retrieve quiz metadata needed for the generalities tab.
- `PUT /quizzes/{quiz_uuid}` – Persist updates to quiz metadata fields.
- `DELETE /quizzes/{quiz_uuid}` – Delete the quiz directory and its database rows after confirmation.
- `POST /quizzes/{quiz_uuid}/duplicate` – Clone quiz databases and assets under a new UUID.
- `POST /quizzes/{quiz_uuid}/lock` – Mark the quiz as locked once printable subjects are generated.
- `POST /quizzes/{quiz_uuid}/unlock` – Reopen a locked quiz after explicit confirmation.

### Questions & Subjects
- `GET /quizzes/{quiz_uuid}/questions` – Load subjects, questions, answers, and ordering metadata for the editor.
- `POST /quizzes/{quiz_uuid}/questions` – Add a question (and create a subject when needed).
- `PUT /quizzes/{quiz_uuid}/questions/{question_uuid}` – Update question text, type, scoring, and metadata.
- `DELETE /quizzes/{quiz_uuid}/questions/{question_uuid}` – Remove a question when the quiz is unlocked.
- `PATCH /quizzes/{quiz_uuid}/questions/order` – Persist reordered questions within and across subjects.
- `PATCH /quizzes/{quiz_uuid}/subjects/order` – Persist subject reordering.
- `POST /quizzes/{quiz_uuid}/questions/{question_uuid}/answers` – Append an answer option.
- `PUT /quizzes/{quiz_uuid}/questions/{question_uuid}/answers/{answer_uuid}` – Edit answer text or correctness.
- `DELETE /quizzes/{quiz_uuid}/questions/{question_uuid}/answers/{answer_uuid}` – Remove an answer option.
- `PATCH /quizzes/{quiz_uuid}/questions/{question_uuid}/answers/order` – Store answer ordering adjustments.
- `POST /quizzes/{quiz_uuid}/questions/{question_uuid}/illustration` – Upload or replace a question illustration.
- `DELETE /quizzes/{quiz_uuid}/questions/{question_uuid}/illustration` – Remove the stored illustration asset.
- `POST /quizzes/{quiz_uuid}/ai/questions` – Request AI-assisted question generation and merge results.

### Compilation & Exports
- `POST /quizzes/{quiz_uuid}/amc/session` – Ensure the AMC workspace exists and sync supporting assets.
- `POST /quizzes/{quiz_uuid}/amc/latex` – Regenerate `sujet.tex` via the LaTeX service.
- `GET /quizzes/{quiz_uuid}/amc/latex` – Download the latest `sujet.tex`.
- `POST /quizzes/{quiz_uuid}/amc/compile` – Run the AMC toolchain with options for student count, randomization, and two-up printing.
- `GET /quizzes/{quiz_uuid}/amc/exports/sujet.pdf` – Download the compiled subject bundle.
- `GET /quizzes/{quiz_uuid}/amc/exports/reponses.pdf` – Download the answer key PDF.
- `GET /quizzes/{quiz_uuid}/amc/logs` – Retrieve logs from the latest compile attempt.
- `POST /quizzes/{quiz_uuid}/ai/verify-subject` – Launch AI quality checks against the current `sujet.tex`.

### Evaluation & Analysis
- `POST /quizzes/{quiz_uuid}/uploads/copies` – Upload scanned copies for later processing.
- `PUT /quizzes/{quiz_uuid}/roster` – Select or upload the roster used for analysis.
- `POST /quizzes/{quiz_uuid}/analysis` – Kick off the AMC analyze pipeline for the uploaded copies.
- `GET /quizzes/{quiz_uuid}/analysis/status` – Poll the state of the ongoing analysis job.
- `GET /quizzes/{quiz_uuid}/analysis/checkboxes` – Retrieve checkbox classifications and threshold metadata.
- `PATCH /quizzes/{quiz_uuid}/analysis/checkboxes` – Persist manual overrides and updated thresholds.
- `GET /quizzes/{quiz_uuid}/analysis/page-images/{student}/{page}` – Serve page imagery for checkbox review.
- `GET /quizzes/{quiz_uuid}/analysis/associations` – Fetch handwriting matches and auto/manual associations.
- `PATCH /quizzes/{quiz_uuid}/analysis/associations` – Update manual student associations.
- `POST /quizzes/{quiz_uuid}/analysis/associations/transcribe_names` – Transcribe handwriting crops into `{ "prenom": "...", "nom": "..." }`
- `POST /quizzes/{quiz_uuid}/analysis/recalculate` – Re-run grading, exports, and annotations after edits.
- `GET /quizzes/{quiz_uuid}/analysis/notes` – Return aggregated grade data for UI display.
- `GET /quizzes/{quiz_uuid}/analysis/corrections.zip` – Download the ZIP of annotated corrections.

### Email & Support
- `POST /emails/verification` – Send verification or change-email codes through the email service.
- `POST /emails/password-reset` – Deliver password reset one-time passwords when the auth flow requests them.
- `POST /quizzes/{quiz_uuid}/emails/preview` – Generate per-student email previews with grades and attachments.
- `POST /quizzes/{quiz_uuid}/emails/send` – Dispatch correction emails sequentially with progress reporting.
- `POST /support/requests` – Submit instructor support tickets routed to the support channel.

## Development

- The directory `dev_documents` contains an example amc_session folder (and subdirectories) with all files after corrections, inlcluding the sqlite databases created by amc. It also contains code (not functional, needs to be adapted) for some of the mentioned services.
