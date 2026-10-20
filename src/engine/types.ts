/**
 * Ledgr core data model.
 *
 * All money is integer cents. Percentages are basis points (1% = 100 bp).
 * `null` / `undefined` always means "not known / not verified" — the engine
 * never substitutes a default dollar value for a missing input.
 */

export type Cents = number;
export type BasisPoints = number;
export type ISODate = string; // YYYY-MM-DD

// ───────────────────────────── Visit ─────────────────────────────

export type VisitSetting =
  | "emergency"
  | "urgent_care"
  | "outpatient"
  | "office"
  | "inpatient"
  | "observation";

export type ServiceCategory =
  | "primary_care"
  | "specialist"
  | "emergency"
  | "urgent_care"
  | "lab"
  | "imaging"
  | "surgery"
  | "therapy"
  | "other";

/** ED-only: where the patient is in the EMTALA timeline. */
export type EdPhase = "pre_screening" | "screening_or_stabilizing" | "post_stabilization";

export type NetworkStatus = "in_network" | "out_of_network" | "unknown";

export type ProtectionStatus = "none" | "pending" | "verified";

export interface VisitInfo {
  dateOfService: ISODate;
  facility: string;
  department: string;
  setting: VisitSetting;
  serviceCategory: ServiceCategory;
  newPatient?: boolean;
  networkStatus: NetworkStatus;
  edPhase?: EdPhase;
  /** Facility financial-assistance (charity care) determination. */
  financialAssistance: ProtectionStatus;
  /** Accident-related visit, payer = WC/auto/liability */
  accidentRelated?: boolean;
  /** Amount already collected from the patient for THIS encounter, in cents. */
  previouslyCollectedCents: Cents;
  /** Facility-approved estimate of the allowed amount for the service (not billed charges). */
  allowedAmountEstimateCents?: Cents | null;
  /** State whose rules apply (e.g. "NC"). */
  jurisdiction: string;
}

// ───────────────────────────── Coverage ─────────────────────────────

export type PlanType =
  | "commercial_employer"
  | "commercial_individual"
  | "marketplace"
  | "medicare_original"
  | "medicare_advantage"
  | "medigap"
  | "medicaid"
  | "medicaid_managed_care"
  | "tricare"
  | "va"
  | "workers_comp"
  | "auto_liability"
  | "other";

export type EligibilityStatus = "active" | "inactive" | "unverified" | "retro_pending";

export type CobStatus = "established" | "pending" | "conflict" | "unknown";

export type AdjudicationStatus = "not_submitted" | "submitted_pending" | "adjudicated" | "denied";

export type TriState = "yes" | "no" | "unknown";

export interface PlanBenefits {
  /** True only when benefits for THIS service were verified with a recorded source. */
  benefitsVerified: boolean;
  benefitsSource?: string;
  benefitsVerifiedAt?: string;
  /** Verified copay for this service/setting. null = not known. */
  copayCents?: Cents | null;
  /** The setting the verified copay applies to (must match the visit for ED). */
  copaySetting?: VisitSetting | null;
  /** Does a copay apply to this specific service? */
  copayApplies: TriState;
  /** Does the deductible apply to this service? */
  deductibleApplies: TriState;
  deductibleRemainingCents?: Cents | null;
  coinsuranceBp?: BasisPoints | null;
  oopRemainingCents?: Cents | null;
  authRequired?: TriState;
  authOnFile?: boolean;
  /** Payer flagged the service as excluded / not covered. */
  serviceCovered: TriState;
  /** True when the only amount available is a payer/clearinghouse estimate. */
  estimateOnly?: boolean;
  /** For secondary/tertiary plans: does it cover the prior payer's cost-sharing? */
  coversPriorCostShare?: TriState;
}

export interface Adjudication {
  status: AdjudicationStatus;
  eobOnFile: boolean;
  /** Allowed amount on the EOB/ERA. */
  allowedCents?: Cents | null;
  paidCents?: Cents | null;
  /** Patient responsibility reported by THIS payer after adjudication. */
  patientResponsibilityCents?: Cents | null;
  adjudicatedAt?: string;
}

/** Medicare Secondary Payer context — collected via the MSP questionnaire. */
export interface MspContext {
  /** Why the beneficiary has Medicare. */
  entitlementBasis: "age" | "disability" | "esrd" | "unknown";
  /** Is the patient (or spouse, for age basis) currently employed and covered BY that employment? */
  currentEmployment: TriState;
  /** Employer size counted per MSP rules. null = unknown. */
  employerSize?: number | null;
  /** ESRD only: is the patient inside the 30-month coordination period? */
  esrdInCoordinationPeriod?: TriState;
  questionnaireCompleted: boolean;
}

