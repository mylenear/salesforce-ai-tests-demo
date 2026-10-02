# salesforce-tests

Plain-language Salesforce use cases driven by `playwright-cli` via
`/run-usecase <name>`. See `README.md` for setup and structure.

## Credentials & secrets

Credentials are never recorded, logged, or tracked — anywhere.

- Never echo, print, log, or write credential values: passwords, login
  usernames, tokens, `SF_PRIVATE_KEY`, `SF_CLIENT_ID`, `access_token`,
  `frontdoor_url`, session IDs (`sid=`), or cookies.
- Never `cat`/read `.env`, `private.key`, or `auth-state/*`, and never print
  env vars that hold secrets. Reference them by name (`"$`SF_PASSWORD`"`) and
  let the shell expand them.
- Wherever a credential is filled in or used, record only
  `credentials provided` (optionally with the variable/placeholder name, never
  the value) — in commands, video chapters, results, locators, and summaries.
