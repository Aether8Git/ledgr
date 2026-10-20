import { planLabel } from "../engine/engine";
import type { AdjudicationStatus, CobStatus, CoveragePlan, EligibilityStatus, VisitSetting } from "../engine/types";
import { Check, Field, MoneyInput, PercentInput, Select, Tri } from "./fields";
import { PLAN_TYPE_OPTIONS, SETTING_LABEL } from "./labels";

const ORDER_NAME = ["Primary", "Secondary", "Tertiary"];

export function PlanEditor({ plan: p, onChange, onRemove, planCount, defaultOpen }: { plan: CoveragePlan; onChange: (p: CoveragePlan) => void; onRemove: () => void; planCount: number; defaultOpen?: boolean }) {
  const set = (patch: Partial<CoveragePlan>) => onChange({ ...p, ...patch });
  const setB = (patch: Partial<CoveragePlan["benefits"]>) => onChange({ ...p, benefits: { ...p.benefits, ...patch } });
  const setA = (patch: Partial<CoveragePlan["adjudication"]>) => onChange({ ...p, adjudication: { ...p.adjudication, ...patch } });
  const isMedicaid = p.type === "medicaid" || p.type === "medicaid_managed_care";
  const b = p.benefits;
  const a = p.adjudication;

  return (
    <details className="plan" data-order={p.payerOrder ?? ""} open={defaultOpen}>
      <summary>
        <span>
          <strong>{p.payerName || "New plan"}</strong> <span className="muted">{planLabel(p).replace(p.payerName, "").trim()}</span>
        </span>
        <span className={`order-chip ${p.payerOrderConfirmed ? "" : "unconfirmed"}`}>
          {p.payerOrder ? ORDER_NAME[p.payerOrder - 1] : "Order not set"}
          {p.payerOrderConfirmed ? "" : " (unconfirmed)"}
        </span>
      </summary>
      <div className="plan-body">
        <div className="grid g3">
          <Field label="Payer name">
            <input value={p.payerName} onChange={(e) => set({ payerName: e.target.value })} />
          </Field>
          <Field label="Plan type">
            <Select value={p.type} onChange={(type) => set({ type })} options={PLAN_TYPE_OPTIONS} />
          </Field>
          {p.type === "medigap" ? (
            <Field label="Medigap plan letter" hint="Plans are not interchangeable">
              <input value={p.medigapLetter ?? ""} maxLength={4} onChange={(e) => set({ medigapLetter: e.target.value.toUpperCase() || null })} />
            </Field>
          ) : (
            <Field label="Plan name">
              <input value={p.planName} onChange={(e) => set({ planName: e.target.value })} />
            </Field>
          )}
        </div>

        <div className="subhead">Eligibility</div>
        <div className="grid g4">
          <Field label="Status for date of service">
            <Select<EligibilityStatus>
              value={p.eligibility}
              onChange={(eligibility) => set({ eligibility })}
              options={[
                { value: "active", label: "Active (verified)" },
                { value: "unverified", label: "Not yet verified" },
                { value: "inactive", label: "Inactive / terminated" },
                { value: "retro_pending", label: "Pending / retroactive" },
              ]}
            />
          </Field>
          <Field label="Effective">
            <input type="date" value={p.effectiveDate ?? ""} onChange={(e) => set({ effectiveDate: e.target.value || null })} />
          </Field>
          <Field label="Terminates">
            <input type="date" value={p.terminationDate ?? ""} onChange={(e) => set({ terminationDate: e.target.value || null })} />
          </Field>
          <Field label="Verification source">
            <input value={p.eligibilitySource ?? ""} placeholder="271, portal, phone…" onChange={(e) => set({ eligibilitySource: e.target.value, eligibilityVerifiedAt: new Date().toISOString() })} />
          </Field>
        </div>
        <Field label="Member ID (masked)" hint="Demo mode: never enter a real member ID.">
          <input value={p.memberIdMasked ?? ""} onChange={(e) => set({ memberIdMasked: e.target.value })} />
        </Field>

        {planCount > 1 && (
          <>
            <div className="subhead">Coordination of benefits</div>
            <div className="grid g3">
              <Field label="Payer position">
                <Select
                  value={String(p.payerOrder ?? "")}
                  onChange={(v) => set({ payerOrder: v ? (Number(v) as 1 | 2 | 3) : null })}
                  options={[{ value: "", label: "Not set" }, ...Array.from({ length: Math.min(3, planCount) }, (_, i) => ({ value: String(i + 1), label: ORDER_NAME[i] }))]}
                />
              </Field>
              <Field label="COB status">
                <Select<CobStatus>
                  value={p.cobStatus}
                  onChange={(cobStatus) => set({ cobStatus })}
                  options={[
                    { value: "established", label: "Established" },
                    { value: "pending", label: "Pending" },
                    { value: "unknown", label: "Unknown" },
                    { value: "conflict", label: "Conflict reported" },
                  ]}
                />
              </Field>
              <Field label="Order source">
                <input value={p.payerOrderSource ?? ""} placeholder="Payer COB response…" onChange={(e) => set({ payerOrderSource: e.target.value })} />
              </Field>
            </div>
            <div className="grid g2">
              <Check checked={p.payerOrderConfirmed} onChange={(payerOrderConfirmed) => set({ payerOrderConfirmed })}>
                Position confirmed by the payer (not by card order or patient preference)
              </Check>
              <Check checked={!!p.isEmployerGroupPlan} onChange={(isEmployerGroupPlan) => set({ isEmployerGroupPlan })}>
                Employer group health plan
              </Check>
              <Check checked={!!p.patientIsDependent} onChange={(patientIsDependent) => set({ patientIsDependent })}>
                Patient is a dependent on this plan
              </Check>
            </div>
          </>
        )}

        {isMedicaid && (
          <>
            <div className="subhead">Medicaid protections</div>
            <div className="grid g2">
              <Check checked={!!p.qmb} onChange={(qmb) => set({ qmb })}>
                Qualified Medicare Beneficiary (QMB)
              </Check>
              <Field group label="Cost-sharing exemption">
                <Tri value={p.costSharingExempt} onChange={(costSharingExempt) => set({ costSharingExempt })} labels={["Exempt", "Not exempt", "Unknown"]} />
              </Field>
            </div>
          </>
        )}

        <div className="subhead">Benefits for this service</div>
        <div className="grid g2">
          <Check checked={b.benefitsVerified} onChange={(benefitsVerified) => setB({ benefitsVerified, benefitsVerifiedAt: new Date().toISOString() })}>
            Benefits verified for this service and setting
          </Check>
          <Field label="Benefit source">
            <input value={b.benefitsSource ?? ""} placeholder="271 / portal / call ref #" onChange={(e) => setB({ benefitsSource: e.target.value })} />
          </Field>
        </div>
        <div className="grid g3">
          <Field group label="Service covered?">
            <Tri value={b.serviceCovered} onChange={(serviceCovered) => setB({ serviceCovered })} />
          </Field>
          <Field group label="Copay applies?">
            <Tri value={b.copayApplies} onChange={(copayApplies) => setB({ copayApplies })} />
          </Field>
          <Field group label="Deductible applies?">
            <Tri value={b.deductibleApplies} onChange={(deductibleApplies) => setB({ deductibleApplies })} />
          </Field>
        </div>
        <div className="grid g4">
          <Field label="Verified copay">
            <MoneyInput cents={b.copayCents} onChange={(copayCents) => setB({ copayCents })} />
          </Field>
          <Field label="Copay is for">
            <Select<VisitSetting | "">
              value={(b.copaySetting ?? "") as VisitSetting | ""}
              onChange={(v) => setB({ copaySetting: (v || null) as VisitSetting | null })}
              options={[{ value: "", label: "Not specified" }, ...Object.entries(SETTING_LABEL).map(([value, label]) => ({ value: value as VisitSetting, label }))]}
            />
          </Field>
          <Field label="Deductible remaining">
            <MoneyInput cents={b.deductibleRemainingCents} onChange={(deductibleRemainingCents) => setB({ deductibleRemainingCents })} />
          </Field>
          <Field label="Coinsurance %">
            <PercentInput bp={b.coinsuranceBp} onChange={(coinsuranceBp) => setB({ coinsuranceBp })} />
          </Field>
          <Field label="Out-of-pocket remaining">
            <MoneyInput cents={b.oopRemainingCents} onChange={(oopRemainingCents) => setB({ oopRemainingCents })} />
          </Field>
          <Field group label="Authorization required?">
            <Tri value={b.authRequired} onChange={(authRequired) => setB({ authRequired })} />
          </Field>
          {(p.payerOrder ?? 1) > 1 && (
            <Field group label="Covers prior payer's cost-sharing?">
              <Tri value={b.coversPriorCostShare} onChange={(coversPriorCostShare) => setB({ coversPriorCostShare })} />
            </Field>
          )}
        </div>
        <div className="grid g2">
          <Check checked={!!b.authOnFile} onChange={(authOnFile) => setB({ authOnFile })}>Authorization / referral on file</Check>
          <Check checked={!!b.estimateOnly} onChange={(estimateOnly) => setB({ estimateOnly })}>Payer returned these amounts as an estimate only</Check>
        </div>

        <div className="subhead">Claim</div>
        <div className="grid g4">
          <Field label="Adjudication">
            <Select<AdjudicationStatus>
              value={a.status}
              onChange={(status) => setA({ status })}
              options={[
                { value: "not_submitted", label: "Not submitted" },
                { value: "submitted_pending", label: "Submitted, pending" },
                { value: "adjudicated", label: "Adjudicated" },
                { value: "denied", label: "Denied" },
              ]}
            />
          </Field>
          {a.status === "adjudicated" && (
            <>
              <Field label="Allowed (EOB)">
                <MoneyInput cents={a.allowedCents} onChange={(allowedCents) => setA({ allowedCents })} />
              </Field>
              <Field label="Paid (EOB)">
                <MoneyInput cents={a.paidCents} onChange={(paidCents) => setA({ paidCents })} />
              </Field>
              <Field label="Patient responsibility (EOB)">
                <MoneyInput cents={a.patientResponsibilityCents} onChange={(patientResponsibilityCents) => setA({ patientResponsibilityCents })} />
              </Field>
            </>
          )}
        </div>
        {a.status === "adjudicated" && (
          <Check checked={a.eobOnFile} onChange={(eobOnFile) => setA({ eobOnFile })}>EOB / ERA on file</Check>
        )}

        <Field label="Conflicting information" hint="Describe any disagreement between sources. Anything here routes the case to a supervisor.">
          <textarea value={p.conflictingInformation ?? ""} onChange={(e) => set({ conflictingInformation: e.target.value || null })} />
        </Field>

        <div className="btn-row">
          <button type="button" className="btn danger small" onClick={onRemove}>Remove plan</button>
        </div>
      </div>
    </details>
  );
}
