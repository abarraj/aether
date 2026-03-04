# Security Model

Aether is strict multi-tenant SaaS.

Rules:

• Every table must contain `org_id`
• org_id must be derived server-side
• Client cannot choose org_id
• All queries must filter by org_id
• RLS must enforce membership

RBAC roles

Owner
- full control
- invites users
- billing

Admin
- integrations
- data management

Editor
- operational changes

Viewer
- read only

Caching rules

• cache keys must include org_id
• never store tenant state globally
