# System Overview

This application is a graphical web interface for the LaTeX Auto Multiple Choice (AMC) suite with AI-assisted tooling. The UI supports French by default while allowing English-language quizzes and content throughout the workflow.

## Technology Stack

- **Backend:** Python/Flask integrated with Auto Multiple Choice.
- **Frontend:** TypeScript single-page application.
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

Each instructor (`user_uuid`) owns a directory populated with defaults on account creation:

- `user_defaults.sqlite`: columns `first_name`, `last_name`, `institution_name`, `student_instructions`, `coding_explanation`, `email_subject`, `email_body`, `default_quiz_language` (e.g., `fr`, `en`).
- `classes.sqlite`: columns `class_title`, `student_list`.
- `quizes.sqlite`: columns `quiz_uuid`, `quiz_title`, `creation_date`, `quiz_state`, `id_coding`, `number_of_questions`, `institution_name`, `student_instructions`, `coding_explanation`, `email_subject`, `email_body`, `class_title`, `date_of_quiz`, `duration`, `quiz_language`, `random_question_order`, `random_answer_order`.
- `{list_uuid}.csv`: one CSV per student list.
- `{quiz_uuid}/`: quiz-specific directory containing:
  - `questions.sqlite`: columns `question_text`, `question_type`, `subject_title`, `subject_uuid`, `answer_option1` ... `answer_option10`, `correct_answer`, `points`, `question_number`, `illustration_filename`, `illustration_width`.
  - `list.csv`: student list.
  - `illustrations/`: image assets stored as `<md5>.png` or `<md5>.jpg`/`.jpeg`.
  - `amc_session/`: workspace used while compiling AMC documents.

## Frontend Application

### A. Landing Page

- **A1:** Present a concise description of the software.
- **A2:** Provide account-creation and login options. Login with Google should request the email address only; otherwise email verification is required.
  - **Create account (email/password):** Collect email and a password entered twice (8–30 characters; at least one uppercase letter, lowercase letter, digit, and special character). If the email is new or the existing record has `verification_code != "-1"`, create a row in `users` with generated `user_uuid`, salt, salted hash, and verification code. Send the verification code by email. After the user confirms the code, set `verification_code` to `"-1"`, create the `{user_uuid}` directory with prefilled `user_defaults.sqlite`, empty `classes.sqlite`, and empty `quizes.sqlite`, then sign the user in. If an account already exists with `verification_code == "-1"`, show an “account already exists” error.
  - **Create account (Google Sign-In):** If the email exists in `users`, proceed directly to login. Otherwise create a new record with generated `user_uuid`, set `verification_code` to `"-1"`, and create the `{user_uuid}` directory as above.
- **Login (email/password):** Compute the salted password hash and compare it with `salted_password_hash`. If it does not match, compare the entered password with `one_time_pwd` and confirm that the current time is earlier than `one_time_pwd_expires_at`. When the one-time password is valid, prompt the user to set a new password (same complexity rules), generate a new salt and hash, save both, and set `one_time_pwd_expires_at` to the current time. On successful login, set `last_active` to the current timestamp. If neither credential path succeeds, display an error.
  - **Login attempt with password on a Google-only account:** Detect the absence of password credentials (missing salt/hash) and instruct the user to sign in with Google or trigger the password reset flow to establish credentials.
- **Login (Google Sign-In):** Authenticate with Google and log the user in when successful, updating `last_active` at the end of the flow.
- **Forgot password:** Generate a one-time password (OTP), send it by email, write it to `one_time_pwd`, and set `one_time_pwd_expires_at` to 15 minutes in the future.
- **Session activity:** Each authenticated API request updates `last_active`. When a user’s `last_active` is more than 30 minutes old, expire the session and require re-authentication. While inactive, encrypt the on-disk `{user_uuid}` directory using a service key; decrypt it only after successful login.

### B. Dashboard Page

- **B1:** “Create new quiz” button generates a new `quiz_uuid`, creates `{user_uuid}/{quiz_uuid}`, and inserts a row into `quizes.sqlite` with `quiz_uuid`, the current time as `creation_date`, `quiz_state = "unlocked"`, `id_coding = "8"`, `number_of_questions = "0"`, `quiz_language` (defaulting to `default_quiz_language`), and `institution_name`, `student_instructions`, `coding_explanation`, `email_subject`, `email_body` copied from `user_defaults.sqlite`. The UI then navigates to section E1.
- **B2:** List available quizzes with columns `quiz_title`, `number_of_questions`, `creation_date`, `quiz_state`, and actions.
  - **Delete:** Ask for explicit confirmation (highlighting that data is unrecoverable), then remove the corresponding row from `quizes.sqlite` and delete `{user_uuid}/{quiz_uuid}`.
  - **Duplicate:** Generate a new `quiz_uuid`, copy the source quiz directory (excluding any `amc_session` subdirectory), and duplicate the database row with the new `quiz_uuid`, `quiz_state = "unlocked"`, and a fresh `creation_date`.
  - **Unlock quiz:** Available only when `quiz_state` is `"locked"`. Display a warning that unlocking invalidates any previously generated `sujet.pdf` and prevents automated correction for that version. Proceed only after explicit confirmation, then set `quiz_state` back to `"unlocked"`.

