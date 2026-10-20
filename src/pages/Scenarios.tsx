import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { STATUS_COLOR_VAR, STATUS_LABEL } from "../components/labels";
import { SCENARIOS, type Scenario } from "../data/scenarios";
import { formatCents } from "../engine/calc";
import { evaluate } from "../engine/engine";
import { useApp } from "../lib/app";

const GROUPS: Scenario["group"][] = ["Single coverage", "Dual coverage", "Triple coverage", "Emergency", "Protections & edge cases"];

export function Scenarios() {
  const { rules, loadScenario } = useApp();
  const nav = useNavigate();
  const [group, setGroup] = useState<Scenario["group"] | "All">("All");
  const results = useMemo(
    () =>
      SCENARIOS.map((s) => {
        const d = evaluate(s.encounter, rules);
        const pass = d.status === s.expected.status && d.action === s.expected.action && d.amountCents === s.expected.amountCents && d.supervisorReview === s.expected.supervisorReview;
        return { s, d, pass };
      }),
    [rules],
  );
  const shown = results.filter((r) => group === "All" || r.s.group === group);
  const failing = results.filter((r) => !r.pass).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Demo scenarios</h1>
          <p>
            Thirty fictitious patients covering single, dual, and triple coverage. Each is checked live against the current rule library — if an admin changes a rule, you'll see which expected outcomes it affects. All plan amounts are hypothetical.
          </p>
        </div>
        <span className={`badge ${failing ? "fail" : "pass"}`}>{failing ? `${failing} differ from expected with current rules` : `All ${results.length} match expected outcomes`}</span>
      </div>

      <div className="tabs" role="tablist">
        {(["All", ...GROUPS] as const).map((g) => (
          <button key={g} role="tab" aria-selected={group === g} onClick={() => setGroup(g)}>
            {g}
          </button>
        ))}
      </div>

      <div className="scen-grid">
        {shown.map(({ s, d, pass }) => (
          <article key={s.id} className="scen">
            <div className="top">
              <span className="n">Scenario {s.number}</span>
              <span className={`badge ${pass ? "pass" : "fail"}`}>{pass ? "Matches expected" : "Differs"}</span>
            </div>
            <h3>{s.title}</h3>
            <p className="muted" style={{ fontSize: "0.9rem" }}>{s.summary}</p>
            <div className="status-text" style={{ color: STATUS_COLOR_VAR[d.status] }}>
              {STATUS_LABEL[d.status]}
              {d.amountCents !== null && `: ${formatCents(d.amountCents)}${d.amountKind === "estimate" ? " (estimate)" : ""}`}
            </div>
            {!pass && <p className="faint">Expected: {STATUS_LABEL[s.expected.status]}{s.expected.amountCents !== null ? `, ${formatCents(s.expected.amountCents)}` : ""}</p>}
            <div>
              <button
                className="btn small"
                onClick={() => {
                  loadScenario(s.id);
                  nav("/detailed");
                }}
              >
                Open in registration check
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
