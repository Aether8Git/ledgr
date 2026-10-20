import { useMemo, useState } from "react";
import { ACTION_LABEL, STATUS_LABEL } from "../components/labels";
import { GLOSSARY, LESSONS, QUIZ } from "../data/learning";
import { SCENARIOS } from "../data/scenarios";
import { evaluate } from "../engine/engine";
import type { RecommendedAction } from "../engine/types";
import { useApp } from "../lib/app";

export function Learning() {
  const [tab, setTab] = useState<"lessons" | "terms" | "check" | "practice">("lessons");
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Learning center</h1>
          <p>How copays, deductibles, and multiple plans actually work at the desk — and when to collect, wait, or escalate.</p>
        </div>
      </div>
      <div className="note edu" style={{ marginBottom: 16 }}>
        Educational material. Examples use fictitious patients and hypothetical plan amounts. For a real patient, the verified payer response and your facility's approved rules are the authority.
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "lessons"} onClick={() => setTab("lessons")}>Walkthroughs</button>
        <button role="tab" aria-selected={tab === "terms"} onClick={() => setTab("terms")}>Terms</button>
        <button role="tab" aria-selected={tab === "check"} onClick={() => setTab("check")}>Knowledge check</button>
        <button role="tab" aria-selected={tab === "practice"} onClick={() => setTab("practice")}>Practice encounters</button>
      </div>
      {tab === "lessons" && <Lessons />}
      {tab === "terms" && <Terms />}
      {tab === "check" && <Quiz />}
      {tab === "practice" && <Practice />}
    </div>
  );
}

function Lessons() {
  const [id, setId] = useState(LESSONS[0].id);
  const l = LESSONS.find((x) => x.id === id)!;
  return (
    <div className="lesson-grid">
      <nav style={{ display: "grid", gap: 4, alignContent: "start" }}>
        {LESSONS.map((x) => (
          <button key={x.id} className="btn" style={{ textAlign: "left", borderColor: x.id === id ? "var(--chart)" : undefined }} onClick={() => setId(x.id)}>
            {x.title}
          </button>
        ))}
      </nav>
      <section className="panel">
        <div className="panel-head"><h2>{l.title}</h2></div>
        <div className="panel-body prose">
          <p>{l.intro}</p>
          <h3>Step by step</h3>
          <ol>{l.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          <dl className="kv" style={{ marginTop: 6 }}>
            <dt><strong style={{ color: "var(--st-verified)" }}>Collect</strong></dt><dd>{l.collect}</dd>
            <dt><strong style={{ color: "var(--st-awaiting)" }}>Wait</strong></dt><dd>{l.wait}</dd>
            <dt><strong style={{ color: "var(--st-review)" }}>Escalate</strong></dt><dd>{l.escalate}</dd>
          </dl>
        </div>
      </section>
    </div>
  );
}

function Terms() {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th style={{ width: "16%" }}>Term</th><th>What it means</th><th>At the desk</th><th>Common mistake</th></tr></thead>
        <tbody>
          {GLOSSARY.map((t) => (
            <tr key={t.term}>
              <td><strong>{t.term}</strong></td>
              <td>{t.plain}</td>
              <td>{t.atTheDesk}</td>
              <td className="muted">{t.mistake}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Quiz() {
  const [picked, setPicked] = useState<Record<number, number>>({});
  const score = Object.entries(picked).filter(([i, a]) => QUIZ[Number(i)].answer === a).length;
  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 820 }}>
      <p className="muted">{Object.keys(picked).length} of {QUIZ.length} answered, {score} correct.</p>
      {QUIZ.map((q, i) => (
        <section key={i} className="panel">
          <div className="panel-body">
            <h3>{i + 1}. {q.q}</h3>
            <div style={{ display: "grid", gap: 6 }}>
              {q.options.map((o, j) => {
                const chosen = picked[i];
                const state = chosen === undefined ? undefined : j === q.answer ? "right" : j === chosen ? "wrong" : undefined;
                return (
                  <button key={j} className="quiz-opt" data-state={state} disabled={chosen !== undefined} onClick={() => setPicked({ ...picked, [i]: j })}>
                    {o}
                  </button>
                );
              })}
            </div>
            {picked[i] !== undefined && <p className={picked[i] === q.answer ? "" : "muted"}><strong>{picked[i] === q.answer ? "Correct." : "Not quite."}</strong> {q.why}</p>}
          </div>
        </section>
      ))}
      {Object.keys(picked).length > 0 && <div><button className="btn" onClick={() => setPicked({})}>Start over</button></div>}
    </div>
  );
}

const PRACTICE_CHOICES: RecommendedAction[] = ["collect_verified_copay", "collect_verified_responsibility", "do_not_collect_verify", "wait_for_adjudication", "refer_financial_counseling", "refer_billing_review", "follow_ed_workflow", "no_collection"];

function Practice() {
  const { rules } = useApp();
  const pool = useMemo(() => SCENARIOS.filter((s) => s.number <= 30), []);
  const [idx, setIdx] = useState(0);
  const [guess, setGuess] = useState<RecommendedAction | null>(null);
  const s = pool[idx];
  const d = useMemo(() => evaluate(s.encounter, rules), [s, rules]);
  const right = guess === d.action;
  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 860 }}>
      <section className="panel">
        <div className="panel-head">
          <h2>Encounter {idx + 1} of {pool.length}</h2>
          <span className="faint">{s.group}</span>
        </div>
        <div className="panel-body">
          <h3>{s.title}</h3>
          <p>{s.summary}</p>
          <p className="muted">What should you do at the desk?</p>
          <div style={{ display: "grid", gap: 6 }}>
            {PRACTICE_CHOICES.map((a) => (
              <button key={a} className="quiz-opt" disabled={!!guess} data-state={guess ? (a === d.action ? "right" : a === guess ? "wrong" : undefined) : undefined} onClick={() => setGuess(a)}>
                {ACTION_LABEL[a]}
              </button>
            ))}
          </div>
          {guess && (
            <div className="prose" style={{ marginTop: 6 }}>
              <p><strong>{right ? "That's the recommended action." : `Recommended: ${ACTION_LABEL[d.action]}.`}</strong> Status: {STATUS_LABEL[d.status]}.</p>
              {d.explanation.map((e, i) => <p key={i}>{e}</p>)}
              <p className="faint">Rules used: {d.rulesApplied.map((r) => r.ruleId).join(", ")}</p>
            </div>
          )}
          <div className="btn-row">
            <button className="btn" disabled={idx === 0} onClick={() => { setIdx(idx - 1); setGuess(null); }}>Previous</button>
            <button className="btn primary" disabled={idx === pool.length - 1} onClick={() => { setIdx(idx + 1); setGuess(null); }}>Next encounter</button>
          </div>
        </div>
      </section>
    </div>
  );
}
