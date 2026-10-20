import { formatCents } from "./calc";

/**
 * Quick copay lookup.
 *
 * The registrar adds the patient's coverages (any order), picks the visit type, and
 * answers only the questions this combination needs. Ledgr works out the payer order
 * from the standard rules and says how much to collect.
 *
 * Rule sources (summarized, not legal advice — validate in the rule library):
 *  - Medicare Secondary Payer: 42 U.S.C. 1395y(b); 42 CFR Part 411; CMS MSP Manual (Pub. 100-05),
 *    Ch. 3 model admission questionnaire.
 *  - Order of benefits between non-Medicare plans: NAIC Coordination of Benefits Model Regulation (MDL-120).
 *  - Medicaid payer of last resort (42 U.S.C. 1396a(a)(25)); IHS payer of last resort (25 U.S.C. 1623(b));
 *    QMB billing prohibition (42 U.S.C. 1396a(n)(3)(B)); TRICARE (10 U.S.C. 1079(j), 32 CFR 199.8);
 *    EMTALA (42 CFR 489.24(d)(4)); Medicare hospice (42 CFR Part 418).
 * Copay amounts come only from the plan library — a blank amount is never guessed.
 */

export type VisitType = "office" | "specialist" | "urgent_care" | "emergency" | "outpatient" | "imaging" | "lab" | "inpatient";

export const VISIT_TYPES: { value: VisitType; label: string }[] = [
  { value: "office", label: "Office / primary care" },
  { value: "specialist", label: "Specialist" },
  { value: "urgent_care", label: "Urgent care" },
  { value: "emergency", label: "Emergency department" },
  { value: "outpatient", label: "Outpatient procedure" },
  { value: "imaging", label: "Imaging" },
  { value: "lab", label: "Lab" },
  { value: "inpatient", label: "Inpatient admission" },
];

export type PlanKind =
  | "commercial"
  | "marketplace"
  | "medicare"
  | "medicare_advantage"
  | "medigap"
  | "medicaid"
  | "medicaid_mco"
  | "tricare"
  | "tricare_for_life"
  | "va"
  | "ihs"
  | "black_lung"
  | "workers_comp"
  | "auto"
  | "other";

export const PLAN_KINDS: { value: PlanKind; label: string }[] = [
  { value: "commercial", label: "Commercial / employer" },
  { value: "marketplace", label: "Marketplace (ACA)" },
  { value: "medicare", label: "Original Medicare" },
  { value: "medicare_advantage", label: "Medicare Advantage" },
  { value: "medigap", label: "Medicare Supplement (Medigap)" },
  { value: "medicaid", label: "Medicaid" },
  { value: "medicaid_mco", label: "Medicaid managed care" },
  { value: "tricare", label: "TRICARE" },
  { value: "tricare_for_life", label: "TRICARE For Life" },
  { value: "va", label: "VA" },
  { value: "ihs", label: "Indian Health Service / tribal" },
  { value: "black_lung", label: "Federal Black Lung Program" },
  { value: "workers_comp", label: "Workers' comp" },
  { value: "auto", label: "Auto / liability / no-fault" },
  { value: "other", label: "Other" },
];

export type MedicareParts = "A" | "B" | "AB";

export interface LibraryPlan {
  id: string;
  payer: string;
  name: string;
  kind: PlanKind;
  /** Original Medicare only: which parts the patient has. */
  medicare_parts?: MedicareParts | null;
  /** Employer group name, for commercial plans. */
  group_name?: string | null;
  /** Added at the desk; an admin should confirm the amounts. */
  needs_review?: boolean;
  /** cents per visit type; null/missing = not loaded */
  copays: Partial<Record<VisitType, number | null>>;
  ed_waived_if_admitted: boolean;
  notes?: string | null;
  example?: boolean;
  active?: boolean;
}

/** How the patient holds a group/individual plan (decides order between non-Medicare plans). */
export type Holder = "self_active" | "self_retired" | "self_cobra" | "spouse" | "child";

export interface MspAnswers {
  reason?: "age" | "disability" | "esrd";
  /** Patient or spouse currently working and covered through that job (not COBRA, not retiree). */
  working?: boolean;
  /** The employer plan is COBRA continuation. */
  cobra?: boolean;
  employerSize?: "under20" | "under20_multi" | "20to99" | "100plus";
  /** ESRD only: within the 30-month coordination period. */
  esrdFirst30Months?: boolean;
}

