import { describe, expect, it } from "vitest";
import { SCENARIOS, plan } from "../src/data/scenarios";
import { evaluate } from "../src/engine/engine";
import { SEED_RULES } from "../src/engine/rules";
import { UNABLE_TO_DETERMINE, type Encounter, type RuleDefinition } from "../src/engine/types";

const rules = SEED_RULES;

describe("Section 15 scenarios (fictitious demo data)", () => {
  for (const s of SCENARIOS) {
    it(`#${s.number} ${s.title}`, () => {
      const d = evaluate(s.encounter, rules);
      expect(d.status, `status — headline: ${d.headline}`).toBe(s.expected.status);
      expect(d.action).toBe(s.expected.action);
      expect(d.amountCents).toBe(s.expected.amountCents);
      if (s.expected.amountKind !== undefined) expect(d.amountKind).toBe(s.expected.amountKind);
      expect(d.supervisorReview).toBe(s.expected.supervisorReview);
      const ids = d.rulesApplied.map((r) => r.ruleId);
      for (const r of s.expected.rules) expect(ids, `rule ${r}`).toContain(r);
      const text = d.explanation.join(" ").toLowerCase();
      for (const e of s.expected.explains) expect(text, `explanation should mention "${e}"`).toContain(e.toLowerCase());
      // Every result must carry an explanation and a next step.
      expect(d.explanation.length).toBeGreaterThan(0);
      expect(d.nextSteps.length).toBeGreaterThan(0);
      // Escalation must carry a reason.
      if (d.supervisorReview) expect(d.escalationReason).toBeTruthy();
      // Amounts always carry a source and kind.
      if (d.amountCents !== null) {
        expect(d.amountSource).toBeTruthy();
        expect(d.amountKind).not.toBeNull();
      }
    });
  }
});

