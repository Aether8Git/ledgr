import type { DecisionStatus, PlanType, RecommendedAction, RuleCategory, ServiceCategory, VerificationStatus, VisitSetting } from "../engine/types";

export const STATUS_LABEL: Record<DecisionStatus, string> = {
  verified_amount: "Verified amount available",
  estimate_only: "Estimated amount only",
  awaiting_adjudication: "Awaiting payer adjudication",
  verification_required: "Additional verification required",
  supervisor_review: "Supervisor review required",
  no_collection: "No collection recommended at this stage",
  ed_workflow: "Follow emergency department workflow",
};

export const STATUS_COLOR_VAR: Record<DecisionStatus, string> = {
  verified_amount: "var(--st-verified)",
  estimate_only: "var(--st-estimate)",
  awaiting_adjudication: "var(--st-awaiting)",
  verification_required: "var(--st-verify)",
  supervisor_review: "var(--st-review)",
  no_collection: "var(--st-none)",
  ed_workflow: "var(--st-ed)",
};

export const ACTION_LABEL: Record<RecommendedAction, string> = {
  collect_verified_copay: "Collect the verified copay",
  collect_verified_responsibility: "Collect the verified patient balance",
  collect_estimate_per_policy: "Request the estimate (facility policy allows)",
  do_not_collect_verify: "Don't collect yet — verify first",
  wait_for_adjudication: "Don't collect — wait for the claim to process",
  refer_financial_counseling: "Refer to financial counseling",
  refer_billing_review: "Refer for billing review",
  follow_ed_workflow: "Follow the ED registration and treatment workflow",
  no_collection: "No collection",
};

export const SETTING_LABEL: Record<VisitSetting, string> = {
  emergency: "Emergency department",
  urgent_care: "Urgent care",
  outpatient: "Hospital outpatient",
  office: "Office / clinic visit",
  inpatient: "Inpatient admission",
  observation: "Observation",
};

export const SERVICE_LABEL: Record<ServiceCategory, string> = {
  primary_care: "Primary care",
  specialist: "Specialist",
  emergency: "Emergency",
  urgent_care: "Urgent care",
  lab: "Laboratory",
  imaging: "Imaging",
  surgery: "Surgery / procedure",
  therapy: "Therapy",
  other: "Other",
};

export const PLAN_TYPE_OPTIONS: { value: PlanType; label: string }[] = [
  { value: "commercial_employer", label: "Commercial — employer" },
  { value: "commercial_individual", label: "Commercial — individual" },
  { value: "marketplace", label: "Marketplace (ACA)" },
  { value: "medicare_original", label: "Original Medicare (Part A/B)" },
  { value: "medicare_advantage", label: "Medicare Advantage (Part C)" },
  { value: "medigap", label: "Medicare Supplement (Medigap)" },
  { value: "medicaid", label: "Medicaid" },
  { value: "medicaid_managed_care", label: "Medicaid managed care" },
  { value: "tricare", label: "TRICARE" },
  { value: "va", label: "VA" },
  { value: "workers_comp", label: "Workers' compensation" },
  { value: "auto_liability", label: "Auto / liability" },
  { value: "other", label: "Other" },
];

export const CATEGORY_LABEL: Record<RuleCategory, string> = {
  federal_law: "Federal law",
  state_law: "State law",
  payer_contract: "Payer contract",
  plan_benefit: "Plan benefit",
  facility_policy: "Facility policy",
  operational: "Operational safeguard",
};

export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  verified: "Verified",
  reference_cited: "Cited — awaiting validation",
  draft: "Draft — not usable",
};