export interface QuickAnswers {
  edSeen?: boolean;
  admitted?: boolean;
  collectedCents?: number;
  /** Workers' comp / auto present: is this visit for that injury or accident? */
  accidentRelated?: boolean;
  /** Black Lung present: is this visit for the covered lung condition? */
  blackLungRelated?: boolean;
  /** Services paid by a government research program/grant. */
  researchProgram?: boolean;
  vaAuthorized?: boolean;
  hospice?: "no" | "related" | "unrelated" | "unknown";
  msp?: MspAnswers;
  medicaidLevel?: "qmb" | "partial" | "full" | "unknown";
  /** TRICARE present: is the patient an active-duty service member? */
  tricareActiveDuty?: boolean;
  /** Per plan id: how the patient holds it. */
  holder?: Record<string, Holder>;
  /** Child on two parents' plans: are the parents married/living together? */
  parentsTogether?: boolean;
  /** Plan id of the parent whose birthday (month/day) comes first in the year. */
  birthdayFirstPlanId?: string;
  /** Plan id named by a court order, or of the custodial parent if there is no order. */
  custodyPlanId?: string;
  /** Facility policy: collect the primary copay when a non-Medicaid secondary exists. */
  collectPrimaryWhenSecondary?: boolean;
}

export interface QuickInput extends QuickAnswers {
  /** Coverages in any order. */
  plans: LibraryPlan[];
  visit: VisitType;
}

export type QuickTone = "collect" | "none" | "check" | "ed";

export interface QuickResult {
  tone: QuickTone;
  amountCents: number | null;
  headline: string;
  reasons: string[];
  /** Payer order Ledgr worked out (labels), when it got that far. */
  order?: string[];
  sourcePlan?: string;
}

// ───────────────────────── helpers ─────────────────────────

const isMedicaid = (p: LibraryPlan) => p.kind === "medicaid" || p.kind === "medicaid_mco";
const isMedicare = (p: LibraryPlan) => p.kind === "medicare" || p.kind === "medicare_advantage";
const isHealthPlan = (p: LibraryPlan) => p.kind === "commercial" || p.kind === "marketplace" || p.kind === "other";
export const planLabel = (p: LibraryPlan) => `${p.payer} — ${p.name}`;
const visitLabel = (v: VisitType) => VISIT_TYPES.find((x) => x.value === v)!.label.toLowerCase();

function done(tone: QuickTone, amountCents: number | null, headline: string, reasons: string[], extra: Partial<QuickResult> = {}): QuickResult {
  return { tone, amountCents, headline, reasons, ...extra };
}
function withNote(r: QuickResult, ...notes: string[]): QuickResult {
  return { ...r, reasons: [...r.reasons, ...notes.filter(Boolean)] };
}

/** Does this part of Original Medicare cover this visit? Part A = inpatient facility; Part B = the rest. */
export function medicarePartCovers(parts: MedicareParts | null | undefined, visit: VisitType): boolean {
  if (!parts || parts === "AB") return true;
  return parts === "A" ? visit === "inpatient" : visit !== "inpatient";
}

// ───────────────────────── questions ─────────────────────────

export interface QuestionSet {
  edSeen: boolean;
  admitted: boolean;
  accidentRelated: boolean;
  blackLungRelated: boolean;
  researchProgram: boolean;
  vaAuthorized: boolean;
  hospice: boolean;
  msp: boolean;
  medicaidLevel: boolean;
  tricareActiveDuty: boolean;
  /** Plan ids that need a "whose plan is this?" answer. */
  holderFor: string[];
  /** Child on two parents' plans. */
  parentRules: boolean;
}

/** Which questions the screen should ask for this combination of coverages and visit. */
export function questionsNeeded(plans: LibraryPlan[], visit: VisitType, a: QuickAnswers = {}): QuestionSet {
  const has = (k: PlanKind) => plans.some((p) => p.kind === k);
  const medicare = plans.some(isMedicare);
  const healthPlans = plans.filter(isHealthPlan);
  const holderFor = healthPlans.length >= 2 ? healthPlans.map((p) => p.id) : [];
  const childPlans = healthPlans.filter((p) => a.holder?.[p.id] === "child");
  return {
    edSeen: visit === "emergency",
    admitted: visit === "emergency" && !!a.edSeen,
    accidentRelated: has("workers_comp") || has("auto"),
    blackLungRelated: has("black_lung"),
    researchProgram: medicare,
    vaAuthorized: has("va"),
    hospice: medicare,
    msp: medicare && healthPlans.length > 0,
    medicaidLevel: medicare && plans.some(isMedicaid),
    tricareActiveDuty: has("tricare") && medicare,
    holderFor,
    parentRules: childPlans.length >= 2,
  };
}

