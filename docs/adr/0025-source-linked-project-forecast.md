# Source-linked Project Forecast

Status

Accepted for Stage 4.

Context

Project health and forecasts influence prioritization but are estimates. A single unexplained status or a model-generated conclusion presented as fact is not sufficiently auditable.

Decision

Each health update stores health, narrative summary, optional forecast date, confidence in the closed interval zero to one, and an explicit uncertainty explanation. At least one typed source is required; source rows retain the referenced aggregate, observation time, and value snapshot and are immutable.

A human may publish directly. An Agent may draft, but publishing requires an active approval whose subject, action, exact payload hash, and revision match the health update being published. The API validates the referenced sources inside the same Workspace and Project scope before publishing.

Alternatives

An opaque generated score was rejected because users cannot inspect its evidence. Requiring approval for human updates was rejected as unnecessary friction. Treating confidence as a binary flag was rejected because it hides forecast uncertainty.

Consequences

Every published health statement is explainable and provenance-linked. Clients must display uncertainty and sources alongside the forecast rather than collapsing them into a definitive date.

Migration

Migration `0018_stage4_loops_health_a2a.sql` adds health update/source tables, source immutability, and agent-approval constraints.

Spec changes

Project health request schemas and history endpoints are defined in `OPENAPI.yaml`.
