import { describe, expect, it } from "vitest";
import { quickCopay, questionsNeeded, type LibraryPlan, type QuickInput } from "../src/engine/quick";

let n = 0;
const p = (o: Partial<LibraryPlan> & Pick<LibraryPlan, "kind">): LibraryPlan => ({
  id: `p${++n}`,
  payer: o.payer ?? "Payer",
  name: o.name ?? "Plan",
  copays: {},
  ed_waived_if_admitted: false,
  ...o,
});

const ppo = p({ kind: "commercial", payer: "Cigna", name: "Acme PPO", copays: { office: 3000, specialist: 6000, emergency: 30000, inpatient: 25000 }, ed_waived_if_admitted: true });
const spouse = p({ kind: "commercial", payer: "UnitedHealthcare", name: "Spouse plan", copays: { office: 2000 } });
const mom = p({ kind: "commercial", payer: "BCBS", name: "Mom's plan", copays: { office: 1500 } });
const dad = p({ kind: "commercial", payer: "Anthem", name: "Dad's plan", copays: { office: 4000 } });
const ambetter = p({ kind: "marketplace", payer: "Ambetter", name: "Silver", copays: { office: 3500 } });
const medicareAB = p({ kind: "medicare", payer: "Medicare", name: "A&B", medicare_parts: "AB" });
const medicareA = p({ kind: "medicare", payer: "Medicare", name: "A only", medicare_parts: "A" });
const medicareB = p({ kind: "medicare", payer: "Medicare", name: "B only", medicare_parts: "B" });
const planG = p({ kind: "medigap", payer: "Supp", name: "Plan G", copays: { office: 0, emergency: 0 } });
const planN = p({ kind: "medigap", payer: "Supp", name: "Plan N", copays: { office: 2000, emergency: 5000 }, ed_waived_if_admitted: true });
const ma = p({ kind: "medicare_advantage", payer: "Humana", name: "Gold Plus", copays: { specialist: 4000 } });
const medicaid = p({ kind: "medicaid", payer: "NC Medicaid", name: "Direct" });
const tricare = p({ kind: "tricare", payer: "TRICARE", name: "Select", copays: { office: 3300 } });
const tfl = p({ kind: "tricare_for_life", payer: "TRICARE", name: "For Life" });
const va = p({ kind: "va", payer: "VA", name: "Community Care" });
const ihs = p({ kind: "ihs", payer: "IHS", name: "PRC" });
const blackLung = p({ kind: "black_lung", payer: "DOL", name: "Black Lung" });
const wc = p({ kind: "workers_comp", payer: "WC", name: "Carrier" });
const auto = p({ kind: "auto", payer: "Auto", name: "Carrier" });

const run = (o: Partial<QuickInput>) => quickCopay({ plans: [], visit: "office", ...o });
const working20 = { reason: "age" as const, working: true, employerSize: "100plus" as const };

describe("basics", () => {
  it("single plan copay by visit type; missing copay is never guessed", () => {
    expect(run({ plans: [ppo], visit: "specialist" }).amountCents).toBe(6000);
    expect(run({ plans: [ppo], visit: "imaging" }).tone).toBe("check");
  });
  it("ED: nothing before seen; ED copay after; waived on admission", () => {
    expect(run({ plans: [ppo], visit: "emergency" }).tone).toBe("ed");
    expect(run({ plans: [ppo], visit: "emergency", edSeen: true }).amountCents).toBe(30000);
    expect(run({ plans: [ppo], visit: "emergency", edSeen: true, admitted: true }).amountCents).toBe(0);
  });
  it("credits what was already collected", () => {
    expect(run({ plans: [ppo], collectedCents: 1000 }).amountCents).toBe(2000);
  });
  it("no insurance → financial counseling", () => {
    expect(run({}).headline).toMatch(/financial counseling/);
  });
});