### C. Settings Page

- **C1 Global defaults:** Editable fields for institution name, student instructions, default quiz language, email subject for grade delivery, and email body (with placeholders for student name, quiz title, grade, instructor name). Load values from `user_defaults.sqlite` and persist edits there.
- **C2 Student lists:** Display each row from `classes.sqlite` with editable `class_title` and associated student list (`{list_uuid}.csv`). Show a collapsed table by default.
  - **Create new class:** Allow uploading a CSV (max 500 kB). Validate format, then display the editable student list containing columns `id`, `nom`, `prenom`, `email` (`email` optional). Generate a new `list_uuid`, save the file as `{list_uuid}.csv`, and insert an entry in `classes.sqlite` with `class_title` and the file reference.
  - **Edit existing class:** Persist changes to both `classes.sqlite` and the corresponding `{list_uuid}.csv`.
- **C3 Instructor details:** Editable `first_name` and `last_name`, loaded from and saved to `user_defaults.sqlite`.
- **Change email:** Collect a new email address, generate a verification code (not stored until confirmed), and email the code. Update the `users` table `email` only after successful verification.
- **Change password:** Prompt for a new password twice (same complexity rules), generate a new salt and hash, and update the `users` record.
- **Download all my data:** Create a ZIP archive of the `{user_uuid}` directory and make it available for download.
- **Delete account:** Confirm intent, log the user out, delete `{user_uuid}`, and remove the corresponding row from `users`.

### D. Help Page

Provide detailed guidance on features and workflows, including a searchable question-and-answer section. Offer a mechanism to contact support via `email_service`.

### E. Quiz Page

This page uses tabs to manage quizzes.

- **E1 Generalities:** Manage quiz metadata stored in `quizes.sqlite`.
  - `quiz_title` (required before saving other data).
  - `institution_name`.
  - `class_title`: editable text field plus dropdown populated from `classes.sqlite`.
  - `date_of_quiz`: calendar selector (French locale).
  - `duration`.
  - `student_instructions`.
  - `quiz_language`: dropdown with at least French (`fr`) and English (`en`); defaults to `default_quiz_language` and is stored in `quizes.sqlite`.
  - `id_coding`: enable student ID coding by storing the number of digits and the explanation in `coding_explanation`; set `id_coding = -1` when disabled.
- **E2 Questions:** Available once `quiz_title` is stored. Load and persist data in `questions.sqlite`.
  - Question attributes include `question_text`, `question_type` (`simple`, `multiple-choice`, or `open`), `subject_title`, `subject_uuid` (generated for new subjects), answer options (`answer_option1` through `answer_option10`), `correct_answer`, `points`, `question_number` (auto-managed as `Q1`, `Q2`, ... and always realigned to the current display order whenever questions or subjects are reordered or deleted), `illustration_filename`, and `illustration_width` (stores the LaTeX width to apply when rendering the illustration).
  - All textual fields accept French or English content; downstream exports and services use `quiz_language` to determine locale-specific formatting (e.g., date formats and AI prompts).
  - When a quiz reaches the locked state, disable every question attribute input except `correct_answer`, `points`, and `question_number`, which remain editable so instructors can adjust scoring and grading feedback.
  - Allow uploading `.png`, `.jpg`, or `.jpeg` illustrations up to 5 MB. Store each as `{user_uuid}/{quiz_uuid}/{image_md5_sum}.{png|jpg}` and display a thumbnail.
  - Support reordering questions within subjects and reordering whole subjects; both actions are disabled when `quiz_state` is `"locked"`.
  - Provide AI-assisted question generation by uploading `.txt` or `.pdf` class material (max 5 MB) and selecting difficulty (easy, average, hard) and question type (simple, multiple-choice, open). Invoke `ai_service` for generation. Disable when `quiz_state` is `"locked"`.
  - Prevent adding or removing questions once the quiz is locked.
