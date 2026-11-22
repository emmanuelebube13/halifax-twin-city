# Opus builder agents, one workstream each, with a lead session

- Date: 21 Nov 2026 (evening)
- Decided by: the architect
- Status: decided

## Context

The 15 Nov brief had one lead agent working card by card.

## Decision

Opus agents build from `engineering/build-plan.md`, one workstream each, in their own git worktree under `C:\halifax-twin-data\worktrees\` on their own branch. Each owns a set of paths and does not edit another's. The lead session plans, integrates and verifies.

## Why

Five independent workstreams can run at the same time without stepping on each other.

## Replaces

The single-lead sequence in the 15 Nov brief's first prompt.

## Consequences for the build

- Builders commit to their branch and do not push, open pull requests or merge.
- The lead merges the branches into `release-1`, resolves overlaps (for example the shared fetch helper), runs everything together, then pushes and opens one pull request per workstream.
- Gate verifiers are still separate sessions that have not seen the build.
