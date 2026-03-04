# System Overview

Aether is a multi-tenant operational intelligence platform inspired by Palantir Foundry/AIP, designed for small and mid-sized businesses.

Core workflow:
1) Ingest data (CSV uploads + integrations)
2) Map data into an operational model (ontology: entities + relationships)
3) Compute explainable metrics and performance gaps (deterministic by default)
4) Surface insights through dashboards, heatmaps, and graph views
5) AI assistant reasons using computed metrics, targets, alerts, and active data streams

Multi-vertical strategy:
Aether begins with one wedge vertical (gym/wellness studios) but the core architecture must remain vertical-agnostic so new verticals can be supported via entity types and metric definitions, not hardcoded pipelines.

Non-negotiables:
- strict tenant isolation (org-scoped queries everywhere)
- server-side authorization (RBAC enforced on API routes/server actions)
- explainable analytics (formula + source + dataset version)
- scalable ingestion (multi-stream, versioned datasets, deterministic recompute)
