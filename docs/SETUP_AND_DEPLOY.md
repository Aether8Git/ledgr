# Setup and deployment

## Requirements

- Node.js 20+ (built and tested on Node 22)
- For Supabase mode: a Supabase project on a plan with a signed BAA before any PHI is involved

## Local development (demo mode)

```bash
npm install
npm run dev          # Vite dev server
npm test             # Vitest, 54 tests
npm run typecheck
npm run build        # outputs dist/
```

Demo mode needs no backend. Data stays in the browser's localStorage. Only fictitious data may be entered.

## Supabase mode

1. Create a Supabase project (recommended name: `ledgr`). Keep it separate from REPS and Primacy projects.
2. Apply the schema:
   ```bash
   supabase link --project-ref <ref>
   supabase db push                      # applies supabase/migrations/
   npm run seed:sql                      # regenerates supabase/seed.sql from src/engine/rules.ts
   psql "$DATABASE_URL" -f supabase/seed.sql
   ```
3. Create users in Supabase Auth, then set roles with the service role (there's deliberately no client-side role editing):
   ```sql
   insert into profiles (id, full_name, role, facility)
   values ('<auth user id>', 'Jordan Reviewer', 'compliance', 'Demo Regional');
   ```
   Roles: `registrar`, `supervisor`, `rules_admin`, `compliance`, `auditor`. You need at least two people among `rules_admin`/`compliance` for approvals.
4. Configure the frontend:
   ```bash
   cp .env.example .env.local
   # VITE_SUPABASE_URL=https://<ref>.supabase.co
   # VITE_SUPABASE_ANON_KEY=<anon key>
   ```
5. Build and deploy `dist/` to any static host (Vercel, Netlify, Supabase hosting, an internal web server). Configure SPA fallback so all routes serve `index.html`.

## Before connecting real data

Complete everything on the in-app **Readiness** page and in [LIMITATIONS_AND_PENDING_RULES.md](LIMITATIONS_AND_PENDING_RULES.md), in particular:

- Compliance validation of every rule (approve each through the rule library so it's marked *Verified* with reviewer and date).
- A completed state rule for each jurisdiction you serve (the NC Medicaid rule is a draft placeholder).
- Facility policy parameters set by revenue-cycle leadership (estimate collection, ED collection, secondary-coverage policy, review threshold).
- Move `evaluate()` server-side (Edge Function) and record decisions from there.
- SSO with MFA, BAA in place, security review, penetration test.

## Regenerating generated files

```bash
npm run seed:sql          # supabase/seed.sql from the seed rule library
npm run docs:scenarios    # docs/TEST_SCENARIOS.md from the scenario fixtures
```
