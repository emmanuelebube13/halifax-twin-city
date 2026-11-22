# Secrets come from environment variables or git-ignored local config

- Date: 20 Nov 2026
- Decided by: the architect
- Status: decided

## Context

The 15 Nov documents kept keys in GitHub secrets and cloud app settings. The repository is public.

## Decision

Keys, tokens and passwords never enter the repository, a document, an issue, a pull request or a chat. They are read from environment variables (`CESIUM_ION_TOKEN`) or a git-ignored local config file. Only example files (`.env.example`) are committed. The serving API binds to 127.0.0.1 and gives the Cesium token to the page only when the request comes from localhost (127.0.0.1 or ::1).

The database password lives only in `%APPDATA%\postgresql\pgpass.conf`, which `psql` and `psycopg` read by themselves; the connection string in `HALIFAX_TWIN_DB_URL` has no password in it.

## Why

A public repository leaks anything committed to it, permanently, including through its history.

## Replaces

"GitHub secrets and cloud app settings" in the 15 Nov brief and the Drive copy of AGENTS.md.

## Consequences for the build

- Agents never open, print or copy the password file or the token. To check the token is set, test for its presence only.
- `.gitignore` excludes `.env`, `.env.*` (except `.env.example`), `config.local.json` and `*.local.json`.
