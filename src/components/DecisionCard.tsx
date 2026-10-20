import { formatCents } from "../engine/calc";
import { planTypeLabel } from "../engine/engine";
import type { Decision, Encounter } from "../engine/types";
import { ACTION_LABEL, CATEGORY_LABEL, SERVICE_LABEL, SETTING_LABEL, STATUS_LABEL, VERIFICATION_LABEL } from "./labels";

const ELIG = { active: "active", inactive: "inactive", unverified: "not verified", retro_pending: "pending / retroactive" } as const;

export function DecisionCard({ decision: d, encounter, onRecord }: { decision: Decision; encounter: Encounter; onRecord?: () => void }) {
  const coverage = encounter.plans.length ? encounter.plans.map((p) => (p.type === "medigap" && p.medigapLetter ? `Medigap Plan ${p.medigapLetter}` : planTypeLabel(p.type))).join(" + ") : "None on file";
  const eligibilitySummary = encounter.plans.length
    ? encounter.plans.map((p) => `${p.payerName}: ${ELIG[p.eligibility]}${p.eligibilitySource ? `, ${p.eligibilitySource}` : ""}`).join("; ")
    : "—";

  return (
    <section className="decision" aria-live="polite" aria-label="Decision">
      <div className="band" data-status={d.status}>
        <div className="status">{STATUS_LABEL[d.status]}</div>
        <div className="headline">{d.headline}</div>
      </div>

      {d.supervisorReview && (
        <div className="review-flag">
          <strong>Supervisor review required.</strong> {d.escalationReason}
        </div>
      )}
      {d.warnings.length > 0 && (
        <div className="warn" role="note">
          {d.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}

      <div className="amount">
        <span className="label">Amount to collect now</span>
        {d.amountCents === null ? (
          <span className="value none">Not determined from the information provided</span>
        ) : (
          <>
            <span className="value">{formatCents(d.amountCents)}</span>
            <span className={`kind ${d.amountKind ?? ""}`}>
              {d.amountKind === "verified" ? "Verified." : "Estimate, not a final balance."} Source: {d.amountSource}
            </span>
          </>
        )}
      </div>

      <div className="dsec">
        <h4>Recommended action</h4>
        <p><strong>{ACTION_LABEL[d.action]}</strong></p>
      </div>

      <div className="dsec">
        <dl className="kv">
          <dt>Coverage</dt><dd>{coverage}</dd>
          <dt>Visit</dt><dd>{SETTING_LABEL[encounter.visit.setting]}, {SERVICE_LABEL[encounter.visit.serviceCategory].toLowerCase()}</dd>
          <dt>Eligibility</dt><dd>{eligibilitySummary}</dd>
          {d.payerOrder.map((o) => (
            <FragmentRow key={o.planId} k={["Primary", "Secondary", "Tertiary"][o.order - 1] + " payer"} v={`${o.label}${o.confirmed ? "" : " — not confirmed"}`} />
          ))}
        </dl>
      </div>

      <div className="dsec">
        <h4>Why</h4>
        {d.explanation.map((e, i) => (
          <p key={i}>{e}</p>
        ))}
      </div>

      <div className="dsec">
        <h4>Next steps</h4>
        <ol>{d.nextSteps.map((s, i) => <li key={i}>{s}</li>)}</ol>
      </div>

      {d.missing.length > 0 && (
        <div className="dsec">
          <h4>Still needed</h4>
          <ul>{d.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}

      {d.calculation.length > 0 && (
        <div className="dsec">
          <details className="why">
            <summary>How the amount was calculated</summary>
            <table className="calc">
              <tbody>
                {d.calculation.map((c, i) => (
                  <tr key={i}>
                    <td>
                      {c.label}
                      {c.note && <div className="faint">{c.note}</div>}
                      {c.source && <div className="faint">Source: {c.source}</div>}
                    </td>
                    <td>{c.amountCents === undefined ? "" : formatCents(c.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}

      <div className="dsec">
        <details className="why">
          <summary>Rules and sources ({d.rulesApplied.length})</summary>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {d.rulesApplied.map((r, i) => (
              <div key={i} className="rule-line">
                <div>
                  <span className="rid">{r.ruleId}</span> v{r.version} — {r.ruleName}
                </div>
                <div className="btn-row">
                  <span className="badge cat">{CATEGORY_LABEL[r.category]}</span>
                  <span className={`badge ${r.verificationStatus}`}>{VERIFICATION_LABEL[r.verificationStatus]}</span>
                </div>
                <div className="muted">{r.outcome}</div>
                <div className="faint">Source: {r.source}</div>
              </div>
            ))}
          </div>
        </details>
      </div>

      <div className="dsec">
        <div className="btn-row" style={{ justifyContent: "space-between" }}>
          <span className="faint">Evaluated {new Date(d.evaluatedAt).toLocaleTimeString()} by {d.engineVersion}</span>
          {onRecord && <button className="btn primary small" onClick={onRecord}>Record decision</button>}
        </div>
      </div>
    </section>
  );
}

function FragmentRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}