// ───────────────────────── main ─────────────────────────

export function quickCopay(input: QuickInput): QuickResult {
  const v = input.visit;
  let plans = input.plans.filter(Boolean);
  const notes: string[] = [];

  // 1. ED: nothing before the patient is seen (EMTALA).
  if (v === "emergency" && !input.edSeen) {
    return done("ed", null, "Don't ask for payment yet", [
      "This is an ER visit and the patient hasn't been seen yet.",
      "Federal law (EMTALA) doesn't allow screening or treatment to be delayed for payment or insurance questions. Collect after the patient is seen, or at discharge.",
    ]);
  }

  // 2. No coverage.
  if (plans.length === 0) {
    return done("check", null, "No insurance entered — refer to financial counseling", [
      "Ask whether the patient has any coverage (Medicaid, Medicare, a parent's or spouse's plan, VA, TRICARE).",
      "If not, refer to financial counseling for coverage screening and financial assistance.",
    ]);
  }

  // 3. Programs that pay first for a specific cause of the visit.
  const carrier = plans.find((p) => p.kind === "workers_comp" || p.kind === "auto");
  if (carrier) {
    if (input.accidentRelated === undefined) {
      return done("check", null, "Is this visit for the injury or accident?", [`${planLabel(carrier)} only pays for care related to that injury or accident.`]);
    }
    if (input.accidentRelated) {
      const others = plans.filter((p) => p.kind !== "workers_comp" && p.kind !== "auto");
      return done("none", 0, "Don't collect — bill the accident carrier", [
        `${planLabel(carrier)} pays first for care related to the ${carrier.kind === "workers_comp" ? "work injury" : "accident"}, so no health-plan copay is collected.`,
        "Get the carrier name, claim number, adjuster contact, and date of injury or accident.",
        ...(others.length
          ? [
              `Keep ${others.map(planLabel).join(" and ")} on file as secondary.${
                others.some(isMedicare)
                  ? " If the carrier won't pay promptly, Medicare may make a conditional payment — billing handles that."
                  : " If the carrier denies, billing can send the claim to the health plan with the accident details."
              }`,
            ]
          : []),
      ]);
    }
    notes.push(`${planLabel(carrier)} isn't used — this visit isn't for that injury or accident.`);
    plans = plans.filter((p) => p !== carrier);
  }

  const blackLung = plans.find((p) => p.kind === "black_lung");
  if (blackLung) {
    if (input.blackLungRelated === undefined) {
      return done("check", null, "Is this visit for the patient's black lung condition?", ["The Federal Black Lung Program pays first only for the covered lung condition."]);
    }
    if (input.blackLungRelated) {
      return done("none", 0, "Don't collect — bill the Black Lung Program", ["The Federal Black Lung Program pays first for treatment of the covered lung condition. Medicare and other plans pay for unrelated care."]);
    }
    notes.push("Black Lung Program isn't used — this visit isn't for the covered lung condition.");
    plans = plans.filter((p) => p !== blackLung);
  }

  if (plans.some(isMedicare) && input.researchProgram) {
    return done("none", 0, "Don't collect — bill the research program", ["A government research program or grant is paying for these services, so it pays first. Get the research program's billing details."]);
  }

  const va = plans.find((p) => p.kind === "va");
  if (va) {
    if (input.vaAuthorized) {
      return done("none", 0, "Don't collect — bill VA", [
        "VA authorized this visit. Bill VA under the authorization, and don't bill the patient's other insurance or collect a copay. VA handles any veteran copays.",
        "VA and Medicare don't coordinate: for VA-authorized care, VA pays.",
      ]);
    }
    plans = plans.filter((p) => p !== va);
    if (!plans.length) {
      return done("check", null, "No VA authorization — VA won't pay for this visit", [
        "VA only pays for outside care it has authorized. Ask the patient for a VA referral, or treat as self-pay and refer to financial counseling.",
      ]);
    }
    notes.push("VA benefits aren't used — there's no VA authorization for this visit, so the patient's other coverage is billed.");
  }

  // 4. Hospice (Original Medicare pays hospice even for Medicare Advantage members).
  if (plans.some(isMedicare)) {
    if (input.hospice === "related") {
      return done("none", 0, "Don't collect — call the hospice agency", [
        "The patient is on hospice and this visit is related to the terminal illness. The hospice agency is responsible for it, not Medicare or the Medicare Advantage plan.",
        "Contact the hospice agency before non-emergency services and get their authorization.",
      ]);
    }
    if (input.hospice === "unknown") {
      return done("check", null, "Ask whether this visit is related to the hospice diagnosis", [
        "Hospice care related to the terminal illness is billed to the hospice agency. Unrelated care is billed as usual (to Original Medicare, or to the Medicare Advantage plan).",
      ]);
    }
    if (input.hospice === "unrelated") notes.push("Patient is on hospice; this visit is unrelated to the hospice diagnosis, so it's billed as usual.");
  }

  // 5. Structural checks.
  if (plans.some((p) => p.kind === "medigap") && plans.some((p) => p.kind === "medicare_advantage")) {
    return done("check", null, "Check coverage — Medigap doesn't work with Medicare Advantage", ["A Medicare Supplement doesn't pay with a Medicare Advantage plan. Confirm which Medicare coverage is active."]);
  }
  if (plans.some((p) => p.kind === "medigap") && !plans.some((p) => p.kind === "medicare")) {
    return done("check", null, "Check coverage — a supplement needs Original Medicare", ["A Medicare Supplement only pays after Original Medicare. Confirm the patient's Medicare is active."]);
  }
  if (plans.filter(isMedicare).length > 1) {
    return done("check", null, "Check coverage — two Medicare plans", ["A patient has either Original Medicare or a Medicare Advantage plan, not both. Confirm which is active."]);
  }

  // 6. Work out the payer order.
  const ordered = orderCoverages(plans, input);
  if ("problem" in ordered) return withNote(ordered.problem, ...notes);

  // 7. Decide the amount from the primary and what follows it.
  const r = amountFor(ordered.order, input);
  return { ...withNote(r, ...ordered.why, ...notes), order: ordered.order.map(planLabel) };
}