export interface CoveragePlan {
  id: string;
  payerName: string;
  planName: string;
  type: PlanType;
  /** Medigap standardized letter, e.g. "G". */
  medigapLetter?: string | null;
  /** Masked only — never the full identifier in demo. */
  memberIdMasked?: string;
  eligibility: EligibilityStatus;
  effectiveDate?: ISODate | null;
  terminationDate?: ISODate | null;
  eligibilityVerifiedAt?: string | null;
  eligibilitySource?: string | null;
  /** 1 = primary, 2 = secondary, 3 = tertiary. */
  payerOrder?: 1 | 2 | 3 | null;
  payerOrderConfirmed: boolean;
  payerOrderSource?: string | null;
  cobStatus: CobStatus;
  /** Is this a group health plan through current employment (for MSP)? */
  isEmployerGroupPlan?: boolean;
  /** Patient is a dependent on this plan (child-of-two-parents COB). */
  patientIsDependent?: boolean;
  /** Medicaid: patient is a Qualified Medicare Beneficiary. */
  qmb?: boolean;
  /** Medicaid: patient meets a federal/state cost-sharing exemption (child, pregnancy, etc.) */
  costSharingExempt?: TriState;
  /** Data from two sources disagree (eligibility vs. benefits, etc.). */
  conflictingInformation?: string | null;
  benefits: PlanBenefits;
  adjudication: Adjudication;
}

export interface Encounter {
  id: string;
  label?: string;
  demo: boolean;
  visit: VisitInfo;
  plans: CoveragePlan[];
  msp?: MspContext;
}

// ───────────────────────────── Rules ─────────────────────────────

/** Precedence: lower number wins. */
export type RuleCategory =
  | "federal_law"
  | "state_law"
  | "payer_contract"
  | "plan_benefit"
  | "facility_policy"
  | "operational";

export const CATEGORY_PRECEDENCE: Record<RuleCategory, number> = {
  federal_law: 1,
  state_law: 2,
  payer_contract: 3,
  plan_benefit: 4,
  facility_policy: 5,
  operational: 6,
};

export type VerificationStatus =
  /** Written from a cited authoritative reference; NOT yet validated by the facility's compliance reviewer. */
  | "reference_cited"
  /** Validated by a named reviewer on a recorded date. */
  | "verified"
  /** Placeholder awaiting content (e.g., a state rule nobody has supplied). */
  | "draft";

export interface RuleVersionEntry {
  version: number;
  changedAt: string;
  changedBy: string;
  approvedBy?: string | null;
  summary: string;
}

export type ParamValue = string | number | boolean;

export interface RuleParam {
  key: string;
  label: string;
  type: "boolean" | "number" | "cents" | "text";
  value: ParamValue;
  help?: string;
}

export interface RuleDefinition {
  id: string;
  name: string;
  description: string;
  category: RuleCategory;
  payerScope: string; // "All payers", "Original Medicare", ...
  planScope: string;
  coverageTypes: PlanType[] | "any";
  settings: VisitSetting[] | "any";
  effectiveDate: ISODate;
  expirationDate?: ISODate | null;
  jurisdiction: string; // "US-Federal", "NC", "Facility"
  source: string;
  sourceUrl?: string;
  verificationDate?: ISODate | null;
  verificationStatus: VerificationStatus;
  requiredInputs: string[];
  /** Plain-English summary of the decision logic. */
  logicSummary: string;
  /** Key of the evaluator implementation in the engine. */
  logicKey: string;
  priority: number;
  conflictBehavior: "blocking" | "advisory";
  reviewer: string;
  enabled: boolean;
  params: RuleParam[];
  version: number;
  history: RuleVersionEntry[];
}

// ───────────────────────────── Decision output ─────────────────────────────

export type DecisionStatus =
  | "verified_amount"
  | "estimate_only"
  | "awaiting_adjudication"
  | "verification_required"
  | "supervisor_review"
  | "no_collection"
  | "ed_workflow";

export type RecommendedAction =
  | "collect_verified_copay"
  | "collect_verified_responsibility"
  | "collect_estimate_per_policy"
  | "do_not_collect_verify"
  | "wait_for_adjudication"
  | "refer_financial_counseling"
  | "refer_billing_review"
  | "follow_ed_workflow"
  | "no_collection";

export interface AppliedRule {
  ruleId: string;
  ruleName: string;
  category: RuleCategory;
  verificationStatus: VerificationStatus;
  source: string;
  version: number;
  outcome: string;
}

export interface CalcStep {
  label: string;
  amountCents?: Cents | null;
  note?: string;
  source?: string;
}

export interface PayerOrderLine {
  order: 1 | 2 | 3;
  planId: string;
  label: string;
  confirmed: boolean;
}

export interface Decision {
  encounterId: string;
  status: DecisionStatus;
  action: RecommendedAction;
  headline: string;
  /** Null whenever a reliable amount cannot be determined. */
  amountCents: Cents | null;
  amountKind: "verified" | "estimate" | null;
  amountSource: string | null;
  explanation: string[];
  nextSteps: string[];
  missing: string[];
  warnings: string[];
  supervisorReview: boolean;
  escalationReason: string | null;
  rulesApplied: AppliedRule[];
  calculation: CalcStep[];
  payerOrder: PayerOrderLine[];
  evaluatedAt: string;
  engineVersion: string;
}

export const UNABLE_TO_DETERMINE = "Unable to determine a reliable amount — verification required";