describe("two non-Medicare plans (NAIC order)", () => {
  it("asks whose plan each one is", () => {
    expect(questionsNeeded([ppo, spouse], "office").holderFor).toHaveLength(2);
    expect(run({ plans: [ppo, spouse] }).headline).toMatch(/whose plan/);
  });
  it("employee plan before spouse/dependent plan, regardless of entry order", () => {
    const r = run({ plans: [spouse, ppo], holder: { [ppo.id]: "self_active", [spouse.id]: "spouse" }, collectPrimaryWhenSecondary: true });
    expect(r.order?.[0]).toMatch(/Acme PPO/);
    expect(r.amountCents).toBe(3000);
  });
  it("active before COBRA", () => {
    const r = run({ plans: [ppo, spouse], holder: { [ppo.id]: "self_cobra", [spouse.id]: "self_active" } });
    expect(r.order?.[0]).toMatch(/Spouse plan/);
  });
  it("by default waits for the secondary instead of stacking copays", () => {
    const r = run({ plans: [ppo, spouse], holder: { [ppo.id]: "self_active", [spouse.id]: "spouse" } });
    expect(r).toMatchObject({ tone: "none", amountCents: 0 });
  });
  it("child, parents together: birthday rule", () => {
    const base = { plans: [mom, dad], holder: { [mom.id]: "child" as const, [dad.id]: "child" as const } };
    expect(run(base).headline).toMatch(/parents married/);
    expect(run({ ...base, parentsTogether: true }).headline).toMatch(/birthday/);
    const r = run({ ...base, parentsTogether: true, birthdayFirstPlanId: dad.id, collectPrimaryWhenSecondary: true });
    expect(r.order?.[0]).toMatch(/Dad/);
    expect(r.amountCents).toBe(4000);
  });
  it("child, parents separated: court order / custodial parent", () => {
    const base = { plans: [mom, dad], holder: { [mom.id]: "child" as const, [dad.id]: "child" as const }, parentsTogether: false };
    expect(run(base).headline).toMatch(/Which parent/);
    expect(run({ ...base, custodyPlanId: mom.id }).order?.[0]).toMatch(/Mom/);
  });
  it("employer plan + marketplace plan both as subscriber: needs payer confirmation", () => {
    expect(run({ plans: [ppo, ambetter], holder: { [ppo.id]: "self_active", [ambetter.id]: "self_active" } }).headline).toMatch(/Confirm the order/);
  });
});

describe("Medicare Secondary Payer", () => {
  it("Medicare + employer plan asks MSP questions", () => {
    expect(questionsNeeded([medicareAB, ppo], "office").msp).toBe(true);
    expect(run({ plans: [medicareAB, ppo] }).headline).toMatch(/Medicare questions/);
  });
  it("working aged, 20+ employees: employer plan first", () => {
    const r = run({ plans: [medicareAB, ppo], msp: working20, collectPrimaryWhenSecondary: true });
    expect(r.order).toEqual(["Cigna — Acme PPO", "Medicare — A&B"]);
    expect(r.amountCents).toBe(3000);
  });
  it("working aged, under 20 employees: Medicare first, $0", () => {
    const r = run({ plans: [ppo, medicareAB], msp: { reason: "age", working: true, employerSize: "under20" } });
    expect(r.order?.[0]).toMatch(/Medicare/);
    expect(r.amountCents).toBe(0);
  });
  it("multi-employer plan under 20 counts as large employer", () => {
    expect(run({ plans: [medicareAB, ppo], msp: { reason: "age", working: true, employerSize: "under20_multi" } }).order?.[0]).toMatch(/Cigna/);
  });
  it("retiree plan and COBRA: Medicare first", () => {
    expect(run({ plans: [medicareAB, ppo], msp: { reason: "age", working: false } }).order?.[0]).toMatch(/Medicare/);
    expect(run({ plans: [medicareAB, ppo], msp: { reason: "age", cobra: true } }).order?.[0]).toMatch(/Medicare/);
  });
  it("disability: 100+ employer first, under 100 Medicare first", () => {
    expect(run({ plans: [medicareAB, ppo], msp: { reason: "disability", working: true, employerSize: "100plus" } }).order?.[0]).toMatch(/Cigna/);
    expect(run({ plans: [medicareAB, ppo], msp: { reason: "disability", working: true, employerSize: "20to99" } }).order?.[0]).toMatch(/Medicare/);
  });
  it("ESRD: employer plan first in the 30-month period (even COBRA), Medicare after", () => {
    expect(run({ plans: [medicareAB, ppo], msp: { reason: "esrd", cobra: true, esrdFirst30Months: true } }).order?.[0]).toMatch(/Cigna/);
    expect(run({ plans: [medicareAB, ppo], msp: { reason: "esrd", esrdFirst30Months: false } }).order?.[0]).toMatch(/Medicare/);
  });
  it("Medicare Advantage follows the same MSP rules", () => {
    expect(run({ plans: [ma, ppo], msp: working20 }).order?.[0]).toMatch(/Cigna/);
  });
});

describe("Part A only / Part B only", () => {
  it("Part A only + employer plan, office visit: employer plan only", () => {
    const r = run({ plans: [medicareA, ppo], msp: { reason: "age", working: false } });
    expect(r.amountCents).toBe(3000);
    expect(r.reasons.join(" ")).toMatch(/Part A only/);
  });
  it("Part A only + employer plan, inpatient: MSP decides", () => {
    expect(run({ plans: [medicareA, ppo], visit: "inpatient", msp: { reason: "age", working: false } }).order?.[0]).toMatch(/Medicare/);
  });
  it("Part B only + employer plan, inpatient: employer plan only", () => {
    expect(run({ plans: [medicareB, ppo], visit: "inpatient" }).amountCents).toBe(25000);
  });
  it("Part A only alone, office visit: not covered", () => {
    expect(run({ plans: [medicareA] }).headline).toMatch(/no Part B/);
  });
});

