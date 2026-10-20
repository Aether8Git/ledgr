# Limitations and rules awaiting verification

Ledgr is **decision support**. It does not replace payer adjudication, official benefit verification, compliance review, or the facility's approved policies.

## Rules awaiting authoritative validation

All 35 seed rules ship unverified. 34 are **cited, awaiting validation** — their logic was written from the cited reference, but no compliance reviewer has signed off. 1 is a **draft** and blocks recommendations until completed.

| Rule | What needs validating |
|---|---|
| FED-EMTALA-001 | Confirm ED workflow wording against facility EMTALA policy and 42 CFR 489.24(d)(4). |
| FED-MSP-001/002/003 | Employer-size thresholds (20 / 100), ESRD 30-month period, multi-employer and spouse-coverage nuances not modeled. |
| FED-MSP-004 | MSP questionnaire timing and re-use rules for recurring outpatient visits (Pub. 100-05 Ch. 3). |
| FED-MCD-001 | Payer-of-last-resort exceptions (e.g., certain state programs, IHS) not modeled. |
| FED-MCD-002 | QMB prohibition applies to all providers — confirm facility billing system suppresses statements. |
| FED-MCD-003 | Federal exemption categories are summarized, not enumerated; relies on the state rule. |
| **STATE-NC-MCD-001 (draft)** | **NC Medicaid cost-sharing amounts, exemptions, and POS rules must be supplied. Until then Ledgr won't recommend any NC Medicaid copay.** Other states have no rule at all. |
| FED-NSA-001 | Scope limited to commercial/marketplace ED out-of-network; post-stabilization and notice-and-consent paths not modeled. |
| FED-MEDIGAP-001, PLAN-MEDIGAP-G, PLAN-MEDIGAP-OTHER | Plan G behaviour per CMS Medigap chart; letters other than G route to verification. Massachusetts, Minnesota, and Wisconsin use different standardized plans — not modeled. |
| FED-MEDICARE-001 | Current-year deductible/coinsurance must come from verified sources; no amounts are hardcoded. OPPS copayment caps and per-service variations not modeled. |
| FED-TRICARE-001 | TRICARE-for-Life and supplement exceptions not modeled. |
| PLAN-MA-001, PLAN-BEN-001/002 | Operational interpretations — confirm with Patient Access leadership. |
| FAC-* | Facility policy parameters (estimate collection, ED collection, secondary-coverage policy, $500 review threshold) are placeholders for revenue-cycle leadership to set. |
| OPS-* | Operational safeguards — confirm with Patient Access leadership. OPS-WC-001 is state-specific in practice. |

To validate a rule: Rule library → open the rule → set status *Verified*, verification date, reviewer → submit → a second reviewer approves.

## Prototype capabilities

- **Demo-mode storage** is browser localStorage — not durable, shared, or tamper-evident.
- **Supabase mode** schema and approval functions were validated in a local Postgres (PGlite) run — two-person rule and federal-law lock confirmed — but RLS policies have not been tested against a live Supabase project, and nothing has been deployed or pen-tested.
- **The engine runs client-side.** Production should evaluate in an Edge Function and write the decision log server-side.
- **Role switching** in the sidebar is a demo affordance.
- **No document upload / extraction** (brief section 14) yet.
- **No AI model is called.** Explanations are generated deterministically by the engine.
- **One benefit per encounter.** Professional vs. facility billing, multiple line items, and observation/inpatient status rules are not separately modeled.
- **Up to three plans.** The data model is a list, but UI and payer-order logic stop at tertiary.
- **Self-pay** routes to financial counseling; self-pay deposits/discount policies are not modeled.
- **Learning center** content is educational and has not been reviewed by a compliance educator.

## External integrations not connected

See [INTEGRATIONS_REQUIRED.md](INTEGRATIONS_REQUIRED.md). None are connected.
