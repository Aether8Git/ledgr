import type { Decision, Encounter } from "../engine/types";

type QState = "done" | "current" | "skipped" | "blocked" | "todo";
interface Q {
  q: string;
  state: QState;
  answer?: string;
}

const PROTECTION_RULES = ["FED-MCD-002", "FAC-FAP-001", "OPS-WC-001", "FED-NSA-001", "OPS-ELIG-002"];

/**
 * The guided decision tree. Each question's state comes from the encounter data and
 * the engine's decision: once the engine has a reliable action, remaining questions
 * are marked "not needed" instead of being asked.
 */
export function guidedQuestions(enc: Encounter, d: Decision): Q[] {
  const v = enc.visit;
  const ids = new Set(d.rulesApplied.map((r) => r.ruleId));
  const plans = enc.plans;
  const active = plans.filter((p) => p.eligibility === "active");
  const multi = active.length > 1;
  const primary = [...active].sort((a, b) => (a.payerOrder ?? 9) - (b.payerOrder ?? 9))[0];
  const qs: Q[] = [];

  const isEd = v.setting === "emergency";
  const edBlocked = d.status === "ed_workflow";
  qs.push({ q: "Is this an emergency department visit or a scheduled / non-emergency service?", state: "done", answer: isEd ? (edBlocked ? "Emergency — patient not yet screened/stabilized" : "Emergency — screened and stabilized") : "Non-emergency" });

  const protectedHit = PROTECTION_RULES.some((r) => ids.has(r));
  const eligBlocked = d.status === "verification_required" && d.missing.some((m) => /eligibility|active coverage/i.test(m));
  const orderBlocked = ids.has("OPS-COB-002") || ids.has("FED-MSP-004") || ids.has("FED-MCD-001") && d.status === "supervisor_review" || ids.has("FED-MEDIGAP-001") || ids.has("FED-TRICARE-001") || (["verification_required", "supervisor_review"].includes(d.status) && d.missing.some((m) => /payer position|coordination|primary|MSP|employer size|current employment/i.test(m))) || /payer order/i.test(d.headline);
  const benefitsBlocked = d.status === "verification_required" && !eligBlocked && !orderBlocked;
  const adjWait = d.status === "awaiting_adjudication" && ids.has("OPS-ADJ-001");

  qs.push({ q: "How many insurance plans are active for this date of service?", state: plans.length || ids.has("OPS-SELFPAY-001") ? "done" : "current", answer: plans.length ? `${active.length} active of ${plans.length} on file` : "None on file" });
  qs.push({ q: "Has each plan's eligibility been verified?", state: eligBlocked ? "blocked" : plans.length ? "done" : "skipped", answer: plans.some((p) => p.eligibility === "unverified") ? "Not yet" : plans.length ? "Yes" : undefined });
  qs.push({ q: "Is the primary payer order confirmed?", state: !multi ? "skipped" : orderBlocked ? "blocked" : "done", answer: !multi ? "Single plan" : orderBlocked ? "Needs confirmation or review" : "Confirmed" });
  qs.push({ q: "Are the benefits for this specific service available?", state: benefitsBlocked ? "blocked" : primary?.benefits.benefitsVerified ? "done" : "todo", answer: primary ? (primary.benefits.benefitsVerified ? `Verified — ${primary.benefits.benefitsSource ?? "source recorded"}` : "Not verified") : undefined });
  qs.push({ q: "Has the primary claim been adjudicated?", state: primary?.adjudication.status === "not_submitted" ? "done" : adjWait && primary?.adjudication.status === "submitted_pending" ? "blocked" : primary ? "done" : "todo", answer: primary?.adjudication.status.replace("_", " ") });
  qs.push({ q: "Has the secondary or tertiary payer processed the claim?", state: !multi ? "skipped" : adjWait && primary?.adjudication.status === "adjudicated" ? "blocked" : primary?.adjudication.status === "not_submitted" ? "skipped" : "done", answer: !multi ? "Not applicable" : undefined });
  qs.push({ q: "Is there a verified patient responsibility?", state: d.amountKind === "verified" ? "done" : "todo", answer: d.amountKind === "verified" ? "Yes" : d.amountKind === "estimate" ? "Estimate only" : "No" });
  qs.push({ q: "Does any law, plan provision, or facility policy restrict collection?", state: protectedHit ? "blocked" : "done", answer: protectedHit ? d.rulesApplied.filter((r) => PROTECTION_RULES.includes(r.ruleId)).map((r) => r.ruleName).join("; ") : "None found" });
  qs.push({ q: "Is the result reliable enough for staff to act?", state: "todo", answer: d.status === "verified_amount" || d.status === "no_collection" ? "Yes" : d.status === "ed_workflow" ? "Yes — follow ED workflow" : "Not yet" });

  // Stop asking once a reliable action exists: everything after the deciding question is "not needed".
  let stop = qs.findIndex((x) => x.state === "blocked");
  if (edBlocked) stop = 0;
  if (stop >= 0) {
    for (let i = stop + 1; i < qs.length - 1; i++) qs[i] = { ...qs[i], state: "skipped", answer: "Not needed for this decision" };
    qs[stop] = { ...qs[stop], state: "current" };
  } else {
    const firstTodo = qs.findIndex((x) => x.state === "todo");
    if (firstTodo >= 0 && firstTodo < qs.length - 1) qs[firstTodo] = { ...qs[firstTodo], state: "current" };
  }
  qs[qs.length - 1] = { ...qs[qs.length - 1], state: d.status === "verified_amount" || d.status === "no_collection" || d.status === "ed_workflow" ? "done" : "current" };
  return qs;
}

export function GuidedQuestions({ encounter, decision }: { encounter: Encounter; decision: Decision }) {
  const qs = guidedQuestions(encounter, decision);
  return (
    <section className="panel guide" aria-label="Guided questions">
      <div className="panel-head">
        <h3>Guided questions</h3>
        <span className="faint">Only what this case needs</span>
      </div>
      <div className="panel-body">
        <ol>
          {qs.map((x, i) => (
            <li key={i} data-state={x.state}>
              <span className="dot" aria-hidden />
              <span>
                {x.q}
                {x.answer && <span className="ans">{x.state === "skipped" ? x.answer : x.answer}</span>}
                <span className="sr-only">({x.state})</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
