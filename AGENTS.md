# Repository Guidelines

## Project Structure & Module Organization

- `scripts/`: Core proxy automation scripts grouped by ecosystem (`weread/`, `telecom/`, `tools/` for standalone utilities like `bilibili`, `pixiv`, `github`).
- `ql_script/`: Qinglong panel tasks (`weread.js`, `telecom_wednesday.py`) with embedded `@cron` headers, single-variable configuration, and self-healing token renewal.
- `loon/`: Loon `.plugin` configuration files (`CookieCenter.plugin` for central auth/cron, plus standalone tool plugins).
- `boxjs/`: BoxJS subscription schemas (`CookieCenter.boxjs.json`) for credential persistence and app settings.
- `notes/` & `docs/`: Technical reversing notes, protocol analyses, and onboarding guides (`add-app.md`, `add-plugin.md`).
- `icons/`: Image assets for plugins and BoxJS apps.

## Build, Test, and Development Commands

This repository contains standalone JavaScript and Python automation scripts; no compilation step is required.

- `node --check <script.js>`: Verifies JavaScript syntax and parse readiness.
- `python -m py_compile <script.py>`: Verifies Python script syntax.
- `node -e "JSON.parse(require('fs').readFileSync('boxjs/CookieCenter.boxjs.json','utf8')); console.log('JSON_OK')"`: Validates BoxJS JSON syntax.
- `python ql_script/telecom_wednesday.py`: Executes the Qinglong script locally using configured environment variables.
- `git status --short`: Confirms the working directory is clean before committing.

## Coding Style & Naming Conventions

- **JavaScript / Python**: Use 2-space or 4-space indentation consistently. Normalize HTTP headers with `.toLowerCase()`. Avoid Unicode escaping for Chinese and emojis.
- **Naming**: Directory and script names must be lowercase English identifiers (`bilibili`, `telecom`). Secondary helper scripts use dot notation (`<name>.<role>.js`).
- **Script Headers**: Main scripts must define `SCRIPT_VERSION = "YYYY-MM-DD.rX"` logged on launch and include the inlined `Env` multi-platform adapter at the bottom.
- **Loon Plugins**: Files in `loon/` must include `#!version` and a timestamped `#!date = YYYY-MM-DD HH:mm` (minute precision is required on every change).

## Testing Guidelines

- Run syntax validation (`node --check`, `py_compile`) and JSON validation prior to commit.
- Test credential capture and task execution inside proxy clients (Loon, Surge, Quantumult X, Stash) or a Qinglong instance using sandbox accounts.
- Verify notification formatting, ensuring specific reward names are reported rather than vague counts.

## Commit & Pull Request Guidelines

- **Commit Format**: Conventional Commits `<type>(<scope>): <subject>`.
  - Common types: `feat`, `fix`, `refactor`, `chore`, `docs`.
  - Example: `feat(telecom): add prize history readout (v1.3.0)` or `fix(weread): handle skey refresh`.
- **Pull Requests**: Explain the target platform, verify syntax, link any related issues, and bump `SCRIPT_VERSION` or `.plugin` metadata when modifying scripts. Never commit active session tokens or one-off reverse-engineering scratch scripts.
