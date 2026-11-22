# The web app runs locally first

- Date: 16 Nov 2026
- Decided by: the architect
- Status: decided; the free static host for later is not chosen

## Context

T06 deployed the web app to Azure Static Web Apps on the Free plan, with a preview link for every pull request.

## Decision

The web app runs locally on the build machine (the Vite dev server, or a local preview of the production build). A free static host may be chosen later, if a public URL is wanted at all.

## Why

No Azure and no paid cloud. Release 1 is shown through screenshots and a screen recording, which needs no public URL.

## Replaces

Azure Static Web Apps and per-pull-request preview links in T06 and T12.

## Consequences for the build

- Phone testing uses a phone-sized browser viewport, or a real phone on the same home network pointed at the build machine.
- The serving API passes the Cesium token only to requests from localhost, so a phone on the network gets 2D only. That is intended.
- Choosing a host, and whether the app should be public at all, are open questions for the architect.
