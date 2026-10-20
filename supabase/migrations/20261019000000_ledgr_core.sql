-- Ledgr core schema
-- Roles, rule library with versioning and two-person approval, de-identified decision log, audit log.
-- PHI policy: this schema stores NO patient names, member IDs, DOB, or addresses. Decision snapshots
-- carry an encounter reference that resolves only inside the facility's registration system.


-- ───────────────────────── Roles & profiles ─────────────────────────
do $$ begin
  create type ledgr_role as enum ('registrar', 'supervisor', 'rules_admin', 'compliance', 'auditor');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role ledgr_role not null default 'registrar',
  facility text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.current_role_is(variadic roles ledgr_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.active and p.role = any(roles));
$$;

alter table public.profiles enable row level security;
create policy "profiles: read own" on public.profiles for select using (id = auth.uid());
create policy "profiles: admins read all" on public.profiles for select using (current_role_is('rules_admin', 'compliance', 'auditor', 'supervisor'));
-- Role changes are made by an administrator via the service role only (no client update policy).

-- ───────────────────────── Rule library ─────────────────────────
create table if not exists public.rules (
  id text primary key,
  version integer not null default 1,
  category text not null check (category in ('federal_law','state_law','payer_contract','plan_benefit','facility_policy','operational')),
  verification_status text not null check (verification_status in ('reference_cited','verified','draft')),
  enabled boolean not null default true,
  definition jsonb not null,           -- full RuleDefinition (see src/engine/types.ts)
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

create table if not exists public.rule_versions (
  rule_id text not null references public.rules (id),
  version integer not null,
  definition jsonb not null,
  changed_by uuid references auth.users (id),
  approved_by uuid references auth.users (id),
  summary text not null,
  created_at timestamptz not null default now(),
  primary key (rule_id, version)
);

create table if not exists public.rule_change_requests (
  id uuid primary key default gen_random_uuid(),
  rule_id text not null,
  summary text not null,
  proposed jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  proposed_by uuid not null default auth.uid() references auth.users (id),
  proposed_at timestamptz not null default now(),
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  decision_note text
);

alter table public.rules enable row level security;
alter table public.rule_versions enable row level security;
alter table public.rule_change_requests enable row level security;

create policy "rules: authenticated read" on public.rules for select using (auth.uid() is not null);
create policy "rule_versions: authenticated read" on public.rule_versions for select using (auth.uid() is not null);
-- No insert/update/delete policies on rules: changes go only through approve_rule_change().

create policy "changes: read" on public.rule_change_requests for select using (current_role_is('rules_admin','compliance','auditor','supervisor'));
create policy "changes: propose" on public.rule_change_requests for insert
  with check (current_role_is('rules_admin','compliance') and proposed_by = auth.uid() and status = 'pending');

-- Two-person approval. Federal-law rules may not be disabled.
create or replace function public.approve_rule_change(request_id uuid, note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  cr rule_change_requests%rowtype;
  next_version integer;
begin
  if not current_role_is('compliance','rules_admin') then
    raise exception 'Only compliance reviewers or rules administrators can approve changes';
  end if;
  select * into cr from rule_change_requests where id = request_id for update;
  if not found or cr.status <> 'pending' then raise exception 'Request is not pending'; end if;
  if cr.proposed_by = auth.uid() then raise exception 'Two-person rule: proposer cannot approve'; end if;
  if (cr.proposed->>'category') = 'federal_law' and coalesce((cr.proposed->>'enabled')::boolean, true) = false then
    raise exception 'Federal-law rules cannot be disabled';
  end if;
  if (cr.proposed->>'verificationStatus') = 'verified'
     and (coalesce(cr.proposed->>'verificationDate','') = '' or coalesce(cr.proposed->>'reviewer','') = '') then
    raise exception 'A verified rule needs a verification date and reviewer';
  end if;

  select coalesce(max(version), 0) + 1 into next_version from rule_versions where rule_id = cr.rule_id;

  insert into rules (id, version, category, verification_status, enabled, definition, updated_at, updated_by)
  values (cr.rule_id, next_version, cr.proposed->>'category', cr.proposed->>'verificationStatus',
          coalesce((cr.proposed->>'enabled')::boolean, true),
          jsonb_set(cr.proposed, '{version}', to_jsonb(next_version)), now(), cr.proposed_by)
  on conflict (id) do update set
    version = excluded.version, category = excluded.category, verification_status = excluded.verification_status,
    enabled = excluded.enabled, definition = excluded.definition, updated_at = now(), updated_by = excluded.updated_by;

  insert into rule_versions (rule_id, version, definition, changed_by, approved_by, summary)
  values (cr.rule_id, next_version, cr.proposed, cr.proposed_by, auth.uid(), cr.summary);

  update rule_change_requests set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = note
  where id = request_id;

  insert into audit_log (actor, kind, summary, detail)
  values (auth.uid(), 'rule_change_approved', cr.rule_id || ' v' || next_version || ': ' || cr.summary, jsonb_build_object('request_id', request_id));
end $$;

create or replace function public.reject_rule_change(request_id uuid, note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare cr rule_change_requests%rowtype;
begin
  if not current_role_is('compliance','rules_admin') then raise exception 'Not permitted'; end if;
  select * into cr from rule_change_requests where id = request_id for update;
  if not found or cr.status <> 'pending' then raise exception 'Request is not pending'; end if;
  if cr.proposed_by = auth.uid() then raise exception 'Two-person rule: proposer cannot reject their own change'; end if;
  update rule_change_requests set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = note where id = request_id;
  insert into audit_log (actor, kind, summary, detail)
  values (auth.uid(), 'rule_change_rejected', cr.rule_id || ': ' || cr.summary, jsonb_build_object('request_id', request_id));
end $$;

-- ───────────────────────── Decision & audit logs ─────────────────────────
create table if not exists public.decision_log (
  id uuid primary key default gen_random_uuid(),
  encounter_ref text not null,        -- opaque reference into the facility system; not an MRN
  snapshot jsonb not null,            -- de-identified: coverage types, statuses, amounts, rule ids@versions, calc steps
  recorded_by uuid not null default auth.uid() references auth.users (id),
  recorded_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid references auth.users (id),
  kind text not null,
  summary text not null,
  detail jsonb
);

alter table public.decision_log enable row level security;
alter table public.audit_log enable row level security;

create policy "decision_log: insert own" on public.decision_log for insert with check (recorded_by = auth.uid());
create policy "decision_log: read own" on public.decision_log for select using (recorded_by = auth.uid());
create policy "decision_log: reviewers read" on public.decision_log for select using (current_role_is('supervisor','compliance','auditor'));
create policy "audit_log: reviewers read" on public.audit_log for select using (current_role_is('supervisor','rules_admin','compliance','auditor'));
-- Append-only: no update/delete policies on either log for any role.

-- Mirror decision inserts and change proposals into the audit log.
create or replace function public.audit_decision() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (actor, kind, summary, detail)
  values (new.recorded_by, 'decision_recorded', new.encounter_ref || ': ' || coalesce(new.snapshot #>> '{decision,status}', ''), jsonb_build_object('decision_id', new.id));
  return new;
end $$;
drop trigger if exists trg_audit_decision on public.decision_log;
create trigger trg_audit_decision after insert on public.decision_log for each row execute function public.audit_decision();

create or replace function public.audit_proposal() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (actor, kind, summary, detail)
  values (new.proposed_by, 'rule_change_proposed', new.rule_id || ': ' || new.summary, jsonb_build_object('request_id', new.id));
  return new;
end $$;
drop trigger if exists trg_audit_proposal on public.rule_change_requests;
create trigger trg_audit_proposal after insert on public.rule_change_requests for each row execute function public.audit_proposal();

-- ───────────────────────── Retention ─────────────────────────
-- Default retention is set by the facility's records policy. Example (disabled):
-- select cron.schedule('ledgr-decision-retention', '0 3 * * *', $$delete from decision_log where recorded_at < now() - interval '7 years'$$);
