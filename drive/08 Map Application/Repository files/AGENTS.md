# AGENTS.md

Rules for every agent working on the Halifax Digital Twin map application. The architect owns the models, the business rules, the contract approvals and every gate.

## Rules

1. Read `docs/plan.md`, `AGENTS.md`, `docs/contract/openapi.yaml` and `docs/sources/` before you start. Look at `docs/wireframes/` before any interface work.
2. One task card, one branch, one pull request. Name the branch after the card, for example `t03-transit-collector`.
3. Do not change the contract, a business rule or a model name. Propose the change to the architect and wait.
4. Confirm every external address, limit, price and licence yourself at build time. The plan's facts are as of 15 November 2026.
5. No personal data. Show the licence attribution wherever data is shown.
6. Never commit a key or password. Use environment variables, GitHub secrets and cloud app settings. Commit only `.env.example`.
7. No emoji anywhere: interface, pins, alerts, documents, commit messages, code comments. Sentence case for all interface text.
8. Every number shown to a user goes through the shared formatter. Every piece of interface text lives in the language file.
9. Every pull request carries tests and a short note headed "How I verified".
10. Finish every card with `docs/learning/<card>.md`: what you built, why, how to run it, and one exercise for the architect to do by hand.
11. Spend nothing without asking. If a step would create a paid resource or leave a free tier, stop and ask.
12. The verifier is always a separate session that has not seen the build. It reports; it does not fix.

## When to stop

Stop and ask the architect when a source is not open or its licence is unclear, when a business rule or model name is missing, when the acceptance test cannot be met as written, when a step would cost money, or when you need a key or account you were not given.

## Roles

| Role | Does | Never does |
| --- | --- | --- |
| Lead | Picks the next card, breaks it down, opens the pull request, reports at gates | Merges without the architect's approval at a gate |
| Source scout | Confirms each source: address, format, refresh rate, licence, sample | Writes pipeline code |
| Collector engineer | Builds one collector per source and its monitoring | Couples one source's failure to another |
| API engineer | Owns the contract file, the serving API and its adapters | Changes the contract without approval |
| Map engineer | Builds the shell, layers, stories, pins and panels | Reads data from anywhere but the API |
| Data engineer | Writes DuckDB transforms, then implements Bronze to Gold to the architect's model | Invents entity or column names |
| Verifier | Recomputes each answer independently from raw data; runs the definition of done | Fixes what it finds |

## Definition of done for a story

- The answer sentence matches an independent check of the same data.
- It works on a phone and on a laptop.
- Source, as-of time and reliability tier are visible.
- Empty, loading and source-down states are designed.
- The story is recorded in the story register with its question id, layers and data lineage.
- Automated tests pass for the API and the story.
- The architect has accepted it at a demo.

## Session report

End every session with a short report in the pull request: what is done, the evidence, what is blocked, and the questions for the architect.
