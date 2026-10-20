import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SCENARIOS } from "../data/scenarios";
import type { Encounter, RuleDefinition } from "../engine/types";
import { DEMO_MODE, demoStore, remoteStore, supabase, uid, type AuditEntry, type ChangeRequest, type Role } from "./store";

interface AppState {
  demo: boolean;
  user: string;
  role: Role;
  setRole: (r: Role) => void;
  setUser: (u: string) => void;
  rules: RuleDefinition[];
  changes: ChangeRequest[];
  proposeChange: (proposed: RuleDefinition, summary: string) => void;
  decideChange: (id: string, approve: boolean, note: string) => string | null;
  resetRules: () => void;
  audit: AuditEntry[];
  log: (e: Omit<AuditEntry, "id" | "at" | "actor" | "role">) => void;
  clearAudit: () => void;
  encounter: Encounter;
  setEncounter: (e: Encounter) => void;
  loadScenario: (id: string) => void;
  newEncounter: () => void;
  signOut: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function blankEncounter(): Encounter {
  return {
    id: `enc-${uid().slice(0, 8)}`,
    demo: DEMO_MODE,
    visit: {
      dateOfService: new Date().toISOString().slice(0, 10),
      facility: "Demo Regional Medical Center",
      department: "Outpatient Registration",
      setting: "office",
      serviceCategory: "specialist",
      networkStatus: "unknown",
      financialAssistance: "none",
      previouslyCollectedCents: 0,
      allowedAmountEstimateCents: null,
      jurisdiction: "NC",
    },
    plans: [],
  };
}

const SESSION_TIMEOUT_MS = 15 * 60 * 1000;

export function AppProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("registrar");
  const [user, setUser] = useState("Demo User A");
  const [rules, setRules] = useState<RuleDefinition[]>(() => demoStore.loadRules());
  const [changes, setChanges] = useState<ChangeRequest[]>(() => demoStore.loadChanges());
  const [audit, setAudit] = useState<AuditEntry[]>(() => demoStore.loadAudit());
  const [encounter, setEncounter] = useState<Encounter>(() => structuredClone(SCENARIOS.find((s) => s.id === "s05")!.encounter));

  useEffect(() => {
    if (DEMO_MODE || !supabase) return;
    remoteStore.loadRules().then(setRules);
    // Role and display name come from the authenticated profile (RLS-protected), never from the client.
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: prof } = await supabase!.from("profiles").select("full_name, role").eq("id", data.user.id).single();
      if (prof) {
        setUser(prof.full_name ?? data.user.email ?? "User");
        setRole(prof.role as Role);
      }
    });
  }, []);

  const log = useCallback(
    (e: Omit<AuditEntry, "id" | "at" | "actor" | "role">) => {
      demoStore.appendAudit({ ...e, actor: user, role });
      setAudit(demoStore.loadAudit());
    },
    [user, role],
  );

  const proposeChange = useCallback(
    (proposed: RuleDefinition, summary: string) => {
      const cr: ChangeRequest = { id: uid(), ruleId: proposed.id, proposedBy: user, proposedByRole: role, proposedAt: new Date().toISOString(), summary, proposed, status: "pending" };
      const next = [cr, ...changes];
      setChanges(next);
      demoStore.saveChanges(next);
      remoteStore.proposeChange(cr);
      log({ kind: "rule_change_proposed", summary: `${proposed.id}: ${summary}`, detail: { requestId: cr.id } });
    },
    [changes, user, role, log],
  );

  const decideChange = useCallback(
    (id: string, approve: boolean, note: string): string | null => {
      const cr = changes.find((c) => c.id === id);
      if (!cr || cr.status !== "pending") return "This request is no longer pending.";
      if (cr.proposedBy === user) return "Two-person rule: the person who proposed a change cannot approve or reject it. Switch to a different reviewer.";
      const now = new Date().toISOString();
      const updated: ChangeRequest = { ...cr, status: approve ? "approved" : "rejected", decidedBy: user, decidedAt: now, decisionNote: note };
      const nextChanges = changes.map((c) => (c.id === id ? updated : c));
      setChanges(nextChanges);
      demoStore.saveChanges(nextChanges);
      if (approve) {
        const current = rules.find((r) => r.id === cr.ruleId);
        const version = (current?.version ?? 0) + 1;
        const applied: RuleDefinition = {
          ...cr.proposed,
          version,
          history: [...(current?.history ?? []), { version, changedAt: now, changedBy: cr.proposedBy, approvedBy: user, summary: cr.summary }],
        };
        const nextRules = current ? rules.map((r) => (r.id === cr.ruleId ? applied : r)) : [...rules, applied];
        setRules(nextRules);
        demoStore.saveRules(nextRules);
      }
      remoteStore.decideChange(id, approve, note);
      log({ kind: approve ? "rule_change_approved" : "rule_change_rejected", summary: `${cr.ruleId}: ${cr.summary}${note ? ` — ${note}` : ""}`, detail: { requestId: id } });
      return null;
    },
    [changes, rules, user, log],
  );

  const resetRules = useCallback(() => {
    demoStore.resetRules();
    setRules(demoStore.loadRules());
    setChanges([]);
    log({ kind: "session", summary: "Demo rule library reset to seed." });
  }, [log]);

  const clearAudit = useCallback(() => {
    demoStore.clearAudit();
    setAudit([]);
  }, []);

  const loadScenario = useCallback((id: string) => {
    const s = SCENARIOS.find((x) => x.id === id);
    if (s) setEncounter(structuredClone(s.encounter));
  }, []);

  const newEncounter = useCallback(() => setEncounter(blankEncounter()), []);

  const signOut = useCallback(() => {
    supabase?.auth.signOut();
    setEncounter(blankEncounter());
  }, []);

  // Session timeout: clear the working encounter after inactivity.
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const reset = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setEncounter(blankEncounter());
        if (!DEMO_MODE) supabase?.auth.signOut();
      }, SESSION_TIMEOUT_MS);
    };
    reset();
    const evts = ["mousedown", "keydown", "touchstart"];
    evts.forEach((e) => window.addEventListener(e, reset));
    return () => {
      window.clearTimeout(timer.current);
      evts.forEach((e) => window.removeEventListener(e, reset));
    };
  }, []);

  const value = useMemo<AppState>(
    () => ({ demo: DEMO_MODE, user, role, setRole, setUser, rules, changes, proposeChange, decideChange, resetRules, audit, log, clearAudit, encounter, setEncounter, loadScenario, newEncounter, signOut }),
    [user, role, rules, changes, proposeChange, decideChange, resetRules, audit, log, clearAudit, encounter, loadScenario, newEncounter, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}
