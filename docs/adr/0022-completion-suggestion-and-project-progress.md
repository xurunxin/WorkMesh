# Completion suggestion and project progress policy

Status: Accepted

## Context

Merged code is evidence, not proof that a work item should change workflow status. Project reporting needs milestones, health updates, dependencies, and an artifact shelf without introducing Stage 4 automation.

## Decision

Projects retain the existing single-Team model. Milestones group work items and calculate progress from human-controlled workflow status categories. Updates may be drafted by an authorized agent through the HTTP API, TypeScript SDK, or MCP tool, but publishing is a separate human-only action. Basic project dependencies must form an acyclic graph.

A successful merge creates an open completion suggestion with evidence. It does not transition or close the work item and does not change milestone progress. A human must accept/dismiss the suggestion and perform any workflow transition separately.

## Alternatives

Automatically close on merge; derive progress from session or PR state; allow agents to publish health without human review.

## Consequences

Project status remains human-responsible. Suggestions may remain open and are explicitly visible in the project delivery view.

## Migration

Migration 0008 adds milestones, updates, dependencies, artifact shelf links, and completion suggestions.

## Spec changes

Project delivery, milestone, update, dependency, and completion-suggestion routes are added.
