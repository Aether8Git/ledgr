import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SEED_RULES } from "../engine/rules";
import type { Decision, Encounter, RuleDefinition } from "../engine/types";

/**
 * Persistence layer.
 *
 * DEMO MODE (no Supabase env): rules, change requests, and the audit log live in
 * localStorage. Only fictitious data may be used.
 *
 * SUPABASE MODE: the same interface backed by the tables in supabase/migrations,
 * protected by RLS. Decision audit rows store a de-identified snapshot (no names,
 * no member IDs) plus an encounter reference that lives in the facility's system.
 */

export type Role = "registrar" | "supervisor" | "rules_admin" | "compliance" | "auditor";

export const ROLE_LABEL: Record<Role, string> = {
  registrar: "Registrar",
  supervisor: "Patient Access Supervisor",
  rules_admin: "Rules Administrator",
  compliance: "Compliance Reviewer",
  auditor: "Auditor (read-only)",
};

export const can = {
  editRules: (r: Role) => r === "rules_admin" || r === "compliance",
  approveRules: (r: Role) => r === "compliance" || r === "rules_admin",
  viewAudit: (r: Role) => r !== "registrar",
};

export interface ChangeRequest {
  id: string;
  ruleId: string;
  proposedBy: string;
  proposedByRole: Role;
  proposedAt: string;
  summary: string;
  /** The full proposed rule (next version). */
  proposed: RuleDefinition;
  status: "pending" | "approved" | "rejected";
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  role: Role;
  kind: "decision_recorded" | "rule_change_proposed" | "rule_change_approved" | "rule_change_rejected" | "session";
  summary: string;
  detail?: unknown;
}

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const DEMO_MODE = !SUPABASE_URL || !SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null = DEMO_MODE ? null : createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);

const LS = {
  rules: "ledgr.rules.v1",
  changes: "ledgr.changes.v1",
  audit: "ledgr.audit.v1",
};

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLS(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable — demo state is in-memory only */
  }
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

/** De-identify a decision for the audit trail: no names, no member IDs, no free text about the patient. */
export function deidentify(enc: Encounter, d: Decision) {
  return {
    encounterRef: enc.id,
    demo: enc.demo,
    visit: { dateOfService: enc.visit.dateOfService, setting: enc.visit.setting, serviceCategory: enc.visit.serviceCategory, jurisdiction: enc.visit.jurisdiction },
    coverage: enc.plans.map((p) => ({ type: p.type, medigapLetter: p.medigapLetter ?? null, order: p.payerOrder ?? null, eligibility: p.eligibility })),
    decision: {
      status: d.status,
      action: d.action,
      amountCents: d.amountCents,
      amountKind: d.amountKind,
      amountSource: d.amountSource,
      supervisorReview: d.supervisorReview,
      escalationReason: d.escalationReason,
      rules: d.rulesApplied.map((r) => `${r.ruleId}@v${r.version}`),
      calculation: d.calculation,
      engineVersion: d.engineVersion,
      evaluatedAt: d.evaluatedAt,
    },
  };
}

// ─────────────────────────── Demo store ───────────────────────────

export const demoStore = {
  loadRules(): RuleDefinition[] {
    const saved = readLS<RuleDefinition[] | null>(LS.rules, null);
    if (!saved) return structuredClone(SEED_RULES);
    // Add any seed rules introduced after the user's local copy was saved.
    const ids = new Set(saved.map((r) => r.id));
    return [...saved, ...SEED_RULES.filter((r) => !ids.has(r.id))];
  },
  saveRules(rules: RuleDefinition[]) {
    writeLS(LS.rules, rules);
  },
  resetRules() {
    writeLS(LS.rules, SEED_RULES);
    writeLS(LS.changes, []);
  },
  loadChanges(): ChangeRequest[] {
    return readLS<ChangeRequest[]>(LS.changes, []);
  },
  saveChanges(c: ChangeRequest[]) {
    writeLS(LS.changes, c);
  },
  loadAudit(): AuditEntry[] {
    return readLS<AuditEntry[]>(LS.audit, []);
  },
  appendAudit(e: Omit<AuditEntry, "id" | "at">): AuditEntry {
    const entry: AuditEntry = { ...e, id: uid(), at: new Date().toISOString() };
    const all = [entry, ...readLS<AuditEntry[]>(LS.audit, [])].slice(0, 500);
    writeLS(LS.audit, all);
    return entry;
  },
  clearAudit() {
    writeLS(LS.audit, []);
  },
};

// ─────────────────────────── Supabase store ───────────────────────────
// Thin wrappers; RLS enforces roles server-side. Used only when env vars are set.

export const remoteStore = {
  async loadRules(): Promise<RuleDefinition[]> {
    if (!supabase) return demoStore.loadRules();
    const { data, error } = await supabase.from("rules").select("definition").order("id");
    if (error || !data?.length) return structuredClone(SEED_RULES);
    return data.map((r: { definition: RuleDefinition }) => r.definition);
  },
  async proposeChange(cr: ChangeRequest) {
    if (!supabase) return;
    await supabase.from("rule_change_requests").insert({ id: cr.id, rule_id: cr.ruleId, summary: cr.summary, proposed: cr.proposed });
  },
  async decideChange(id: string, approve: boolean, note: string) {
    if (!supabase) return;
    await supabase.rpc(approve ? "approve_rule_change" : "reject_rule_change", { request_id: id, note });
  },
  async recordDecision(enc: Encounter, d: Decision) {
    if (!supabase) return;
    await supabase.from("decision_log").insert({ encounter_ref: enc.id, snapshot: deidentify(enc, d) });
  },
};

export { uid };
