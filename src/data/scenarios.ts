import type { Adjudication, CoveragePlan, DecisionStatus, Encounter, PlanBenefits, RecommendedAction } from "../engine/types";

/**
 * DEMONSTRATION SCENARIOS — every patient, payer amount, and member ID here is
 * FICTITIOUS. Plan-specific amounts (copays, deductibles, EOB figures) are
 * hypothetical inputs, not statements about any real plan.
 *
 * These fixtures double as the automated test suite (tests/scenarios.test.ts):
 * `expected` is the outcome the engine must produce.
 */

export interface Scenario {
  id: string;
  number: number;
  title: string;
  group: "Single coverage" | "Dual coverage" | "Triple coverage" | "Emergency" | "Protections & edge cases";
  summary: string;
  encounter: Encounter;
  expected: {
    status: DecisionStatus;
    action: RecommendedAction;
    amountCents: number | null;
    amountKind?: "verified" | "estimate" | null;
    supervisorReview: boolean;
    /** Rule ids that must appear in rulesApplied. */
    rules: string[];
    /** Plain-English explanation must mention these (case-insensitive). */
    explains: string[];
  };
}

const DOS = "2026-10-20";
let seq = 0;

export type PlanInput = Omit<Partial<CoveragePlan>, "benefits" | "adjudication"> &
  Pick<CoveragePlan, "payerName" | "type"> & { benefits?: Partial<PlanBenefits>; adjudication?: Partial<Adjudication> };

export function plan(over: PlanInput): CoveragePlan {
  seq += 1;
  return {
    id: over.id ?? `plan-${seq}`,
    planName: over.planName ?? "Demo plan",
    memberIdMasked: "DEMO•••" + String(1000 + seq).slice(-4),
    eligibility: "active",
    effectiveDate: "2026-01-01",
    terminationDate: null,
    eligibilityVerifiedAt: `${DOS}T08:05:00-04:00`,
    eligibilitySource: "Demo 271 response",
    payerOrder: 1,
    payerOrderConfirmed: true,
    payerOrderSource: "Demo payer COB response",
    cobStatus: "established",
    conflictingInformation: null,
    ...(over as Partial<CoveragePlan>),
    payerName: over.payerName,
    type: over.type,
    benefits: {
      benefitsVerified: true,
      benefitsSource: `Demo benefits — ${over.payerName}`,
      benefitsVerifiedAt: `${DOS}T08:06:00-04:00`,
      copayCents: null,
      copaySetting: null,
      copayApplies: "no",
      deductibleApplies: "unknown",
      deductibleRemainingCents: null,
      coinsuranceBp: null,
      oopRemainingCents: null,
      authRequired: "no",
      authOnFile: false,
      serviceCovered: "yes",
      estimateOnly: false,
      coversPriorCostShare: "unknown",
      ...(over.benefits ?? {}),
    },
    adjudication: {
      status: "not_submitted",
      eobOnFile: false,
      allowedCents: null,
      paidCents: null,
      patientResponsibilityCents: null,
      ...(over.adjudication ?? {}),
    },
  };
}

function enc(id: string, label: string, visit: Partial<Encounter["visit"]>, plans: CoveragePlan[], msp?: Encounter["msp"]): Encounter {
  return {
    id,
    label,
    demo: true,
    visit: {
      dateOfService: DOS,
      facility: "Demo Regional Medical Center",
      department: "Outpatient Registration",
      setting: "office",
      serviceCategory: "specialist",
      networkStatus: "in_network",
      financialAssistance: "none",
      previouslyCollectedCents: 0,
      allowedAmountEstimateCents: null,
      jurisdiction: "NC",
      ...visit,
    },
    plans,
    msp,
  };
}

const MSP_RETIREE = { entitlementBasis: "age" as const, currentEmployment: "no" as const, employerSize: null, questionnaireCompleted: true };

