# Auth Setup

## Goal
Authenticate once via JWT Bearer flow and save the browser session to
`auth-state/salesforce-auth.json`. All subsequent use case runs load this
file instead of re-authenticating — equivalent to `auth.setup.ts` in
`@playwright/test`.

This also serves as the end-to-end JWT login check. It bypasses MFA entirely,
but requires the Connected App + certificate to be set up in Salesforce first
(see README § JWT Setup).

Re-run this use case whenever the saved session expires (Salesforce sessions
typically last 2–8 hours depending on org policy).

## Config
- env: config/env.yaml (key: dev)
- credentials: config/credentials.yaml (key: jwt_user)

## Pre-auth
Before opening the browser, run:

```bash
set -a; source .env; set +a
node scripts/sf-jwt-auth.js
```

Parse the JSON output and store it as `{{jwt}}`:
- `{{jwt.access_token}}`  — short-lived session token (valid ~2 hours)
- `{{jwt.instance_url}}`  — e.g. https://your-domain.my.salesforce.com
- `{{jwt.frontdoor_url}}` — full URL to inject the token into a browser session

If this step fails, stop and report the error (expired token, wrong client ID,
user not pre-authorized, etc.) — do not proceed to browser steps.

## Steps
1. open: {{jwt.frontdoor_url}}
2. assert: the App Launcher (waffle) icon is visible in the top nav
3. assert: current URL contains "lightning"
4. save-state: auth-state/salesforce-auth.json

## On step 4
After the assert steps pass, run:
  `playwright-cli state-save auth-state/salesforce-auth.json`

This saves all cookies and storage to the file. Report the file path in the
result so future runs can confirm it exists before loading it.

## On failure
- **Pre-auth fails**: Check SF_CLIENT_ID, SF_PRIVATE_KEY, SF_JWT_USERNAME in
  .env. Ensure the Connected App has "Admin approved users are pre-authorized"
  and the user's profile is listed. A `DECODER routines::unsupported` error
  means SF_PRIVATE_KEY is malformed — it must be one line with literal `\n`
  between PEM lines, wrapped in double quotes.
- **Step 1 shows a Salesforce error page**: the access token may have expired
  (3-min exchange window) or the Connected App is not pre-authorized for this
  user. Check SF_CLIENT_ID, SF_PRIVATE_KEY, and that the user's profile is
  listed under the Connected App's pre-authorized profiles.
- **Step 1 shows an OAuth consent screen**: the Connected App's "Permitted
  Users" is not set to "Admin approved users are pre-authorized". Fix in
  Salesforce Setup and retry.
- **Steps 2–3 fail after a redirect**: the token exchange succeeded but
  Salesforce redirected to an unexpected page (e.g. "Choose Your App"). Capture
  a snapshot and report the actual URL and page state.
- **Step 4 fails**: The `auth-state/` directory may not exist. Create it with
  `mkdir -p auth-state` and retry.
