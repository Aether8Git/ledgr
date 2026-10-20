import { applyCopay, creditPreviouslyCollected, estimateDeductibleCoinsurance, formatCents } from "./calc";
import { paramValue } from "./rules";
import {
  CATEGORY_PRECEDENCE,
  UNABLE_TO_DETERMINE,
  type AppliedRule,
  type CalcStep,
  type CoveragePlan,
  type Decision,
  type DecisionStatus,
  type Encounter,
  type PayerOrderLine,
  type PlanType,
  type RecommendedAction,
  type RuleDefinition,
} from "./types";

export const ENGINE_VERSION = "ledgr-engine 0.1.0";

/**
 * Decision engine.
 *
 * Stages run in precedence order. A stage either returns a terminal Decision or
 * adds context and passes through. Higher-precedence (federal law, protections)
 * stages run first so a lower-precedence rule can never override them.
 *
 *   1. ED / EMTALA gate              (federal law)
 *   2. Self-pay                       (operational)
 *   3. Retro/pending eligibility      (operational, protective)
 *   4. Eligibility for date of service
 *   5. Conflicting information
 *   6. Protections: QMB, financial assistance, WC/liability
 *   7. ED post-stabilization policy
 *   8. Payer order: Medigap / Medicaid / TRICARE structure, MSP, dependents, confirmation
 *   9. Network status / No Surprises Act
 *  10. Adjudicated balance (if claims processed)
 *  11. Pre-adjudication: Medicaid, Medicare, multi-plan policy, plan benefits
 *  12. Advisory: authorization, review threshold
 */

const COMMERCIAL_LIKE: PlanType[] = ["commercial_employer", "commercial_individual", "marketplace", "medicare_advantage", "tricare", "va", "medicaid_managed_care", "other"];
const NETWORK_PLANS: PlanType[] = ["commercial_employer", "commercial_individual", "marketplace", "medicare_advantage", "medicaid_managed_care", "tricare"];
const isMedicaid = (p: CoveragePlan) => p.type === "medicaid" || p.type === "medicaid_managed_care";

const PLAN_TYPE_LABEL: Record<PlanType, string> = {
  commercial_employer: "Employer plan",
  commercial_individual: "Individual plan",
  marketplace: "Marketplace plan",
  medicare_original: "Original Medicare",
  medicare_advantage: "Medicare Advantage",
  medigap: "Medigap",
  medicaid: "Medicaid",
  medicaid_managed_care: "Medicaid managed care",
  tricare: "TRICARE",
  va: "VA",
  workers_comp: "Workers' comp",
  auto_liability: "Auto / liability",
  other: "Other coverage",
};
export const planTypeLabel = (t: PlanType) => PLAN_TYPE_LABEL[t];
export const planLabel = (p: CoveragePlan) =>
  `${p.payerName}${p.type === "medigap" && p.medigapLetter ? ` Plan ${p.medigapLetter}` : ""} (${PLAN_TYPE_LABEL[p.type]})`;

class Ctx {
  applied: AppliedRule[] = [];
  explanation: string[] = [];
  nextSteps: string[] = [];
  missing: string[] = [];
  warnings: string[] = [];
  calculation: CalcStep[] = [];
  payerOrder: PayerOrderLine[] = [];
  supervisorReview = false;
  escalationReason: string | null = null;
  private rules: Map<string, RuleDefinition>;

  constructor(public enc: Encounter, rules: RuleDefinition[]) {
    this.rules = new Map(rules.map((r) => [r.id, r]));
  }

  /** A rule is in force if it exists, is enabled, and is effective on the date of service. */
  rule(id: string): RuleDefinition | undefined {
    const r = this.rules.get(id);
    if (!r) return undefined;
    // Federal-law rules cannot be switched off from the admin UI; treat as enabled regardless.
    if (!r.enabled && r.category !== "federal_law") return undefined;
    const dos = this.enc.visit.dateOfService;
    if (dos < r.effectiveDate) return undefined;
    if (r.expirationDate && dos > r.expirationDate) return undefined;
    return r;
  }

  active(id: string) {
    return this.rule(id) !== undefined;
  }

  fire(id: string, outcome: string) {
    const r = this.rule(id);
    if (!r) return;
    if (this.applied.some((a) => a.ruleId === id && a.outcome === outcome)) return;
    this.applied.push({
      ruleId: r.id,
      ruleName: r.name,
      category: r.category,
      verificationStatus: r.verificationStatus,
      source: r.source,
      version: r.version,
      outcome,
    });
  }

  escalate(reason: string) {
    this.supervisorReview = true;
    this.escalationReason = this.escalationReason ? `${this.escalationReason} ${reason}` : reason;
  }

  done(
    status: DecisionStatus,
    action: RecommendedAction,
    headline: string,
    amount: { cents: number | null; kind: "verified" | "estimate" | null; source: string | null } = { cents: null, kind: null, source: null },
  ): Decision {
    if (status === "supervisor_review") this.supervisorReview = true;
    // Order applied rules by precedence for display.
    const applied = [...this.applied].sort((a, b) => CATEGORY_PRECEDENCE[a.category] - CATEGORY_PRECEDENCE[b.category]);
    const unverifiedUsed = applied.filter((a) => a.verificationStatus !== "verified");
    const warnings = [...this.warnings];
    if (unverifiedUsed.length && !this.enc.demo) {
      warnings.push(`${unverifiedUsed.length} applied rule(s) have not been validated by compliance. Treat this result as decision support only.`);
    }
    return {
      encounterId: this.enc.id,
      status,
      action,
      headline,
      amountCents: amount.cents,
      amountKind: amount.kind,
      amountSource: amount.source,
      explanation: this.explanation,
      nextSteps: this.nextSteps,
      missing: this.missing,
      warnings,
      supervisorReview: this.supervisorReview,
      escalationReason: this.escalationReason,
      rulesApplied: applied,
      calculation: this.calculation,
      payerOrder: this.payerOrder,
      evaluatedAt: new Date().toISOString(),
      engineVersion: ENGINE_VERSION,
    };
  }

  unable(why: string, missing: string[], nextSteps: string[]): Decision {
    this.explanation.push(why);
    this.missing.push(...missing);
    this.nextSteps.push(...nextSteps);
    return this.done("verification_required", "do_not_collect_verify", UNABLE_TO_DETERMINE);
  }
}

function inWindow(p: CoveragePlan, dos: string) {
  if (p.effectiveDate && dos < p.effectiveDate) return false;
  if (p.terminationDate && dos > p.terminationDate) return false;
  return true;
}

// ════════════════════════════════════════════════════════════════════

