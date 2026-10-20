# Test scenarios

Generated from `src/data/scenarios.ts` — the same fixtures `tests/scenarios.test.ts` asserts against. All patients, payers, and amounts are **fictitious**; plan-specific figures are hypothetical inputs, not claims about any real plan. Regenerate with `npm run docs:scenarios`.

## 1. Commercial plan — verified specialist copay

*Single coverage* — Employer plan, in-network specialist visit, $45 copay verified via 271.

**Inputs**

- Visit: office, specialist, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: Demo BlueCo — commercial_employer; eligibility active; COB established; benefits verified, copay yes $45.00 (office), deductible no; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| Verified amount available | Collect the verified copay — $45.00 (verified) | None |

**Required explanation** must mention: "verified $45.00 copay". **Rules that must fire:** PLAN-BEN-001.

**Engine output:** Collect verified copay: $45.00

> Demo BlueCo (Employer plan) has a verified $45.00 copay for this specialist service.

## 2. Commercial plan — deductible, no fixed copay

*Single coverage* — High-deductible plan; imaging has no copay; $1,200 deductible remaining; 20% coinsurance; no allowed-amount estimate; facility does not collect estimates.

**Inputs**

- Visit: outpatient, imaging, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: Demo HealthFirst HDHP — commercial_employer; eligibility active; COB established; benefits verified, copay no, deductible yes $1,200.00 left, coins 20%; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| Awaiting payer adjudication | Don't collect — wait for the claim to process | None |

**Required explanation** must mention: "a deductible is not a copay". **Rules that must fire:** FAC-EST-001.

**Engine output:** Amount to collect now: not determined — wait for the claim to process

> This plan uses a deductible and/or coinsurance for this service instead of a copay. A deductible is not a copay, and coinsurance is a percentage — the final amount is set when the plan processes the claim.

## 3. ED visit — commercial plan, before screening

*Emergency* — Walk-in to the ED with a commercial card. Patient not yet screened.

**Inputs**

- Visit: emergency (pre_screening), emergency, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: Demo BlueCo — commercial_employer; eligibility active; COB established; benefits verified, copay yes $250.00 (emergency), deductible unknown; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| Follow emergency department workflow | Follow the ED registration and treatment workflow | None |

**Required explanation** must mention: "emtala". **Rules that must fire:** FED-EMTALA-001.

**Engine output:** Follow the emergency department workflow — no payment discussion before screening and stabilization

> This is an emergency department visit and the patient has not yet completed the medical screening exam and any stabilizing treatment.
> Federal law (EMTALA) does not allow screening or stabilizing care to be delayed to ask about insurance or payment. Insurance status, a missing card, or inability to pay has no bearing on whether the patient is seen.

## 4. Original Medicare — no supplement

*Single coverage* — Original Medicare only; benefits not yet verified for the service.

**Inputs**

- Visit: outpatient, specialist, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: Medicare (demo) — medicare_original; eligibility active; COB established; benefits not verified, copay no, deductible unknown; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| Additional verification required | Don't collect yet — verify first | None |

**Required explanation** must mention: "no standard copay". **Rules that must fire:** FED-MEDICARE-001.

**Engine output:** Unable to determine a reliable amount — verification required

> Original Medicare has no standard copay. The patient's share is the remaining deductible plus coinsurance on the Medicare-approved amount, which requires verified current-year figures.

## 5. Original Medicare + Medigap Plan G (spec example)

*Dual coverage* — Outpatient service; Part B deductible remaining not yet verified.

**Inputs**

- Visit: outpatient, specialist, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: Medicare (demo) — medicare_original; eligibility active; COB established; benefits not verified, copay no, deductible unknown; claim not_submitted
- Plan 2: Demo Senior Supplement — medigap G; eligibility active; COB established; benefits verified, copay no, deductible unknown; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| Additional verification required | Don't collect yet — verify first | None |

**Required explanation** must mention: "does not cover the part b deductible". **Rules that must fire:** PLAN-MEDIGAP-G, OPS-COB-001.

**Engine output:** Unable to determine a reliable amount — verification required

