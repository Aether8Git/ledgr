# Security and privacy

Designed for HIPAA environments; **not yet assessed**. Status of each control:

| Control | Status |
|---|---|
| Role-based access (registrar, supervisor, rules admin, compliance, auditor) | Built — RLS policies + `current_role_is()`; demo-mode switcher for testing |
| Minimum necessary | Built — decision log stores de-identified snapshots only (coverage types, statuses, amounts, rule ids); no names, member IDs, DOB |
| Two-person rule for rule changes | Built — client and `approve_rule_change()` server function |
| Federal-law rules can't be disabled | Built — client and server |
| Audit logs | Built — append-only under RLS (no update/delete policies), triggers on decisions and proposals |
| Encryption in transit | Supabase/hosting TLS — confirm at deployment |
| Encryption at rest | Supabase managed — confirm plan and BAA |
| Secure authentication | Supabase Auth (email/password) — **replace with facility SSO + MFA** |
| Session timeout | Built — 15 minutes of inactivity clears the working encounter and signs out (Supabase mode) |
| Member identifier handling | Masked field only; demo warns against real IDs. Production should never store full IDs in Ledgr — reference the facility system |
| Demo / production separation | Demo mode is automatic when no Supabase env is set; banner on every page. Use separate Supabase projects per environment |
| Data retention | Commented retention job in migration — set per facility records policy |
| Access monitoring | Not built — use Supabase logs / SIEM export |
| Incident response plan | Not written — required before production |
| Vendor / integration security review | Not done |
| External AI services | None used. No PHI is sent to any AI service |
| Model training on patient data | Not applicable — no model training |