export function evaluate(enc: Encounter, rules: RuleDefinition[]): Decision {
  const c = new Ctx(enc, rules);
  const v = enc.visit;

  // ── 1. ED / EMTALA gate ────────────────────────────────────────────
  if (v.setting === "emergency" && v.edPhase !== "post_stabilization") {
    c.fire("FED-EMTALA-001", "Patient has not completed screening/stabilization — financial steps paused.");
    c.explanation.push(
      "This is an emergency department visit and the patient has not yet completed the medical screening exam and any stabilizing treatment.",
      "Federal law (EMTALA) does not allow screening or stabilizing care to be delayed to ask about insurance or payment. Insurance status, a missing card, or inability to pay has no bearing on whether the patient is seen.",
    );
    c.nextSteps.push(
      "Complete the quick registration fields your ED uses to get the patient to clinical care — do not ask about payment or copays now.",
      "Insurance verification may run in the background as long as it does not delay care.",
      "Return to Ledgr after the patient has been screened and stabilized (or at discharge) to review any financial step.",
    );
    if (v.edPhase === undefined) c.warnings.push("ED phase was not recorded, so Ledgr treated the patient as not yet screened.");
    return c.done("ed_workflow", "follow_ed_workflow", "Follow the emergency department workflow — no payment discussion before screening and stabilization");
  }

  // ── 2. Self-pay ─────────────────────────────────────────────────────
  if (enc.plans.length === 0) {
    c.fire("OPS-SELFPAY-001", "No coverage on file.");
    c.explanation.push("No insurance is on file for this encounter, so there is no copay to look up.");
    c.nextSteps.push("Ask whether the patient has any coverage you may not have (Medicaid, Medicare, a parent's or spouse's plan, a recent job change).", "Refer to financial counseling for coverage screening and the financial assistance application.");
    return c.done("no_collection", "refer_financial_counseling", "No coverage on file — refer to financial counseling");
  }

  // ── 3. Retroactive / pending eligibility ───────────────────────────
  const retro = enc.plans.filter((p) => p.eligibility === "retro_pending");
  if (retro.length && c.active("OPS-ELIG-002")) {
    c.fire("OPS-ELIG-002", `${retro.map(planLabel).join(", ")} eligibility is pending or may be retroactive.`);
    c.explanation.push("Coverage for this date of service may be approved retroactively. Collecting now could mean collecting money the patient will not owe.");
    c.nextSteps.push("Do not collect at this time.", "Note the pending application on the account and refer to financial counseling to track the determination.");
    return c.done("no_collection", "refer_financial_counseling", "Hold collection — eligibility is pending or retroactive");
  }

  // ── 4. Eligibility for the date of service ─────────────────────────
  const unverified = enc.plans.filter((p) => p.eligibility === "unverified");
  const usable = enc.plans.filter((p) => p.eligibility === "active" && inWindow(p, v.dateOfService));
  const excluded = enc.plans.filter((p) => p.eligibility === "inactive" || (p.eligibility === "active" && !inWindow(p, v.dateOfService)));
  for (const p of excluded) {
    c.fire("OPS-ELIG-001", `${planLabel(p)} excluded — not active on ${v.dateOfService}.`);
    c.warnings.push(`${planLabel(p)} is not active for the date of service and was not used.`);
  }
  if (unverified.length) {
    c.fire("OPS-ELIG-001", "Eligibility not verified for one or more plans.");
    return c.unable(
      "Eligibility has not been verified for every plan on file, so payer order and benefits cannot be relied on.",
      unverified.map((p) => `Eligibility for ${planLabel(p)} on ${v.dateOfService} (source and timestamp)`),
      ["Run an eligibility check (270/271 or payer portal) for each unverified plan and record the source and time.", "Do not collect until eligibility is verified."],
    );
  }
  if (usable.length === 0) {
    c.fire("OPS-ELIG-001", "No active coverage for the date of service.");
    c.explanation.push("None of the plans on file are active for this date of service.");
    c.missing.push("Any other active coverage for the date of service");
    c.nextSteps.push("Ask the patient about new or other coverage and re-verify.", "If no active coverage is found, refer to financial counseling.");
    return c.done("verification_required", "do_not_collect_verify", "No active coverage for this date of service — verify other coverage");
  }

  // ── 5. Conflicting information ─────────────────────────────────────
  const conflicts = usable.filter((p) => p.conflictingInformation || p.cobStatus === "conflict");
  if (conflicts.length) {
    for (const p of conflicts) {
      c.fire("OPS-CONFLICT-001", `${planLabel(p)}: ${p.conflictingInformation ?? "COB marked as conflicting"}.`);
      c.explanation.push(`Sources disagree for ${planLabel(p)}: ${p.conflictingInformation ?? "the payer reports a coordination-of-benefits conflict"}.`);
    }
    c.escalate("Conflicting eligibility, benefit, or COB information.");
    c.nextSteps.push("Do not collect.", "Send to a supervisor with both sources attached so the conflict can be resolved with the payer.");
    return c.done("supervisor_review", "refer_billing_review", "Conflicting information — supervisor review required");
  }

  // ── 6. Protections ─────────────────────────────────────────────────
  const qmb = usable.find((p) => isMedicaid(p) && p.qmb);
  if (qmb) {
    c.fire("FED-MCD-002", "QMB status — Medicare cost-sharing may not be billed to the patient.");
    c.explanation.push(
      "The patient is a Qualified Medicare Beneficiary (QMB). Federal law prohibits billing QMB patients for Medicare deductibles, coinsurance, or copays — even if Medicaid pays nothing.",
    );
    c.nextSteps.push("Do not collect any Medicare cost-sharing.", "Make sure the QMB indicator is on the account so statements are suppressed.");
    return c.done("no_collection", "no_collection", "No collection — patient is protected as a QMB");
  }

  if (v.financialAssistance === "verified" && c.active("FAC-FAP-001")) {
    c.fire("FAC-FAP-001", "Approved financial assistance on file.");
    c.explanation.push("The patient has an approved financial-assistance determination. Point-of-service collection follows that policy, not the plan's copay.");
    c.nextSteps.push("Do not request a copay at registration.", "Confirm the determination dates cover this date of service.");
    return c.done("no_collection", "no_collection", "No collection — approved financial assistance");
  }
  if (v.financialAssistance === "pending" && c.active("FAC-FAP-001")) {
    c.fire("FAC-FAP-001", "Financial assistance application pending.");
    c.explanation.push("A financial-assistance application is pending. Collecting now could conflict with the determination.");
    c.nextSteps.push("Defer collection and note the pending application.", "Refer to financial counseling for status.");
    return c.done("no_collection", "refer_financial_counseling", "Defer collection — financial assistance pending");
  }

  const liability = usable.filter((p) => p.type === "workers_comp" || p.type === "auto_liability");
  if (liability.length) {
    c.fire("OPS-WC-001", `${liability.map(planLabel).join(", ")} on file.`);
    c.explanation.push("This encounter is billed to a workers' compensation or liability carrier. A health-plan copay does not apply at registration.");
    c.nextSteps.push("Collect the carrier name, claim number, adjuster contact, and date of injury.", "Do not collect a copay; route to billing if the claim is denied.");
    if (usable.some((p) => p.type === "medicare_original")) c.fire("FED-MSP-004", "Liability/WC is primary to Medicare when it is liable.");
    return c.done("no_collection", "refer_billing_review", "No copay — bill the workers' comp / liability carrier");
  }

  // ── 7. ED after stabilization ──────────────────────────────────────
  if (v.setting === "emergency") {
    c.fire("FED-EMTALA-001", "Screening and stabilization complete; financial review may proceed.");
    const allowEd = paramValue(c.rule("FAC-ED-001"), "allowPostStabilizationCollection", true);
    if (!allowEd) {
      c.fire("FAC-ED-001", "Facility policy: no ED point-of-service collection.");
      c.explanation.push("Your facility does not collect ED copays at the point of service.");
      c.nextSteps.push("Complete registration. Any balance will be billed after the claim is processed.");
      return c.done("no_collection", "no_collection", "No collection recommended at this stage (facility ED policy)");
    }
    c.fire("FAC-ED-001", "Facility policy allows a verified ED copay after stabilization.");
  }

  // ── 8. Payer order ─────────────────────────────────────────────────
  const multi = usable.length > 1;
  const orderResult = resolvePayerOrder(c, usable);
  if (orderResult.decision) return orderResult.decision;
  const ordered = orderResult.ordered;

  // ── 9. Network / No Surprises Act ──────────────────────────────────
  const primary = ordered[0];
  if (NETWORK_PLANS.includes(primary.type) && c.active("OPS-NET-001")) {
    if (v.networkStatus === "unknown") {
      c.fire("OPS-NET-001", "Network status unknown.");
      return c.unable("The facility's network status with the primary plan is not known, and benefits depend on it.", [`Network status with ${planLabel(primary)}`], ["Confirm the facility's contract status with the payer."]);
    }
    if (v.networkStatus === "out_of_network") {
      if (v.setting === "emergency" && ["commercial_employer", "commercial_individual", "marketplace"].includes(primary.type)) {
        c.fire("FED-NSA-001", "Out-of-network emergency services — in-network cost-sharing protections apply.");
        c.explanation.push("For out-of-network emergency care, federal surprise-billing protections limit the patient to in-network cost-sharing. The correct amount is set when the plan processes the claim.");
        c.nextSteps.push("Do not collect at the desk.", "Flag the account for Patient Financial Services review.");
        return c.done("no_collection", "refer_billing_review", "No collection — out-of-network emergency visit goes to billing review");
      }
      c.fire("OPS-NET-001", "Out-of-network service.");
      c.explanation.push("The facility is out of network with the primary plan. Out-of-network benefits, balance-billing rules, and any good-faith-estimate obligations need review before the patient is asked to pay.");
      c.escalate("Out-of-network service.");
      c.nextSteps.push("Do not collect.", "Refer to a supervisor and financial counseling before the service (out-of-network benefits and estimate requirements).");
      return c.done("supervisor_review", "refer_financial_counseling", "Out-of-network — supervisor review and financial counseling");
    }
  }

  // ── 10. Adjudicated balance ────────────────────────────────────────
  if (primary.adjudication.status !== "not_submitted") {
    return adjudicatedPath(c, ordered);
  }

  // ── 11. Pre-adjudication ───────────────────────────────────────────
  // 11a. Medicaid sole payer
  if (!multi && isMedicaid(primary)) return medicaidSolePath(c, primary);

  // 11b. Medicaid downstream of another payer
  if (multi && ordered.slice(1).some(isMedicaid)) {
    c.fire("FED-MCD-001", "Medicaid pays last; liability is set after the other payer(s) adjudicate.");
    c.fire("OPS-CALC-001", "No copay collected from either plan pre-adjudication.");
    c.explanation.push(
      "Medicaid is on file behind another payer. Medicaid pays last, and the patient's remaining cost-sharing (if any) depends on the primary claim and state Medicaid rules.",
    );
    c.nextSteps.push("Do not collect at registration.", "Bill the primary payer, then Medicaid with the primary EOB.");
    return c.done("awaiting_adjudication", "wait_for_adjudication", "Wait for adjudication — Medicaid is secondary");
  }

  // 11c. Original Medicare (alone or with Medigap)
  if (primary.type === "medicare_original") return medicarePath(c, ordered);

  // 11d. Generic multi-plan: no stacking, policy-driven
  if (multi) {
    c.fire("OPS-CALC-001", "Copays from multiple plans are not added together.");
    const allowPrimaryCopay = paramValue(c.rule("FAC-SEC-001"), "collectPrimaryCopayWhenSecondaryExists", false);
    if (!allowPrimaryCopay) {
      c.fire("FAC-SEC-001", "Facility waits for adjudication when downstream coverage exists.");
      c.explanation.push(
        `The patient has ${ordered.length === 3 ? "three" : "two"} plans. A downstream plan may pick up the primary plan's copay, so the patient's final share is not known until the claim is processed.`,
        "Ledgr never adds copays together or collects the higher copay.",
      );
      c.nextSteps.push("Do not collect a copay at registration.", `Bill ${planLabel(ordered[0])} first, then each downstream plan with the prior EOB.`);
      return c.done("awaiting_adjudication", "wait_for_adjudication", "Wait for adjudication — downstream coverage may cover the primary copay");
    }
    const downstream = ordered.slice(1);
    const unknownDs = downstream.filter((p) => p.benefits.coversPriorCostShare !== "no");
    if (unknownDs.length) {
      c.fire("FAC-SEC-001", "Downstream coverage of the primary copay not verified as 'no'.");
      return c.unable(
        "Facility policy allows collecting the primary copay only when every downstream plan is verified NOT to cover it.",
        unknownDs.map((p) => `Whether ${planLabel(p)} covers the primary plan's cost-sharing`),
        ["Verify each downstream plan's coordination provision, or wait for adjudication."],
      );
    }
    c.fire("FAC-SEC-001", "Downstream plans verified not to cover primary cost-sharing; primary copay may be collected.");
  }

  return planBenefitPath(c, primary);
}

