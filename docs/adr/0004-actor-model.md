# Actor model
Status: Accepted

## Context
The durable model must be future-compatible with humans, agents and services while Stage 0 authorizes only people.
## Decision
Store all principals in `actors` with a `human|agent|service` kind. Expose only human password/session authentication in Stage 0. Work items remain project-optional and require `responsible_human_actor_id` only in a `started` workflow category.
## Alternatives
Separate human and agent entity tables; make projects mandatory.
## Consequences
Stage 1 can add Agent delegation without taking human responsibility away.
## Migration
The invariant is checked in the command layer after resolving workflow state.
## Spec changes
None.
