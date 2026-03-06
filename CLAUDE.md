# Aether Development Rules

**Read SOUL.md first.** It defines what Aether is, what it believes, and how it behaves. Every technical decision must align with it.

## Before Making Any Changes

1. Read `SOUL.md` (product identity and core beliefs)
2. Read this file completely
3. Audit the relevant code
4. Propose a plan
5. Implement changes incrementally

Never perform large refactors without explanation. Never touch more files than necessary.

---

## Platform Overview

Aether is a production multi-tenant SaaS intelligence platform — Palantir for SMBs. It ingests raw business data, builds a structured model of the company's operations, and produces accurate, explainable metrics and insights.

## Technology Stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS v4
- **Backend:** Supabase Postgres, Supabase Auth, Row Level Security
- **AI:** Claude API (Anthropic) for ontology detection and insights
- **Payments:** Stripe (Starter/Growth plans)
- **Hosting:** Vercel
- **Email:** Resend

---

## The 5-Layer Architecture (sacred — never skip layers)

```
Layer 1: Raw Ingestion     → uploads, data_rows (immutable ground truth)
Layer 2: Normalization      → date parsing, number standardization, column identification
Layer 3: Entity Resolution  → staff vs client, alias handling, clarification questions
Layer 4: Ontology           → entity_types, entities, relationships (the business model)
Layer 5: Metrics            → kpi_snapshots, metric_snapshots, performance_gaps (dashboards)
```

**Cardinal rule:** Never compute metrics directly from raw data. Never show a dashboard without entity resolution. Each layer depends on the one below it.

## Key Data Flow

```
CSV Upload
  → lib/data/date-mapping.ts (normalize dates)
  → lib/ai/ontology-detector.ts (AI detects columns — DO NOT MODIFY)
  → lib/data/ontology-builder.ts (creates entity_types + entities)
  → lib/data/compute-engine.ts (aggregates KPIs from data_rows)
  → lib/data/performance-gaps.ts (computes leakage per entity per week)
  → Dashboard reads kpi_snapshots + metric_snapshots
  → Performance reads performance_gaps
```

## Critical Data Rules

- **Dates:** Sales CSVs use DD/MM/YYYY format. The date parser must handle DD/MM, MM/DD, and ISO. Never use raw `new Date(string)` for user-uploaded data.
- **Revenue:** "Total" is the authoritative revenue column (final amount paid). "Amount" is a component. Always prefer "Total" over "Amount" when both exist.
- **Refunds:** If Type contains "refund" or "credit" (case-insensitive), or if Total is negative, it subtracts from revenue.
- **User vs Client:** "User" = who executed the sale (staff if in-studio, client if online). "Client" = who paid (always the customer). If User == Client in the same row, it's an online self-checkout — NOT a staff member.
- **Leakage:** Defined as underperformance vs the entity's own rolling 4-week median baseline. NOT comparison to the top performer.

## Files You Must Not Modify

- `lib/ai/ontology-detector.ts` — The AI detection engine. It works correctly. Consume its output, don't change its logic.
- `SOUL.md` — Only the founder modifies this.

---

## Security & Multi-Tenancy Principles

1. **Never trust org_id from the client.** Always derive tenant context server-side from the authenticated user's profile.
2. **All queries must be scoped by org_id.** No exceptions.
3. **Row Level Security is structural, not optional.** Every table with business data must have RLS policies using `get_user_org_id()`.
4. **Avoid service-role usage in request paths.** Use it only for admin/cron operations.
5. **Strict tenant isolation.** Data from one organization must never appear in another's queries, dashboards, or API responses.

## Metric Principles

1. **Determinism.** Same input + same decisions = identical output every time.
2. **Explainability.** Every number must be traceable back to source rows.
3. **Honesty.** If there isn't enough data, show "insufficient data" — never show a wrong number.
4. **The LLM is the mapper, not the calculator.** AI identifies what columns mean. Deterministic code computes the actual numbers.

## Development Workflow

1. Work on a feature branch (never commit directly to main)
2. Run `npm run build` before pushing — must pass with zero errors
3. Test with real data (sales CSV with DD/MM dates, staff roster with single column)
4. Verify multi-tenant isolation (changes for one org don't affect another)
5. Keep changes minimal and auditable
