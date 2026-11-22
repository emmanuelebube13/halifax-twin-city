# Realistic 3D through CesiumJS and the architect's Cesium ion token

- Date: 15 Nov 2026 (3D is core) and 20 Nov 2026 (engine and token)
- Decided by: the architect
- Status: decided

## Context

The 15 Nov documents loaded Google Photorealistic 3D Tiles with a Google Maps Platform key held in GitHub secrets, and T27 compared three engines before choosing one.

## Decision

Realistic 3D is core, not optional. The 3D view uses CesiumJS with Google Photorealistic 3D Tiles streamed through Cesium ion, using the architect's own ion token. No Google Maps Platform key is used. 2D (MapLibre GL JS) always works, with or without the token.

## Why

The demo proved CesiumJS with ion on 20 Nov, and ion serves the Google tiles without a separate Google key.

## Replaces

The Google Maps Platform key in the brief (T27, T29) and the open engine choice in T27.

## Consequences for the build

- The token is read from `CESIUM_ION_TOKEN` (`2026-11-20-secrets-from-environment.md`). Without it the 3D switch is disabled with a short note.
- Show Google and Cesium attribution on the 3D view. Never cache, store or derive data from Google tiles.
- The token was pasted into a chat on 20 Nov; it must be rotated and restricted to localhost before the build uses it.
- Check ion's free plan terms and limits at build time; do not rely on numbers in older documents.
