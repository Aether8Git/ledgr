-- Scenario support: Medicare parts, employer group, desk-added plans, more coverage types.
alter table public.plans add column if not exists medicare_parts text check (medicare_parts in ('A','B','AB'));
alter table public.plans add column if not exists group_name text;
alter table public.plans add column if not exists needs_review boolean not null default false;

alter table public.plans drop constraint if exists plans_kind_check;
alter table public.plans add constraint plans_kind_check check (kind in (
  'commercial','marketplace','medicare','medicare_advantage','medigap','medicaid','medicaid_mco',
  'tricare','tricare_for_life','va','ihs','black_lung','workers_comp','auto','other'));

-- Registrars may add a plan the first time they see it (flagged for review); only admins edit or delete.
drop policy if exists "plans: admins insert" on public.plans;
drop policy if exists "plans: signed-in insert" on public.plans;
create policy "plans: signed-in insert" on public.plans for insert to authenticated
  with check (current_role_is('rules_admin','compliance') or needs_review = true);

update public.plans set medicare_parts = 'AB' where kind = 'medicare' and medicare_parts is null;

insert into public.plans (payer, name, kind, medicare_parts, copays, notes)
select * from (values
  ('Medicare', 'Medicare Part A only', 'medicare', 'A', '{}'::jsonb, 'Hospital (inpatient) coverage only.'),
  ('Medicare', 'Medicare Part B only', 'medicare', 'B', '{}'::jsonb, 'Outpatient/medical coverage only.'),
  ('TRICARE', 'TRICARE For Life', 'tricare_for_life', null, '{}'::jsonb, 'Pays after Medicare and covers Medicare''s cost-sharing for covered services.'),
  ('VA', 'VA Community Care (authorized)', 'va', null, '{}'::jsonb, 'Bill VA only with an authorization/referral number. Don''t collect a copay.'),
  ('Indian Health Service', 'IHS / tribal health program', 'ihs', null, '{}'::jsonb, 'Pays last, after Medicaid. Patients aren''t charged.'),
  ('U.S. Dept. of Labor', 'Federal Black Lung Program', 'black_lung', null, '{}'::jsonb, 'Pays first only for the covered lung condition.')
) as v(payer, name, kind, medicare_parts, copays, notes)
where not exists (select 1 from public.plans p where p.name = v.name);
