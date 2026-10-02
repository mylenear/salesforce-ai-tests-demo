# salesforce-tests

Salesforce test automation with no hand-written test code. Use cases are
plain-language `.md` step lists; `playwright-cli` executes them against the
real org and learns/heals selectors into YAML as it goes.

> **Demo / learning project.** This repo is an experiment in driving
> Salesforce UI tests from plain-language steps with Claude Code. It is not a
> production test framework. See [Pros and cons](#pros-and-cons) before
> using this approach for real regression testing.

## Structure

```
usecases/
  <name>/           one folder per use case
    <name>.md       plain-language steps (open/fill/click/assert)
    screenshots/    captured on stop or failure
    videos/         full session recording (if available)
    results/        detailed JSON for this use case, one file per run
config/             env.yaml (URLs), credentials.yaml (env var refs), testdata.yaml
locators/           auto-generated/updated YAML: role + accessible_name per step
results/            Markdown run report (one file per run, step table + links to use-case details)
scripts/            helper scripts (sf-jwt-auth.js — JWT token exchange)
auth-state/         saved browser session after auth-setup (git-ignored)
.claude/commands/   run-usecase.md — the Claude Code command that drives it all
.claude/skills/     playwright-cli agent skill (installed by `playwright-cli install --skills`)
```

**Two levels of results:**
- `results/run-<timestamp>.md` — top-level report: every use case and step with Step / Result / Evidence, links to detail
- `usecases/<name>/results/<timestamp>.json` — full detail: step-by-step outcome, locator changes, screenshots

## One-time setup

```bash
npm install -g @playwright/cli@latest
playwright-cli install --skills
```

`playwright-cli install --skills` installs the `playwright-cli` agent skill
into `.claude/skills/playwright-cli/` so Claude Code knows the full command
set (snapshots, video, storage state, tracing, etc.). Re-run it after
upgrading `@playwright/cli` to refresh the skill. Add `--global` to install it
into `~/.claude/skills/` for all projects instead.

**Credentials** are kept in a local `.env` file that is git-ignored. Copy the
example and fill in your values:

```bash
cp .env.example .env
```

Set `SF_LIGHTNING_URL` in `.env` to your org's Lightning URL (e.g.
`https://your-domain.lightning.force.com`). It must be the same org that
`SF_JWT_USERNAME` belongs to. When it is unset, the default in
`config/env.yaml` (`dev.login_url`) is used.

## JWT Setup (MFA-free auth)

Username/password login triggers MFA and cannot run unattended, so all
authentication uses the JWT Bearer Token flow — it authenticates via a
certificate and never prompts for MFA.

### 1. Generate RSA key pair

Run once in the project root:

```bash
openssl genrsa -out private.key 2048
openssl req -new -x509 -key private.key -out certificate.crt -days 365 \
  -subj "/CN=salesforce-tests"
```

`private.key` stays local and is never committed. `certificate.crt` is uploaded
to Salesforce in the next step.

### 2. Create a Connected App in Salesforce

1. Go to **Setup → App Manager → New Connected App**
2. Fill in:
   - **Connected App Name**: `TestAutomation` (or any name)
   - **API Name**: auto-fills
   - **Contact Email**: your email
3. Check **Enable OAuth Settings**
4. **Callback URL**: `https://login.salesforce.com/services/oauth2/success`
   (not used by the JWT flow, but the field is required)
5. **Selected OAuth Scopes** — add both:
   - `Full access (full)`
   - `Perform requests at any time (refresh_token, offline_access)`
6. Check **Use digital signatures** → click **Choose File** → upload `certificate.crt`
7. Click **Save** — Salesforce may take up to 10 minutes to apply the new app
8. On the app detail page, copy the **Consumer Key** — this is your `SF_CLIENT_ID`

### 3. Pre-authorize the test user

Without this step, Salesforce shows an OAuth consent screen even with JWT.

1. Open the Connected App → click **Manage**
2. Set **Permitted Users** → `Admin approved users are pre-authorized`
3. Under **Profiles**, add the test user's profile (or use a Permission Set)

### 4. Add JWT vars to `.env`

```bash
# Add to your .env file

SF_CLIENT_ID=<paste Consumer Key here>
SF_JWT_USERNAME=your-test-user@yourorg.dev

# Collapse the private key PEM to a single line with \n literals:
SF_PRIVATE_KEY="$(awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' private.key)"
```

Or add the `SF_PRIVATE_KEY` line manually — paste the PEM content with literal
`\n` between lines, all on one line, wrapped in double quotes.

### 5. Authenticate and run

```bash
# In Claude Code:

/run-usecase auth-setup   # JWT exchange → opens Salesforce → verifies login → saves auth-state/salesforce-auth.json

/run-usecase <any>        # all subsequent use cases load the saved state — no MFA
```

