import { useApp } from "../lib/app";
import { VERIFICATION_LABEL } from "../components/labels";

export const INTEGRATIONS = [
  { name: "Eligibility & benefits (X12 270/271)", status: "Not connected", note: "Via a clearinghouse (e.g., the facility's existing vendor). Today, eligibility and benefits are entered manually with a recorded source and timestamp." },
  { name: "Registration / ADT system (e.g., Epic Prelude/Cadence)", status: "Not connected", note: "Encounter, visit type, and coverage would arrive via HL7 ADT or FHIR (Encounter, Coverage). Today, entered manually or loaded from demo scenarios." },
  { name: "Claims & remittance (X12 837 / 835)", status: "Not connected", note: "Adjudication status, allowed, paid, and patient responsibility would come from 835 ERAs. Today, EOB figures are entered manually." },
  { name: "Payer benefit APIs (CMS interoperability / FHIR)", status: "Not connected", note: "Payer-specific coverage and prior-auth APIs where available." },
  { name: "Medicare eligibility (HETS)", status: "Not connected", note: "Medicare Part A/B status, deductible remaining, MSP records, MA enrollment. Requires CMS HETS access through an approved submitter." },
  { name: "State Medicaid eligibility (e.g., NCTracks)", status: "Not connected", note: "Medicaid eligibility, QMB/dual status, cost-sharing indicators. Candidate shared integration with Aether's Primacy." },
  { name: "Price transparency / estimate engine", status: "Not connected", note: "Facility allowed-amount estimates. Today, entered manually." },
  { name: "Financial assistance policy system", status: "Not connected", note: "FAP determinations and date ranges. Today, entered manually." },
  { name: "Payment posting", status: "Not connected", note: "Ledgr recommends; it does not take payments. 'Already collected' is entered manually." },
  { name: "Identity provider (SSO)", status: "Prototype", note: "Supabase Auth with email/password in this build. Production should use the facility's SAML/OIDC SSO with MFA." },
];

export const PROTOTYPE_CAPABILITIES = [
  "Demo mode stores the rule library, change requests, and audit log in the browser (localStorage). Not durable, not shared, not tamper-evident.",
  "Supabase mode schema, RLS policies, and approval functions are included but have not been deployed or penetration-tested.",
  "The decision engine runs in the browser. Production should run it server-side (Edge Function) so recorded decisions can't be altered by the client.",
  "Role switching in the sidebar is for demonstration; production roles come from the authenticated profile.",
  "Plan document / EOB upload with extraction (section 14) is not built.",
  "No AI model is called. The 'assistant' is the deterministic engine and its explanations; no PHI leaves the browser in demo mode.",
  "Only Medigap Plan G is modeled; other letters route to verification.",
  "Only one state placeholder rule (NC Medicaid cost-sharing) exists, and it is a draft.",
  "Professional (physician) vs. facility billing are not separately modeled; the engine evaluates one benefit per encounter.",
  "Observation vs. inpatient status rules (e.g., Medicare two-midnight considerations) are not modeled beyond the setting selection.",
];

export function Status() {
  const { rules } = useApp();
  const pending = rules.filter((r) => r.verificationStatus !== "verified");
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Readiness</h1>
          <p>What is prototype, what needs authoritative validation, and what still has to be connected before Ledgr can be used with real patients.</p>
        </div>
      </div>
      <div className="note" style={{ marginBottom: 16, borderLeftColor: "var(--st-ed)", background: "#fcebea" }}>
        <strong>Not production-ready.</strong> Ledgr is decision support. It does not replace payer adjudication, official benefit verification, compliance review, or your facility's approved policies.
      </div>

      <section className="panel">
        <div className="panel-head"><h2>Rules awaiting validation ({pending.length} of {rules.length})</h2></div>
        <div className="panel-body">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Rule</th><th>Status</th><th>Reviewer</th><th>Source</th></tr></thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.id}</strong><div>{r.name}</div></td>
                    <td><span className={`badge ${r.verificationStatus}`}>{VERIFICATION_LABEL[r.verificationStatus]}</span></td>
                    <td>{r.reviewer}</td>
                    <td className="faint">{r.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>External integrations</h2></div>
        <div className="panel-body">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Integration</th><th>Status</th><th>Notes</th></tr></thead>
              <tbody>
                {INTEGRATIONS.map((i) => (
                  <tr key={i.name}><td><strong>{i.name}</strong></td><td>{i.status}</td><td>{i.note}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Prototype capabilities</h2></div>
        <div className="panel-body prose">
          <ul>{PROTOTYPE_CAPABILITIES.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      </section>
    </div>
  );
}