// ───────────────────────── payer order ─────────────────────────

type OrderResult = { order: LibraryPlan[]; why: string[] } | { problem: QuickResult };

function orderCoverages(plans: LibraryPlan[], a: QuickInput): OrderResult {
  const why: string[] = [];
  const medicare = plans.find(isMedicare);
  const medigap = plans.find((p) => p.kind === "medigap");
  const tfl = plans.find((p) => p.kind === "tricare_for_life");
  const tricare = plans.find((p) => p.kind === "tricare");
  const medicaid = plans.filter(isMedicaid);
  const ihs = plans.filter((p) => p.kind === "ihs");
  let health = plans.filter(isHealthPlan);

  // Order the non-Medicare health plans among themselves (NAIC).
  if (health.length > 1) {
    const res = orderHealthPlans(health, a);
    if ("problem" in res) return res;
    health = res.order;
    why.push(...res.why);
  }

  let front: LibraryPlan[];

  if (medicare) {
    // Part A only / Part B only: if Medicare doesn't cover this visit, it drops out.
    const covers = medicare.kind === "medicare_advantage" || medicarePartCovers(medicare.medicare_parts, a.visit);
    if (!covers) {
      const missing = medicare.medicare_parts === "A" ? "Part B" : "Part A";
      why.push(
        `Patient has Medicare ${medicare.medicare_parts === "A" ? "Part A only (hospital)" : "Part B only (outpatient/medical)"}; this ${visitLabel(a.visit)} visit needs ${missing}, so Medicare doesn't pay for it.`,
      );
      if (!health.length && !medicaid.length && !tricare && !ihs.length) {
        return { problem: done("check", null, `Medicare won't cover this — patient has no ${missing}`, [...why, "Ask about other coverage, or refer to financial counseling."]) };
      }
      front = [...health, ...(tricare ? [tricare] : [])];
    } else {
      // Medicare vs employer plan (MSP).
      let ghpFirst = false;
      if (health.length) {
        const msp = mspGhpPrimary(a.msp);
        if (msp.result === null) {
          return {
            problem: done("check", null, "Finish the Medicare questions to know who pays first", [
              "The patient has Medicare and another health plan. Who pays first comes from the Medicare Secondary Payer questions — not from age, card order, or which copay is higher.",
              msp.why,
            ]),
          };
        }
        ghpFirst = msp.result;
        why.push(msp.why);
      }
      // Medicare vs TRICARE.
      if (tricare) {
        if (a.tricareActiveDuty === undefined) {
          return { problem: done("check", null, "Is the patient on active duty?", ["With Medicare and TRICARE, TRICARE pays first only for active-duty service members."]) };
        }
        why.push(a.tricareActiveDuty ? "Active-duty service member: TRICARE pays before Medicare." : "Not active duty: Medicare pays before TRICARE.");
      }
      if (tfl) why.push("TRICARE For Life pays after Medicare.");
      const medGroup = [medicare, ...(medigap ? [medigap] : [])];
      front = [
        ...(tricare && a.tricareActiveDuty ? [tricare] : []),
        ...(ghpFirst ? health : []),
        ...medGroup,
        ...(ghpFirst ? [] : health),
        ...(tricare && !a.tricareActiveDuty ? [tricare] : []),
        ...(tfl ? [tfl] : []),
      ];
    }
  } else {
    if (tricare && health.length) why.push("TRICARE pays after other health insurance.");
    front = [...health, ...(tricare ? [tricare] : []), ...(tfl ? [tfl] : [])];
  }

  if (medicaid.length && front.length) why.push("Medicaid pays after all other coverage.");
  if (ihs.length && (front.length || medicaid.length)) why.push("Indian Health Service pays last, after Medicaid.");
  const order = [...front, ...medicaid, ...ihs];
  if (!order.length) return { problem: done("check", null, "No usable coverage for this visit", ["None of the coverages entered pay for this visit. Refer to financial counseling."]) };
  return { order, why };
}

