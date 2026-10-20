import { useMemo, useState } from "react";
import { CATEGORY_LABEL, PLAN_TYPE_OPTIONS, VERIFICATION_LABEL } from "../components/labels";
import { Check, Field, MoneyInput, Select } from "../components/fields";
import { isLockedRule } from "../engine/rules";
import { CATEGORY_PRECEDENCE, type RuleCategory, type RuleDefinition, type VerificationStatus } from "../engine/types";
import { useApp } from "../lib/app";
import { can, ROLE_LABEL, type ChangeRequest, type Role } from "../lib/store";

export function RulesAdmin() {
  const { rules, changes, role, user, proposeChange, decideChange, resetRules, demo } = useApp();
  const [tab, setTab] = useState<"library" | "pending" | "history">("library");
  const [cat, setCat] = useState<RuleCategory | "all">("all");
  const [status, setStatus] = useState<VerificationStatus | "all">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<RuleDefinition | null>(null);
  const pending = changes.filter((c) => c.status === "pending");

  const list = useMemo(
    () =>
      [...rules]
        .filter((r) => (cat === "all" || r.category === cat) && (status === "all" || r.verificationStatus === status))
        .filter((r) => !q || `${r.id} ${r.name} ${r.source}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => CATEGORY_PRECEDENCE[a.category] - CATEGORY_PRECEDENCE[b.category] || a.priority - b.priority),
    [rules, cat, status, q],
  );
  const counts = {
    verified: rules.filter((r) => r.verificationStatus === "verified").length,
    cited: rules.filter((r) => r.verificationStatus === "reference_cited").length,
    draft: rules.filter((r) => r.verificationStatus === "draft").length,
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Rule library</h1>
          <p>
            Every recommendation traces back to a rule here. Changes are proposed, then approved by a different reviewer before they take effect. Precedence runs federal law, state law, payer contract, plan benefit, facility policy, then operational safeguards — a lower tier never overrides a higher one.
          </p>
        </div>
        <div className="btn-row">
          <span className="badge verified">{counts.verified} verified</span>
          <span className="badge reference_cited">{counts.cited} awaiting validation</span>
          <span className="badge draft">{counts.draft} draft</span>
          {demo && can.editRules(role) && (
            <button className="btn small" onClick={() => confirm("Reset the demo rule library to the seed rules? Pending changes are discarded.") && resetRules()}>
              Reset demo library
            </button>
          )}
        </div>
      </div>

      {!can.editRules(role) && <div className="note" style={{ marginBottom: 16 }}>You're viewing as {ROLE_LABEL[role]}. Rules Administrators and Compliance Reviewers can propose and approve changes.</div>}

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "library"} onClick={() => setTab("library")}>Rules ({rules.length})</button>
        <button role="tab" aria-selected={tab === "pending"} onClick={() => setTab("pending")}>Awaiting approval ({pending.length})</button>
        <button role="tab" aria-selected={tab === "history"} onClick={() => setTab("history")}>Decided changes</button>
      </div>

      {tab === "library" && (
        <>
          <div className="grid g3" style={{ marginBottom: 14 }}>
            <Field label="Search">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ID, name, or citation" />
            </Field>
            <Field label="Category">
              <Select value={cat} onChange={setCat} options={[{ value: "all", label: "All categories" }, ...Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value: value as RuleCategory, label }))]} />
            </Field>
            <Field label="Verification">
              <Select value={status} onChange={setStatus} options={[{ value: "all", label: "Any status" }, ...Object.entries(VERIFICATION_LABEL).map(([value, label]) => ({ value: value as VerificationStatus, label }))]} />
            </Field>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Category</th>
                  <th>Jurisdiction</th>
                  <th>Status</th>
                  <th>Version</th>
                  <th>On</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => setOpen(r)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(r)}>
                    <td>
                      <strong>{r.id}</strong>
                      <div>{r.name}</div>
                      <div className="faint">{r.source}</div>
                    </td>
                    <td>{CATEGORY_LABEL[r.category]}</td>
                    <td>{r.jurisdiction}</td>
                    <td><span className={`badge ${r.verificationStatus}`}>{VERIFICATION_LABEL[r.verificationStatus]}</span></td>
                    <td className="num">v{r.version}{pending.some((p) => p.ruleId === r.id) && <div className="faint">change pending</div>}</td>
                    <td>{isLockedRule(r) ? "Always" : r.enabled ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "pending" && (
        <div style={{ display: "grid", gap: 14 }}>
          {pending.length === 0 && <p className="muted">Nothing is waiting for approval. Open a rule in the library to propose a change.</p>}
          {pending.map((c) => (
            <PendingCard key={c.id} c={c} current={rules.find((r) => r.id === c.ruleId)} role={role} user={user} decideChange={decideChange} />
          ))}
        </div>
      )}

      {tab === "history" && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Rule</th><th>Change</th><th>Proposed</th><th>Decision</th></tr>
            </thead>
            <tbody>
              {changes.filter((c) => c.status !== "pending").map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.ruleId}</strong></td>
                  <td>{c.summary}</td>
                  <td>{c.proposedBy}<div className="faint">{new Date(c.proposedAt).toLocaleString()}</div></td>
                  <td>
                    <span className={`badge ${c.status === "approved" ? "pass" : "fail"}`}>{c.status === "approved" ? "Approved" : "Rejected"}</span>
                    <div className="faint">{c.decidedBy}, {c.decidedAt && new Date(c.decidedAt).toLocaleString()}</div>
                    {c.decisionNote && <div className="faint">{c.decisionNote}</div>}
                  </td>
                </tr>
              ))}
              {changes.every((c) => c.status === "pending") && (
                <tr><td colSpan={4} className="muted">No decided changes yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <RuleDrawer
          rule={open}
          canEdit={can.editRules(role)}
          hasPending={pending.some((p) => p.ruleId === open.id)}
          onClose={() => setOpen(null)}
          onPropose={(next, summary) => {
            proposeChange(next, summary);
            setOpen(null);
            setTab("pending");
          }}
        />
      )}
    </div>
  );
}

function PendingCard({ c, current, role, user, decideChange }: { c: ChangeRequest; current?: RuleDefinition; role: Role; user: string; decideChange: (id: string, approve: boolean, note: string) => string | null }) {
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const diffs = current ? diffRule(current, c.proposed) : ["New rule"];
  const own = c.proposedBy === user;
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>{c.ruleId}: {c.summary}</h3>
          <div className="faint">Proposed by {c.proposedBy} ({ROLE_LABEL[c.proposedByRole]}), {new Date(c.proposedAt).toLocaleString()}</div>
        </div>
      </div>
      <div className="panel-body">
        <ul>{diffs.map((d, i) => <li key={i}>{d}</li>)}</ul>
        {can.approveRules(role) ? (
          <>
            {own && <div className="note">You proposed this change. A different reviewer must approve it — switch the signed-in user in the sidebar to try the two-person flow.</div>}
            <Field label="Review note">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you checked, e.g. source reviewed on date" />
            </Field>
            {err && <p style={{ color: "var(--st-ed)" }}>{err}</p>}
            <div className="btn-row">
              <button className="btn primary small" disabled={own} onClick={() => setErr(decideChange(c.id, true, note))}>Approve and publish</button>
              <button className="btn small" disabled={own} onClick={() => setErr(decideChange(c.id, false, note))}>Reject</button>
            </div>
          </>
        ) : (
          <p className="faint">Only Compliance Reviewers and Rules Administrators can approve.</p>
        )}
      </div>
    </section>
  );
}

function diffRule(a: RuleDefinition, b: RuleDefinition): string[] {
  const out: string[] = [];
  const keys: (keyof RuleDefinition)[] = ["name", "description", "source", "sourceUrl", "jurisdiction", "effectiveDate", "expirationDate", "verificationStatus", "verificationDate", "reviewer", "enabled", "logicSummary", "priority"];
  for (const k of keys) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(`${k}: ${fmt(a[k])} → ${fmt(b[k])}`);
  for (const p of b.params) {
    const old = a.params.find((x) => x.key === p.key);
    if (!old || old.value !== p.value) out.push(`${p.label}: ${fmt(old?.value)} → ${fmt(p.value)}`);
  }
  return out.length ? out : ["No field changes (re-approval only)"];
}
const fmt = (v: unknown) => (v === undefined || v === null || v === "" ? "(blank)" : String(v));

function RuleDrawer({ rule, canEdit, hasPending, onClose, onPropose }: { rule: RuleDefinition; canEdit: boolean; hasPending: boolean; onClose: () => void; onPropose: (r: RuleDefinition, summary: string) => void }) {
  const [draft, setDraft] = useState<RuleDefinition>(structuredClone(rule));
  const [summary, setSummary] = useState("");
  const set = (patch: Partial<RuleDefinition>) => setDraft({ ...draft, ...patch });
  const locked = isLockedRule(rule);
  const changed = diffRule(rule, draft)[0] !== "No field changes (re-approval only)";
  const editable = canEdit && !hasPending;
  const markingVerified = draft.verificationStatus === "verified" && rule.verificationStatus !== "verified";
  const verifyIncomplete = markingVerified && (!draft.verificationDate || !draft.reviewer);

  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`Rule ${rule.id}`}>
        <div className="panel-head">
          <div>
            <h2>{rule.id}</h2>
            <div className="muted">{rule.name}</div>
          </div>
          <button className="btn small" onClick={onClose}>Close</button>
        </div>
        <div className="panel-body">
          <div className="btn-row">
            <span className="badge cat">{CATEGORY_LABEL[rule.category]}</span>
            <span className={`badge ${rule.verificationStatus}`}>{VERIFICATION_LABEL[rule.verificationStatus]}</span>
            <span className="badge cat">v{rule.version}</span>
            <span className="badge cat">{rule.conflictBehavior === "blocking" ? "Blocking" : "Advisory"}</span>
          </div>
          <p>{rule.description}</p>
          <dl className="kv">
            <dt>Logic</dt><dd>{rule.logicSummary}</dd>
            <dt>Payer / plan</dt><dd>{rule.payerScope} — {rule.planScope}</dd>
            <dt>Coverage types</dt><dd>{rule.coverageTypes === "any" ? "Any" : rule.coverageTypes.map((t) => PLAN_TYPE_OPTIONS.find((o) => o.value === t)?.label).join(", ")}</dd>
            <dt>Settings</dt><dd>{rule.settings === "any" ? "Any" : rule.settings.join(", ")}</dd>
            <dt>Required inputs</dt><dd>{rule.requiredInputs.join(", ") || "None"}</dd>
            <dt>Engine key</dt><dd><code>{rule.logicKey}</code>, priority {rule.priority}</dd>
          </dl>
          {hasPending && <div className="note">A change to this rule is waiting for approval. Approve or reject it before proposing another.</div>}

          <div className="subhead">Source and verification</div>
          <Field label="Authoritative source">
            <textarea value={draft.source} disabled={!editable} onChange={(e) => set({ source: e.target.value })} />
          </Field>
          <Field label="Source link">
            <input value={draft.sourceUrl ?? ""} disabled={!editable} onChange={(e) => set({ sourceUrl: e.target.value })} />
          </Field>
          {rule.sourceUrl && <a href={rule.sourceUrl} target="_blank" rel="noreferrer">Open current source</a>}
          <div className="grid g2">
            <Field label="Jurisdiction">
              <input value={draft.jurisdiction} disabled={!editable} onChange={(e) => set({ jurisdiction: e.target.value })} />
            </Field>
            <Field label="Responsible reviewer">
              <input value={draft.reviewer} disabled={!editable} onChange={(e) => set({ reviewer: e.target.value })} />
            </Field>
            <Field label="Effective">
              <input type="date" value={draft.effectiveDate} disabled={!editable} onChange={(e) => set({ effectiveDate: e.target.value })} />
            </Field>
            <Field label="Expires">
              <input type="date" value={draft.expirationDate ?? ""} disabled={!editable} onChange={(e) => set({ expirationDate: e.target.value || null })} />
            </Field>
            <Field label="Verification status">
              <Select<VerificationStatus> value={draft.verificationStatus} onChange={(verificationStatus) => editable && set({ verificationStatus })} options={Object.entries(VERIFICATION_LABEL).map(([value, label]) => ({ value: value as VerificationStatus, label }))} />
            </Field>
            <Field label="Verification date" hint={markingVerified ? "Required to mark verified" : undefined}>
              <input type="date" value={draft.verificationDate ?? ""} disabled={!editable} onChange={(e) => set({ verificationDate: e.target.value || null })} />
            </Field>
          </div>

          {(draft.params.length > 0 || !locked) && <div className="subhead">Configuration</div>}
          {!locked ? (
            <Check checked={draft.enabled} onChange={(enabled) => editable && set({ enabled })}>Rule enabled</Check>
          ) : (
            <p className="faint">Federal-law rules can't be switched off. Their wording, source, and verification can still be updated through approval.</p>
          )}
          {draft.params.map((p, i) => (
            <div key={p.key}>
              {p.type === "boolean" ? (
                <Check checked={Boolean(p.value)} onChange={(val) => editable && set({ params: draft.params.map((x, j) => (j === i ? { ...x, value: val } : x)) })}>{p.label}</Check>
              ) : p.type === "cents" ? (
                <Field label={p.label}>
                  <MoneyInput cents={Number(p.value)} onChange={(c) => editable && set({ params: draft.params.map((x, j) => (j === i ? { ...x, value: c ?? 0 } : x)) })} />
                </Field>
              ) : (
                <Field label={p.label}>
                  <input value={String(p.value)} disabled={!editable} onChange={(e) => set({ params: draft.params.map((x, j) => (j === i ? { ...x, value: p.type === "number" ? Number(e.target.value) : e.target.value } : x)) })} />
                </Field>
              )}
            </div>
          ))}

          {editable && (
            <>
              <div className="subhead">Propose change</div>
              <Field label="What changed and why">
                <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="e.g. Validated against 42 CFR 489.24 on 2026-11-02" />
              </Field>
              {verifyIncomplete && <p style={{ color: "var(--st-ed)" }}>Add a verification date and reviewer before marking this rule verified.</p>}
              <div className="btn-row">
                <button className="btn primary" disabled={!changed || !summary.trim() || verifyIncomplete} onClick={() => onPropose({ ...draft }, summary.trim())}>
                  Submit for approval
                </button>
                <span className="faint">Takes effect only after a second reviewer approves.</span>
              </div>
            </>
          )}

          <div className="subhead">Version history</div>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            {[...rule.history].reverse().map((h) => (
              <li key={h.version}>
                <strong>v{h.version}</strong> {h.summary}
                <div className="faint">{h.changedBy}{h.approvedBy ? `, approved by ${h.approvedBy}` : ""}, {h.changedAt.slice(0, 10)}</div>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </>
  );
}
