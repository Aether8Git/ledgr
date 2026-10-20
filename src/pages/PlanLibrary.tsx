import { useEffect, useMemo, useState } from "react";
import { MoneyInput } from "../components/fields";
import { CARRIERS } from "../data/plans";
import { formatCents } from "../engine/calc";
import { PLAN_KINDS, VISIT_TYPES, type LibraryPlan, type PlanKind, type VisitType } from "../engine/quick";
import { useApp } from "../lib/app";
import { can, planStore, uid } from "../lib/store";

const KIND_LABEL = Object.fromEntries(PLAN_KINDS.map((k) => [k.value, k.label])) as Record<PlanKind, string>;
const CSV_COLUMNS = ["payer", "name", "group", "type", ...VISIT_TYPES.map((v) => v.value), "er_waived_if_admitted", "notes"];

export function PlanLibrary() {
  const { role } = useApp();
  const admin = can.editRules(role);
  const [plans, setPlans] = useState<LibraryPlan[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "review" | "example" | "missing">("all");
  const [editing, setEditing] = useState<LibraryPlan | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const reload = () => planStore.load().then(setPlans).catch((e) => setErr(e.message));
  useEffect(() => {
    reload();
  }, []);

  const shown = useMemo(() => {
    const t = q.toLowerCase().trim();
    return plans
      .filter((p) => !t || `${p.payer} ${p.name} ${p.group_name ?? ""}`.toLowerCase().includes(t))
      .filter((p) => filter === "all" || (filter === "review" && p.needs_review) || (filter === "example" && p.example) || (filter === "missing" && VISIT_TYPES.some((v) => p.copays[v.value] == null)));
  }, [plans, q, filter]);

  const counts = {
    review: plans.filter((p) => p.needs_review).length,
    example: plans.filter((p) => p.example).length,
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Plan library</h1>
          <p>Every plan Ledgr knows, with its copay for each visit type. A blank box means "not loaded" — the copay check will tell staff to look it up instead of guessing.</p>
        </div>
        {admin && (
          <div className="btn-row">
            <button className="btn" onClick={() => setImportOpen(true)}>Import from spreadsheet</button>
            <button className="btn primary" onClick={() => { setIsNew(true); setEditing({ id: uid(), payer: "", name: "", kind: "commercial", copays: {}, ed_waived_if_admitted: false }); }}>Add plan</button>
          </div>
        )}
      </div>
      {!admin && <div className="note" style={{ marginBottom: 16 }}>Registrars can add a new plan from the copay check screen. Rules Administrators and Compliance Reviewers can edit or remove plans here.</div>}
      {err && <div className="warn" style={{ borderRadius: 8, marginBottom: 12 }}>{err}</div>}

      <div className="grid g2" style={{ marginBottom: 14 }}>
        <label className="field">
          <span>Search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Payer, plan or employer" />
        </label>
        <label className="field">
          <span>Show</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">All plans ({plans.length})</option>
            <option value="review">Added at the desk — needs review ({counts.review})</option>
            <option value="example">Example plans to replace ({counts.example})</option>
            <option value="missing">Plans with missing copays</option>
          </select>
        </label>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Plan</th>
              {VISIT_TYPES.map((v) => <th key={v.value} className="num">{v.label.replace(" / primary care", "").replace(" department", "").replace(" procedure", "").replace(" admission", "")}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id} className={admin ? "clickable" : undefined} onClick={() => admin && (setIsNew(false), setEditing(structuredClone(p)))}>
                <td>
                  <strong>{p.payer}</strong> — {p.name}
                  {p.group_name && <span className="faint"> ({p.group_name})</span>}
                  <div className="faint">
                    {KIND_LABEL[p.kind]}
                    {p.medicare_parts && p.medicare_parts !== "AB" ? `, Part ${p.medicare_parts} only` : ""}
                    {p.ed_waived_if_admitted ? ", ER copay waived if admitted" : ""}
                  </div>
                  <div className="btn-row" style={{ marginTop: 4 }}>
                    {p.example && <span className="badge reference_cited">Example</span>}
                    {p.needs_review && <span className="badge draft">Needs review</span>}
                  </div>
                </td>
                {VISIT_TYPES.map((v) => (
                  <td key={v.value} className="num">{p.copays[v.value] == null ? <span className="faint">—</span> : formatCents(p.copays[v.value]!)}</td>
                ))}
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={9} className="muted">No plans match.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <PlanDrawer
          plan={editing}
          isNew={isNew}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
      {importOpen && <ImportDrawer onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); reload(); }} />}
    </div>
  );
}

