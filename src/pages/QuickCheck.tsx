import { useEffect, useMemo, useState } from "react";
import { MoneyInput } from "../components/fields";
import { CARRIERS } from "../data/plans";
import { formatCents } from "../engine/calc";
import { paramValue } from "../engine/rules";
import { PLAN_KINDS, VISIT_TYPES, planLabel, questionsNeeded, quickCopay, type Holder, type LibraryPlan, type MspAnswers, type PlanKind, type QuickAnswers, type VisitType } from "../engine/quick";
import { useApp } from "../lib/app";
import { can, planStore, uid } from "../lib/store";

const MAX_COVERAGES = 4;

export function QuickCheck() {
  const { rules, role } = useApp();
  const [library, setLibrary] = useState<LibraryPlan[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [slots, setSlots] = useState<(LibraryPlan | null)[]>([null]);
  const [visit, setVisit] = useState<VisitType>("office");
  const [ans, setAns] = useState<QuickAnswers>({ hospice: "no" });
  const set = (patch: Partial<QuickAnswers>) => setAns((a) => ({ ...a, ...patch }));
  const msp: MspAnswers = ans.msp ?? {};
  const setMsp = (m: MspAnswers) => set({ msp: m });
  const [adding, setAdding] = useState<number | null>(null);

  const reload = () => planStore.load().then(setLibrary).catch((e) => setLoadError(e.message));
  useEffect(() => {
    reload();
  }, []);

  const plans = slots.filter((p): p is LibraryPlan => !!p);
  const q = questionsNeeded(plans, visit, ans);
  const collectPrimaryWhenSecondary = paramValue(rules.find((r) => r.id === "FAC-SEC-001"), "collectPrimaryCopayWhenSecondaryExists", false);
  const result = useMemo(
    () => quickCopay({ ...ans, plans, visit, collectPrimaryWhenSecondary }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(plans.map((p) => p.id)), library, visit, ans, collectPrimaryWhenSecondary],
  );
  const childPlans = plans.filter((p) => ans.holder?.[p.id] === "child");

  const reset = () => {
    setSlots([null]);
    setVisit("office");
    setAns({ hospice: "no" });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Copay check</h1>
          <p>Pick the visit and add every coverage the patient has, in any order. Ledgr works out who pays first and tells you what to collect.</p>
        </div>
        <button className="btn" onClick={reset}>New patient</button>
      </div>
      {loadError && <div className="warn" style={{ borderRadius: 8, marginBottom: 12 }}>Couldn't load the plan library: {loadError}</div>}

      <div className="workspace">
        <div>
          <section className="panel">
            <div className="panel-head"><h2>Visit</h2></div>
            <div className="panel-body">
              <div className="chips" role="group" aria-label="Visit type">
                {VISIT_TYPES.map((v) => (
                  <button key={v.value} type="button" className="chip" aria-pressed={visit === v.value} onClick={() => setVisit(v.value)}>
                    {v.label}
                  </button>
                ))}
              </div>
              {visit === "emergency" && (
                <div className="grid g2">
                  <YesNo label="Has the patient been seen by the provider?" value={ans.edSeen} onChange={(b) => set({ edSeen: b })} />
                  {ans.edSeen && <YesNo label="Is the patient being admitted?" value={ans.admitted} onChange={(b) => set({ admitted: b })} />}
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Coverage</h2>
              {slots.length < MAX_COVERAGES && (
                <button className="btn small" onClick={() => setSlots([...slots, null])}>Add another coverage</button>
              )}
            </div>
            <div className="panel-body">
              {slots.map((s, i) => (
                <div key={i} className="slot">
                  <div className="slot-head">
                    <strong>Coverage {i + 1}</strong>
                    {i > 0 && (
                      <button className="btn small" onClick={() => setSlots(slots.filter((_, j) => j !== i))}>Remove</button>
                    )}
                  </div>
                  <PlanPicker
                    library={library}
                    value={s}
                    onChange={(p) => setSlots(slots.map((x, j) => (j === i ? p : x)))}
                    onAddNew={() => setAdding(i)}
                  />
                  {s?.notes && <p className="faint" style={{ marginTop: 6 }}>{s.notes}</p>}
                  {s && q.holderFor.includes(s.id) && (
                    <label className="field" style={{ marginTop: 8 }}>
                      <span>How is the patient covered on this plan?</span>
                      <select value={ans.holder?.[s.id] ?? ""} onChange={(e) => set({ holder: { ...ans.holder, [s.id]: e.target.value as Holder } })}>
                        <option value="">Choose…</option>
                        <option value="self_active">Patient's own plan — currently working</option>
                        <option value="self_retired">Patient's own plan — retired or laid off</option>
                        <option value="self_cobra">Patient's own plan — COBRA</option>
                        <option value="spouse">Spouse's plan</option>
                        <option value="child">Parent's plan (patient is a child)</option>
                      </select>
                    </label>
                  )}
                  {s?.needs_review && <p className="faint" style={{ marginTop: 4, color: "var(--st-estimate)" }}>Added at the desk — waiting for an admin to confirm the amounts.</p>}
                  {adding === i && (
                    <AddPlan
                      onCancel={() => setAdding(null)}
                      onSaved={(p) => {
                        setAdding(null);
                        setLibrary((l) => [...l, p]);
                        setSlots(slots.map((x, j) => (j === i ? p : x)));
                      }}
                      admin={can.editRules(role)}
                    />
                  )}
                </div>
              ))}
              <p className="faint">No insurance? Leave it empty.</p>
            </div>
          </section>

          {(q.msp || q.medicaidLevel || q.hospice || q.vaAuthorized || q.accidentRelated || q.blackLungRelated || q.tricareActiveDuty || q.parentRules) && (
            <section className="panel">
              <div className="panel-head"><h2>A few more questions</h2></div>
              <div className="panel-body">
                {q.accidentRelated && <YesNo label="Is this visit for the work injury or accident?" value={ans.accidentRelated} onChange={(b) => set({ accidentRelated: b })} />}
                {q.blackLungRelated && <YesNo label="Is this visit for the patient's black lung condition?" value={ans.blackLungRelated} onChange={(b) => set({ blackLungRelated: b })} />}
                {q.vaAuthorized && <YesNo label="Is there a VA authorization or referral for this visit?" value={ans.vaAuthorized} onChange={(b) => set({ vaAuthorized: b })} />}
                {q.hospice && (
                  <label className="field">
                    <span>Is the patient on hospice?</span>
                    <select value={ans.hospice ?? "no"} onChange={(e) => set({ hospice: e.target.value as QuickAnswers["hospice"] })}>
                      <option value="no">No</option>
                      <option value="unrelated">Yes — this visit is unrelated to the hospice diagnosis</option>
                      <option value="related">Yes — this visit is related to the hospice diagnosis</option>
                      <option value="unknown">Yes — not sure if related</option>
                    </select>
                  </label>
                )}
                {q.researchProgram && <YesNo label="Is a government research program or grant paying for this care?" value={ans.researchProgram ?? false} onChange={(b) => set({ researchProgram: b })} />}
                {q.medicaidLevel && (
                  <label className="field">
                    <span>Medicaid level on the eligibility response</span>
                    <select value={ans.medicaidLevel ?? ""} onChange={(e) => set({ medicaidLevel: (e.target.value || undefined) as QuickAnswers["medicaidLevel"] })}>
                      <option value="">Choose…</option>
                      <option value="qmb">QMB (Qualified Medicare Beneficiary)</option>
                      <option value="full">Full Medicaid</option>
                      <option value="partial">Partial — SLMB or QI only</option>
                      <option value="unknown">Not sure</option>
                    </select>
                  </label>
                )}
                {q.tricareActiveDuty && <YesNo label="Is the patient an active-duty service member?" value={ans.tricareActiveDuty} onChange={(b) => set({ tricareActiveDuty: b })} />}
                {q.parentRules && (
                  <>
                    <YesNo label="Are the child's parents married or living together?" value={ans.parentsTogether} onChange={(b) => set({ parentsTogether: b })} />
                    {ans.parentsTogether === true && (
                      <label className="field">
                        <span>Whose birthday (month and day) comes first in the year?</span>
                        <select value={ans.birthdayFirstPlanId ?? ""} onChange={(e) => set({ birthdayFirstPlanId: e.target.value || undefined })}>
                          <option value="">Choose…</option>
                          {childPlans.map((p) => <option key={p.id} value={p.id}>The parent on {planLabel(p)}</option>)}
                        </select>
                      </label>
                    )}
                    {ans.parentsTogether === false && (
                      <label className="field">
                        <span>Which plan is named by a court order — or, with no order, belongs to the custodial parent?</span>
                        <select value={ans.custodyPlanId ?? ""} onChange={(e) => set({ custodyPlanId: e.target.value || undefined })}>
                          <option value="">Choose…</option>
                          {childPlans.map((p) => <option key={p.id} value={p.id}>{planLabel(p)}</option>)}
                        </select>
                      </label>
                    )}
                  </>
                )}
                {q.msp && (
                  <>
                    <p className="muted">Medicare plus another health plan: these answers decide who pays first.</p>
                    <label className="field">
                      <span>Why does the patient have Medicare?</span>
                      <select value={msp.reason ?? ""} onChange={(e) => setMsp({ ...msp, reason: (e.target.value || undefined) as MspAnswers["reason"] })}>
                        <option value="">Choose…</option>
                        <option value="age">Age 65 or older</option>
                        <option value="disability">Disability (under 65)</option>
                        <option value="esrd">Kidney failure (ESRD)</option>
                      </select>
                    </label>
                    {msp.reason === "esrd" && (
                      <YesNo label="Is the patient within the 30-month kidney failure coordination period?" value={msp.esrdFirst30Months} onChange={(b) => setMsp({ ...msp, esrdFirst30Months: b })} />
                    )}
                    {(msp.reason === "age" || msp.reason === "disability") && (
                      <>
                        <YesNo label="Is the other plan COBRA?" value={msp.cobra} onChange={(b) => setMsp({ ...msp, cobra: b })} />
                        {msp.cobra === false && (
                          <YesNo label="Is the patient or spouse currently working and covered by that employer's plan?" value={msp.working} onChange={(b) => setMsp({ ...msp, working: b })} />
                        )}
                        {msp.cobra === false && msp.working && (
                          <label className="field">
                            <span>How many employees does that employer have?</span>
                            <select value={msp.employerSize ?? ""} onChange={(e) => setMsp({ ...msp, employerSize: (e.target.value || undefined) as MspAnswers["employerSize"] })}>
                              <option value="">Choose…</option>
                              <option value="under20">Fewer than 20</option>
                              <option value="under20_multi">Fewer than 20, but part of a multi-employer or union plan</option>
                              <option value="20to99">20 to 99</option>
                              <option value="100plus">100 or more</option>
                            </select>
                          </label>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </section>
          )}

          <section className="panel">
            <div className="panel-body">
              <label className="field" style={{ maxWidth: 260 }}>
                <span>Already collected for this visit</span>
                <MoneyInput cents={ans.collectedCents ?? 0} placeholder="0.00" onChange={(c) => set({ collectedCents: c ?? 0 })} />
              </label>
            </div>
          </section>
        </div>

        <aside className="sticky" id="answer">
          <section className="answer" data-tone={result.tone} aria-live="polite">
            <div className="answer-amount">
              {result.amountCents !== null && result.tone === "collect" ? formatCents(result.amountCents) : result.amountCents === 0 ? "$0" : "—"}
            </div>
            <div className="answer-head">{result.headline}</div>
            {result.order && result.order.length > 1 && (
              <ol className="answer-order">
                {result.order.map((o, i) => <li key={i}><span>{["Primary", "Secondary", "Tertiary", "Fourth"][i]}</span> {o}</li>)}
              </ol>
            )}
            <ul>
              {result.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </section>
          <p className="faint">Copay amounts come from your plan library. Ledgr never fills in a blank amount.</p>
        </aside>
      </div>
      <div className="mobile-jump">
        <a href="#answer">{result.headline}</a>
      </div>
    </div>
  );
}

function YesNo({ label, value, onChange }: { label: string; value: boolean | undefined; onChange: (b: boolean) => void }) {
  return (
    <div className="field" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="seg">
        <button type="button" aria-pressed={value === true} onClick={() => onChange(true)}>Yes</button>
        <button type="button" aria-pressed={value === false} onClick={() => onChange(false)}>No</button>
      </div>
    </div>
  );
}

function PlanPicker({ library, value, onChange, onAddNew }: { library: LibraryPlan[]; value: LibraryPlan | null; onChange: (p: LibraryPlan | null) => void; onAddNew: () => void }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const t = text.toLowerCase().trim();
    const list = t ? library.filter((p) => `${p.payer} ${p.name} ${p.group_name ?? ""}`.toLowerCase().includes(t)) : library;
    return list.slice(0, 10);
  }, [text, library]);

  if (value) {
    return (
      <div className="picked">
        <span>
          <strong>{value.payer}</strong> — {value.name}
          {value.group_name ? ` (${value.group_name})` : ""}
        </span>
        <button className="btn small" onClick={() => onChange(null)}>Change</button>
      </div>
    );
  }
  return (
    <div className="picker">
      <input
        placeholder="Search payer or plan — e.g. Cigna, Medicare, Plan G"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label="Search plans"
      />
      {open && (
        <ul className="picker-list" role="listbox">
          {matches.map((p) => (
            <li key={p.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(p); setText(""); setOpen(false); }}>
                <strong>{p.payer}</strong> — {p.name}
                {p.group_name ? <span className="faint"> ({p.group_name})</span> : null}
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="add-new" onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen(false); onAddNew(); }}>
              + Plan not listed? Add it
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

function AddPlan({ onCancel, onSaved, admin }: { onCancel: () => void; onSaved: (p: LibraryPlan) => void; admin: boolean }) {
  const [payer, setPayer] = useState("");
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [kind, setKind] = useState<PlanKind>("commercial");
  const [copays, setCopays] = useState<LibraryPlan["copays"]>({});
  const [waived, setWaived] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!payer.trim() || !name.trim()) return setErr("Enter the payer and the plan name from the card.");
    setSaving(true);
    try {
      const p: LibraryPlan = { id: uid(), payer: payer.trim(), name: name.trim(), group_name: group.trim() || null, kind, copays, ed_waived_if_admitted: waived, needs_review: !admin, notes: null };
      onSaved(await planStore.save(p, true));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="add-plan">
      <h3>Add a plan</h3>
      <p className="faint">Enter the copays from the card or eligibility response. Leave a box blank if you don't know it.</p>
      <div className="grid g2">
        <label className="field">
          <span>Payer</span>
          <input list="carriers" value={payer} onChange={(e) => setPayer(e.target.value)} placeholder="e.g. Cigna" />
          <datalist id="carriers">{CARRIERS.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <label className="field">
          <span>Plan name (from the card)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Open Access Plus" />
        </label>
        <label className="field">
          <span>Employer / group (optional)</span>
          <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="e.g. Acme Corp" />
        </label>
        <label className="field">
          <span>Type</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as PlanKind)}>
            {PLAN_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
      </div>
      <div className="grid g4">
        {VISIT_TYPES.map((v) => (
          <label key={v.value} className="field">
            <span>{v.label}</span>
            <MoneyInput cents={copays[v.value] ?? null} onChange={(c) => setCopays({ ...copays, [v.value]: c })} />
          </label>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={waived} onChange={(e) => setWaived(e.target.checked)} />
        <span>ER copay is waived if the patient is admitted</span>
      </label>
      {err && <p style={{ color: "var(--st-ed)" }}>{err}</p>}
      <div className="btn-row">
        <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save plan"}</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