// ════════════════════════════ payer order ════════════════════════════

function resolvePayerOrder(c: Ctx, usable: CoveragePlan[]): { ordered: CoveragePlan[]; decision?: Decision } {
  const enc = c.enc;
  if (usable.length === 1) {
    c.payerOrder = [{ order: 1, planId: usable[0].id, label: planLabel(usable[0]), confirmed: true }];
    if (usable[0].type === "medigap") {
      c.fire("FED-MEDIGAP-001", "Medigap with no active Original Medicare.");
      c.explanation.push("A Medicare Supplement is on file but Original Medicare is not active for this date. A supplement cannot pay first.");
      c.escalate("Medigap without active Original Medicare.");
      c.nextSteps.push("Verify the patient's Medicare Part A/B status.");
      return { ordered: usable, decision: c.done("supervisor_review", "refer_billing_review", "Supervisor review — supplement without Original Medicare") };
    }
    return { ordered: usable };
  }

  const triple = usable.length >= 3;
  const byType = (t: PlanType) => usable.filter((p) => p.type === t);

  // Display the entered order (confirmed or not).
  const sortedEntered = [...usable].sort((a, b) => (a.payerOrder ?? 9) - (b.payerOrder ?? 9));
  c.payerOrder = sortedEntered
    .filter((p) => p.payerOrder)
    .map((p) => ({ order: p.payerOrder!, planId: p.id, label: planLabel(p), confirmed: p.payerOrderConfirmed }));

  const review = (headline: string, reason: string, why: string, steps: string[]) => {
    c.explanation.push(why);
    c.escalate(reason);
    c.nextSteps.push(...steps);
    return { ordered: usable, decision: c.done("supervisor_review", "refer_billing_review", headline) };
  };

  // Medigap structure
  const medigap = byType("medigap");
  if (medigap.length) {
    const om = byType("medicare_original");
    const ma = byType("medicare_advantage");
    if (ma.length) {
      c.fire("FED-MEDIGAP-001", "Medigap on file with Medicare Advantage.");
      return review("Supervisor review — Medigap does not pay with Medicare Advantage", "Medigap with Medicare Advantage.", "A Medigap policy does not pay Medicare Advantage cost-sharing. One of these may be outdated.", ["Confirm which Medicare coverage is active (Original vs. Advantage).", "Do not collect until resolved."]);
    }
    if (!om.length) {
      c.fire("FED-MEDIGAP-001", "Medigap without active Original Medicare.");
      return review("Supervisor review — supplement without Original Medicare", "Medigap without Original Medicare.", "A Medicare Supplement is on file but Original Medicare is not active.", ["Verify Medicare Part A/B status."]);
    }
    if (medigap.some((g) => g.payerOrder !== null && g.payerOrder !== undefined && om[0].payerOrder && g.payerOrder < om[0].payerOrder)) {
      c.fire("FED-MEDIGAP-001", "Medigap ordered ahead of Original Medicare.");
      return review("Supervisor review — supplement ordered ahead of Medicare", "Payer order lists Medigap before Medicare.", "The supplement is listed ahead of Original Medicare. A supplement always pays after Medicare.", ["Correct the payer order with a supervisor."]);
    }
  }

  // Medicaid last
  const medicaid = usable.filter(isMedicaid);
  const maxOrder = Math.max(...usable.map((p) => p.payerOrder ?? 0));
  if (medicaid.length && medicaid.some((m) => m.payerOrder && m.payerOrder !== maxOrder)) {
    c.fire("FED-MCD-001", "Medicaid ordered ahead of other active coverage.");
    return review("Supervisor review — Medicaid must pay last", "Medicaid not last in payer order.", "Medicaid is listed ahead of other active coverage. Medicaid is the payer of last resort.", ["Correct the payer order; Medicaid should follow all other coverage."]);
  }

  // TRICARE after OHI
  const tricare = byType("tricare")[0];
  if (tricare) {
    const ohi = usable.filter((p) => ["commercial_employer", "commercial_individual", "marketplace"].includes(p.type));
    if (ohi.some((o) => tricare.payerOrder && o.payerOrder && tricare.payerOrder < o.payerOrder)) {
      c.fire("FED-TRICARE-001", "TRICARE ordered ahead of other health insurance.");
      return review("Supervisor review — TRICARE normally pays after other health insurance", "TRICARE ahead of OHI.", "TRICARE is listed before another health plan. TRICARE generally pays after other health insurance.", ["Verify the order with TRICARE and the other plan."]);
    }
  }

  // Medicare Secondary Payer
  const om = byType("medicare_original")[0];
  const ghp = usable.find((p) => p.isEmployerGroupPlan && !isMedicaid(p) && p.type !== "medigap" && p.type !== "medicare_original");
  if (om) {
    const otherNonSupplement = usable.filter((p) => p.type !== "medicare_original" && p.type !== "medigap" && !isMedicaid(p));
    if (otherNonSupplement.length) {
      const msp = enc.msp;
      if (!msp || !msp.questionnaireCompleted) {
        c.fire("FED-MSP-004", "MSP questionnaire not completed.");
        return { ordered: usable, decision: c.unable("Original Medicare and another health plan are both on file. Payer order must come from the Medicare Secondary Payer questionnaire — not from age, card order, or patient preference.", ["Completed MSP questionnaire (entitlement basis, current employment, employer size)"], ["Complete the MSP questionnaire with the patient.", "Do not collect until payer order is established."]) };
      }
      c.fire("FED-MSP-004", "MSP questionnaire on file.");
      if (ghp) {
        const mspRes = mspExpected(msp);
        if (mspRes.ruleId) c.fire(mspRes.ruleId, mspRes.outcome);
        if (mspRes.expected === "unknown") {
          c.explanation.push(`Ledgr cannot determine whether Medicare or ${planLabel(ghp)} pays first: ${mspRes.outcome}`);
          c.escalate("MSP payer order cannot be determined from the questionnaire answers.");
          c.missing.push(...mspRes.missing);
          c.nextSteps.push("Have a supervisor or MSP coordinator review the questionnaire and confirm with the employer plan.", "Do not collect until payer order is settled.");
          return { ordered: usable, decision: c.done("supervisor_review", "refer_billing_review", "Supervisor review — Medicare payer order needs review") };
        }
        const expectedPrimary = mspRes.expected === "ghp" ? ghp : om;
        const enteredPrimary = usable.find((p) => p.payerOrder === 1);
        c.explanation.push(`Medicare Secondary Payer rules indicate ${planLabel(expectedPrimary)} pays first. ${mspRes.outcome}`);
        if (enteredPrimary && enteredPrimary.id !== expectedPrimary.id) {
          c.escalate("Entered payer order contradicts MSP rules.");
          c.nextSteps.push(`Correct the payer order: ${planLabel(expectedPrimary)} should be primary.`);
          return { ordered: usable, decision: c.done("supervisor_review", "refer_billing_review", "Supervisor review — payer order contradicts Medicare Secondary Payer rules") };
        }
      }
    }
  }

  // Dependent child of two parents
  const deps = usable.filter((p) => p.patientIsDependent);
  if (deps.length >= 2 && deps.some((p) => !p.payerOrderConfirmed)) {
    c.fire("OPS-COB-002", "Dependent covered by two parents' plans; order not confirmed.");
    return {
      ordered: usable,
      decision: c.unable(
        "The patient is a dependent on two parents' plans. Many plans use the 'birthday rule' (the parent whose birthday comes first in the calendar year is primary), but custody orders and plan terms can change that — so the order must be confirmed with the payers, not assumed.",
        ["Confirmed payer order from both plans (and any custody/court order on file)"],
        ["Confirm COB with both payers.", "Do not collect until the primary plan is confirmed."],
      ),
    };
  }

  // Confirmation, uniqueness, contiguity, COB status
  const orders = usable.map((p) => p.payerOrder);
  const validOrders = orders.every((o) => o && o >= 1 && o <= usable.length) && new Set(orders).size === usable.length;
  const unconfirmed = usable.filter((p) => !p.payerOrderConfirmed);
  const cobOpen = usable.filter((p) => p.cobStatus !== "established");
  if (!validOrders || unconfirmed.length || cobOpen.length) {
    const missing: string[] = [];
    if (!validOrders) missing.push("A unique primary / secondary" + (triple ? " / tertiary" : "") + " position for each plan");
    for (const p of unconfirmed) missing.push(`Confirmed payer position for ${planLabel(p)} (source)`);
    for (const p of cobOpen) missing.push(`Coordination of benefits established with ${planLabel(p)}`);
    c.fire("OPS-COB-001", triple ? "Triple coverage with unresolved payer order." : "Payer order not confirmed.");
    if (triple) {
      c.explanation.push("Three plans are active and the order of benefits is not fully established. With three payers, an order mistake causes denials and duplicate collections.");
      c.missing.push(...missing);
      c.escalate("Triple coverage with unresolved payer order.");
      c.nextSteps.push("Do not collect.", "Route to a supervisor to confirm COB with all three payers.");
      return { ordered: usable, decision: c.done("supervisor_review", "refer_billing_review", "Supervisor review — three plans with unresolved payer order") };
    }
    return {
      ordered: usable,
      decision: c.unable(
        "Payer order is not confirmed. The order cards are presented, patient preference, and which copay is higher do not decide which plan is primary.",
        missing,
        ["Confirm COB with each payer and record the source.", "Do not collect until the primary plan is confirmed."],
      ),
    };
  }

  c.fire("OPS-COB-001", `Payer order confirmed for ${usable.length} plans.`);
  const ordered = [...usable].sort((a, b) => a.payerOrder! - b.payerOrder!);
  c.payerOrder = ordered.map((p) => ({ order: p.payerOrder!, planId: p.id, label: planLabel(p), confirmed: true }));
  return { ordered };
}

