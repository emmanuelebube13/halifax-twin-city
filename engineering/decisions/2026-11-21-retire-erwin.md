# erwin is retired; the model lives in the spec

- Date: 21 Nov 2026 (evening)
- Decided by: the architect
- Status: decided

## Context

The logical model was being redrawn in erwin, whose trial ends on 22 Nov 2026. The same model already exists as data in `database/generator/logical_model_spec.py`, which generates the physical SQL byte for byte.

## Decision

erwin is retired. The model lives in `database/generator/logical_model_spec.py`. Diagrams, the data dictionary and model checks will be generated from the spec (card M01, after release 1). pgAdmin is used for browsing the database.

## Why

One source of truth, with everything generated from it, cannot drift apart. erwin was a paid tool after the trial and duplicated the spec.

## Replaces

The 20 Nov work split ("the architect finishes erwin") and the erwin export deadline. The open question about the Event subtype circle in erwin no longer applies.

## Consequences for the build

- Model names still come from the spec, exactly. Never invent a name; ask.
- Exporting the partial erwin diagram before 22 Nov is optional, only as a record.
- Card M01 in `engineering/task-cards-v2.md` covers the generated diagrams, dictionary and checks.