> Medicare processes the claim first. Plan G generally covers the remaining Medicare cost-sharing but generally does not cover the Part B deductible. There is no standard copay to collect.
> Whether the patient owes anything depends on how much of the Part B deductible is left this year, which has not been verified.

## 6. Medicare Advantage — plan-specific specialist copay

*Single coverage* — MA HMO with a verified $40 specialist copay. Original Medicare rules are not applied.

**Inputs**

- Visit: office, specialist, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: Demo Advantage HMO — medicare_advantage; eligibility active; COB established; benefits verified, copay yes $40.00 (office), deductible unknown; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| Verified amount available | Collect the verified copay — $40.00 (verified) | None |

**Required explanation** must mention: "$40.00". **Rules that must fire:** PLAN-MA-001.

**Engine output:** Collect verified copay: $40.00

> Demo Advantage HMO (Medicare Advantage) has a verified $40.00 copay for this specialist service.

## 7. Medicare + Medicaid (QMB)

*Dual coverage* — Dual-eligible, QMB indicator on the Medicaid response.

**Inputs**

- Visit: outpatient, specialist, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: Medicare (demo) — medicare_original; eligibility active; COB established; benefits verified, copay no, deductible unknown; claim not_submitted
- Plan 2: NC Medicaid (demo) — medicaid; eligibility active; COB established; QMB; benefits verified, copay no, deductible unknown; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| No collection recommended at this stage | No collection | None |

**Required explanation** must mention: "qualified medicare beneficiary". **Rules that must fire:** FED-MCD-002.

**Engine output:** No collection — patient is protected as a QMB

> The patient is a Qualified Medicare Beneficiary (QMB). Federal law prohibits billing QMB patients for Medicare deductibles, coinsurance, or copays — even if Medicaid pays nothing.

## 8. Commercial primary + commercial secondary

*Dual coverage* — Patient's employer plan ($30 copay) and spouse's employer plan; COB established; default facility policy.

**Inputs**

- Visit: office, specialist, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: Demo BlueCo — commercial_employer; eligibility active; COB established; benefits verified, copay yes $30.00 (office), deductible unknown; claim not_submitted
- Plan 2: Demo United Health (spouse) — commercial_employer; eligibility active; COB established; benefits verified, copay yes $50.00 (office), deductible unknown; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| Awaiting payer adjudication | Don't collect — wait for the claim to process | None |

**Required explanation** must mention: "never adds copays together". **Rules that must fire:** OPS-CALC-001, FAC-SEC-001.

**Engine output:** Wait for adjudication — downstream coverage may cover the primary copay

> The patient has two plans. A downstream plan may pick up the primary plan's copay, so the patient's final share is not known until the claim is processed.
> Ledgr never adds copays together or collects the higher copay.

## 9. Medicare + current employer plan — employer size unknown

*Dual coverage* — Age 67, still working; employer plan on file; MSP questionnaire done but employer size unknown.

**Inputs**

- Visit: outpatient, specialist, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: Medicare (demo) — medicare_original; eligibility active; COB established; benefits verified, copay no, deductible unknown; claim not_submitted
- Plan 2: Demo Acme Employer Plan — commercial_employer; eligibility active; COB established; benefits verified, copay no, deductible unknown; claim not_submitted
- MSP: basis age, current employment yes, employer size unknown, questionnaire done

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| Supervisor review required | Refer for billing review | Supervisor review |

**Required explanation** must mention: "20-employee". **Rules that must fire:** FED-MSP-004, FED-MSP-001.

**Engine output:** Supervisor review — Medicare payer order needs review

> Ledgr cannot determine whether Medicare or Demo Acme Employer Plan (Employer plan) pays first: the employer's size is unknown (the 20-employee threshold decides the order).

## 10. Dependent child on both parents' plans

*Dual coverage* — Child covered by both parents; order not yet confirmed with payers.

**Inputs**

- Visit: office, primary_care, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1 (unconfirmed): Demo Aetna-like (Parent A) — commercial_employer; eligibility active; COB pending; benefits verified, copay no, deductible unknown; claim not_submitted
- Plan 2 (unconfirmed): Demo Cigna-like (Parent B) — commercial_employer; eligibility active; COB pending; benefits verified, copay no, deductible unknown; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| Additional verification required | Don't collect yet — verify first | None |

