# Halifax Digital Twin: start here

This repository is the Halifax Digital Twin, a living data model and 3D map of Halifax, Nova Scotia, built by Emmanuel Mbachu (the architect) as both a product and a way to learn enterprise data practice.

Before any work, read in this order:

1. `PROJECT_CONTEXT.md` in this folder: everything known about the project as of 21 Nov 2026 (history, decisions, design, current code, open questions, future).
2. `docs/08 Map Application/00 Start here： Claude Code handoff, MAIN BUILD.md` (Drive copy is the original): what the main build's first session must do, and the rules.

Rules that apply to every session:

- Never write into `drive/` or `docs/`. `scripts/sync-drive.ps1` mirrors Google Drive there with `rclone sync` and deletes anything else.
- Never commit, print or repeat a key, token or password. The repository is public. The Cesium ion token comes from the environment variable `CESIUM_ION_TOKEN` or a git-ignored local config.
- Use the logical model's names exactly (`database/generator/logical_model_spec.py`). Do not change the `silver` schema without the architect's approval; propose instead.
- One task, one branch, one pull request with tests and a "How I verified" section. The architect reviews and merges.
- Spend nothing. Local or genuinely free tools only. Stop and ask before anything that costs money or needs an account or key you were not given.
- No emoji anywhere. Sentence case. Canadian spelling. Halifax time, 24-hour clock.
- End each task with a short learning note for the architect, and each session with a report: what is done, the evidence, what is blocked, numbered questions.

Session 0 of the main build is expected to extend this file. Keep it short; put detail in `PROJECT_CONTEXT.md` or the engineering documents.