function mspExpected(msp: NonNullable<Encounter["msp"]>): { expected: "ghp" | "medicare" | "unknown"; ruleId?: string; outcome: string; missing: string[] } {
  switch (msp.entitlementBasis) {
    case "age": {
      if (msp.currentEmployment === "no") return { expected: "medicare", ruleId: "FED-MSP-001", outcome: "Coverage is not based on current employment (e.g., retiree coverage), so Medicare pays first.", missing: [] };
      if (msp.currentEmployment === "unknown") return { expected: "unknown", ruleId: "FED-MSP-001", outcome: "current-employment status is unknown.", missing: ["Whether the plan is through current employment"] };
      if (msp.employerSize == null) return { expected: "unknown", ruleId: "FED-MSP-001", outcome: "the employer's size is unknown (the 20-employee threshold decides the order).", missing: ["Employer size (20+ employees?)"] };
      return msp.employerSize >= 20
        ? { expected: "ghp", ruleId: "FED-MSP-001", outcome: "Current-employment coverage from an employer with 20+ employees pays before Medicare.", missing: [] }
        : { expected: "medicare", ruleId: "FED-MSP-001", outcome: "Employer has fewer than 20 employees, so Medicare pays first.", missing: [] };
    }
    case "disability": {
      if (msp.currentEmployment === "no") return { expected: "medicare", ruleId: "FED-MSP-002", outcome: "Coverage is not based on current employment, so Medicare pays first.", missing: [] };
      if (msp.currentEmployment === "unknown") return { expected: "unknown", ruleId: "FED-MSP-002", outcome: "current-employment status is unknown.", missing: ["Whether the plan is through current employment"] };
      if (msp.employerSize == null) return { expected: "unknown", ruleId: "FED-MSP-002", outcome: "the employer's size is unknown (the 100-employee threshold decides the order).", missing: ["Employer size (100+ employees?)"] };
      return msp.employerSize >= 100
        ? { expected: "ghp", ruleId: "FED-MSP-002", outcome: "Large group plan (100+ employees) through current employment pays before Medicare.", missing: [] }
        : { expected: "medicare", ruleId: "FED-MSP-002", outcome: "Employer has fewer than 100 employees, so Medicare pays first.", missing: [] };
    }
    case "esrd": {
      if (msp.esrdInCoordinationPeriod === "yes") return { expected: "ghp", ruleId: "FED-MSP-003", outcome: "Inside the 30-month ESRD coordination period, the group plan pays first.", missing: [] };
      if (msp.esrdInCoordinationPeriod === "no") return { expected: "medicare", ruleId: "FED-MSP-003", outcome: "The ESRD coordination period has ended, so Medicare pays first.", missing: [] };
      return { expected: "unknown", ruleId: "FED-MSP-003", outcome: "whether the patient is inside the 30-month coordination period is unknown.", missing: ["ESRD coordination period start date"] };
    }
    default:
      return { expected: "unknown", outcome: "the reason the patient has Medicare (age, disability, ESRD) is unknown.", missing: ["Medicare entitlement basis"] };
  }
}

