# Claude Project Instructions — Aether

Aether is a production SaaS intelligence platform inspired by Palantir Foundry/AIP.

Primary goals:
- multi-tenant SaaS architecture
- strict tenant isolation
- explainable analytics
- enterprise-grade security
- scalable vertical intelligence platform

Technology stack:
- Next.js (App Router)
- React
- TypeScript
- Supabase (Postgres + Auth + RLS)
- Vercel hosting

Branch workflow:
- dev branch = development
- main branch = production

Golden rules for this repository:

1. Never break tenant isolation.
All queries must be scoped by org_id.

2. Never trust org_id from the client.
It must be derived server-side.

3. Row Level Security must always remain enabled.

4. RBAC must be enforced server-side.

5. Changes should be incremental and auditable.

6. Generate SQL migrations but do not execute them automatically.

7. Treat the system as enterprise production software.
