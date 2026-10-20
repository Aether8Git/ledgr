import { Fragment, useState } from "react";
import { useApp } from "../lib/app";
import { can, ROLE_LABEL, type AuditEntry } from "../lib/store";

const KIND_LABEL: Record<AuditEntry["kind"], string> = {
  decision_recorded: "Decision recorded",
  rule_change_proposed: "Rule change proposed",
  rule_change_approved: "Rule change approved",
  rule_change_rejected: "Rule change rejected",
  session: "Session",
};

export function Audit() {
  const { audit, role, demo, clearAudit } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  if (!can.viewAudit(role)) {
    return (
      <div className="page">
        <h1>Audit log</h1>
        <p className="muted" style={{ marginTop: 8 }}>The audit log is available to supervisors, rules administrators, compliance reviewers, and auditors.</p>
      </div>
    );
  }
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <p>Every recorded decision and rule change, with the rule versions used. Decision entries are de-identified: no names or member IDs, only coverage types, statuses, amounts, and rule references.</p>
        </div>
        {demo && audit.length > 0 && <button className="btn small" onClick={() => confirm("Clear the demo audit log?") && clearAudit()}>Clear demo log</button>}
      </div>
      {audit.length === 0 ? (
        <p className="muted">No entries yet. Record a decision from the registration check, or propose a rule change, and it will appear here.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>When</th><th>Who</th><th>Event</th><th>Summary</th><th></th></tr>
            </thead>
            <tbody>
              {audit.map((e) => (
                <Fragment key={e.id}>
                  <tr>
                    <td className="num">{new Date(e.at).toLocaleString()}</td>
                    <td>{e.actor}<div className="faint">{ROLE_LABEL[e.role]}</div></td>
                    <td>{KIND_LABEL[e.kind]}</td>
                    <td>{e.summary}</td>
                    <td>{e.detail ? <button className="btn small" onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? "Hide" : "Details"}</button> : null}</td>
                  </tr>
                  {open === e.id && (
                    <tr>
                      <td colSpan={5}><pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: "0.8rem" }}>{JSON.stringify(e.detail, null, 2)}</pre></td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