// ═══════════════════════════ adjudicated ═══════════════════════════

function adjudicatedPath(c: Ctx, ordered: CoveragePlan[]): Decision {
  const v = c.enc.visit;
  const primary = ordered[0];
  if (primary.adjudication.status === "submitted_pending") {
    c.fire("OPS-ADJ-001", "Primary claim submitted, not yet adjudicated.");
    c.explanation.push(`The claim is with ${planLabel(primary)} and has not been processed. The patient's share is not final until it is.`);
    c.nextSteps.push("Do not collect a balance now.", "Recheck after the primary EOB/ERA posts.");
    return c.done("awaiting_adjudication", "wait_for_adjudication", "Wait for the primary payer to process the claim");
  }
  if (primary.adjudication.status === "denied") {
    c.fire("OPS-ADJ-001", "Primary claim denied.");
    c.explanation.push(`${planLabel(primary)} denied the claim. A denial is not automatically a patient balance — it may be correctable or appealable.`);
    c.escalate("Primary claim denied.");
    c.nextSteps.push("Do not collect.", "Route to billing to review the denial reason.");
    return c.done("supervisor_review", "refer_billing_review", "Supervisor review — primary claim denied");
  }

  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i];
    const a = p.adjudication;
    if (a.status === "adjudicated") {
      if (!a.eobOnFile || a.patientResponsibilityCents == null) {
        c.fire("OPS-ADJ-001", `${planLabel(p)} adjudicated but EOB/patient responsibility missing.`);
        return c.unable(`${planLabel(p)} processed the claim, but its EOB or patient-responsibility amount is not on file.`, [`EOB/ERA from ${planLabel(p)} with patient responsibility`], ["Obtain the EOB/ERA before quoting any balance."]);
      }
      c.calculation.push({ label: `${["Primary", "Secondary", "Tertiary"][i]} — ${planLabel(p)}: allowed`, amountCents: a.allowedCents ?? null, source: "EOB/ERA" });
      c.calculation.push({ label: `${["Primary", "Secondary", "Tertiary"][i]} — paid`, amountCents: a.paidCents ?? null, source: "EOB/ERA" });
      c.calculation.push({ label: `${["Primary", "Secondary", "Tertiary"][i]} — patient responsibility after this payer`, amountCents: a.patientResponsibilityCents, source: "EOB/ERA" });
      continue;
    }
    if (a.status === "denied") {
      c.fire("OPS-ADJ-001", `${planLabel(p)} denied the crossover/secondary claim.`);
      c.escalate(`${planLabel(p)} denied.`);
      c.explanation.push(`${planLabel(p)} denied its part of the claim. Billing must review before the patient is billed.`);
      c.nextSteps.push("Do not collect.", "Route to billing to review the downstream denial.");
      return c.done("supervisor_review", "refer_billing_review", "Supervisor review — downstream claim denied");
    }
    // downstream not processed
    c.fire("OPS-ADJ-001", `${planLabel(p)} has not processed the claim.`);
    c.fire("OPS-CALC-001", "Primary patient responsibility is not the final balance while downstream coverage is pending.");
    c.explanation.push(
      `${planLabel(ordered[i - 1])} has processed the claim, but ${planLabel(p)} has not. The amount on the earlier EOB is not the patient's final balance — the next plan may pay some or all of it.`,
    );
    if (isMedicaid(p)) c.fire("FED-MCD-001", "Medicaid processes last.");
    c.nextSteps.push(`Make sure the claim was sent to ${planLabel(p)} with the prior EOB.`, "Do not collect until it is processed.");
    return c.done("awaiting_adjudication", "wait_for_adjudication", `Wait for ${planLabel(p)} to process the claim`);
  }

  // all adjudicated
  const last = ordered[ordered.length - 1];
  const final = last.adjudication.patientResponsibilityCents!;
  c.fire("OPS-ADJ-001", `Final patient responsibility from ${planLabel(last)}: ${formatCents(final)}.`);
  c.explanation.push(
    ordered.length > 1
      ? `Every payer has processed the claim. The patient's balance is the patient responsibility on the last EOB (${planLabel(last)}), not billed charges minus payments.`
      : `${planLabel(last)} has processed the claim. The patient's balance is the patient responsibility on the EOB.`,
  );
  const credit = creditPreviouslyCollected(final, v.previouslyCollectedCents);
  if (v.previouslyCollectedCents > 0) c.fire("OPS-CALC-002", `${formatCents(v.previouslyCollectedCents)} already collected credited.`);
  c.calculation.push(...credit.steps);
  if (credit.creditCents > 0) {
    c.escalate("Collected amount exceeds final patient responsibility (credit balance).");
    c.explanation.push(`The patient has paid ${formatCents(credit.creditCents)} more than they owe.`);
    c.nextSteps.push("Do not collect.", "Route to billing to review the credit balance / refund.");
    return c.done("supervisor_review", "refer_billing_review", "Credit balance — refer to billing for refund review");
  }
  if (credit.dueCents === 0) {
    c.nextSteps.push("Do not collect.");
    return c.done("no_collection", "no_collection", final === 0 ? "No patient balance — payers report $0 patient responsibility" : "Nothing more to collect — balance already paid");
  }
  c.nextSteps.push(`Ask the patient for ${formatCents(credit.dueCents)} (adjudicated balance).`, "Give a receipt that references the EOB.");
  return threshold(c, c.done("verified_amount", "collect_verified_responsibility", "Verified balance from adjudicated claim", { cents: credit.dueCents, kind: "verified", source: `EOB/ERA — ${planLabel(last)}` }));
}