export const SCENARIOS: Scenario[] = [
  {
    id: "s01", number: 1, group: "Single coverage",
    title: "Commercial plan — verified specialist copay",
    summary: "Employer plan, in-network specialist visit, $45 copay verified via 271.",
    encounter: enc("s01", "Avery Demo", {}, [
      plan({ payerName: "Demo BlueCo", type: "commercial_employer", benefits: { benefitsVerified: true, copayApplies: "yes", copayCents: 4500, copaySetting: "office", deductibleApplies: "no", serviceCovered: "yes" } }),
    ]),
    expected: { status: "verified_amount", action: "collect_verified_copay", amountCents: 4500, amountKind: "verified", supervisorReview: false, rules: ["PLAN-BEN-001"], explains: ["verified $45.00 copay"] },
  },
  {
    id: "s02", number: 2, group: "Single coverage",
    title: "Commercial plan — deductible, no fixed copay",
    summary: "High-deductible plan; imaging has no copay; $1,200 deductible remaining; 20% coinsurance; no allowed-amount estimate; facility does not collect estimates.",
    encounter: enc("s02", "Blake Demo", { setting: "outpatient", serviceCategory: "imaging" }, [
      plan({ payerName: "Demo HealthFirst HDHP", type: "commercial_employer", benefits: { benefitsVerified: true, copayApplies: "no", deductibleApplies: "yes", deductibleRemainingCents: 120000, coinsuranceBp: 2000, serviceCovered: "yes" } }),
    ]),
    expected: { status: "awaiting_adjudication", action: "wait_for_adjudication", amountCents: null, supervisorReview: false, rules: ["FAC-EST-001"], explains: ["a deductible is not a copay"] },
  },
  {
    id: "s03", number: 3, group: "Emergency",
    title: "ED visit — commercial plan, before screening",
    summary: "Walk-in to the ED with a commercial card. Patient not yet screened.",
    encounter: enc("s03", "Casey Demo", { setting: "emergency", serviceCategory: "emergency", department: "Emergency Department", edPhase: "pre_screening" }, [
      plan({ payerName: "Demo BlueCo", type: "commercial_employer", benefits: { benefitsVerified: true, copayApplies: "yes", copayCents: 25000, copaySetting: "emergency", serviceCovered: "yes" } }),
    ]),
    expected: { status: "ed_workflow", action: "follow_ed_workflow", amountCents: null, supervisorReview: false, rules: ["FED-EMTALA-001"], explains: ["emtala"] },
  },
  {
    id: "s04", number: 4, group: "Single coverage",
    title: "Original Medicare — no supplement",
    summary: "Original Medicare only; benefits not yet verified for the service.",
    encounter: enc("s04", "Dana Demo", { setting: "outpatient", serviceCategory: "specialist" }, [
      plan({ payerName: "Medicare (demo)", type: "medicare_original", benefits: { benefitsVerified: false } }),
    ]),
    expected: { status: "verification_required", action: "do_not_collect_verify", amountCents: null, supervisorReview: false, rules: ["FED-MEDICARE-001"], explains: ["no standard copay"] },
  },
  {
    id: "s05", number: 5, group: "Dual coverage",
    title: "Original Medicare + Medigap Plan G (spec example)",
    summary: "Outpatient service; Part B deductible remaining not yet verified.",
    encounter: enc("s05", "Emery Demo", { setting: "outpatient", serviceCategory: "specialist" }, [
      plan({ id: "s05-mc", payerName: "Medicare (demo)", type: "medicare_original", payerOrder: 1, benefits: { benefitsVerified: false } }),
      plan({ id: "s05-g", payerName: "Demo Senior Supplement", type: "medigap", medigapLetter: "G", payerOrder: 2 }),
    ]),
    expected: { status: "verification_required", action: "do_not_collect_verify", amountCents: null, supervisorReview: false, rules: ["PLAN-MEDIGAP-G", "OPS-COB-001"], explains: ["does not cover the part b deductible"] },
  },
  {
    id: "s06", number: 6, group: "Single coverage",
    title: "Medicare Advantage — plan-specific specialist copay",
    summary: "MA HMO with a verified $40 specialist copay. Original Medicare rules are not applied.",
    encounter: enc("s06", "Finley Demo", {}, [
      plan({ payerName: "Demo Advantage HMO", type: "medicare_advantage", benefits: { benefitsVerified: true, copayApplies: "yes", copayCents: 4000, copaySetting: "office", serviceCovered: "yes" } }),
    ]),
    expected: { status: "verified_amount", action: "collect_verified_copay", amountCents: 4000, amountKind: "verified", supervisorReview: false, rules: ["PLAN-MA-001"], explains: ["$40.00"] },
  },
  {
    id: "s07", number: 7, group: "Dual coverage",
    title: "Medicare + Medicaid (QMB)",
    summary: "Dual-eligible, QMB indicator on the Medicaid response.",
    encounter: enc("s07", "Gray Demo", { setting: "outpatient" }, [
      plan({ payerName: "Medicare (demo)", type: "medicare_original", payerOrder: 1 }),
      plan({ payerName: "NC Medicaid (demo)", type: "medicaid", payerOrder: 2, qmb: true }),
    ]),
    expected: { status: "no_collection", action: "no_collection", amountCents: null, supervisorReview: false, rules: ["FED-MCD-002"], explains: ["qualified medicare beneficiary"] },
  },
  {
    id: "s08", number: 8, group: "Dual coverage",
    title: "Commercial primary + commercial secondary",
    summary: "Patient's employer plan ($30 copay) and spouse's employer plan; COB established; default facility policy.",
    encounter: enc("s08", "Harper Demo", {}, [
      plan({ payerName: "Demo BlueCo", type: "commercial_employer", payerOrder: 1, benefits: { benefitsVerified: true, copayApplies: "yes", copayCents: 3000, copaySetting: "office", serviceCovered: "yes" } }),
      plan({ payerName: "Demo United Health (spouse)", type: "commercial_employer", payerOrder: 2, benefits: { benefitsVerified: true, copayApplies: "yes", copayCents: 5000, copaySetting: "office", serviceCovered: "yes" } }),
    ]),
    expected: { status: "awaiting_adjudication", action: "wait_for_adjudication", amountCents: null, supervisorReview: false, rules: ["OPS-CALC-001", "FAC-SEC-001"], explains: ["never adds copays together"] },
  },
  {
    id: "s09", number: 9, group: "Dual coverage",
    title: "Medicare + current employer plan — employer size unknown",
    summary: "Age 67, still working; employer plan on file; MSP questionnaire done but employer size unknown.",
    encounter: enc("s09", "Indigo Demo", { setting: "outpatient" }, [
      plan({ payerName: "Medicare (demo)", type: "medicare_original", payerOrder: 1 }),
      plan({ payerName: "Demo Acme Employer Plan", type: "commercial_employer", isEmployerGroupPlan: true, payerOrder: 2 }),
    ], { entitlementBasis: "age", currentEmployment: "yes", employerSize: null, questionnaireCompleted: true }),
    expected: { status: "supervisor_review", action: "refer_billing_review", amountCents: null, supervisorReview: true, rules: ["FED-MSP-004", "FED-MSP-001"], explains: ["20-employee"] },
  },
  {
    id: "s10", number: 10, group: "Dual coverage",
    title: "Dependent child on both parents' plans",
    summary: "Child covered by both parents; order not yet confirmed with payers.",
    encounter: enc("s10", "Jules Demo (minor)", { serviceCategory: "primary_care" }, [
      plan({ payerName: "Demo Aetna-like (Parent A)", type: "commercial_employer", patientIsDependent: true, payerOrder: 1, payerOrderConfirmed: false, cobStatus: "pending" }),
      plan({ payerName: "Demo Cigna-like (Parent B)", type: "commercial_employer", patientIsDependent: true, payerOrder: 2, payerOrderConfirmed: false, cobStatus: "pending" }),
    ]),
    expected: { status: "verification_required", action: "do_not_collect_verify", amountCents: null, supervisorReview: false, rules: ["OPS-COB-002"], explains: ["birthday rule"] },
  },
  {
    id: "s11", number: 11, group: "Triple coverage",
    title: "Medicare + retiree plan + Medicaid — fully adjudicated",
    summary: "Age-based Medicare (primary), retiree group plan (secondary), Medicaid (tertiary). All three EOBs on file; final patient responsibility $0.",
    encounter: enc("s11", "Kai Demo", { setting: "outpatient", serviceCategory: "surgery" }, [
      plan({ payerName: "Medicare (demo)", type: "medicare_original", payerOrder: 1, adjudication: { status: "adjudicated", eobOnFile: true, allowedCents: 182000, paidCents: 145600, patientResponsibilityCents: 36400 } }),
      plan({ payerName: "Demo Retiree Plan", type: "commercial_employer", isEmployerGroupPlan: true, payerOrder: 2, adjudication: { status: "adjudicated", eobOnFile: true, allowedCents: 36400, paidCents: 29120, patientResponsibilityCents: 7280 } }),
      plan({ payerName: "NC Medicaid (demo)", type: "medicaid", payerOrder: 3, adjudication: { status: "adjudicated", eobOnFile: true, allowedCents: 7280, paidCents: 7280, patientResponsibilityCents: 0 } }),
    ], MSP_RETIREE),
    expected: { status: "no_collection", action: "no_collection", amountCents: null, supervisorReview: false, rules: ["FED-MSP-001", "OPS-ADJ-001"], explains: ["last eob"] },
  },
  {
    id: "s12", number: 12, group: "Triple coverage",
    title: "Three plans — unresolved payer order",
    summary: "Employer plan, spouse plan, and an individual plan; COB pending on two.",
    encounter: enc("s12", "Lane Demo", {}, [
      plan({ payerName: "Demo BlueCo", type: "commercial_employer", payerOrder: 1, payerOrderConfirmed: true }),
      plan({ payerName: "Demo United Health (spouse)", type: "commercial_employer", payerOrder: 2, payerOrderConfirmed: false, cobStatus: "pending" }),
      plan({ payerName: "Demo Individual Marketplace", type: "marketplace", payerOrder: 3, payerOrderConfirmed: false, cobStatus: "unknown" }),
    ]),
    expected: { status: "supervisor_review", action: "refer_billing_review", amountCents: null, supervisorReview: true, rules: ["OPS-COB-001"], explains: ["three plans"] },
  },
  {
    id: "s13", number: 13, group: "Single coverage",
    title: "Primary claim pending adjudication",
    summary: "Patient asks about their balance; claim submitted, not processed.",
    encounter: enc("s13", "Morgan Demo", {}, [
      plan({ payerName: "Demo BlueCo", type: "commercial_employer", adjudication: { status: "submitted_pending", eobOnFile: false } }),
    ]),
    expected: { status: "awaiting_adjudication", action: "wait_for_adjudication", amountCents: null, supervisorReview: false, rules: ["OPS-ADJ-001"], explains: ["has not been processed"] },
  },
  {
    id: "s14", number: 14, group: "Dual coverage",
    title: "Secondary has not processed the claim",
    summary: "Primary EOB shows $210 patient responsibility; secondary not yet billed.",
    encounter: enc("s14", "Noel Demo", {}, [
      plan({ payerName: "Demo BlueCo", type: "commercial_employer", payerOrder: 1, adjudication: { status: "adjudicated", eobOnFile: true, allowedCents: 90000, paidCents: 69000, patientResponsibilityCents: 21000 } }),
      plan({ payerName: "Demo United Health (spouse)", type: "commercial_employer", payerOrder: 2, adjudication: { status: "not_submitted", eobOnFile: false } }),
    ]),
    expected: { status: "awaiting_adjudication", action: "wait_for_adjudication", amountCents: null, supervisorReview: false, rules: ["OPS-ADJ-001", "OPS-CALC-001"], explains: ["not the patient's final balance"] },
  },
  {
    id: "s15", number: 15, group: "Protections & edge cases",
    title: "Terminated insurance",
    summary: "Card presented; plan terminated 2026-09-30.",
    encounter: enc("s15", "Oakley Demo", {}, [
      plan({ payerName: "Demo BlueCo", type: "commercial_employer", terminationDate: "2026-09-30" }),
    ]),
    expected: { status: "verification_required", action: "do_not_collect_verify", amountCents: null, supervisorReview: false, rules: ["OPS-ELIG-001"], explains: ["none of the plans"] },
  },
  {
    id: "s16", number: 16, group: "Protections & edge cases",
    title: "Out-of-network scheduled service",
    summary: "Scheduled MRI; facility out of network with the patient's plan.",
    encounter: enc("s16", "Parker Demo", { setting: "outpatient", serviceCategory: "imaging", networkStatus: "out_of_network" }, [
      plan({ payerName: "Demo Narrow-Network HMO", type: "marketplace" }),
    ]),
    expected: { status: "supervisor_review", action: "refer_financial_counseling", amountCents: null, supervisorReview: true, rules: ["OPS-NET-001"], explains: ["out of network"] },
  },
  {
    id: "s17", number: 17, group: "Emergency",
    title: "ED after stabilization — only the office copay is on file",
    summary: "Plan has a $30 office copay and a separate ED benefit; only the office copay was captured.",
    encounter: enc("s17", "Quinn Demo", { setting: "emergency", serviceCategory: "emergency", department: "Emergency Department", edPhase: "post_stabilization" }, [
      plan({ payerName: "Demo BlueCo", type: "commercial_employer", benefits: { benefitsVerified: true, copayApplies: "yes", copayCents: 3000, copaySetting: "office", serviceCovered: "yes" } }),
    ]),
    expected: { status: "verification_required", action: "do_not_collect_verify", amountCents: null, supervisorReview: false, rules: ["PLAN-BEN-002", "FAC-ED-001"], explains: ["office copay never applies"] },
  },
  {
    id: "s18", number: 18, group: "Single coverage",
    title: "Deductible may not be met — estimate shown, not collected",
    summary: "No copay; $500 deductible remaining; 20% coinsurance; facility estimate of allowed amount $800; facility does not collect estimates.",
    encounter: enc("s18", "Reese Demo", { setting: "outpatient", serviceCategory: "imaging", allowedAmountEstimateCents: 80000 }, [
      plan({ payerName: "Demo HealthFirst", type: "commercial_employer", benefits: { benefitsVerified: true, copayApplies: "no", deductibleApplies: "yes", deductibleRemainingCents: 50000, coinsuranceBp: 2000, oopRemainingCents: 300000, serviceCovered: "yes" } }),
    ]),
    // 500.00 + 20% × 300.00 = 560.00
    expected: { status: "estimate_only", action: "wait_for_adjudication", amountCents: 56000, amountKind: "estimate", supervisorReview: false, rules: ["FAC-EST-001"], explains: ["coinsurance is a percentage"] },
  },
  {
    id: "s19", number: 19, group: "Protections & edge cases",
    title: "Approved financial assistance",
    summary: "Commercial plan with $45 copay, but the patient has an approved FAP determination.",
    encounter: enc("s19", "Sage Demo", { financialAssistance: "verified" }, [
      plan({ payerName: "Demo BlueCo", type: "commercial_employer", benefits: { benefitsVerified: true, copayApplies: "yes", copayCents: 4500, copaySetting: "office", serviceCovered: "yes" } }),
    ]),
    expected: { status: "no_collection", action: "no_collection", amountCents: null, supervisorReview: false, rules: ["FAC-FAP-001"], explains: ["financial-assistance"] },
  },
  {
    id: "s20", number: 20, group: "Protections & edge cases",
    title: "Conflicting eligibility and benefit information",
    summary: "271 says active; payer portal shows termination last month.",
    encounter: enc("s20", "Tatum Demo", {}, [
      plan({ payerName: "Demo BlueCo", type: "commercial_employer", conflictingInformation: "271 response shows active; payer portal shows coverage terminated 2026-09-30" }),
    ]),
    expected: { status: "supervisor_review", action: "refer_billing_review", amountCents: null, supervisorReview: true, rules: ["OPS-CONFLICT-001"], explains: ["sources disagree"] },
  },
  {
    id: "s21", number: 21, group: "Protections & edge cases",
    title: "Missing benefit data",
    summary: "Eligibility verified active; benefits for the service were never pulled.",
    encounter: enc("s21", "Uri Demo", {}, [
      plan({ payerName: "Demo BlueCo", type: "commercial_employer", benefits: { benefitsVerified: false, copayApplies: "unknown" } }),
    ]),
    expected: { status: "verification_required", action: "do_not_collect_verify", amountCents: null, supervisorReview: false, rules: ["PLAN-BEN-001"], explains: ["active coverage does not tell you the copay"] },
  },
  {
    id: "s22", number: 22, group: "Protections & edge cases",
    title: "Copay already collected",
    summary: "Verified $45 copay; $45 already collected at check-in kiosk.",
    encounter: enc("s22", "Vale Demo", { previouslyCollectedCents: 4500 }, [
      plan({ payerName: "Demo BlueCo", type: "commercial_employer", benefits: { benefitsVerified: true, copayApplies: "yes", copayCents: 4500, copaySetting: "office", serviceCovered: "yes" } }),
    ]),
    expected: { status: "no_collection", action: "no_collection", amountCents: null, supervisorReview: false, rules: ["OPS-CALC-002"], explains: ["already been collected"] },
  },
  {
    id: "s23", number: 23, group: "Protections & edge cases",
    title: "Retroactive eligibility pending",
    summary: "Uninsured on arrival; Medicaid application submitted, may be retroactive.",
    encounter: enc("s23", "Wren Demo", {}, [
      plan({ payerName: "NC Medicaid (demo) — application", type: "medicaid", eligibility: "retro_pending" }),
    ]),
    expected: { status: "no_collection", action: "refer_financial_counseling", amountCents: null, supervisorReview: false, rules: ["OPS-ELIG-002"], explains: ["retroactively"] },
  },
  {
    id: "s24", number: 24, group: "Single coverage",
    title: "Payer reports $0 patient responsibility",
    summary: "Preventive visit; claim adjudicated with $0 patient responsibility.",
    encounter: enc("s24", "Xen Demo", { serviceCategory: "primary_care" }, [
      plan({ payerName: "Demo BlueCo", type: "commercial_employer", adjudication: { status: "adjudicated", eobOnFile: true, allowedCents: 21500, paidCents: 21500, patientResponsibilityCents: 0 } }),
    ]),
    expected: { status: "no_collection", action: "no_collection", amountCents: null, supervisorReview: false, rules: ["OPS-ADJ-001"], explains: ["patient responsibility on the eob"] },
  },
  {
    id: "s25", number: 25, group: "Single coverage",
    title: "Only an estimate is available",
    summary: "Clearinghouse returned a $75 urgent-care copay flagged as an estimate.",
    encounter: enc("s25", "Yael Demo", { setting: "urgent_care", serviceCategory: "urgent_care" }, [
      plan({ payerName: "Demo BlueCo", type: "commercial_employer", benefits: { benefitsVerified: true, benefitsSource: "Demo clearinghouse estimate", copayApplies: "yes", copayCents: 7500, copaySetting: "urgent_care", estimateOnly: true, serviceCovered: "yes" } }),
    ]),
    expected: { status: "estimate_only", action: "wait_for_adjudication", amountCents: 7500, amountKind: "estimate", supervisorReview: false, rules: ["FAC-EST-001"], explains: ["estimate, not a confirmed benefit"] },
  },
  // ── Additional coverage beyond the required 25 ──
  {
    id: "s26", number: 26, group: "Emergency",
    title: "ED after stabilization — verified ED copay",
    summary: "Plan has a separate $250 ER copay, verified for the emergency setting.",
    encounter: enc("s26", "Zion Demo", { setting: "emergency", serviceCategory: "emergency", department: "Emergency Department", edPhase: "post_stabilization" }, [
      plan({ payerName: "Demo BlueCo", type: "commercial_employer", benefits: { benefitsVerified: true, copayApplies: "yes", copayCents: 25000, copaySetting: "emergency", serviceCovered: "yes" } }),
    ]),
    expected: { status: "verified_amount", action: "collect_verified_copay", amountCents: 25000, amountKind: "verified", supervisorReview: false, rules: ["FED-EMTALA-001", "PLAN-BEN-002"], explains: ["emergency"] },
  },
  {
    id: "s27", number: 27, group: "Dual coverage",
    title: "Medicare + Plan G — Part B deductible met",
    summary: "Medicare benefits verified: Part B deductible met for the year.",
    encounter: enc("s27", "Arden Demo", { setting: "outpatient" }, [
      plan({ payerName: "Medicare (demo)", type: "medicare_original", payerOrder: 1, benefits: { benefitsVerified: true, deductibleRemainingCents: 0 } }),
      plan({ payerName: "Demo Senior Supplement", type: "medigap", medigapLetter: "G", payerOrder: 2 }),
    ]),
    expected: { status: "no_collection", action: "no_collection", amountCents: null, supervisorReview: false, rules: ["PLAN-MEDIGAP-G"], explains: ["deductible has been met"] },
  },
  {
    id: "s28", number: 28, group: "Dual coverage",
    title: "Medicare + employer plan — MSP questionnaire not done",
    summary: "Both cards presented; no MSP questionnaire on file.",
    encounter: enc("s28", "Bowie Demo", { setting: "outpatient" }, [
      plan({ payerName: "Medicare (demo)", type: "medicare_original", payerOrder: 1 }),
      plan({ payerName: "Demo Acme Employer Plan", type: "commercial_employer", isEmployerGroupPlan: true, payerOrder: 2 }),
    ]),
    expected: { status: "verification_required", action: "do_not_collect_verify", amountCents: null, supervisorReview: false, rules: ["FED-MSP-004"], explains: ["questionnaire"] },
  },
  {
    id: "s29", number: 29, group: "Dual coverage",
    title: "Medicaid entered as primary over commercial",
    summary: "Registrar put Medicaid first and the parent's employer plan second.",
    encounter: enc("s29", "Cruz Demo", {}, [
      plan({ payerName: "NC Medicaid (demo)", type: "medicaid", payerOrder: 1 }),
      plan({ payerName: "Demo BlueCo", type: "commercial_employer", payerOrder: 2 }),
    ]),
    expected: { status: "supervisor_review", action: "refer_billing_review", amountCents: null, supervisorReview: true, rules: ["FED-MCD-001"], explains: ["payer of last resort"] },
  },
  {
    id: "s30", number: 30, group: "Single coverage",
    title: "Medicaid sole payer — state schedule not verified",
    summary: "NC Medicaid; patient not exempt; NC cost-sharing rule still draft in the library.",
    encounter: enc("s30", "Drew Demo", {}, [
      plan({ payerName: "NC Medicaid (demo)", type: "medicaid", costSharingExempt: "no", benefits: { benefitsVerified: true, copayApplies: "yes", copayCents: 400, serviceCovered: "yes" } }),
    ]),
    expected: { status: "verification_required", action: "do_not_collect_verify", amountCents: null, supervisorReview: false, rules: ["FED-MCD-003", "STATE-NC-MCD-001"], explains: ["not been verified"] },
  },
];
