# No Azure and no paid cloud

- Date: 16 Nov 2026
- Decided by: the architect
- Status: decided

## Context

The 15 Nov plan, brief and task cards put the collector on Azure Functions, raw files in Azure Blob Storage and the web app on Azure Static Web Apps, under a US$5 monthly budget alert.

## Decision

No Azure and no paid cloud. Everything runs locally on the build machine or on genuinely free services. Nothing is spent without asking the architect first.

## Why

The project is personal and unfunded. A local stack is free, keeps the data under the architect's control, and teaches the same data engineering skills.

## Replaces

Every Azure reference in the 15 Nov documents: Azure Functions (T04), Blob Storage (T03, T04), Static Web Apps and preview links (T06), the US$5 budget alert, and "cloud app settings" for secrets.

## Consequences for the build

- The collector is a local Python process (`2026-11-16-collector-hosting-local.md`).
- Raw files live on local disk (`2026-11-16-bronze-local-raw-files.md`).
- The web app runs locally; a free static host may come later (`2026-11-16-web-hosting-local-first.md`).
- Any step that needs an account, a trial, a licence or payment details stops and asks.