// ═══════════════════════════ Medicaid sole ═══════════════════════════

function medicaidSolePath(c: Ctx, p: CoveragePlan): Decision {
  const v = c.enc.visit;
  c.fire("FED-MCD-003", "Medicaid cost-sharing is limited and state-specific.");
  if (p.costSharingExempt === "yes") {
    c.explanation.push("This patient/service is exempt from Medicaid cost-sharing.");
    c.nextSteps.push("Do not collect.");
    return c.done("no_collection", "no_collection", "No collection — Medicaid cost-sharing exemption");
  }
  if (p.costSharingExempt !== "no") {
    return c.unable("Medicaid exempts many patients and services from cost-sharing (for example, many children, pregnancy-related services, and emergency services). Exemption status is not recorded.", ["Medicaid cost-sharing exemption status"], ["Check the Medicaid eligibility response for cost-sharing indicators."]);
  }
  const stateRuleId = `STATE-${v.jurisdiction}-MCD-001`;
  const stateRule = c.rule(stateRuleId);
  if (!stateRule || stateRule.verificationStatus !== "verified") {
    if (stateRule) c.fire(stateRuleId, "State Medicaid cost-sharing schedule is not verified in the rule library.");
    return c.unable(`The ${v.jurisdiction} Medicaid cost-sharing schedule has not been verified in Ledgr's rule library, so Ledgr will not recommend a Medicaid copay.`, [`Verified ${v.jurisdiction} Medicaid cost-sharing rule (Rules Admin)`], ["Do not collect.", "Ask compliance to complete and verify the state rule."]);
  }
  c.fire(stateRuleId, "Verified state Medicaid cost-sharing schedule applied.");
  return planBenefitPath(c, p);
}

// ═══════════════════════════ Medicare ═══════════════════════════