function mspGhpPrimary(msp: MspAnswers | undefined): { result: boolean | null; why: string } {
  if (!msp?.reason) return { result: null, why: "Answer why the patient has Medicare (age, disability or kidney failure)." };
  if (msp.reason === "esrd") {
    if (msp.esrdFirst30Months === undefined) return { result: null, why: "Answer whether the patient is in the 30-month kidney failure coordination period." };
    return msp.esrdFirst30Months
      ? { result: true, why: "Kidney failure (ESRD), within the 30-month coordination period: the employer plan pays first — this includes COBRA and retiree plans." }
      : { result: false, why: "Kidney failure (ESRD), after the 30-month coordination period: Medicare pays first." };
  }
  if (msp.cobra) return { result: false, why: "The employer plan is COBRA continuation, so Medicare pays first." };
  if (msp.working === undefined) return { result: null, why: "Answer whether the patient or spouse is currently working and covered by that employer's plan." };
  if (!msp.working) return { result: false, why: "The plan isn't from current employment (for example retiree coverage), so Medicare pays first." };
  if (!msp.employerSize) return { result: null, why: "Answer how many employees the employer has." };
  const multi =
    msp.employerSize === "under20_multi" ? " (a multi-employer or union plan counts the larger employers — confirm the plan hasn't been granted a small-employer exception)" : "";
  if (msp.reason === "age") {
    return msp.employerSize === "under20"
      ? { result: false, why: "Age 65+, employer under 20 employees: Medicare pays first." }
      : { result: true, why: `Age 65+, currently working, employer 20+ employees: the employer plan pays first${multi}.` };
  }
  return msp.employerSize === "100plus" || msp.employerSize === "under20_multi"
    ? { result: true, why: `Disability, currently working, employer 100+ employees: the employer plan pays first${multi}.` }
    : { result: false, why: "Disability, employer under 100 employees: Medicare pays first." };
}

const HOLDER_RANK: Record<Holder, number> = { self_active: 0, self_retired: 1, spouse: 2, child: 2, self_cobra: 3 };
const HOLDER_TEXT: Record<Holder, string> = {
  self_active: "covers the patient as an active employee",
  self_retired: "covers the patient as a retiree or laid-off employee",
  self_cobra: "is COBRA continuation",
  spouse: "covers the patient as a spouse/dependent",
  child: "covers the patient as a child/dependent",
};

