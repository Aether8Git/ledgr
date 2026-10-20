// Generates docs/TEST_SCENARIOS.md from the scenario fixtures. Run: npm run docs:scenarios
import { writeFileSync } from "node:fs";
import { SCENARIOS } from "../src/data/scenarios";
import { evaluate } from "../src/engine/engine";
import { SEED_RULES } from "../src/engine/rules";
import { formatCents } from "../src/engine/calc";
import { STATUS_LABEL, ACTION_LABEL } from "../src/components/labels";

const out: string[] = [
  "# Test scenarios",
  "",
  "Generated from `src/data/scenarios.ts` — the same fixtures `tests/scenarios.test.ts` asserts against. All patients, payers, and amounts are **fictitious**; plan-specific figures are hypothetical inputs, not claims about any real plan. Regenerate with `npm run docs:scenarios`.",
  "",
];
for (const s of SCENARIOS) {
  const e = s.encounter;
  const d = evaluate(e, SEED_RULES);
  out.push(`## ${s.number}. ${s.title}`, "", `*${s.group}* — ${s.summary}`, "", "**Inputs**", "");
  out.push(`- Visit: ${e.visit.setting}${e.visit.edPhase ? ` (${e.visit.edPhase})` : ""}, ${e.visit.serviceCategory}, network ${e.visit.networkStatus}, FAP ${e.visit.financialAssistance}, already collected ${formatCents(e.visit.previouslyCollectedCents)}, allowed estimate ${formatCents(e.visit.allowedAmountEstimateCents)}`);
  for (const p of e.plans) {
    const b = p.benefits, a = p.adjudication;
    out.push(`- Plan ${p.payerOrder ?? "?"}${p.payerOrderConfirmed ? "" : " (unconfirmed)"}: ${p.payerName} — ${p.type}${p.medigapLetter ? ` ${p.medigapLetter}` : ""}; eligibility ${p.eligibility}${p.terminationDate ? ` (term ${p.terminationDate})` : ""}; COB ${p.cobStatus}${p.qmb ? "; QMB" : ""}${p.conflictingInformation ? `; conflict: "${p.conflictingInformation}"` : ""}; benefits ${b.benefitsVerified ? "verified" : "not verified"}, copay ${b.copayApplies}${b.copayCents != null ? ` ${formatCents(b.copayCents)} (${b.copaySetting ?? "setting n/a"})` : ""}, deductible ${b.deductibleApplies}${b.deductibleRemainingCents != null ? ` ${formatCents(b.deductibleRemainingCents)} left` : ""}${b.coinsuranceBp != null ? `, coins ${b.coinsuranceBp / 100}%` : ""}${b.estimateOnly ? ", estimate only" : ""}; claim ${a.status}${a.patientResponsibilityCents != null ? ` (PR ${formatCents(a.patientResponsibilityCents)})` : ""}`);
  }
  if (e.msp) out.push(`- MSP: basis ${e.msp.entitlementBasis}, current employment ${e.msp.currentEmployment}, employer size ${e.msp.employerSize ?? "unknown"}, questionnaire ${e.msp.questionnaireCompleted ? "done" : "not done"}`);
  out.push("", "| Expected decision | Collection recommendation | Escalation |", "|---|---|---|");
  out.push(`| ${STATUS_LABEL[s.expected.status]} | ${ACTION_LABEL[s.expected.action]}${s.expected.amountCents != null ? ` — ${formatCents(s.expected.amountCents)} (${s.expected.amountKind})` : ""} | ${s.expected.supervisorReview ? "Supervisor review" : "None"} |`);
  out.push("", `**Required explanation** must mention: ${s.expected.explains.map((x) => `"${x}"`).join(", ")}. **Rules that must fire:** ${s.expected.rules.join(", ")}.`, "");
  out.push(`**Engine output:** ${d.headline}`, "", ...d.explanation.map((x) => `> ${x}`), "");
}
writeFileSync(new URL("../docs/TEST_SCENARIOS.md", import.meta.url), out.join("\n"));
console.log("Wrote docs/TEST_SCENARIOS.md");