function medicarePath(c: Ctx, ordered: CoveragePlan[]): Decision {
  const v = c.enc.visit;
  const om = ordered[0];
  const medigap = ordered.find((p) => p.type === "medigap");
  c.fire("FED-MEDICARE-001", "Original Medicare uses deductible + coinsurance, not a fixed copay.");
  if (!om.benefits.benefitsVerified) {
    c.fire("PLAN-BEN-001", "Medicare benefits not verified.");
  }

  // Other downstream (non-Medigap) coverage, e.g., retiree plan — wait.
  const nonGap = ordered.slice(1).filter((p) => p.type !== "medigap");
  if (nonGap.length) {
    c.fire("OPS-CALC-001", "No copay collected while downstream coverage exists.");
    c.explanation.push("Medicare pays first and another plan follows. The patient's remaining share depends on both claims.");
    c.nextSteps.push("Do not collect at registration.", "Bill Medicare, then the secondary with the Medicare remittance.");
    return c.done("awaiting_adjudication", "wait_for_adjudication", "Wait for adjudication — Medicare with downstream coverage");
  }

  if (medigap) {
    const letter = (medigap.medigapLetter ?? "").toUpperCase().trim();
    if (letter !== "G") {
      c.fire("PLAN-MEDIGAP-OTHER", letter ? `Medigap Plan ${letter} — benefits not modeled.` : "Medigap plan letter missing.");
      return c.unable(
        letter
          ? `Medigap Plan ${letter}'s benefits differ from other plans. Ledgr does not assume what Plan ${letter} covers.`
          : "The Medigap plan letter is not recorded. Medigap plans are not interchangeable.",
        [letter ? `Verified Plan ${letter} coverage of the Part B deductible and any Medigap copays` : "Medigap plan letter"],
        ["Verify the supplement's benefits with the carrier."],
      );
    }
    c.fire("PLAN-MEDIGAP-G", "Plan G covers Medicare cost-sharing except the Part B deductible.");
    c.explanation.push("Medicare processes the claim first. Plan G generally covers the remaining Medicare cost-sharing but generally does not cover the Part B deductible. There is no standard copay to collect.");
    if (v.setting === "inpatient") {
      c.explanation.push("For a covered inpatient stay, Plan G covers the Part A deductible and coinsurance.");
      c.nextSteps.push("Do not collect a facility copay.", "Professional (Part B) services for this stay may still be subject to the Part B deductible — billed separately.");
      return c.done("no_collection", "no_collection", "No facility collection — Plan G covers Part A cost-sharing");
    }
    const ded = om.benefits.deductibleRemainingCents;
    if (!om.benefits.benefitsVerified || ded == null) {
      return c.unable(
        "Whether the patient owes anything depends on how much of the Part B deductible is left this year, which has not been verified.",
        ["Remaining Medicare Part B deductible (from the Medicare eligibility response)"],
        ["Verify the Medicare benefit and remaining Part B deductible.", "Review applicable facility policy before collecting.", "Do not collect a standard copay."],
      );
    }
    if (ded === 0) {
      c.calculation.push({ label: "Remaining Part B deductible (verified)", amountCents: 0, source: om.benefits.benefitsSource });
      c.explanation.push("The Part B deductible has been met this year, so Plan G is expected to cover the remaining Medicare cost-sharing for covered services.");
      c.nextSteps.push("Do not collect at registration.");
      return c.done("no_collection", "no_collection", "No collection recommended — Part B deductible met; Plan G covers the rest");
    }
    // Deductible remaining → at most the remaining deductible, estimate only
    const allowed = v.allowedAmountEstimateCents;
    c.calculation.push({ label: "Remaining Part B deductible (verified)", amountCents: ded, source: om.benefits.benefitsSource });
    if (allowed == null) {
      c.explanation.push(`Up to ${formatCents(ded)} of the Part B deductible may apply, but the Medicare-approved amount for this service is not known.`);
      return estimateGate(c, null, "Medicare Part B deductible (Plan G does not cover it)");
    }
    const est = Math.min(ded, allowed);
    c.calculation.push({ label: "Medicare-approved amount (facility estimate)", amountCents: allowed }, { label: "Estimated deductible owed = min(deductible, approved)", amountCents: est });
    c.explanation.push("Plan G does not pay the Part B deductible, so the patient may owe up to the remaining deductible. This is an estimate until Medicare processes the claim.");
    return estimateGate(c, est, "Estimate: remaining Part B deductible vs. Medicare-approved amount");
  }

  // Original Medicare alone
  const b = om.benefits;
  if (!b.benefitsVerified || b.deductibleRemainingCents == null || b.coinsuranceBp == null) {
    return c.unable(
      "Original Medicare has no standard copay. The patient's share is the remaining deductible plus coinsurance on the Medicare-approved amount, which requires verified current-year figures.",
      [
        ...(b.deductibleRemainingCents == null ? ["Remaining Medicare deductible (verified)"] : []),
        ...(b.coinsuranceBp == null ? ["Applicable Medicare coinsurance for this service"] : []),
      ],
      ["Verify the Medicare benefit for this service.", "Ask about supplemental coverage (Medigap, retiree plan, Medicaid)."],
    );
  }
  const allowed = v.allowedAmountEstimateCents;
  if (allowed == null) {
    c.explanation.push("Deductible and coinsurance are verified, but the Medicare-approved amount for this service is not available, so no estimate is possible.");
    return estimateGate(c, null, "Medicare deductible + coinsurance");
  }
  const r = estimateDeductibleCoinsurance({ allowedCents: allowed, deductibleRemainingCents: b.deductibleRemainingCents, coinsuranceBp: b.coinsuranceBp, oopRemainingCents: null, source: "Facility estimate of Medicare-approved amount" });
  c.calculation.push(...r.steps);
  c.explanation.push("Original Medicare without a supplement: the patient's share is any remaining deductible plus coinsurance on the approved amount. This is an estimate until Medicare processes the claim.");
  return estimateGate(c, r.totalCents, "Estimate: Medicare deductible + coinsurance on approved amount");
}

// ═══════════════════════════ plan benefits ═══════════════════════════