**Required explanation** must mention: "birthday rule". **Rules that must fire:** OPS-COB-002.

**Engine output:** Unable to determine a reliable amount — verification required

> The patient is a dependent on two parents' plans. Many plans use the 'birthday rule' (the parent whose birthday comes first in the calendar year is primary), but custody orders and plan terms can change that — so the order must be confirmed with the payers, not assumed.

## 11. Medicare + retiree plan + Medicaid — fully adjudicated

*Triple coverage* — Age-based Medicare (primary), retiree group plan (secondary), Medicaid (tertiary). All three EOBs on file; final patient responsibility $0.

**Inputs**

- Visit: outpatient, surgery, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: Medicare (demo) — medicare_original; eligibility active; COB established; benefits verified, copay no, deductible unknown; claim adjudicated (PR $364.00)
- Plan 2: Demo Retiree Plan — commercial_employer; eligibility active; COB established; benefits verified, copay no, deductible unknown; claim adjudicated (PR $72.80)
- Plan 3: NC Medicaid (demo) — medicaid; eligibility active; COB established; benefits verified, copay no, deductible unknown; claim adjudicated (PR $0.00)
- MSP: basis age, current employment no, employer size unknown, questionnaire done

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| No collection recommended at this stage | No collection | None |

**Required explanation** must mention: "last eob". **Rules that must fire:** FED-MSP-001, OPS-ADJ-001.

**Engine output:** No patient balance — payers report $0 patient responsibility

> Medicare Secondary Payer rules indicate Medicare (demo) (Original Medicare) pays first. Coverage is not based on current employment (e.g., retiree coverage), so Medicare pays first.
> Every payer has processed the claim. The patient's balance is the patient responsibility on the last EOB (NC Medicaid (demo) (Medicaid)), not billed charges minus payments.

## 12. Three plans — unresolved payer order

*Triple coverage* — Employer plan, spouse plan, and an individual plan; COB pending on two.

**Inputs**

- Visit: office, specialist, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: Demo BlueCo — commercial_employer; eligibility active; COB established; benefits verified, copay no, deductible unknown; claim not_submitted
- Plan 2 (unconfirmed): Demo United Health (spouse) — commercial_employer; eligibility active; COB pending; benefits verified, copay no, deductible unknown; claim not_submitted
- Plan 3 (unconfirmed): Demo Individual Marketplace — marketplace; eligibility active; COB unknown; benefits verified, copay no, deductible unknown; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| Supervisor review required | Refer for billing review | Supervisor review |

**Required explanation** must mention: "three plans". **Rules that must fire:** OPS-COB-001.

**Engine output:** Supervisor review — three plans with unresolved payer order

> Three plans are active and the order of benefits is not fully established. With three payers, an order mistake causes denials and duplicate collections.

## 13. Primary claim pending adjudication

*Single coverage* — Patient asks about their balance; claim submitted, not processed.

**Inputs**

- Visit: office, specialist, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: Demo BlueCo — commercial_employer; eligibility active; COB established; benefits verified, copay no, deductible unknown; claim submitted_pending

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| Awaiting payer adjudication | Don't collect — wait for the claim to process | None |

**Required explanation** must mention: "has not been processed". **Rules that must fire:** OPS-ADJ-001.

**Engine output:** Wait for the primary payer to process the claim

> The claim is with Demo BlueCo (Employer plan) and has not been processed. The patient's share is not final until it is.

## 14. Secondary has not processed the claim

*Dual coverage* — Primary EOB shows $210 patient responsibility; secondary not yet billed.

**Inputs**

- Visit: office, specialist, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: Demo BlueCo — commercial_employer; eligibility active; COB established; benefits verified, copay no, deductible unknown; claim adjudicated (PR $210.00)
- Plan 2: Demo United Health (spouse) — commercial_employer; eligibility active; COB established; benefits verified, copay no, deductible unknown; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| Awaiting payer adjudication | Don't collect — wait for the claim to process | None |

