# Tenant Isolation Checklist

Rules and regression checks to prevent cross-tenant data leakage.

## Pre-Deployment Checks (every PR)

### Server Code

- [ ] Every new API route uses `getOrgContext()` from `lib/auth/org-context.ts`
- [ ] org_id is **never** read from request body, query params, or headers
- [ ] No `createClient` from `@/lib/supabase/client` in server files (`app/api/`, `lib/` server modules)
- [ ] No `createAdminClient()` in user-request code paths without documented justification
- [ ] All Supabase queries include `.eq('org_id', ctx.orgId)` even when RLS is active (defense in depth)

### Caching

- [ ] No module-level `Map`, `Set`, or `Object` storing org-specific data
- [ ] No `unstable_cache` or `React.cache()` without org_id in the cache key
- [ ] Client-side cache keys (React Query, SWR, etc.) include org_id

### Database

- [ ] Every new table with tenant data has an `org_id` column
- [ ] `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is called
- [ ] RLS policies for SELECT, INSERT, UPDATE, DELETE all use `get_user_org_id()`
- [ ] Service-role queries document why RLS bypass is needed

### Service Role Usage

Allowed only in these contexts:
1. **Cron jobs** — no user session available. Must check `CRON_SECRET`.
2. **Webhook handlers** — external caller. Must verify signature (e.g., Stripe).
3. **Admin scripts** — must check `ADMIN_KEY` header.
4. **Cross-org aggregation** — e.g., industry benchmarks. Must anonymize output.

## Regression Test Plan

### Setup
1. Create Org A (user-a@test.com) — upload sample data
2. Create Org B (user-b@test.com) — no data uploaded

### Cross-Tenant Isolation (logged in as Org B)
- [ ] Dashboard shows zero KPIs, no revenue/labor data
- [ ] Performance page shows no gaps or entities
- [ ] Alerts page is empty
- [ ] Data page shows no uploads
- [ ] Data Model page shows no entity types
- [ ] AI Assistant has no data context (responds with "no data" message)
- [ ] AI Spotlight returns null
- [ ] Settings > Team shows only Org B members
- [ ] Settings > Audit Log shows only Org B events
- [ ] Settings > API Keys shows only Org B keys
- [ ] Settings > Billing shows Org B plan

### Malicious Client Calls (as Org B)
- [ ] `curl POST /api/targets` with `org_id: ORG_A_ID` in body → ignored, target created under Org B
- [ ] Direct Supabase query `from('data_rows').select('*').eq('org_id', ORG_A_ID)` → returns empty (RLS blocks)
- [ ] `curl GET /api/cron/weekly-report` without Bearer token → 401
- [ ] `curl GET /api/cron/alerts` without Bearer token → 401

### Session Edge Cases
- [ ] Log out Org A → log in Org B → no Org A data visible
- [ ] Refresh page rapidly → no flash of wrong-org data
- [ ] Open two browser tabs (Org A and Org B) → each sees only their data
- [ ] Group org → child org switching only shows authorized children

### RLS Verification (via Supabase SQL editor)
```sql
-- As authenticated user for Org B, verify RLS blocks cross-org reads:
SET request.jwt.claims = '{"sub": "ORG_B_USER_UUID"}';
SELECT count(*) FROM data_rows WHERE org_id = 'ORG_A_UUID';
-- Expected: 0
```