function PlanDrawer({ plan, isNew, onClose, onSaved }: { plan: LibraryPlan; isNew: boolean; onClose: () => void; onSaved: () => void }) {
  const [p, setP] = useState<LibraryPlan>(plan);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<LibraryPlan>) => setP({ ...p, ...patch });

  const save = async () => {
    if (!p.payer.trim() || !p.name.trim()) return setErr("Payer and plan name are required.");
    setBusy(true);
    try {
      await planStore.save({ ...p, needs_review: false }, isNew);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirm(`Remove ${p.payer} — ${p.name} from the plan library?`)) return;
    setBusy(true);
    try {
      await planStore.remove(p.id);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Edit plan">
        <div className="panel-head">
          <h2>{isNew ? "Add plan" : "Edit plan"}</h2>
          <button className="btn small" onClick={onClose}>Close</button>
        </div>
        <div className="panel-body">
          <div className="grid g2">
            <label className="field">
              <span>Payer</span>
              <input list="carriers-lib" value={p.payer} onChange={(e) => set({ payer: e.target.value })} />
              <datalist id="carriers-lib">{CARRIERS.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <label className="field">
              <span>Plan name</span>
              <input value={p.name} onChange={(e) => set({ name: e.target.value })} />
            </label>
            <label className="field">
              <span>Employer / group (optional)</span>
              <input value={p.group_name ?? ""} onChange={(e) => set({ group_name: e.target.value || null })} />
            </label>
            <label className="field">
              <span>Type</span>
              <select value={p.kind} onChange={(e) => set({ kind: e.target.value as PlanKind })}>
                {PLAN_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </label>
            {p.kind === "medicare" && (
              <label className="field">
                <span>Medicare parts</span>
                <select value={p.medicare_parts ?? "AB"} onChange={(e) => set({ medicare_parts: e.target.value as LibraryPlan["medicare_parts"] })}>
                  <option value="AB">Part A and Part B</option>
                  <option value="A">Part A only</option>
                  <option value="B">Part B only</option>
                </select>
              </label>
            )}
          </div>
          <div className="subhead">Copays — leave blank if unknown, enter 0 for no copay</div>
          <div className="grid g2">
            {VISIT_TYPES.map((v) => (
              <label key={v.value} className="field">
                <span>{v.label}</span>
                <MoneyInput cents={p.copays[v.value] ?? null} onChange={(c) => set({ copays: { ...p.copays, [v.value]: c } })} />
              </label>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={p.ed_waived_if_admitted} onChange={(e) => set({ ed_waived_if_admitted: e.target.checked })} />
            <span>ER copay is waived if the patient is admitted</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={!!p.example} onChange={(e) => set({ example: e.target.checked })} />
            <span>Example plan (amounts are placeholders)</span>
          </label>
          <label className="field">
            <span>Notes for staff</span>
            <textarea value={p.notes ?? ""} onChange={(e) => set({ notes: e.target.value || null })} />
          </label>
          {plan.needs_review && <p className="faint">Saving confirms this desk-added plan and clears its review flag.</p>}
          {err && <p style={{ color: "var(--st-ed)" }}>{err}</p>}
          <div className="btn-row">
            <button className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save plan"}</button>
            {!isNew && <button className="btn danger" onClick={remove} disabled={busy}>Remove plan</button>}
          </div>
        </div>
      </aside>
    </>
  );
}

function parseMoney(s: string): number | null {
  const t = s.replace(/[$,\s]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === "," || c === "\t") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

function ImportDrawer({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => {
    const rows = parseCsv(text);
    if (!rows.length) return { plans: [] as LibraryPlan[], problems: [] as string[] };
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const hasHeader = header.includes("payer");
    const cols = hasHeader ? header : CSV_COLUMNS;
    const body = hasHeader ? rows.slice(1) : rows;
    const problems: string[] = [];
    const plans: LibraryPlan[] = [];
    body.forEach((r, i) => {
      const get = (k: string) => (r[cols.indexOf(k)] ?? "").trim();
      const payer = get("payer");
      const name = get("name") || get("plan");
      if (!payer || !name) return problems.push(`Row ${i + 1}: needs a payer and a plan name.`);
      const typeText = get("type").toLowerCase();
      const kind = (PLAN_KINDS.find((k) => k.value === typeText || k.label.toLowerCase() === typeText)?.value ?? "commercial") as PlanKind;
      const copays: Partial<Record<VisitType, number | null>> = {};
      for (const v of VISIT_TYPES) copays[v.value] = parseMoney(get(v.value));
      plans.push({ id: uid(), payer, name, group_name: get("group") || null, kind, copays, ed_waived_if_admitted: /^(y|yes|true|1)$/i.test(get("er_waived_if_admitted")), notes: get("notes") || null });
    });
    return { plans, problems };
  }, [text]);

  const run = async () => {
    setBusy(true);
    let ok = 0;
    const errs: string[] = [];
    for (const p of preview.plans) {
      try {
        await planStore.save(p, true);
        ok++;
      } catch (e) {
        errs.push(`${p.payer} — ${p.name}: ${(e as Error).message}`);
      }
    }
    setBusy(false);
    if (errs.length) setMsg(`Imported ${ok}. ${errs.length} failed: ${errs.slice(0, 3).join("; ")}`);
    else onDone();
  };

  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Import plans">
        <div className="panel-head">
          <h2>Import from spreadsheet</h2>
          <button className="btn small" onClick={onClose}>Close</button>
        </div>
        <div className="panel-body">
          <p>Copy rows from Excel or Google Sheets and paste them below. Use these columns, in this order, with a header row:</p>
          <pre className="code">{CSV_COLUMNS.join(", ")}</pre>
          <p className="faint">Type is one of: {PLAN_KINDS.map((k) => k.value).join(", ")}. Leave a copay blank if unknown; use 0 for no copay.</p>
          <textarea style={{ minHeight: 180, width: "100%" }} value={text} onChange={(e) => setText(e.target.value)} placeholder={"payer,name,group,type,office,specialist,...\nCigna,Open Access Plus,Acme Corp,commercial,30,60,75,300,,,0,,yes,"} />
          {text && <p>{preview.plans.length} plan(s) ready to import.{preview.problems.length ? ` ${preview.problems.length} row(s) skipped.` : ""}</p>}
          {preview.problems.slice(0, 5).map((p, i) => <p key={i} className="faint">{p}</p>)}
          {msg && <p style={{ color: "var(--st-ed)" }}>{msg}</p>}
          <div className="btn-row">
            <button className="btn primary" disabled={!preview.plans.length || busy} onClick={run}>{busy ? "Importing…" : `Import ${preview.plans.length} plan(s)`}</button>
          </div>
        </div>
      </aside>
    </>
  );
}
