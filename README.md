# Ledgr

**Copay and patient-responsibility decision support for hospital registration.** An Aether product.

Ledgr tells a registrar what to do at the desk — collect a verified copay, wait for adjudication, verify something first, escalate, or follow the ED workflow — and shows exactly why: the rules applied, their sources, the calculation, and what's still missing. It never fills in a number it doesn't have.

> **Status: working prototype, not production-ready.** See [docs/LIMITATIONS_AND_PENDING_RULES.md](docs/LIMITATIONS_AND_PENDING_RULES.md). Every seed rule is *cited, awaiting validation* until your compliance reviewer approves it.

## What's in the box

| Area | Where |
|---|---|
| Decision engine (pure TypeScript, no UI dependencies) | `src/engine/engine.ts` |
| Rule library — 35 rules with source, jurisdiction, effective dates, reviewer, version history | `src/engine/rules.ts` |
| Patient-responsibility arithmetic (integer cents, single rounding step) | `src/engine/calc.ts` |
| Data model | `src/engine/types.ts` |
| Registrar workspace: visit + 1–3 plans + MSP questionnaire, live decision card, guided questions | `src/pages/Registration.tsx` |
| Rule library admin with two-person approval | `src/pages/RulesAdmin.tsx` |
| Learning center: walkthroughs, glossary, knowledge check, practice encounters | `src/pages/Learning.tsx` |
| 30 fictitious demo scenarios (also the test fixtures) | `src/data/scenarios.ts` |
| Audit log (de-identified) | `src/pages/Audit.tsx` |
| Readiness page: pending rules, integrations, prototype gaps | `src/pages/Status.tsx` |
| Supabase schema, RLS, approval functions, append-only logs | `supabase/migrations/` |
| Test suite — 54 tests | `tests/` |

## Quick start (demo mode)

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 54 tests
npm run build
```

With no Supabase environment variables, Ledgr runs in **demo mode**: the rule library, change requests, and audit log live in the browser, and a banner reminds users to enter fictitious data only. Use the sidebar to switch between Demo User A/B and roles to try the two-person approval flow.

## Docs

- [Architecture](docs/ARCHITECTURE.md) — data model, engine stages, rule precedence
- [Setup and deployment](docs/SETUP_AND_DEPLOY.md)
- [Test scenarios](docs/TEST_SCENARIOS.md) — inputs, expected decision, explanation, escalation for all 30 scenarios
- [Integrations still required](docs/INTEGRATIONS_REQUIRED.md)
- [Limitations and rules awaiting verification](docs/LIMITATIONS_AND_PENDING_RULES.md)
- [Security and privacy](docs/SECURITY.md)

## Design principle

Easy enough for a new registrar during a busy shift; rigorous enough that it never substitutes guesswork for verified benefits or applicable collection rules.
