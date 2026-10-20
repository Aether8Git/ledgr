import { useMemo, useState } from "react";
import { DecisionCard } from "../components/DecisionCard";
import { Check, Field, MoneyInput, Select, Tri } from "../components/fields";
import { GuidedQuestions } from "../components/GuidedQuestions";
import { SERVICE_LABEL, SETTING_LABEL } from "../components/labels";
import { PlanEditor } from "../components/PlanEditor";
import { plan, SCENARIOS } from "../data/scenarios";
import { evaluate } from "../engine/engine";
import type { CoveragePlan, EdPhase, MspContext, NetworkStatus, ProtectionStatus, ServiceCategory, VisitSetting } from "../engine/types";
import { useApp } from "../lib/app";
import { deidentify, remoteStore } from "../lib/store";

export function Registration() {
  const { encounter: enc, setEncounter, rules, log, newEncounter, loadScenario } = useApp();
  const decision = useMemo(() => evaluate(enc, rules), [enc, rules]);
  const v = enc.visit;
  const setV = (patch: Partial<typeof v>) => setEncounter({ ...enc, visit: { ...v, ...patch } });
  const setPlan = (i: number, p: CoveragePlan) => setEncounter({ ...enc, plans: enc.plans.map((x, j) => (j === i ? p : x)) });
  const removePlan = (i: number) => setEncounter({ ...enc, plans: enc.plans.filter((_, j) => j !== i) });
  const addPlan = () => {
    if (enc.plans.length >= 3) return;
    const next = plan({ payerName: "", type: "commercial_employer", eligibility: "unverified", payerOrder: enc.plans.length ? null : 1, payerOrderConfirmed: enc.plans.length === 0, cobStatus: enc.plans.length ? "unknown" : "established", eligibilitySource: null, benefits: { benefitsVerified: false, benefitsSource: "", copayApplies: "unknown", serviceCovered: "unknown" } });
    setEncounter({ ...enc, plans: [...enc.plans, next] });
  };
  const hasMedicare = enc.plans.some((p) => p.type === "medicare_original");
  const hasOtherWithMedicare = hasMedicare && enc.plans.some((p) => !["medicare_original", "medigap", "medicaid", "medicaid_managed_care"].includes(p.type));
  const msp: MspContext = enc.msp ?? { entitlementBasis: "unknown", currentEmployment: "unknown", employerSize: null, esrdInCoordinationPeriod: "unknown", questionnaireCompleted: false };
  const setMsp = (patch: Partial<MspContext>) => setEncounter({ ...enc, msp: { ...msp, ...patch } });

  const [recorded, setRecorded] = useState<string | null>(null);
  const record = () => {
    setRecorded(new Date().toLocaleTimeString());
    log({ kind: "decision_recorded", summary: `${enc.id}: ${decision.headline}`, detail: deidentify(enc, decision) });
    remoteStore.recordDecision(enc, decision);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Registration check</h1>
          <p>Enter what you've verified. Ledgr recommends what to do at the desk, and tells you what it still needs. Blank means unknown — it never fills in a number for you.</p>
        </div>
        <div className="btn-row">
          <select aria-label="Load a demo scenario" value="" onChange={(e) => e.target.value && loadScenario(e.target.value)} className="btn">
            <option value="">Load demo scenario…</option>
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.number}. {s.title}
              </option>
            ))}
          </select>
          <button className="btn" onClick={newEncounter}>Start a new encounter</button>
        </div>
      </div>

      <div className="workspace">
        <div>
          <section className="panel">
            <div className="panel-head">
              <h2>Visit</h2>
              <span className="faint">{enc.label ? `${enc.label} (demo)` : enc.id}</span>
            </div>
            <div className="panel-body">
              <div className="grid g3">
                <Field label="Date of service">
                  <input type="date" value={v.dateOfService} onChange={(e) => setV({ dateOfService: e.target.value })} />
                </Field>
                <Field label="Setting">
                  <Select<VisitSetting> value={v.setting} onChange={(setting) => setV({ setting, edPhase: setting === "emergency" ? v.edPhase ?? "pre_screening" : undefined })} options={Object.entries(SETTING_LABEL).map(([value, label]) => ({ value: value as VisitSetting, label }))} />
                </Field>
                <Field label="Service">
                  <Select<ServiceCategory> value={v.serviceCategory} onChange={(serviceCategory) => setV({ serviceCategory })} options={Object.entries(SERVICE_LABEL).map(([value, label]) => ({ value: value as ServiceCategory, label }))} />
                </Field>
              </div>

              {v.setting === "emergency" && (
                <div className="note">
                  <Field label="Where is the patient in ED care?">
                    <Select<EdPhase>
                      value={v.edPhase ?? "pre_screening"}
                      onChange={(edPhase) => setV({ edPhase })}
                      options={[
                        { value: "pre_screening", label: "Arrived — not yet screened" },
                        { value: "screening_or_stabilizing", label: "Being screened or stabilized" },
                        { value: "post_stabilization", label: "Screened and stabilized / at discharge" },
                      ]}
                    />
                  </Field>
                </div>
              )}

              <div className="grid g4">
                <Field label="Facility">
                  <input value={v.facility} onChange={(e) => setV({ facility: e.target.value })} />
                </Field>
                <Field label="Department">
                  <input value={v.department} onChange={(e) => setV({ department: e.target.value })} />
                </Field>
                <Field label="Network status">
                  <Select<NetworkStatus> value={v.networkStatus} onChange={(networkStatus) => setV({ networkStatus })} options={[{ value: "unknown", label: "Unknown" }, { value: "in_network", label: "In network" }, { value: "out_of_network", label: "Out of network" }]} />
                </Field>
                <Field label="State rules">
                  <input value={v.jurisdiction} maxLength={2} onChange={(e) => setV({ jurisdiction: e.target.value.toUpperCase() })} />
                </Field>
                <Field label="Financial assistance">
                  <Select<ProtectionStatus> value={v.financialAssistance} onChange={(financialAssistance) => setV({ financialAssistance })} options={[{ value: "none", label: "None on file" }, { value: "pending", label: "Application pending" }, { value: "verified", label: "Approved" }]} />
                </Field>
                <Field label="Collected this visit">
                  <MoneyInput cents={v.previouslyCollectedCents} placeholder="0.00" onChange={(c) => setV({ previouslyCollectedCents: c ?? 0 })} />
                </Field>
                <Field label="Allowed estimate" hint="Facility estimate, not billed charges">
                  <MoneyInput cents={v.allowedAmountEstimateCents} onChange={(allowedAmountEstimateCents) => setV({ allowedAmountEstimateCents })} />
                </Field>
                <Field label="New patient">
                  <Select value={v.newPatient === undefined ? "" : v.newPatient ? "y" : "n"} onChange={(x) => setV({ newPatient: x === "" ? undefined : x === "y" })} options={[{ value: "", label: "Not relevant" }, { value: "y", label: "New" }, { value: "n", label: "Established" }]} />
                </Field>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Coverage</h2>
              <button className="btn small" onClick={addPlan} disabled={enc.plans.length >= 3}>
                {enc.plans.length === 0 ? "Add a plan" : enc.plans.length >= 3 ? "Three plans maximum" : "Add another plan"}
              </button>
            </div>
            <div className="panel-body">
              {enc.plans.length === 0 && <p className="muted">No coverage entered. Add each plan the patient has; if they have none, Ledgr will route to financial counseling.</p>}
              {enc.plans.map((p, i) => (
                <PlanEditor key={p.id} plan={p} planCount={enc.plans.length} onChange={(np) => setPlan(i, np)} onRemove={() => removePlan(i)} defaultOpen={enc.plans.length === 1 || i === enc.plans.length - 1} />
              ))}
            </div>
          </section>

          {hasOtherWithMedicare && (
            <section className="panel">
              <div className="panel-head">
                <h2>Medicare Secondary Payer questionnaire</h2>
              </div>
              <div className="panel-body">
                <p className="muted">Medicare and another health plan are both on file. Payer order comes from these answers — not from age alone.</p>
                <Check checked={msp.questionnaireCompleted} onChange={(questionnaireCompleted) => setMsp({ questionnaireCompleted })}>
                  MSP questionnaire completed with the patient for this encounter
                </Check>
                <div className="grid g2">
                  <Field label="Why the patient has Medicare">
                    <Select value={msp.entitlementBasis} onChange={(entitlementBasis) => setMsp({ entitlementBasis })} options={[{ value: "unknown", label: "Unknown" }, { value: "age", label: "Age (65+)" }, { value: "disability", label: "Disability" }, { value: "esrd", label: "End-stage renal disease" }]} />
                  </Field>
                  {msp.entitlementBasis !== "esrd" ? (
                    <>
                      <Field group label="Other plan is through current employment (patient or spouse)?">
                        <Tri value={msp.currentEmployment} onChange={(currentEmployment) => setMsp({ currentEmployment })} />
                      </Field>
                      <Field label="Employer size (employees)" hint="Blank if unknown">
                        <input inputMode="numeric" value={msp.employerSize ?? ""} onChange={(e) => setMsp({ employerSize: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0) })} />
                      </Field>
                    </>
                  ) : (
                    <Field group label="Inside the 30-month ESRD coordination period?">
                      <Tri value={msp.esrdInCoordinationPeriod} onChange={(esrdInCoordinationPeriod) => setMsp({ esrdInCoordinationPeriod })} />
                    </Field>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>

        <aside className="sticky" id="decision">
          <DecisionCard decision={decision} encounter={enc} onRecord={record} />
          {recorded && <p className="faint" role="status">Decision recorded to the audit log at {recorded}.</p>}
          <GuidedQuestions encounter={enc} decision={decision} />
        </aside>
      </div>
      <div className="mobile-jump">
        <a href="#decision">See decision: {decision.headline}</a>
      </div>
    </div>
  );
}