describe("Global safeguards", () => {
  it("never returns a verified amount without a verified source", () => {
    for (const s of SCENARIOS) {
      const d = evaluate(s.encounter, rules);
      if (d.amountKind === "verified") expect(d.amountSource).toBeTruthy();
    }
  });

  it("verification-required results never carry a dollar amount", () => {
    for (const s of SCENARIOS) {
      const d = evaluate(s.encounter, rules);
      if (d.status === "verification_required") {
        expect(d.amountCents).toBeNull();
        expect(d.headline === UNABLE_TO_DETERMINE || d.headline.length > 0).toBe(true);
      }
    }
  });

  it("ED pre-screening never produces an amount or payment step, whatever the coverage", () => {
    const base = SCENARIOS.find((s) => s.id === "s26")!.encounter;
    for (const phase of ["pre_screening", "screening_or_stabilizing", undefined] as const) {
      const e: Encounter = { ...base, visit: { ...base.visit, edPhase: phase } };
      const d = evaluate(e, rules);
      expect(d.status).toBe("ed_workflow");
      expect(d.amountCents).toBeNull();
      expect(d.nextSteps.join(" ").toLowerCase()).toContain("do not ask about payment");
    }
  });

  it("ED pre-screening gate holds for self-pay and terminated coverage too", () => {
    const e: Encounter = { ...SCENARIOS[0].encounter, visit: { ...SCENARIOS[0].encounter.visit, setting: "emergency", edPhase: "pre_screening" }, plans: [] };
    expect(evaluate(e, rules).status).toBe("ed_workflow");
  });

  it("federal-law rules cannot be disabled", () => {
    const disabled: RuleDefinition[] = rules.map((r) => (r.id === "FED-EMTALA-001" || r.id === "FED-MCD-002" ? { ...r, enabled: false } : r));
    expect(evaluate(SCENARIOS.find((s) => s.id === "s03")!.encounter, disabled).status).toBe("ed_workflow");
    expect(evaluate(SCENARIOS.find((s) => s.id === "s07")!.encounter, disabled).status).toBe("no_collection");
  });

  it("does not let card order or the higher copay decide the primary", () => {
    // Secondary has the higher copay; order unconfirmed.
    const e: Encounter = {
      ...SCENARIOS[0].encounter,
      id: "x-order",
      plans: [
        plan({ payerName: "Plan A", type: "commercial_employer", payerOrder: 1, payerOrderConfirmed: false, benefits: { copayApplies: "yes", copayCents: 2000 } }),
        plan({ payerName: "Plan B", type: "commercial_employer", payerOrder: 2, payerOrderConfirmed: false, benefits: { copayApplies: "yes", copayCents: 9000 } }),
      ],
    };
    const d = evaluate(e, rules);
    expect(d.status).toBe("verification_required");
    expect(d.amountCents).toBeNull();
  });

  it("collects only the primary copay (never stacked) when facility policy allows and downstream verified not to cover it", () => {
    const allow = rules.map((r) => (r.id === "FAC-SEC-001" ? { ...r, params: r.params.map((p) => ({ ...p, value: true })) } : r));
    const e: Encounter = {
      ...SCENARIOS[0].encounter,
      id: "x-stack",
      plans: [
        plan({ payerName: "Plan A", type: "commercial_employer", payerOrder: 1, benefits: { copayApplies: "yes", copayCents: 3000, copaySetting: "office" } }),
        plan({ payerName: "Plan B", type: "commercial_employer", payerOrder: 2, benefits: { copayApplies: "yes", copayCents: 5000, copaySetting: "office", coversPriorCostShare: "no" } }),
      ],
    };
    const d = evaluate(e, allow);
    expect(d.status).toBe("verified_amount");
    expect(d.amountCents).toBe(3000); // not 8000, not 5000
  });

  it("subtracts already-collected amounts and flags overpayments for billing review", () => {
    const s22 = SCENARIOS.find((s) => s.id === "s22")!.encounter;
    const partial = evaluate({ ...s22, visit: { ...s22.visit, previouslyCollectedCents: 2000 } }, rules);
    expect(partial.amountCents).toBe(2500);
    const over = evaluate({ ...s22, visit: { ...s22.visit, previouslyCollectedCents: 6000 } }, rules);
    expect(over.status).toBe("supervisor_review");
    expect(over.amountCents).toBeNull();
  });

  it("caps a copay at the remaining out-of-pocket maximum and stops at $0 OOP", () => {
    const s01 = SCENARIOS[0].encounter;
    const capped = evaluate({ ...s01, plans: [{ ...s01.plans[0], benefits: { ...s01.plans[0].benefits, oopRemainingCents: 1500 } }] }, rules);
    expect(capped.amountCents).toBe(1500);
    const met = evaluate({ ...s01, plans: [{ ...s01.plans[0], benefits: { ...s01.plans[0].benefits, oopRemainingCents: 0 } }] }, rules);
    expect(met.status).toBe("no_collection");
  });

  it("supervisor threshold flags large verified amounts without changing them", () => {
    const s26 = SCENARIOS.find((s) => s.id === "s26")!.encounter;
    const big = evaluate({ ...s26, plans: [{ ...s26.plans[0], benefits: { ...s26.plans[0].benefits, copayCents: 75000 } }] }, rules);
    expect(big.status).toBe("verified_amount");
    expect(big.amountCents).toBe(75000);
    expect(big.supervisorReview).toBe(true);
  });

  it("estimate collection becomes an allowed action only when facility policy enables it", () => {
    const allow = rules.map((r) => (r.id === "FAC-EST-001" ? { ...r, params: r.params.map((p) => ({ ...p, value: true })) } : r));
    const d = evaluate(SCENARIOS.find((s) => s.id === "s18")!.encounter, allow);
    expect(d.status).toBe("estimate_only");
    expect(d.action).toBe("collect_estimate_per_policy");
    expect(d.amountKind).toBe("estimate");
  });

  it("Medigap letters other than G are never assumed", () => {
    const s05 = SCENARIOS.find((s) => s.id === "s05")!.encounter;
    const n = evaluate({ ...s05, plans: [s05.plans[0], { ...s05.plans[1], medigapLetter: "N" }] }, rules);
    expect(n.status).toBe("verification_required");
    expect(n.rulesApplied.map((r) => r.ruleId)).toContain("PLAN-MEDIGAP-OTHER");
  });

  it("MSP: working-aged with a 20+ employer makes the employer plan primary; wrong entered order is escalated", () => {
    const s09 = SCENARIOS.find((s) => s.id === "s09")!.encounter;
    const d = evaluate({ ...s09, msp: { ...s09.msp!, employerSize: 250 } }, rules);
    expect(d.status).toBe("supervisor_review");
    expect(d.explanation.join(" ")).toContain("Demo Acme Employer Plan");
  });

  it("MSP: retiree coverage leaves Medicare primary (no age-only shortcut)", () => {
    const s09 = SCENARIOS.find((s) => s.id === "s09")!.encounter;
    const d = evaluate({ ...s09, msp: { ...s09.msp!, currentEmployment: "no" } }, rules);
    expect(d.status).toBe("awaiting_adjudication");
    expect(d.rulesApplied.map((r) => r.ruleId)).toContain("FED-MSP-001");
  });

  it("disabling a facility policy rule changes behaviour (rules are configurable, not hardcoded)", () => {
    const noEd = rules.map((r) => (r.id === "FAC-ED-001" ? { ...r, params: r.params.map((p) => ({ ...p, value: false })) } : r));
    const d = evaluate(SCENARIOS.find((s) => s.id === "s26")!.encounter, noEd);
    expect(d.status).toBe("no_collection");
  });

  it("rules outside their effective window are ignored", () => {
    const future = rules.map((r) => (r.id === "FAC-FAP-001" ? { ...r, effectiveDate: "2027-01-01" } : r));
    const d = evaluate(SCENARIOS.find((s) => s.id === "s19")!.encounter, future);
    expect(d.status).toBe("verified_amount");
  });

  it("every seed rule has the required metadata", () => {
    for (const r of rules) {
      expect(r.id).toBeTruthy();
      expect(r.source).toBeTruthy();
      expect(r.jurisdiction).toBeTruthy();
      expect(r.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.reviewer).toBeTruthy();
      expect(r.history.length).toBeGreaterThan(0);
      expect(["reference_cited", "verified", "draft"]).toContain(r.verificationStatus);
    }
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
  });
});
