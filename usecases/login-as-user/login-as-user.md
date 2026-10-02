# Login As User

## Goal
Using the admin session saved by `auth-setup`, find the
`{{testdata.login_as_user.name}}` user via the Setup top search ("Search
Setup"), log in as that user with the **Login** button on the user's page,
and verify the impersonation succeeded. Log out afterwards and delete the
session data; the next `auth-setup` run creates a fresh admin session.

## Config
- env: config/env.yaml (key: dev)
- testdata: config/testdata.yaml (key: login_as_user)

## Precondition
- `auth-state/salesforce-auth.json` must exist. If it is missing, stop and
  report: "Run `/run-usecase auth-setup` first."
- The org must allow Login-As: Setup → Login Access Policies →
  "Administrators Can Log in as Any User" enabled. Otherwise the Login button
  is not shown on the user page.

## Steps
1. open: {{env.dev.login_url}}/lightning/setup/SetupOneHome/home
2. assert: Setup Home is displayed — the input with placeholder "Search Setup" is visible in the top header
3. fill: the input with placeholder "Search Setup" with "{{testdata.login_as_user.name}}"
4. assert: the search results dropdown that opens after the value is entered
   shows an option named "{{testdata.login_as_user.name}}" — wait for the
   dropdown to populate; if no matching option appears, stop with STOPPED:
   "User '{{testdata.login_as_user.name}}' not found in Setup search" and mark
   the remaining steps as SKIPPED
5. click: the `li` item with title "{{testdata.login_as_user.name}}" inside that
   dropdown — do it right away while the dropdown is still open (don't re-type,
   press Enter, or pick the 'Search "…" in Setup' option instead)
6. assert: wait until the user detail page for "{{testdata.login_as_user.name}}"
   has finished loading (the page heading / User Detail section shows the name)
7. click: the "Login" button on the user detail page
8. assert: the header banner reads "Logged in as {{testdata.login_as_user.name}}"
   and a "Log out as {{testdata.login_as_user.name}}" link is visible
9. assert: the App Launcher (waffle) icon is visible and current URL contains "lightning"
10. click: the "Log out as {{testdata.login_as_user.name}}" link — no check of
    the page afterwards (it lands on the login page; that is expected here and
    is not a "session expired" stop)
11. delete-session: delete `auth-state/salesforce-auth.json` and run
    `playwright-cli delete-data` to remove the browser's session data

## Notes
- In Lightning Setup the user detail page (steps 6–7) is rendered inside an
  iframe; snapshot the frame content to locate the heading and Login button.
- Do **not** run `state-save` in this use case — `auth-state/salesforce-auth.json`
  must stay the admin session.
- Logging out of the impersonated user currently ends the admin session too
  (Salesforce redirects to the login page and the saved state stops working),
  so step 11 deletes the session data. Run `/run-usecase auth-setup` before
  the next use case to get a fresh admin session.

## On failure
- **Step 4 fails**: the user doesn't exist, is named differently, or search
  results haven't loaded yet. Check `login_as_user.name` in
  `config/testdata.yaml`.
- **Step 7 fails (no Login button)**: Login-As is disabled in Login Access
  Policies, the user is inactive, or the admin lacks the "Manage Users"
  permission.
- **Step 8 fails**: capture a snapshot and report the landed URL (query string
  stripped) and page title.
- **Redirected to the login page at any point**: the saved session expired —
  run `/run-usecase auth-setup` to refresh.