**Required explanation** must mention: "not the patient's final balance". **Rules that must fire:** OPS-ADJ-001, OPS-CALC-001.

**Engine output:** Wait for Demo United Health (spouse) (Employer plan) to process the claim

> Demo BlueCo (Employer plan) has processed the claim, but Demo United Health (spouse) (Employer plan) has not. The amount on the earlier EOB is not the patient's final balance — the next plan may pay some or all of it.

## 15. Terminated insurance

*Protections & edge cases* — Card presented; plan terminated 2026-09-30.

**Inputs**

- Visit: office, specialist, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: Demo BlueCo — commercial_employer; eligibility active (term 2026-09-30); COB established; benefits verified, copay no, deductible unknown; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| Additional verification required | Don't collect yet — verify first | None |

**Required explanation** must mention: "none of the plans". **Rules that must fire:** OPS-ELIG-001.

**Engine output:** No active coverage for this date of service — verify other coverage

> None of the plans on file are active for this date of service.

## 16. Out-of-network scheduled service

*Protections & edge cases* — Scheduled MRI; facility out of network with the patient's plan.

**Inputs**

- Visit: outpatient, imaging, network out_of_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: Demo Narrow-Network HMO — marketplace; eligibility active; COB established; benefits verified, copay no, deductible unknown; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| Supervisor review required | Refer to financial counseling | Supervisor review |

**Required explanation** must mention: "out of network". **Rules that must fire:** OPS-NET-001.

**Engine output:** Out-of-network — supervisor review and financial counseling

> The facility is out of network with the primary plan. Out-of-network benefits, balance-billing rules, and any good-faith-estimate obligations need review before the patient is asked to pay.

## 17. ED after stabilization — only the office copay is on file

*Emergency* — Plan has a $30 office copay and a separate ED benefit; only the office copay was captured.

**Inputs**

- Visit: emergency (post_stabilization), emergency, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: Demo BlueCo — commercial_employer; eligibility active; COB established; benefits verified, copay yes $30.00 (office), deductible unknown; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| Additional verification required | Don't collect yet — verify first | None |

**Required explanation** must mention: "office copay never applies". **Rules that must fire:** PLAN-BEN-002, FAC-ED-001.

**Engine output:** Unable to determine a reliable amount — verification required

> The copay on file ($30.00) is for office, not the emergency room. An office copay never applies to an ED visit.

## 18. Deductible may not be met — estimate shown, not collected

*Single coverage* — No copay; $500 deductible remaining; 20% coinsurance; facility estimate of allowed amount $800; facility does not collect estimates.

**Inputs**

- Visit: outpatient, imaging, network in_network, FAP none, already collected $0.00, allowed estimate $800.00
- Plan 1: Demo HealthFirst — commercial_employer; eligibility active; COB established; benefits verified, copay no, deductible yes $500.00 left, coins 20%; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| Estimated amount only | Don't collect — wait for the claim to process — $560.00 (estimate) | None |

**Required explanation** must mention: "coinsurance is a percentage". **Rules that must fire:** FAC-EST-001.

**Engine output:** Estimated amount only: $560.00 — not collected per facility policy

> This plan uses a deductible and/or coinsurance for this service instead of a copay. A deductible is not a copay, and coinsurance is a percentage — the final amount is set when the plan processes the claim.

## 19. Approved financial assistance

*Protections & edge cases* — Commercial plan with $45 copay, but the patient has an approved FAP determination.

**Inputs**

- Visit: office, specialist, network in_network, FAP verified, already collected $0.00, allowed estimate —
- Plan 1: Demo BlueCo — commercial_employer; eligibility active; COB established; benefits verified, copay yes $45.00 (office), deductible unknown; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| No collection recommended at this stage | No collection | None |

**Required explanation** must mention: "financial-assistance". **Rules that must fire:** FAC-FAP-001.

**Engine output:** No collection — approved financial assistance

> The patient has an approved financial-assistance determination. Point-of-service collection follows that policy, not the plan's copay.

## 20. Conflicting eligibility and benefit information

*Protections & edge cases* — 271 says active; payer portal shows termination last month.

