# Lead prompt: release 1

21 Nov 2026. This is the one prompt the architect gives to one agent. That agent (the lead) routes the work to five builders, puts their work together, and hands the result to a separate final tester. The architect does not start the builders by hand.

## How to start the lead

```powershell
cd C:\Users\emman\OneDrive\Documents\Project\Halifax_Twin_city\halifax-twin-city
claude --model opus --add-dir C:\halifax-twin-data
```

Then type:

```text
Read engineering/lead-prompt.md and do what it says under "Your job".
```

---

## Your job

You are the lead agent for release 1 of the Halifax Digital Twin: the main build, not the demo. Release 1 is one web map with three sectors on real data (Transportation, Public Works, Housing & Real Estate), one story each. You route the work to five builders, integrate what they produce, and hand it to the final tester. You do not build the workstreams yourself and you are not the final tester.

The architect, Emmanuel Mbachu, is learning as the project goes. He reviews and merges every pull request. He is not watching this session closely, so do not stop to ask him things you can find out yourself; collect real questions for the end.

### Read first

In this folder, in this order:

1. `CLAUDE.md`
2. `PROJECT_CONTEXT.md`
3. `docs/08 Map Application/00 Start here： Claude Code handoff, MAIN BUILD.md`
4. `engineering/build-plan.md` (the specification for all five workstreams)
5. `engineering/agent-prompts.md` (the five builder prompts)

Where this prompt disagrees with section 9 of the build plan, this prompt wins: you do not push and you do not open pull requests. That happens after the final tester has passed the release.

### Rules that bind you and every builder

- Never write into `drive/` or `docs/`.
- Never print, copy or commit a key, token or password. Do not open `%APPDATA%\postgresql\pgpass.conf`.
- Use the logical model's names exactly. Never change the `silver` schema.
- Spend nothing. Free and open tools only. No new accounts or keys.
- No emoji. Sentence case. Canadian spelling. 24-hour clock. Dates as 21 Nov 2026.
- Do not push, open pull requests, merge into `main`, delete branches, or register scheduled tasks.
- Tests never run against the `halifax_twin` database; each workstream uses its own scratch database.

### Step 1: check the ground

1. `git worktree list` shows five builder folders under `C:\halifax-twin-data\worktrees\` (`docs`, `collector`, `sector`, `api`, `web`), each on its own branch.
2. The database answers: `C:\halifax-twin-data\pgsql\bin\pg_isready.exe -h localhost -p 5433`. If it does not, start it with the command in `engineering/agent-prompts.md`.
3. On branch `s00-initialize`, commit `engineering/agent-prompts.md` and `engineering/lead-prompt.md` if they are still untracked.
4. Look at each builder folder for existing commits beyond `s00-initialize`. If a builder has already done work, tell that builder to continue from what is there instead of starting again.

If a worktree or the database is missing and you cannot restore it, stop and say so.

### Step 2: start the five builders

Start five subagents in one message so they run at the same time: general-purpose agents on the Opus model, one per workstream A to E. Give each one its prompt from `engineering/agent-prompts.md`, word for word (the text inside the block under its heading). Add nothing that changes its scope. Each prompt already names the folder the builder must stay in.

Things to know while they run:

- B (collector) matters most for time: the feed archive only starts once it runs, and missed history cannot be rebuilt.
- E (web) builds against contract files that D (API) writes first into the `api` worktree. E's prompt tells it to wait and check again if they are not there yet.
- Builders cannot ask the architect anything. If one stops on a question you can answer from the documents, answer it and send that builder back to work. If it needs the architect (money, a key, an unclear licence, a missing model name), leave that part undone and record the question.
- Do not do a builder's work for it. If a report shows a gap against its "Done when" line in the build plan, send it back with the specific gap, once or twice. After that, record what is still missing.

### Step 3: check each builder's report against its folder

A report is a claim until you have checked it. For each workstream:

1. The commits it lists exist on its branch, and the folder is clean.
2. It only touched paths it owns (build plan, section 7).
3. Its tests pass when you run them yourself.
4. Nothing under `drive/` or `docs/` changed, no secret was committed, and a text search finds no emoji.

### Step 4: integrate

1. Create branch `release-1` from `s00-initialize` in this folder and merge the five builder branches into it. Resolve overlaps (the plan expects one: the fetch-logging helper shared by the two collector workstreams).
2. Make sure the realtime collector is running against `halifax_twin`, exactly one copy, and leave it running.
3. Start the API (port 8010) and the web app (port 5173) from `release-1`, and walk through the three stories at laptop size (1440 by 900) and phone size (390 by 844). Fix what fails as integration work, with commits on `release-1`.
4. Add `scripts/start-all.ps1` and `scripts/stop-all.ps1` so the database, collector, API and web app start and stop with one command each.
5. Stop the API and the web app when you are done. Leave the database and the collector running.

### Step 5: hand over to the final tester, then stop

The final tester is a separate session that has not seen the build. It tests and reports; it does not fix. Write `engineering/release-1-handover.md` for it, commit it on `release-1`, and stop. Keep it factual. The tester will check every claim, so a known gap stated plainly is worth more than a claim that fails.

The handover holds:

1. How to start and stop everything, and the address to open.
2. Per workstream: branch, last commit, what it delivered, the test command and its result when you ran it.
3. Per story (TRN-Q01, PWK-Q13, HRE-Q29): the source actually used, its licence, row counts and date range in `halifax_twin`, and whether a fallback question replaced the planned one.
4. The collector: process id, when it started, how to stop it, and the largest gap in the feed so far.
5. Known gaps: anything not built, switched off, left as a placeholder, or different from the build plan or the contract.
6. Every builder's questions for the architect in one numbered list, each answerable in one line, with duplicates removed.

Then give the architect a short final message: what is ready, what is not, and that the next step is the final test.
