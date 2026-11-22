# Learning note: session 0 documents (branch `s00-docs`)

21 Nov 2026. Workstream A of release 1.

## What was built and why

| File | What it is | Why it matters |
| :---- | :---- | :---- |
| `CLAUDE.md` (extended) | Orientation every Claude Code session reads first: layout, where not to write, how to run things, the decisions in force | A new session starts with the right picture instead of re-deriving it, and does not repeat old mistakes such as writing into `docs/` |
| `AGENTS.md` | The rules, roles, definition of done and session report, updated from the 15 Nov Drive copy | One rule book for every agent; Azure, DuckDB and cloud secrets removed |
| `.env.example` | The three environment variables the code reads, with placeholders only | Shows what to set without ever holding a secret |
| `engineering/runbooks/setup-windows.md` | How this machine was set up, how to start, stop and rebuild the database, memory settings with reasons, the Cesium token, and the hand tasks | Lets the architect (or a new agent) rebuild or repair the machine alone |
| `engineering/decisions/` | One dated note per decision (8 from the handoff, 5 from the evening of 21 Nov, plus the `engineering/` folder) | Decisions are findable, dated and say what they replace |
| `engineering/agent-brief-v2.md` | The 15 Nov brief with the overrides applied | The standing orientation for the main build |
| `engineering/task-cards-v2.md` | T01 to T30 with each change marked, plus T31 (schedule loader port) and M01 (model tooling) | The backlog after release 1, in one place, consistent with the decisions |

## How to use it

- Starting a session: read `CLAUDE.md`, then follow its reading order.
- After a reboot: start the database (`engineering/runbooks/setup-windows.md`, section 6).
- Before a decision is taken: write it as a proposal in `engineering/decisions/` using the template in its README; the architect turns it into "decided".
- Picking the next piece of work after release 1: `engineering/task-cards-v2.md`, "Order of work".

## The project site (`site/`, added by scope addendum)

A static GitHub Pages site: plain HTML, CSS and a few lines of script, with no build step. Open `site/index.html` in a browser to see it. Its design is a harbour chart in fog: chart paper and ink, depth contours and soundings in IBM Plex Mono, port red and starboard green as the only accents, and an amber for Atlantic light. Every colour is a token on `:root`, with a dark set. All text colours were checked at 4.5:1 or better, and borders at 3:1 or better, in both themes. The 13 questions are copied word for word from the register, and a script checks them against the workbook.

`.github/workflows/pages.yml` can deploy `site/` with the official Pages actions. It runs only when started by hand, and only after Pages is turned on in the repository settings. That choice stays with the architect.

## Exercise for the architect

Practise the "decision record" habit on one real decision.

1. Open `engineering/decisions/README.md` and copy the template.
2. Pick one open question from `PROJECT_CONTEXT.md` section 12, for example "Bronze backup to Drive: yes or no".
3. Write `engineering/decisions/2026-11-22-bronze-backup.md` with your answer: context (about 425 MB a day of trip updates, 7-day retention), the decision, why, what it replaces, and the consequences for the collector.
4. Add a row to the table in the README.
5. Compare it with `2026-11-21-raw-data-retention.md`: does your note say clearly what an agent must and must not build?

## Enterprise mapping

Architecture decision records (ADRs), runbooks and a definition of done are standard practice in enterprise data teams and appear in data management (DAMA-DMBOK, data governance) and DevOps topics.
