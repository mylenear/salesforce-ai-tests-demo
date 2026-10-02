---
description: Run a Salesforce use case defined in usecases/<name>.md using playwright-cli, learning and healing locators in locators/<name>.yaml as it goes.
---

You are running an automated Salesforce test use case with `playwright-cli`.

Use case name: $ARGUMENTS

## Procedure

1. **Load inputs**
   - If a `.env` file exists in the project root, source it with
     `set -a; source .env; set +a` before resolving any credentials. This
     lets developers keep secrets in a local `.env` that is never committed
     (it is listed in `.gitignore`). A `.env.example` in the repo shows the
     required variable names without real values.
   - Read `usecases/$ARGUMENTS/$ARGUMENTS.md` — the ordered list of steps for this use case.
   - Read `config/env.yaml`, `config/credentials.yaml`, and
     `config/testdata.yaml`. Resolve any `{{...}}` placeholders in the use
     case against these files (`{{env.*}}`, `{{credentials.*}}`,
     `{{testdata.*}}`), and resolve any
     `${ENV_VAR}` references against the current shell environment (including
     anything just sourced from `.env`). `${ENV_VAR:-default}` uses `default`
     when the variable is unset or empty.
   - Credential values are never resolved into your own context: map
     credential placeholders to shell variable references (e.g.
     `{{credentials.user.password}}` → `"$SF_PASSWORD"`) and let the shell
     expand them at execution time. Never `cat`/read `.env` or echo secrets.
   - Read `locators/$ARGUMENTS.yaml` if it exists. This holds previously
     learned selectors (role + accessible_name), keyed by step id. If it does
     not exist yet, treat every step as new.

2. **Pre-auth (JWT only)**
   - If the use case .md contains a `## Pre-auth` section, execute the shell
     commands shown in its code block (after first sourcing `.env` if present).
   - Parse the JSON output as `{{jwt}}` and make `{{jwt.frontdoor_url}}`,
     `{{jwt.access_token}}`, and `{{jwt.instance_url}}` available as
     placeholders for subsequent steps.
   - If the script exits non-zero, stop immediately and report the error.
     Never attempt to proceed to browser steps with a failed auth.
   - Never print the `access_token` value in logs, result files, or summaries.

3. **Start the session**
   - Create the output directories for this run if they don't exist:
     `usecases/$ARGUMENTS/videos/`, `usecases/$ARGUMENTS/screenshots/`, and
     `usecases/$ARGUMENTS/results/`.
   - Run `playwright-cli open --persistent` so the Salesforce login/session
     state survives between runs.
   - **Clean cookies** (`auth-setup` only): right after opening, run
     `playwright-cli cookie-clear` so the saved state holds only the session
     created by this run. Cookies left in the persistent profile from other
     orgs or older sessions end up in `state-save` and break the Setup
     domain's session exchange (HTTP 500 on
     `/services/auth/jwt/sidexchange`, Setup stuck loading).
   - **Saved-state restore** (skip for `auth-setup` itself): If
     `auth-state/salesforce-auth.json` exists, immediately run
     `playwright-cli state-load auth-state/salesforce-auth.json` to restore
     the saved session. This means any `open:` step will start already
     authenticated — no login form, no MFA. If the file does not exist, skip
     this and proceed normally (the use case handles auth itself, e.g. via
     JWT or UI login).
   - **Session expired mid-run**: If at any point during the run the browser
     is redirected back to the Salesforce login page unexpectedly, stop the
     run, delete `auth-state/salesforce-auth.json`, and report:
     "Session expired — run `/run-usecase auth-setup` to refresh."
   - Immediately start video recording:
     `playwright-cli video-start usecases/$ARGUMENTS/videos/$TIMESTAMP.webm`
   - Then enable action annotations so every step is visually labelled in the
     video: `playwright-cli video-show-actions`

4. **Execute each step from the use case .md, in order**

   For each step:
   - Before performing the step's action, add a chapter marker:
     `playwright-cli video-chapter "<step-id>: <step description>"`
   - If a matching entry exists in `locators/$ARGUMENTS.yaml` for this step,
     try the fast path first: `playwright-cli find "<accessible_name>"`
     against the current page to get a fresh `ref`, then perform the action
     (`click`, `fill`, `type`, `press`, etc.) on that ref.
   - If there is no cached entry, `find` returns no match, or the action
     fails:
     - Run `playwright-cli snapshot` to capture the full current page state.
     - Locate the element described in the step by its role and label in the
       snapshot.
     - Perform the action using its ref.
     - Write/update that step's entry in `locators/$ARGUMENTS.yaml` with
       `role`, `accessible_name`, and today's date as `last_verified`. Flag
       in your final report whether this locator was newly learned or healed
       (i.e. it existed before but pointed at something different now).
   - **Credential steps** — any step that fills a password/username/token
     field, or whose value comes from `{{credentials.*}}`, `{{jwt.*}}`, or a
     secret env var:
     - Chapter it as `playwright-cli video-chapter "<step-id>: credentials provided"`.
     - Run `playwright-cli video-hide-actions` before the action and
       `playwright-cli video-show-actions` after it, so no value appears in
       the recording's callouts.
     - Pass the value as a shell variable (`playwright-cli fill <ref> "$VAR"`),
       never as a literal, so the command shows only the variable name.
     - Never snapshot a filled credential field; if a snapshot is needed to
       find/heal the locator, take it before filling.
   - For `assert` steps: check the condition against the latest snapshot.
     Re-snapshot if you're not confident rather than guessing.
   - For `save-state: <path>` steps: run
     `playwright-cli state-save <path>` and confirm the file was written.
     Record the file path in the result JSON under `auth_state_saved`.