**Inputs**

- Visit: office, specialist, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: Demo BlueCo — commercial_employer; eligibility active; COB established; conflict: "271 response shows active; payer portal shows coverage terminated 2026-09-30"; benefits verified, copay no, deductible unknown; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| Supervisor review required | Refer for billing review | Supervisor review |

**Required explanation** must mention: "sources disagree". **Rules that must fire:** OPS-CONFLICT-001.

**Engine output:** Conflicting information — supervisor review required

> Sources disagree for Demo BlueCo (Employer plan): 271 response shows active; payer portal shows coverage terminated 2026-09-30.

## 21. Missing benefit data

*Protections & edge cases* — Eligibility verified active; benefits for the service were never pulled.

**Inputs**

- Visit: office, specialist, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: Demo BlueCo — commercial_employer; eligibility active; COB established; benefits not verified, copay unknown, deductible unknown; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| Additional verification required | Don't collect yet — verify first | None |

**Required explanation** must mention: "active coverage does not tell you the copay". **Rules that must fire:** PLAN-BEN-001.

**Engine output:** Unable to determine a reliable amount — verification required

> Coverage is on file for Demo BlueCo (Employer plan), but benefits for this specific service have not been verified. Active coverage does not tell you the copay.

## 22. Copay already collected

*Protections & edge cases* — Verified $45 copay; $45 already collected at check-in kiosk.

**Inputs**

- Visit: office, specialist, network in_network, FAP none, already collected $45.00, allowed estimate —
- Plan 1: Demo BlueCo — commercial_employer; eligibility active; COB established; benefits verified, copay yes $45.00 (office), deductible unknown; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| No collection recommended at this stage | No collection | None |

**Required explanation** must mention: "already been collected". **Rules that must fire:** OPS-CALC-002.

**Engine output:** Copay already collected — nothing more to collect

> Demo BlueCo (Employer plan) has a verified $45.00 copay for this specialist service.
> The copay for this encounter has already been collected.

## 23. Retroactive eligibility pending

*Protections & edge cases* — Uninsured on arrival; Medicaid application submitted, may be retroactive.

**Inputs**

- Visit: office, specialist, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: NC Medicaid (demo) — application — medicaid; eligibility retro_pending; COB established; benefits verified, copay no, deductible unknown; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| No collection recommended at this stage | Refer to financial counseling | None |

**Required explanation** must mention: "retroactively". **Rules that must fire:** OPS-ELIG-002.

**Engine output:** Hold collection — eligibility is pending or retroactive

> Coverage for this date of service may be approved retroactively. Collecting now could mean collecting money the patient will not owe.

## 24. Payer reports $0 patient responsibility

*Single coverage* — Preventive visit; claim adjudicated with $0 patient responsibility.

**Inputs**

- Visit: office, primary_care, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: Demo BlueCo — commercial_employer; eligibility active; COB established; benefits verified, copay no, deductible unknown; claim adjudicated (PR $0.00)

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| No collection recommended at this stage | No collection | None |

**Required explanation** must mention: "patient responsibility on the eob". **Rules that must fire:** OPS-ADJ-001.

**Engine output:** No patient balance — payers report $0 patient responsibility

> Demo BlueCo (Employer plan) has processed the claim. The patient's balance is the patient responsibility on the EOB.

## 25. Only an estimate is available

*Single coverage* — Clearinghouse returned a $75 urgent-care copay flagged as an estimate.

**Inputs**

- Visit: urgent_care, urgent_care, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: Demo BlueCo — commercial_employer; eligibility active; COB established; benefits verified, copay yes $75.00 (urgent_care), deductible unknown, estimate only; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| Estimated amount only | Don't collect — wait for the claim to process — $75.00 (estimate) | None |

**Required explanation** must mention: "estimate, not a confirmed benefit". **Rules that must fire:** FAC-EST-001.

**Engine output:** Estimated amount only: $75.00 — not collected per facility policy

> Demo BlueCo (Employer plan) has a verified $75.00 copay for this urgent care service.
> The payer returned this amount as an estimate, not a confirmed benefit.

