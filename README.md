# Aether

AI-native business intelligence platform. Palantir for SMBs.

Aether ingests raw business data (CSV, XLSX, system exports), automatically understands the structure of the business — staff, clients, services, revenue streams — and produces accurate, explainable operational metrics and insights.

## Stack

- **Frontend:** Next.js 14+ (App Router), React, TypeScript, Tailwind CSS v4
- **Backend:** Supabase (Postgres, Auth, Row Level Security, Storage)
- **AI:** Claude API (Anthropic) for ontology detection and natural language insights
- **Payments:** Stripe
- **Email:** Resend
- **Hosting:** Vercel

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Fill in: SUPABASE_URL, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY, STRIPE keys

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/                    # Next.js App Router pages and API routes
  dashboard/            # Main application pages
  api/                  # Server-side API routes
components/             # React components
  data/                 # Upload, column mapper, entity panels
  dashboard/            # Dashboard-specific components
  layout/               # Sidebar, topbar
lib/                    # Core business logic
  ai/                   # AI detection, recommendations, prompts
  data/                 # Data pipeline (compute engine, gaps, processor)
  auth/                 # Org context, permissions
  billing/              # Stripe integration
hooks/                  # React hooks (KPIs, metrics, org, user)
supabase/migrations/    # Database schema migrations
types/                  # TypeScript type definitions
```

## Architecture

Aether follows a strict 5-layer architecture. See `SOUL.md` for the full philosophy.

```
Layer 1: Raw Ingestion      → Accept and preserve raw uploads
Layer 2: Normalization       → Parse dates, numbers, standardize columns
Layer 3: Entity Resolution   → Identify staff, clients, services; resolve ambiguity
Layer 4: Ontology            → Build structured business model
Layer 5: Metrics             → Compute KPIs, surface dashboards and insights
```

## Key Files

| File | Purpose |
|------|---------|
| `SOUL.md` | Product identity, beliefs, and architecture philosophy |
| `CLAUDE.md` | Development rules for AI tools and developers |
| `lib/ai/ontology-detector.ts` | AI column detection (DO NOT MODIFY) |
| `lib/data/compute-engine.ts` | Main metrics computation engine |
| `lib/data/performance-gaps.ts` | Revenue leakage computation |
| `lib/data/date-mapping.ts` | Date parsing utilities |
| `app/api/upload/route.ts` | File upload and processing pipeline |

## Documentation

- `SOUL.md` — What Aether is and how it should behave
- `CLAUDE.md` — Development rules and technical principles
- `docs/` — Architecture documentation

## Deployment

```bash
# Build
npm run build

# Deploy (via Vercel)
git push origin main
```

Vercel automatically deploys from the main branch.