function planBenefitPath(c: Ctx, p: CoveragePlan): Decision {
  const v = c.enc.visit;
  const b = p.benefits;
  if (p.type === "medicare_advantage") c.fire("PLAN-MA-001", "Medicare Advantage — plan-specific benefits only.");

  if (!b.benefitsVerified) {
    c.fire("PLAN-BEN-001", `Benefits for ${planLabel(p)} not verified for this service.`);
    return c.unable(`Coverage is on file for ${planLabel(p)}, but benefits for this specific service have not been verified. Active coverage does not tell you the copay.`, [`Verified ${v.serviceCategory.replace("_", " ")} benefits for ${planLabel(p)} (copay, deductible, coinsurance) with source`], ["Verify benefits for this service and setting.", "Do not collect until verified."]);
  }
  c.fire("PLAN-BEN-001", `Benefits verified (${b.benefitsSource ?? "source recorded"}).`);

  if (b.serviceCovered === "no") {
    c.explanation.push("The plan reports this service is not covered. The patient may be responsible, but notices/waivers and a cost estimate are required first.");
    c.escalate("Non-covered service.");
    c.nextSteps.push("Do not collect at registration.", "Refer to a supervisor/financial counseling for a non-covered-service notice and estimate.");
    return c.done("supervisor_review", "refer_financial_counseling", "Supervisor review — service not covered by the plan");
  }
  if (b.serviceCovered === "unknown") {
    return c.unable("Whether this service is covered has not been confirmed.", ["Coverage of this specific service"], ["Confirm the service is covered."]);
  }

  // Advisory: authorization
  if (b.authRequired === "yes" && !b.authOnFile) {
    c.fire("OPS-AUTH-001", "Authorization required, not on file.");
    c.warnings.push("The plan requires authorization/referral for this service and none is on file. Missing authorization can lead to a denial.");
    c.nextSteps.push("Obtain or confirm the authorization/referral before the service.");
  }

  const oop = b.oopRemainingCents;
  if (oop === 0) {
    c.calculation.push({ label: "Remaining out-of-pocket maximum (verified)", amountCents: 0, source: b.benefitsSource });
    c.explanation.push("The patient has met their out-of-pocket maximum for the plan year.");
    c.nextSteps.push("Do not collect.");
    return c.done("no_collection", "no_collection", "No collection — out-of-pocket maximum met");
  }

  if (b.copayApplies === "unknown") {
    return c.unable("It is not confirmed whether a copay applies to this service. Not every service has a copay.", ["Whether a copay applies to this service"], ["Verify the benefit for this service type."]);
  }

  if (b.copayApplies === "yes") {
    if (b.copayCents == null) {
      return c.unable("A copay applies but the amount has not been verified.", ["Verified copay amount for this service"], ["Verify the copay amount."]);
    }
    if (v.setting === "emergency" && b.copaySetting !== "emergency") {
      c.fire("PLAN-BEN-002", `Copay on file is for '${b.copaySetting ?? "unspecified"}', not emergency.`);
      return c.unable(`The copay on file (${formatCents(b.copayCents)}) is for ${b.copaySetting ? b.copaySetting.replace("_", " ") : "an unspecified setting"}, not the emergency room. An office copay never applies to an ED visit.`, ["Verified emergency-room copay"], ["Verify the plan's emergency-room benefit."]);
    }
    if (b.copaySetting && b.copaySetting !== v.setting && v.setting !== "emergency") {
      return c.unable(`The copay on file is for ${b.copaySetting.replace("_", " ")}, but this visit is ${v.setting.replace("_", " ")}.`, [`Verified copay for ${v.setting.replace("_", " ")}`], ["Verify the copay for this setting."]);
    }
    if (v.setting === "emergency") c.fire("PLAN-BEN-002", "Verified emergency-room copay used.");
    const r = applyCopay(b.copayCents, oop);
    c.calculation.push(...r.steps.map((s) => ({ ...s, source: s.source ?? b.benefitsSource })));
    if (b.deductibleApplies === "yes") {
      c.warnings.push("The deductible also applies to this service. Only the verified copay is requested now; any deductible amount is billed after adjudication.");
    }
    const credit = creditPreviouslyCollected(r.totalCents, v.previouslyCollectedCents);
    if (v.previouslyCollectedCents > 0) c.fire("OPS-CALC-002", `${formatCents(v.previouslyCollectedCents)} already collected credited.`);
    c.calculation.push(...credit.steps);
    c.explanation.push(`${planLabel(p)} has a verified ${formatCents(b.copayCents)} copay for this ${v.setting === "emergency" ? "emergency" : v.serviceCategory.replace("_", " ")} service.`);
    if (credit.creditCents > 0) {
      c.escalate("Collected more than the verified copay.");
      c.nextSteps.push("Do not collect.", "Route to billing to review the overpayment.");
      return c.done("supervisor_review", "refer_billing_review", "Overpayment — refer to billing");
    }
    if (credit.dueCents === 0) {
      c.explanation.push("The copay for this encounter has already been collected.");
      c.nextSteps.push("Do not collect again.");
      return c.done("no_collection", "no_collection", "Copay already collected — nothing more to collect");
    }
    if (b.estimateOnly) {
      c.explanation.push("The payer returned this amount as an estimate, not a confirmed benefit.");
      return estimateGate(c, credit.dueCents, `Payer estimate — ${b.benefitsSource ?? planLabel(p)}`);
    }
    c.nextSteps.push(`Ask for the ${formatCents(credit.dueCents)} copay.`, "Explain this is the copay only; any deductible or coinsurance is billed after the claim is processed.");
    return threshold(c, c.done("verified_amount", "collect_verified_copay", `Collect verified copay: ${formatCents(credit.dueCents)}`, { cents: credit.dueCents, kind: "verified", source: b.benefitsSource ?? planLabel(p) }));
  }

  // No copay → deductible / coinsurance
  if (b.deductibleApplies === "unknown" || b.deductibleRemainingCents == null || b.coinsuranceBp == null) {
    return c.unable("This service has no fixed copay. The patient's share depends on the deductible and coinsurance, which are not fully verified.", [
      ...(b.deductibleApplies === "unknown" ? ["Whether the deductible applies"] : []),
      ...(b.deductibleRemainingCents == null ? ["Remaining deductible"] : []),
      ...(b.coinsuranceBp == null ? ["Coinsurance %"] : []),
    ], ["Verify deductible and coinsurance for this service."]);
  }
  const dedRemaining = b.deductibleApplies === "yes" ? b.deductibleRemainingCents : 0;
  if (dedRemaining === 0 && b.coinsuranceBp === 0) {
    c.explanation.push("No copay, no remaining deductible, and 0% coinsurance for this service.");
    c.nextSteps.push("Do not collect.");
    return c.done("no_collection", "no_collection", "No patient cost-sharing expected for this service");
  }
  const allowed = v.allowedAmountEstimateCents;
  c.explanation.push("This plan uses a deductible and/or coinsurance for this service instead of a copay. A deductible is not a copay, and coinsurance is a percentage — the final amount is set when the plan processes the claim.");
  if (allowed == null) {
    return estimateGate(c, null, "Deductible + coinsurance");
  }
  const r = estimateDeductibleCoinsurance({ allowedCents: allowed, deductibleRemainingCents: dedRemaining, coinsuranceBp: b.coinsuranceBp, oopRemainingCents: oop, source: "Facility allowed-amount estimate" });
  c.calculation.push(...r.steps);
  const credit = creditPreviouslyCollected(r.totalCents, v.previouslyCollectedCents);
  if (v.previouslyCollectedCents > 0) {
    c.fire("OPS-CALC-002", "Already collected credited.");
    c.calculation.push(...credit.steps);
  }
  return estimateGate(c, credit.dueCents, "Estimate: deductible + coinsurance on facility allowed-amount estimate");
}

// ═══════════════════════════ shared gates ═══════════════════════════

function estimateGate(c: Ctx, estimateCents: number | null, source: string): Decision {
  const allow = paramValue(c.rule("FAC-EST-001"), "allowEstimateCollection", false);
  c.fire("FAC-EST-001", allow ? "Facility allows collecting estimates." : "Facility does not collect estimates at registration.");
  if (estimateCents === null) {
    c.missing.push("Facility allowed-amount estimate for this service");
    c.nextSteps.push("Do not collect a dollar amount now.", allow ? "Obtain a facility estimate if the patient wants one." : "Bill after the claim is processed.");
    return c.done("awaiting_adjudication", "wait_for_adjudication", "Amount to collect now: not determined — wait for the claim to process");
  }
  if (estimateCents === 0) {
    c.nextSteps.push("Do not collect.");
    return c.done("no_collection", "no_collection", "No collection recommended — estimate is $0", { cents: 0, kind: "estimate", source });
  }
  if (allow) {
    c.nextSteps.push(`You may request the estimated ${formatCents(estimateCents)}. Tell the patient it is an estimate and the final bill may differ.`, "Record it as a deposit toward the estimate, not as a paid balance.");
    return threshold(c, c.done("estimate_only", "collect_estimate_per_policy", `Estimated amount only: ${formatCents(estimateCents)}`, { cents: estimateCents, kind: "estimate", source }));
  }
  c.nextSteps.push("Share the estimate if the patient asks, but do not collect it.", "Bill after the claim is processed.");
  return c.done("estimate_only", "wait_for_adjudication", `Estimated amount only: ${formatCents(estimateCents)} — not collected per facility policy`, { cents: estimateCents, kind: "estimate", source });
}

function threshold(c: Ctx, d: Decision): Decision {
  const r = c.rule("FAC-REVIEW-001");
  if (!r || d.amountCents == null) return d;
  const t = paramValue(r, "thresholdCents", 50000);
  if (d.amountCents > t) {
    c.fire("FAC-REVIEW-001", `Amount exceeds the ${formatCents(t)} review threshold.`);
    d.supervisorReview = true;
    d.escalationReason = `Amount above the ${formatCents(t)} supervisor-review threshold.`;
    d.nextSteps.unshift("Get supervisor approval before asking the patient for this amount.");
    d.rulesApplied = [...c.applied].sort((a, b) => CATEGORY_PRECEDENCE[a.category] - CATEGORY_PRECEDENCE[b.category]);
  }
  return d;
}

export { COMMERCIAL_LIKE };
