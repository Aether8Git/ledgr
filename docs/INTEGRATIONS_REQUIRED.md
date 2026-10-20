# Integrations still required

**None of these are connected.** Ledgr does not have real-time payer access. Today every eligibility, benefit, and EOB value is entered manually with a recorded source and timestamp, or loaded from fictitious demo scenarios.

| Integration | Purpose | Likely mechanism | Ledgr fields it would fill |
|---|---|---|---|
| Eligibility & benefits | Active coverage, copay/deductible/coinsurance/OOP by service type | X12 270/271 via the facility's clearinghouse | `eligibility*`, `benefits.*`, `estimateOnly` |
| Registration / ADT / scheduling | Encounter, setting, service, DOS, coverage on file | HL7 v2 ADT, or FHIR `Encounter` + `Coverage` (e.g., Epic) | `visit.*`, `plans[]` skeleton |
| Claims & remittance | Adjudication status and amounts | X12 837 out / 835 ERA in; claim status 276/277 | `adjudication.*` |
| Medicare eligibility | Part A/B status, deductible remaining, MA enrollment, MSP records | CMS HETS via an approved submitter | Medicare plan fields, MSP hints |
| State Medicaid eligibility | Medicaid status, QMB/dual status, cost-sharing indicators | State portal/270-271 (e.g., NCTracks) — candidate shared service with Aether **Primacy** | `qmb`, `costSharingExempt` |
| Payer benefit / prior-auth APIs | Plan-specific benefits and authorization status | Payer FHIR APIs where available | `authRequired`, `authOnFile` |
| Price estimate engine | Facility allowed-amount estimates | Facility price-transparency / estimate tool | `visit.allowedAmountEstimateCents` |
| Financial assistance system | FAP determinations and date ranges | Facility PFS system | `visit.financialAssistance` |
| Payment posting / cashiering | What's already been collected for the encounter | Facility cashiering system | `visit.previouslyCollectedCents` |
| SSO / identity | Authentication, MFA, role provisioning | SAML/OIDC from the facility IdP | `profiles.role` |
| Plan document / EOB upload | Extract benefits from uploaded documents, flag ambiguity | Not built (brief section 14) | — |

Rules for every integration:

- Authorized access only — no scraping, no credential sharing, no bypassing authentication.
- Every value written into an encounter records its source and timestamp.
- If an integration is down, the manual entry path remains, still requiring source and time.
- No PHI goes to an external AI service without an approved BAA and security review.