describe("Medicare with supplements, Medicaid, TRICARE", () => {
  it("Medicare alone / + Plan G: $0; + Plan N: Plan N copay (in any entry order)", () => {
    expect(run({ plans: [medicareAB] }).amountCents).toBe(0);
    expect(run({ plans: [planG, medicareAB] }).amountCents).toBe(0);
    expect(run({ plans: [planN, medicareAB] }).amountCents).toBe(2000);
  });
  it("Medicare + Medicaid: asks level; QMB and full → $0; partial behaves like Medicare alone", () => {
    expect(questionsNeeded([medicareAB, medicaid], "office").medicaidLevel).toBe(true);
    expect(run({ plans: [medicaid, medicareAB] }).headline).toMatch(/Medicaid level/);
    expect(run({ plans: [medicareAB, medicaid], medicaidLevel: "qmb" }).headline).toMatch(/QMB/);
    expect(run({ plans: [medicareAB, medicaid], medicaidLevel: "full" }).amountCents).toBe(0);
    expect(run({ plans: [ma, medicaid], medicaidLevel: "partial", visit: "specialist" }).amountCents).toBe(4000);
  });
  it("Medicare + TRICARE For Life: $0", () => {
    expect(run({ plans: [tfl, medicareAB] })).toMatchObject({ amountCents: 0, order: ["Medicare — A&B", "TRICARE — For Life"] });
  });
  it("Medicare + TRICARE: active duty → TRICARE first", () => {
    expect(run({ plans: [medicareAB, tricare] }).headline).toMatch(/active duty/);
    expect(run({ plans: [medicareAB, tricare], tricareActiveDuty: true }).order?.[0]).toMatch(/TRICARE/);
    expect(run({ plans: [medicareAB, tricare], tricareActiveDuty: false }).order?.[0]).toMatch(/Medicare/);
  });
  it("TRICARE + employer plan: employer plan first", () => {
    expect(run({ plans: [tricare, ppo] }).order?.[0]).toMatch(/Cigna/);
  });
  it("commercial + Medicaid: $0, Medicaid last whatever the entry order", () => {
    const r = run({ plans: [medicaid, ppo] });
    expect(r.amountCents).toBe(0);
    expect(r.order?.[1]).toMatch(/Medicaid/);
  });
  it("IHS pays last, after Medicaid", () => {
    expect(run({ plans: [ihs, medicaid] }).order).toEqual(["NC Medicaid — Direct", "IHS — PRC"]);
    expect(run({ plans: [ihs] }).amountCents).toBe(0);
  });
  it("Medigap with Medicare Advantage is flagged", () => {
    expect(run({ plans: [ma, planG] }).headline).toMatch(/Medigap/);
  });
});

describe("Hospice, VA, Black Lung, research, accidents", () => {
  it("hospice related → hospice agency (also for Medicare Advantage); unknown → ask", () => {
    expect(run({ plans: [medicareAB], hospice: "related" }).headline).toMatch(/hospice/);
    expect(run({ plans: [ma], hospice: "related" }).headline).toMatch(/hospice/);
    expect(run({ plans: [medicareAB], hospice: "unknown" }).tone).toBe("check");
  });
  it("VA: authorized → bill VA; not authorized → other coverage; alone → check", () => {
    expect(run({ plans: [va, ppo], vaAuthorized: true }).headline).toMatch(/bill VA/);
    expect(run({ plans: [va, ppo] }).amountCents).toBe(3000);
    expect(run({ plans: [va] }).tone).toBe("check");
  });
  it("Black Lung: related → program; unrelated → Medicare", () => {
    expect(run({ plans: [blackLung, medicareAB], blackLungRelated: true }).headline).toMatch(/Black Lung/);
    expect(run({ plans: [blackLung, medicareAB], blackLungRelated: false }).amountCents).toBe(0);
  });
  it("government research program pays first", () => {
    expect(run({ plans: [medicareAB], researchProgram: true }).headline).toMatch(/research/);
  });
  it("liability or WC: asks if related; related → carrier with employer plan secondary", () => {
    expect(run({ plans: [auto, ppo] }).headline).toMatch(/injury or accident/);
    const r = run({ plans: [auto, ppo], accidentRelated: true });
    expect(r.amountCents).toBe(0);
    expect(r.reasons.join(" ")).toMatch(/secondary/);
    expect(run({ plans: [wc, medicareAB], accidentRelated: true }).reasons.join(" ")).toMatch(/conditional payment/);
    expect(run({ plans: [wc, ppo], accidentRelated: false }).amountCents).toBe(3000);
  });
});