- **E3 Create subject:** Compile and export quiz materials (available when `questions.sqlite` contains at least one question).
  - On first entry, create `{user_uuid}/{quiz_uuid}/amc_session` if needed and write `sujet.tex` generated via `amc_latex_service` using `quizes.sqlite` and `questions.sqlite`.
  - **AI verify subject:** Run three `ai_service` prompts in parallel to review spelling/grammar, factual correctness, and LaTeX syntax of `sujet.tex`.
  - **Export AMC LaTeX file:** Allow downloading `sujet.tex`.
  - **Export PDF with answers:** Use `amc_compile_service` to build `reponses.pdf`.
  - **Export PDF for N students:** Let the instructor specify the number of students and whether to randomize question and answer order (persisted as `random_question_order` and `random_answer_order`). Create `{user_uuid}/{quiz_uuid}/list.csv` if needed, compile `sujet.pdf` via `amc_compile_service`, and set `quiz_state` to `"locked"`.
- **E4 Evaluate:** Grade student submissions (available only when `quiz_state` is `"locked"`).
  - Upload scanned copies (`copies.pdf`, max 500 MB) to `{user_uuid}/{quiz_uuid}/amc_session/copies.pdf`.
  - Select the student list from `classes.sqlite`, upload a new list (validate format, max 500 kB), or leave it blank. Replacing the list updates `{user_uuid}/{quiz_uuid}/list.csv`.
  - Analyze copies with `amc_analyze_service`, using the uploaded PDF and `list.csv`.
  - After analysis, display detected checkboxes with unchecked items on the left (75% width) and checked items on the right. Allow manual toggling, viewing each checkbox in context, and adjusting the grayscale threshold used for detection.
  - If the student list is provided and IDs were coded (`id_coding != -1`), show handwritten name images alongside the detected IDs and the matching student names, with the option to reassign matches.
  - Otherwise, display handwritten name images with AI-transcribed names. Call `ai_service` per image to obtain the transcription and allow manual edits.
  - Present a summary table built from `notes.csv` and `list.csv`, including last name, first name, student ID (if available), grade, email (if available), and a link to the corrected copy.
  - Enable sending corrected copies via email when student addresses exist. Provide editable global email subject and body using placeholders, a “send to all” option, and per-student controls (preview PDF, editable email, grade). Use `email_service` with `reply_to` and `bcc` set to the instructor’s email from `users`.

## Services

- `amc_latex_service`: Creates AMC LaTeX documents using `quizes.sqlite` and `questions.sqlite` data; outputs an `amc_latex_document`.
- `amc_compile_service`: Runs within a sandbox (mitigating LaTeX injection) with defined timeouts.
  - `get_answer_sheet`: input `amc_latex_document`, output `reponses.pdf`.
  - `get_subject`: input `amc_latex_document`, output `sujet.pdf`.
- `amc_analyze_service`: Accepts AMC data and returns enriched AMC data after analysis.
- `ai_service`: Proxies OpenAI GPT-5 capabilities.
  - `generate_questions_simple`: input subject, course material, question count, difficulty, language; output questions with four answer options (one correct, others plausible but wrong).
  - `generate_questions_multiple_choice`: same inputs (including language); output questions with four options where zero or more answers may be correct.
  - `generate_questions_multiple_open`: same inputs (including language); output open questions with graded answer keys defining percentage breakdowns.
  - `check_spelling_grammar`: input LaTeX document; output list of issues.
  - `check_latex_syntax`: input LaTeX document; output list of issues.
  - `check_factuality`: input LaTeX document; output list of potential factual errors.
  - `image`: input image; output `first_name`, `last_name`.
  - `transcribe_image`: input image; output `first_name`, `last_name` (AI transcription).
- `email_service`: Sends emails (`to`, `reply_to`, `bcc`, `subject`, `body`, `attachment`) and returns success status.

## API Endpoints

### Authentication & Account Lifecycle

- `POST /api/auth/register` — Create an account with email/password and trigger email verification.
- `POST /api/auth/register/google` — Provision an account via Google Sign-In when needed.
- `POST /api/auth/verify-email` — Confirm the verification code that activates an account or new email.
- `POST /api/auth/login` — Authenticate with email/password.
- `POST /api/auth/login/google` — Authenticate via Google Sign-In.
- `POST /api/auth/forgot-password` — Issue a one-time password and expiration.
- `POST /api/auth/reset-password` — Replace credentials using a valid one-time password.
- `POST /api/auth/change-email` — Initiate and confirm an instructor email change.
- `POST /api/auth/change-password` — Update credentials after re-authentication.
- `POST /api/auth/logout` — Terminate the current session.

### Settings & Instructor Profile

