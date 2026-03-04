# Aether Development Rules

Before making any modifications to the codebase, always read the following documentation:

/docs/claude-instructions.md
/docs/architecture/system-overview.md
/docs/architecture/architecture-stack.md
/docs/architecture/data-model.md
/docs/architecture/security-model.md
/docs/architecture/product-philosophy.md

---

## Platform Overview

Aether is a production multi-tenant SaaS intelligence platform inspired by Palantir Foundry.

The system must enforce:

- strict tenant isolation
- server-side RBAC
- Supabase Row Level Security
- org_id scoped queries
- deterministic metric computation
- enterprise-grade security

---

## Technology Stack

Frontend
- Next.js (App Router)
- React
- TypeScript

Backend
- Supabase Postgres
- Supabase Auth
- Row Level Security

Hosting
- Vercel

---

## Development Principles

1. Never trust org_id from the client.
2. Always derive tenant context server-side.
3. All queries must be scoped by org_id.
4. Maintain strict tenant isolation.
5. Avoid service-role usage in request paths.
6. Ensure metrics remain explainable and deterministic.
7. Treat this system as enterprise production software.

---

## Development Workflow

Before implementing changes:

1. Read the architecture documentation.
2. Audit the relevant code.
3. Propose a plan.
4. Wait for approval.
5. Implement changes incrementally.

Never perform large refactors without explanation.