Re-run `/run-usecase auth-setup` whenever the session expires (typically 2–8
hours, depending on your org's session timeout policy).

## "Login As" prerequisites (for `login-as-user`)

In Salesforce, **Login As** lets an admin log in as another user to
troubleshoot or verify what that user can access. The `login-as-user` use case
depends on it, so enable it once in the org before running that use case.

### 1. Enable "Login As"

1. Log in to Salesforce as an administrator.
2. Go to **Setup**.
3. In **Quick Find**, search for **Login Access Policies**.
4. Open **Login Access Policies**.
5. Enable **Administrators Can Log in as Any User**.
6. Click **Save**.

### 2. Log in as a user

1. Go to **Setup → Users → Users**.
2. Find the user you want to access.
3. Click **Login** next to their name.

### Troubleshooting: no Login button

If you don't see the **Login** button, check that:

- Your profile/permission set allows you to log in as other users.
- **Administrators Can Log in as Any User** is enabled.
- The target user is active, and you're an administrator with the appropriate
  access.

> **Note:** For Salesforce Experience Cloud, the steps and permissions are
> somewhat different.

## How a use case runs

Open this project folder in Claude Code, then run `/run-usecase <name>`.

Claude will:
1. Read `usecases/<name>/<name>.md` and resolve `{{env...}}` / `{{credentials...}}`
   placeholders.
2. Drive the browser via `playwright-cli` (open -> fill -> click -> assert).
3. On the first run, snapshot the page, find each element, and write what it
   learned into `locators/<name>.yaml`.
4. On later runs, try the cached locator first, and only re-snapshot/heal if
   something no longer matches — that's how it stays correct as Salesforce
   pages change.
5. Write a detailed result to `usecases/<name>/results/<timestamp>.json` and a
   Markdown run report to `results/run-<timestamp>.md`.

## Video recording

Every `/run-usecase` run automatically records the full browser session to `usecases/<name>/videos/<timestamp>.webm`.

- Each step is marked as a **chapter** in the video (e.g. `step-1: Open login page`) — jump directly to any step in a player that supports chapters (VLC, Chrome).
- **Action callouts** are overlaid on the recording: every click, fill, and assertion is visually labelled with the action name and the target element highlighted.
- On failure or an MFA stop, recording is finalized before the screenshot is taken, so the video always captures everything up to the point of failure.

To watch: drag the `.webm` into Chrome/Firefox, or open with VLC.

## Key files explained

| File | What it is |
|------|-----------|
| `.playwright-cli/page-<timestamp>.yml` | Ephemeral DOM snapshot taken during a run. A YAML accessibility tree of the live page at that moment. Discarded after the run; not committed. |
| `locators/<name>.yaml` | Persistent locator cache for a use case. Stores each step's element by `role` + `accessible_name` — not by fragile numeric refs. Written on first run, healed automatically when the page changes. |
| `auth-state/salesforce-auth.json` | Saved browser session (cookies) after a successful `auth-setup` run. Git-ignored. Load it to skip login on every subsequent run. |
| `scripts/sf-jwt-auth.js` | Exchanges a signed JWT for a Salesforce access token. Zero npm dependencies — uses Node.js built-in `crypto` and `https`. |

The key difference: page snapshots are raw and temporary; locator files are curated and durable. The numeric `ref=eN` values in snapshots are re-resolved fresh every run using the semantic identity saved in the locator file.

## Adding a new use case

1. Create `usecases/<name>/` and add `usecases/<name>/<name>.md` with numbered
   open/fill/click/assert steps, following the shape of `auth-setup/auth-setup.md`.
2. Add any new test data it needs to `config/testdata.yaml`.
3. Run `/run-usecase <name>` — the `screenshots/`, `videos/`, and `results/`
   subfolders, and a matching `locators/<name>.yaml`, are all created automatically
   on first run.

## Pros and cons

How this approach (plain-language `.md` steps run by Claude Code with
`playwright-cli`) compares with standard `.ts` Playwright tests run by
`npx playwright test`.

**Pros**
- **Anyone can write a test.** Use cases read like manual test scripts, so
  BAs and Salesforce admins can write and review them without TypeScript.
- **Locators fix themselves.** Elements are found by role and visible name and
  cached in `locators/*.yaml`. When Lightning pages change, they are found
  again instead of failing.
- **Failures come with a diagnosis.** Run reports explain *why* a step
  failed, not just "selector not found".
- **Good evidence.** Every run produces video with a chapter per step,
  screenshots, JSON detail and a Markdown report.
- **Quick to start.** There is no test code, `package.json` or project
  scaffolding to maintain.

**Cons**
- **Results can vary.** An LLM decides what each step means, so the same use
  case can behave differently between runs or after a model update, and
  assertions may be checked loosely.
- **Slow and costly.** A 5-step run took about 265 s plus token cost. An
  equivalent `.ts` test takes about 15–30 s and costs nothing to run.
- **Hard to run in CI and to scale.** It needs an interactive Claude Code
  session, is hard to run in parallel, and doesn't fail a build the way
  `npx playwright test` does.
- **Limited reuse.** There are no functions, fixtures or page objects, so
  shared steps get copied between files.
- **Self-healing can hide real bugs.** A renamed or moved button can still
  pass.
- **Weaker guarantees.** Keeping secrets out of logs, and debugging the
  runner itself, depend on a prompt (`run-usecase.md`), not code you can
  audit and step through.

**Recommendation: combine the two.** Use `/run-usecase` to draft and explore a
flow. Once it passes, have Claude convert the `.md` file and
`locators/<name>.yaml` into a `.ts` Playwright spec for CI. When a spec breaks,
bring Claude back to diagnose and fix it as a reviewed code change. This
approach fits a few high-value, frequently changing flows written by
non-engineers. For CI regression testing, large suites or strict, auditable
pass/fail, start with `.ts`.

## License

This project is licensed under the [MIT License](LICENSE).

The `playwright-cli` skill in `.claude/skills/playwright-cli/` is from
[microsoft/playwright-cli](https://github.com/microsoft/playwright-cli) and is
licensed under the
[Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0).
