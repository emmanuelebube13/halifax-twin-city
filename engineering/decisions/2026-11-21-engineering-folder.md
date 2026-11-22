# Engineering documents live in `engineering/`, not `docs/`

- Date: 21 Nov 2026
- Decided by: proposed in the handoff note; adopted in the build plan; the architect confirms at review
- Status: adopted, awaiting confirmation

## Context

The 15 Nov brief put `plan.md`, the contract, learning notes, decisions and runbooks under `docs/`. But `scripts/sync-drive.ps1` mirrors Google Drive into `drive/` and `docs/` with `rclone sync`, which deletes anything there that is not on Drive.

## Decision

Engineering documents live in `engineering/`: `build-plan.md`, `contract/`, `decisions/`, `runbooks/`, `learning/`, and the V2 brief and task cards. Nothing is ever written into `drive/` or `docs/`.

## Why

Anything written into the mirror folders would be deleted by the next sync.

## Replaces

Every `docs/...` path for engineering files in the 15 Nov brief, the task cards and the Drive copy of AGENTS.md.

## Consequences for the build

- Contract: `engineering/contract/openapi.yaml`. Learning notes: `engineering/learning/<card or branch>.md`. Source notes: `engineering/sources/`.
- The design documents in `docs/` are read-only copies; Drive is the original.