## 26. ED after stabilization — verified ED copay

*Emergency* — Plan has a separate $250 ER copay, verified for the emergency setting.

**Inputs**

- Visit: emergency (post_stabilization), emergency, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: Demo BlueCo — commercial_employer; eligibility active; COB established; benefits verified, copay yes $250.00 (emergency), deductible unknown; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| Verified amount available | Collect the verified copay — $250.00 (verified) | None |

**Required explanation** must mention: "emergency". **Rules that must fire:** FED-EMTALA-001, PLAN-BEN-002.

**Engine output:** Collect verified copay: $250.00

> Demo BlueCo (Employer plan) has a verified $250.00 copay for this emergency service.

## 27. Medicare + Plan G — Part B deductible met

*Dual coverage* — Medicare benefits verified: Part B deductible met for the year.

**Inputs**

- Visit: outpatient, specialist, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: Medicare (demo) — medicare_original; eligibility active; COB established; benefits verified, copay no, deductible unknown $0.00 left; claim not_submitted
- Plan 2: Demo Senior Supplement — medigap G; eligibility active; COB established; benefits verified, copay no, deductible unknown; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| No collection recommended at this stage | No collection | None |

**Required explanation** must mention: "deductible has been met". **Rules that must fire:** PLAN-MEDIGAP-G.

**Engine output:** No collection recommended — Part B deductible met; Plan G covers the rest

> Medicare processes the claim first. Plan G generally covers the remaining Medicare cost-sharing but generally does not cover the Part B deductible. There is no standard copay to collect.
> The Part B deductible has been met this year, so Plan G is expected to cover the remaining Medicare cost-sharing for covered services.

## 28. Medicare + employer plan — MSP questionnaire not done

*Dual coverage* — Both cards presented; no MSP questionnaire on file.

**Inputs**

- Visit: outpatient, specialist, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: Medicare (demo) — medicare_original; eligibility active; COB established; benefits verified, copay no, deductible unknown; claim not_submitted
- Plan 2: Demo Acme Employer Plan — commercial_employer; eligibility active; COB established; benefits verified, copay no, deductible unknown; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| Additional verification required | Don't collect yet — verify first | None |

**Required explanation** must mention: "questionnaire". **Rules that must fire:** FED-MSP-004.

**Engine output:** Unable to determine a reliable amount — verification required

> Original Medicare and another health plan are both on file. Payer order must come from the Medicare Secondary Payer questionnaire — not from age, card order, or patient preference.

## 29. Medicaid entered as primary over commercial

*Dual coverage* — Registrar put Medicaid first and the parent's employer plan second.

**Inputs**

- Visit: office, specialist, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: NC Medicaid (demo) — medicaid; eligibility active; COB established; benefits verified, copay no, deductible unknown; claim not_submitted
- Plan 2: Demo BlueCo — commercial_employer; eligibility active; COB established; benefits verified, copay no, deductible unknown; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| Supervisor review required | Refer for billing review | Supervisor review |

**Required explanation** must mention: "payer of last resort". **Rules that must fire:** FED-MCD-001.

**Engine output:** Supervisor review — Medicaid must pay last

> Medicaid is listed ahead of other active coverage. Medicaid is the payer of last resort.

## 30. Medicaid sole payer — state schedule not verified

*Single coverage* — NC Medicaid; patient not exempt; NC cost-sharing rule still draft in the library.

**Inputs**

- Visit: office, specialist, network in_network, FAP none, already collected $0.00, allowed estimate —
- Plan 1: NC Medicaid (demo) — medicaid; eligibility active; COB established; benefits verified, copay yes $4.00 (setting n/a), deductible unknown; claim not_submitted

| Expected decision | Collection recommendation | Escalation |
|---|---|---|
| Additional verification required | Don't collect yet — verify first | None |

**Required explanation** must mention: "not been verified". **Rules that must fire:** FED-MCD-003, STATE-NC-MCD-001.

**Engine output:** Unable to determine a reliable amount — verification required

> The NC Medicaid cost-sharing schedule has not been verified in Ledgr's rule library, so Ledgr will not recommend a Medicaid copay.
