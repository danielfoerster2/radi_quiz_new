# Agent Notes

This repository powers the Radi Quiz frontend/backend tooling around Auto Multiple Choice (AMC). The guidelines below capture expectations that currently shape service implementations and workflow.

## Environment & Config
- Python backend code lives under `backend/services`. Services expect their callers to supply every required argument; they intentionally avoid internal defaults.
- External dependencies:
  - AMC CLI (`auto-multiple-choice`), `pdftoppm`, and other shell tools must be present when invoking compile/scan helpers.
  - OpenAI access relies on `OPENAI_API_KEY`.
  - Email delivery uses SMTP settings provided entirely via environment variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_USE_TLS`, `SMTP_FROM`.
- Additional environment variables assumed elsewhere: `DATABASE_URL`, `SECRET_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

## Coding Expectations
- Keep service layers thin: prompt construction, command assembly, and I/O wiring should stay straightforward.
- Let callers validate inputs; surface missing data by raising exceptions rather than silently correcting or defaulting.
- When editing files, prefer `apply_patch`; avoid auto-generated replacements unless explicitly requested.
- Maintain ASCII unless a file already contains Unicode and it is required.
- Add comments only when clarifying non-obvious logic.

## AI Prompting Norms
- `ai_service.generate_questions` prompts describe difficulty and question type semantics explicitly and delegate any validation to upstream code.
- `review_subject` and `extract_student_name` return raw JSON strings; parsing happens at the caller.
- Always capture OpenAI errors by bubbling up exceptions instead of retry loops here. Callers can layer additional resilience if needed.

## Testing & Verification
- Use `python3 -m compileall backend/services` as a quick sanity check after edits.
- AMC/SMTP commands should be mocked or isolated in tests; running the real binaries is outside unit test scope.

## Workflow Reminders
- Sandbox policy defaults to workspace write; never request elevated permissions unless necessary.
- Push back on instructions that introduce unsafe assumptions (e.g., reintroducing silent defaults) to keep behavior predictable.
- Document significant expectations in this file when they change so future agents inherit the same context.

