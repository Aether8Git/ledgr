# Architecture

## Layers

```
┌──────────────── UI (React) ────────────────┐
│ Registration  Scenarios  Learning  Rules  Audit  Readiness │
└───────────────────┬────────────────────────┘
                    │ evaluate(encounter, rules) → Decision
┌───────────────────▼────────────────────────┐
│ Engine (pure TS)  engine.ts · calc.ts       │  ← no I/O, deterministic, unit-tested
│ Rule metadata     rules.ts                  │
└───────────────────┬────────────────────────┘
                    │ RuleDefinition[] / audit writes
┌───────────────────▼────────────────────────┐
│ Store  demo: localStorage │ prod: Supabase (RLS) │
└────────────────────────────────────────────┘
```

The engine has no dependencies on React, the browser, or the network, so the same file can run in a Supabase Edge Function (recommended for production — see Limitations).

## Data model (`src/engine/types.ts`)

- **Encounter** = `VisitInfo` + up to three `CoveragePlan`s + optional `MspContext`.
- **Money** is always integer cents; coinsurance is basis points. `null` means *unknown* — never zero.
- **CoveragePlan** carries eligibility (status, dates, source, timestamp), payer order (position, confirmed, source), COB status, Medicaid flags (QMB, exemption), `PlanBenefits` for *this* service, and `Adjudication` (EOB status, allowed, paid, patient responsibility).
- **RuleDefinition** carries everything section 8 of the brief requires: id, name, description, category, payer/plan scope, coverage types, settings, effective/expiration dates, jurisdiction, source + URL, verification status/date, required inputs, logic summary, `logicKey`, priority, conflict behaviour, reviewer, enabled flag, configurable `params`, version, history.
- **Decision** = status (one of the 7 required statuses) + recommended action + amount (or null) + amount kind (verified/estimate) + source + explanation + next steps + missing inputs + warnings + supervisor flag and reason + rules applied (with version and verification status) + calculation steps + payer order.

## Rules: data vs. logic

Rules are **metadata plus parameters**; the decision logic is code selected by `logicKey`. Admins can change wording, sources, verification status, effective windows, enable/disable (except federal law), and parameters (e.g., *allow estimate collection*, *review threshold*). New *kinds* of logic require a code change and tests — deliberately, so a configuration edit can't silently invent a payer rule.

A rule is in force only if it's enabled (federal law is always enabled) and the date of service falls in its effective window.

## Precedence

Categories rank: federal law → state law → payer contract → plan benefit → facility policy → operational. The engine enforces this structurally: stages run in precedence order and higher-precedence stages return before lower ones run.

| # | Stage | Typical rules |
|---|---|---|
| 1 | ED / EMTALA gate | FED-EMTALA-001 |
| 2 | Self-pay | OPS-SELFPAY-001 |
| 3 | Retroactive eligibility | OPS-ELIG-002 |
| 4 | Eligibility for DOS | OPS-ELIG-001 |
| 5 | Conflicting information | OPS-CONFLICT-001 |
| 6 | Protections | FED-MCD-002 (QMB), FAC-FAP-001, OPS-WC-001 |
| 7 | ED after stabilization | FAC-ED-001 |
| 8 | Payer order | FED-MEDIGAP-001, FED-MCD-001, FED-TRICARE-001, FED-MSP-001…004, OPS-COB-001/002 |
| 9 | Network / surprise billing | OPS-NET-001, FED-NSA-001 |
| 10 | Adjudicated balance | OPS-ADJ-001, OPS-CALC-002 |
| 11 | Pre-adjudication paths | FED-MCD-003 + STATE-xx, FED-MEDICARE-001, PLAN-MEDIGAP-G/OTHER, OPS-CALC-001, FAC-SEC-001, PLAN-BEN-001/002, PLAN-MA-001 |
| 12 | Advisory | OPS-AUTH-001, FAC-REVIEW-001, FAC-EST-001 |

Unverified rules never block a verified one from being shown as unverified: every applied rule's verification status is displayed on the card, and in non-demo mode the card warns when any applied rule hasn't been validated.

## Calculation safeguards (`calc.ts` + engine)

- Copays are never added across plans; the higher copay is never chosen (OPS-CALC-001).
- Deductible and coinsurance are never treated as copays; coinsurance is applied to an **allowed** amount, never billed charges.
- Coinsurance is carried exactly and rounded **once** (half-up) at the end.
- Already-collected amounts are credited; overpayments route to billing (OPS-CALC-002).
- Post-adjudication balance = last payer's patient responsibility, never charges minus payments (OPS-ADJ-001).
- Copays and estimates cap at verified remaining out-of-pocket.
- Any missing required input → `Unable to determine a reliable amount — verification required`.

## Guided questions

`src/components/GuidedQuestions.tsx` derives the 10 questions in section 10 from the encounter and the decision. Once the engine has a reliable action, later questions show *Not needed for this decision* instead of being asked.

## Persistence

- **Demo mode** (`src/lib/store.ts`, `demoStore`): localStorage.
- **Supabase mode** (`remoteStore`): `rules`, `rule_versions`, `rule_change_requests` with `approve_rule_change()` / `reject_rule_change()` enforcing the two-person rule and the federal-law lock server-side; `decision_log` (de-identified snapshot) and `audit_log`, both append-only under RLS.
