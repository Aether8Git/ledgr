-- Plan library: every plan Ledgr knows, with copays by visit type (cents; null = not loaded).
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  payer text not null,
  name text not null,
  kind text not null,
  copays jsonb not null default '{}'::jsonb,
  ed_waived_if_admitted boolean not null default false,
  notes text,
  example boolean not null default false,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) default auth.uid()
);

alter table public.plans enable row level security;
create policy "plans: signed-in read" on public.plans for select to authenticated using (true);
create policy "plans: admins update" on public.plans for update to authenticated using (current_role_is('rules_admin','compliance')) with check (current_role_is('rules_admin','compliance'));
create policy "plans: admins delete" on public.plans for delete to authenticated using (current_role_is('rules_admin','compliance'));
revoke all on public.plans from anon;

create or replace function public.audit_plan_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (actor, kind, summary, detail)
  values (auth.uid(), 'plan_' || lower(tg_op),
          coalesce(new.payer, old.payer) || ' — ' || coalesce(new.name, old.name),
          jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)));
  if tg_op = 'DELETE' then return old; end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.audit_plan_change() from public, anon, authenticated;
drop trigger if exists trg_audit_plan on public.plans;
create trigger trg_audit_plan before insert or update or delete on public.plans for each row execute function public.audit_plan_change();