5. **Stop conditions**
   - If a step says to stop on a specific condition (e.g. an MFA / "Verify
     Your Identity" prompt), stop the video first (`playwright-cli video-stop`),
     then take a screenshot with
     `playwright-cli screenshot usecases/$ARGUMENTS/screenshots/<timestamp>-<step-id>-stopped.png`,
     then stop and report it. Never attempt to work around an authentication
     challenge.
   - If a step fails after both the cached-locator attempt and a fresh
     snapshot attempt, stop the video first (`playwright-cli video-stop`),
     then take a screenshot with
     `playwright-cli screenshot usecases/$ARGUMENTS/screenshots/<timestamp>-<step-id>-failed.png`,
     then stop and report the failure, including the relevant snapshot excerpt.
   - Use the readable timestamp format `YYYY-MM-DDTHH-MM-SS` (e.g. `2026-09-17T18-23-59`) for `<timestamp>` — dashes instead of colons keep it file-system safe while remaining easy to read. Use this same format everywhere: file names, JSON `run_timestamp` fields, and screenshot paths.

6. **Wrap up**
   - Stop video recording: `playwright-cli video-stop`
     The video is already saved at the path given to `video-start`.
   - Write a **detailed** result to `usecases/$ARGUMENTS/results/<timestamp>.json`
     containing: pass/fail per step, which locators were newly learned or healed,
     total duration, and paths to any screenshots or video saved during this run.
     Record each step's `action` using the unresolved placeholder text (e.g.
     `"open: {{jwt.frontdoor_url}}"`). Credential steps are recorded only as
     `"action": "fill: credentials provided"`, `"value": "[REDACTED]"`. Strip
     query strings from any recorded URL (e.g. `landed_url`) so no `sid=` or
     token leaks.
   - Write a **summary** report to `results/run-<timestamp>.md` (create
     `results/` if it doesn't exist). It is a human-readable Markdown report
     with one section per use case that ran in this invocation, and one table
     row per step (plus a `Pre-auth (JWT)` row when the use case has one):
     ```markdown
     # Run <timestamp> — PASS|FAILED|STOPPED

     ## <use case name> — PASS|FAILED|STOPPED

     Duration: <n>s · Detail: [<timestamp>.json](../usecases/$ARGUMENTS/results/<timestamp>.json) · Video: [<timestamp>.webm](../usecases/$ARGUMENTS/videos/<timestamp>.webm)

     | Step | Result | Evidence |
     |------|--------|----------|
     | Pre-auth (JWT) | PASS | Got a token for `https://<instance>.my.salesforce.com` |
     | 1. Open the frontdoor URL (credentials provided) | PASS | Landed on "Home \| Salesforce" at `…salesforce-setup.com/lightning/setup/SetupOneHome/home` |
     | 2. App Launcher is visible | PASS | The cached locator found one match, `button "App Launcher"` |
     | 3. URL contains "lightning" | PASS | The path starts with `/lightning/` |
     ```
     - **Step**: `<step-id>. <short description>`; credential steps say
       `(credentials provided)` and never show the value.
     - **Result**: `PASS`, `FAILED`, `STOPPED`, or `SKIPPED` (steps not reached
       after a stop/failure).
     - **Evidence**: one short sentence of what was actually observed — page
       title, landed URL path (query string stripped), the locator that
       matched and whether it was cached/learned/healed, or the failure
       reason. Wrap URLs, paths, and locators in backticks and escape any `|`
       as `\|`.
     - After a failed/stopped use case's table, add a `Failure:` line with the
       reason and a link to the screenshot.
   - Print a short human-readable summary: overall pass/fail, any locators
     that changed since the last run (signal that a Salesforce component
     changed), and the paths to any saved screenshots or video.

## Rules

- Never store a numeric `ref` (e.g. `e21`) in `locators/*.yaml` — refs are
  only valid within the current snapshot/session. Store `role` +
  `accessible_name` as the durable identity, and re-resolve the ref every
  run.
- Credentials are never recorded — not in commands/transcript output, videos,
  chapters, snapshots, screenshots, `locators/*.yaml`, `results/*.md`, or
  summaries. Wherever credentials are filled in or provided, mark the step
  only as "credentials provided".
- Do not modify `usecases/<name>/<name>.md` — those are the human-authored
  source of truth. Only `locators/*.yaml`, `results/run-*.md`,
  `usecases/<name>/results/*.json`, `usecases/<name>/screenshots/`, and
  `usecases/<name>/videos/` are written by this command.