- `GET /api/settings/defaults` — Retrieve institution defaults from `user_defaults.sqlite`.
- `PUT /api/settings/defaults` — Persist updated institution defaults.
- `GET /api/settings/profile` — Fetch instructor `first_name` and `last_name`.
- `PUT /api/settings/profile` — Save instructor name changes.
- `POST /api/settings/export` — Generate a ZIP archive of `{user_uuid}` data.
- `DELETE /api/settings/account` — Delete the instructor account and user directory.

### Classes & Student Lists

- `GET /api/classes` — List classes with associated `list_uuid` references.
- `POST /api/classes` — Create a class from an uploaded CSV and metadata.
- `GET /api/classes/{class_uuid}` — Retrieve class metadata and student list contents.
- `PUT /api/classes/{class_uuid}` — Update class title or student list (including CSV upload).
- `DELETE /api/classes/{class_uuid}` — Remove a class and its CSV.

### Quizzes

- `GET /api/quizzes` — List quizzes with summary metadata.
- `POST /api/quizzes` — Create a new quiz and seed defaults.
- `GET /api/quizzes/{quiz_uuid}` — Retrieve quiz metadata (`quizes.sqlite`).
- `PUT /api/quizzes/{quiz_uuid}` — Update general quiz parameters.
- `DELETE /api/quizzes/{quiz_uuid}` — Delete a quiz and its directory.
- `POST /api/quizzes/{quiz_uuid}/duplicate` — Duplicate quiz data and files.
- `POST /api/quizzes/{quiz_uuid}/lock` — Set `quiz_state` to `"locked"`.
- `POST /api/quizzes/{quiz_uuid}/unlock` — Return `quiz_state` to `"unlocked"` after receiving confirmation that any existing `sujet.pdf` becomes obsolete and automated correction will no longer match it.

### Questions & Subjects

- `GET /api/quizzes/{quiz_uuid}/questions` — List questions grouped by subject.
- `POST /api/quizzes/{quiz_uuid}/questions` — Add a new question.
- `GET /api/quizzes/{quiz_uuid}/questions/{question_uuid}` — Retrieve a question.
- `PUT /api/quizzes/{quiz_uuid}/questions/{question_uuid}` — Update question fields (respecting lock state).
- `DELETE /api/quizzes/{quiz_uuid}/questions/{question_uuid}` — Remove a question (when unlocked).
- `POST /api/quizzes/{quiz_uuid}/questions/reorder` — Persist question order per subject and subject order.
- `POST /api/quizzes/{quiz_uuid}/subjects` — Create or rename a subject (`subject_uuid`).
- `DELETE /api/quizzes/{quiz_uuid}/subjects/{subject_uuid}` — Remove an empty subject.
- `POST /api/quizzes/{quiz_uuid}/illustrations` — Upload an illustration asset (returns stored filename).

### AI-Assisted Authoring

- `POST /api/quizzes/{quiz_uuid}/ai/generate-questions` — Request AI-generated questions using uploaded material, desired difficulty, question type, and `quiz_language`.
- `POST /api/quizzes/{quiz_uuid}/ai/verify` — Run spelling, factuality, and LaTeX checks on `sujet.tex`.
- `POST /api/ai/transcribe-name` — Transcribe a handwritten name image to text.

### AMC Compilation Workflow

- `POST /api/quizzes/{quiz_uuid}/subject/prepare` — Produce or refresh `sujet.tex` via `amc_latex_service`.
- `GET /api/quizzes/{quiz_uuid}/subject/download` — Download `sujet.tex`.
- `POST /api/quizzes/{quiz_uuid}/subject/answers` — Generate `reponses.pdf` via `amc_compile_service`.
- `POST /api/quizzes/{quiz_uuid}/subject/export` — Compile `sujet.pdf` for N students with optional randomization.

### Evaluation Pipeline

- `POST /api/quizzes/{quiz_uuid}/copies` — Upload `copies.pdf` for analysis.
- `POST /api/quizzes/{quiz_uuid}/analysis` — Trigger `amc_analyze_service` on the uploaded copies.
- `GET /api/quizzes/{quiz_uuid}/analysis` — Retrieve analysis results, checkbox data, and thresholds.
- `PUT /api/quizzes/{quiz_uuid}/analysis/checkboxes` — Persist manual box toggles and threshold changes.
- `PUT /api/quizzes/{quiz_uuid}/analysis/names` — Update name associations or AI transcriptions.
- `GET /api/quizzes/{quiz_uuid}/grades` — Fetch the combined student/grade list (from `notes.csv` and `list.csv`).
- `POST /api/quizzes/{quiz_uuid}/emails/send` — Send corrected copies to all or selected students via `email_service`.


## Known Issues

- Double-sided printing alignment.
- Two-pages-per-sheet printing.
- Page count per copy.