function orderHealthPlans(plans: LibraryPlan[], a: QuickInput): { order: LibraryPlan[]; why: string[] } | { problem: QuickResult } {
  const holder = a.holder ?? {};
  const missing = plans.filter((p) => !holder[p.id]);
  if (missing.length) {
    return {
      problem: done("check", null, "Answer whose plan each one is", [
        "With more than one health plan, the order depends on how the patient is covered on each (employee, retiree, COBRA, spouse, or child) — not on card order or which copay is higher.",
        ...missing.map((p) => `Missing: ${planLabel(p)}.`),
      ]),
    };
  }
  const why: string[] = [];
  const kids = plans.filter((p) => holder[p.id] === "child");
  if (kids.length >= 2) {
    if (a.parentsTogether === undefined) {
      return { problem: done("check", null, "Are the child's parents married or living together?", ["For a child on both parents' plans, the rule depends on whether the parents are together or separated."]) };
    }
    let first: LibraryPlan | undefined;
    if (a.parentsTogether) {
      first = kids.find((p) => p.id === a.birthdayFirstPlanId);
      if (!first) {
        return { problem: done("check", null, "Whose birthday comes first in the year?", ["Birthday rule: the plan of the parent whose birthday (month and day, not year) comes first in the calendar year pays first."]) };
      }
      why.push(`Birthday rule: ${planLabel(first)} belongs to the parent whose birthday comes first in the year, so it pays first.`);
    } else {
      first = kids.find((p) => p.id === a.custodyPlanId);
      if (!first) {
        return {
          problem: done("check", null, "Which parent's plan pays first?", [
            "Parents separated or divorced: a court order naming who provides health coverage decides it. With no order: the custodial parent's plan, then the custodial parent's spouse, then the other parent. Joint custody with no order uses the birthday rule.",
          ]),
        };
      }
      why.push(`Separated parents: ${planLabel(first)} is named by the court order or belongs to the custodial parent, so it pays first. Verify with both plans.`);
    }
    const others = plans.filter((p) => p !== first).sort((x, y) => HOLDER_RANK[holder[x.id]] - HOLDER_RANK[holder[y.id]]);
    return { order: [first, ...others], why };
  }
  const sorted = [...plans].sort((x, y) => HOLDER_RANK[holder[x.id]] - HOLDER_RANK[holder[y.id]]);
  if (HOLDER_RANK[holder[sorted[0].id]] === HOLDER_RANK[holder[sorted[1].id]]) {
    return {
      problem: done("check", null, "Confirm the order with both plans", [
        "Both plans cover the patient the same way, so the standard rules don't settle it (usually the plan that has covered the patient longer pays first). Confirm with the payers.",
      ]),
    };
  }
  why.push(`${planLabel(sorted[0])} ${HOLDER_TEXT[holder[sorted[0].id]]}, so it pays before ${sorted.slice(1).map(planLabel).join(" and ")}.`);
  return { order: sorted, why };
}

// ───────────────────────── amount ─────────────────────────

