# BarLogic Safety And Backup Plan

## 1) Immediate Actions (Today)
- Enable Supabase PITR (Point-in-Time Recovery).
- Create one full SQL backup and store it outside Supabase account.
- Rotate exposed keys:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `GEMINI_API_KEY`
- Enable MFA for Supabase, Git provider, and hosting account.
- Keep `main` branch protected (no direct push).

## 2) Backup Policy
- Daily:
  - Automatic DB backup (Supabase + external export).
- Weekly:
  - Full `pg_dump` backup to cloud storage.
  - Download latest app source zip.
- Monthly:
  - Restore test to staging from backup.
  - Verify app boots and dashboard data is correct.

## 3) Data Protection Rules
- Use soft delete (`deleted_at`) for critical tables where possible.
- Keep strict foreign keys and constraints.
- Keep audit logs enabled for create/update/delete events.
- Never run schema changes directly in production without migration files.

## 4) Operational Safety
- Monitoring:
  - Uptime monitor on main URLs.
  - Error tracking (Sentry).
- Alerts:
  - Notify on API failures, DB failures, and high error rates.
- Availability:
  - Use managed hosting auto-restart and health checks.

## 5) Access Control
- Owner-only routes stay owner-only.
- Service role key server-side only.
- Rotate secrets every 60-90 days.
- Remove unused staff accounts immediately.

## 6) Recovery Runbook (If Incident Happens)
1. Freeze risky operations (voids/deletes/imports).
2. Confirm incident scope (which tables, which time window).
3. Restore to staging from nearest backup/PITR point.
4. Validate:
   - Orders count
   - Inventory stock
   - Owner analytics totals
   - Audit logs
5. Restore production from validated recovery point.
6. Re-enable app traffic.
7. Publish incident notes and prevention action list.

## 7) Weekly Checklist
- [ ] Backups completed and stored externally
- [ ] Restore test passed
- [ ] Error logs reviewed
- [ ] Audit logs reviewed
- [ ] Secrets rotation status checked
- [ ] Pending migrations reviewed