function amountFor(order: LibraryPlan[], a: QuickInput): QuickResult {
  const [primary, ...rest] = order;
  const secondary = rest[0];
  const medicaidBehind = rest.some(isMedicaid);
  const medicareInvolved = order.some(isMedicare);

  // Medicare + Medicaid (dual eligible): depends on the Medicaid level.
  if (medicareInvolved && medicaidBehind) {
    const level = a.medicaidLevel ?? "unknown";
    if (level === "unknown") {
      return done("check", null, "Check the patient's Medicaid level", [
        "With Medicare and Medicaid, what the patient can be charged depends on the Medicaid level on the eligibility response: QMB, a partial program (SLMB, QI), or full Medicaid.",
      ]);
    }
    if (level === "qmb") {
      return done("none", 0, "Don't collect — patient is QMB", [
        "QMB (Qualified Medicare Beneficiary): federal law doesn't allow billing the patient for Medicare deductibles, coinsurance or copays.",
        "Make sure the QMB indicator is on the account so no statement goes out.",
      ]);
    }
    if (level === "full") {
      return done("none", 0, "Don't collect — Medicaid is secondary", ["Full Medicaid pays after Medicare. The patient can only be charged Medicaid's own copay, if any — nothing at the desk."]);
    }
    // partial (SLMB/QI): Medicaid only pays the Part B premium → treat as if Medicaid weren't there.
    const withoutMedicaid = order.filter((p) => !isMedicaid(p));
    return withNote(amountFor(withoutMedicaid, a), "Partial Medicaid (SLMB/QI) only helps pay the Medicare premium, so it doesn't cover cost-sharing.");
  }

  // Any other coverage with Medicaid behind it: nothing at the desk.
  if (medicaidBehind) {
    return done("none", 0, "Don't collect — Medicaid is secondary", [
      "Medicaid pays after the other coverage. A provider that accepts Medicaid can't charge the patient more than Medicaid's own copay, so nothing is collected at the desk.",
    ]);
  }

  // Original Medicare primary.
  if (primary.kind === "medicare") {
    if (secondary?.kind === "medigap") return collectCopay(secondary, a, ["Medicare pays first; the supplement covers the rest of Medicare's cost-sharing."]);
    if (secondary?.kind === "tricare_for_life") {
      return done("none", 0, "Nothing to collect", ["Medicare pays first and TRICARE For Life covers Medicare's deductible and coinsurance for covered services."]);
    }
    if (secondary) {
      return done("none", 0, "Nothing to collect — Medicare pays first", [
        `Original Medicare has no copay. ${planLabel(secondary)} pays after Medicare and usually picks up some or all of the rest. Any balance is billed after both process the claim.`,
      ]);
    }
    return done("none", 0, "Nothing to collect", ["Original Medicare has no copay. Any deductible or 20% coinsurance is billed after Medicare processes the claim."]);
  }

  if (isMedicaid(primary)) {
    return collectCopay(primary, a, ["Many Medicaid patients and services are exempt from copays (for example children, pregnancy, emergencies). Check the eligibility response before collecting."]);
  }
  if (primary.kind === "ihs") {
    return done("none", 0, "Don't collect — Indian Health Service", ["IHS and tribal programs don't charge patients. Bill IHS under its purchased/referred care authorization if there is one."]);
  }
  if (primary.kind === "tricare_for_life") {
    return done("check", null, "Check Medicare — TRICARE For Life pays after Medicare", ["TRICARE For Life requires Medicare Part A and B and pays second. Verify the patient's Medicare."]);
  }

  // Commercial / marketplace / Medicare Advantage / TRICARE / other primary.
  if (secondary) {
    if (secondary.kind === "medigap") return collectCopay(secondary, a);
    if (a.collectPrimaryWhenSecondary) {
      return collectCopay(primary, a, [`Facility policy: collect the primary plan's copay even with secondary coverage. Never add ${planLabel(secondary)}'s copay to it.`]);
    }
    return done("none", 0, "Don't collect — the secondary plan may cover it", [
      `${planLabel(secondary)} pays after ${planLabel(primary)} and may cover the primary copay. The patient's share is billed after both plans process the claim.`,
      "Never add the two copays together or collect the higher one.",
    ]);
  }
  return collectCopay(primary, a);
}

/** Apply the copay from a plan, after admission waivers and anything already collected. */
function collectCopay(p: LibraryPlan, a: QuickInput, extra: string[] = []): QuickResult {
  const v = a.visit;
  const amt = p.copays[v];
  if (amt === null || amt === undefined) {
    return done("check", null, "Copay not loaded — check the card or eligibility", [
      `No ${visitLabel(v)} copay is loaded for ${planLabel(p)}.`,
      "Check the insurance card or eligibility response, then add it to the plan library so it's there next time.",
      ...extra,
    ]);
  }
  if (v === "emergency" && a.admitted && p.ed_waived_if_admitted) {
    return done("none", 0, "Don't collect — ER copay waived on admission", [`${planLabel(p)} waives the ER copay when the patient is admitted.`, ...extra], { sourcePlan: planLabel(p) });
  }
  if (amt === 0) {
    return done("none", 0, "Nothing to collect", [`${planLabel(p)} has a $0 ${visitLabel(v)} copay.`, ...(p.notes ? [p.notes] : []), ...extra], { sourcePlan: planLabel(p) });
  }
  const already = a.collectedCents ?? 0;
  const due = Math.max(0, amt - already);
  const reasons = [`${planLabel(p)} ${visitLabel(v)} copay is ${formatCents(amt)}.`, ...extra];
  if (p.example) reasons.push("This is an EXAMPLE plan — replace its amounts with real ones in the plan library.");
  if (p.needs_review) reasons.push("This plan was added at the desk and hasn't been confirmed by an admin yet.");
  if (already > 0) reasons.push(`${formatCents(already)} already collected for this visit.`);
  if (due === 0) return done("none", 0, "Already collected — nothing more to collect", reasons, { sourcePlan: planLabel(p) });
  return done("collect", due, `Collect ${formatCents(due)}`, reasons, { sourcePlan: planLabel(p) });
}
