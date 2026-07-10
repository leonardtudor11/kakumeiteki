# operations — decision guide

Consult before deploying, migrating, backing up, or automating recurring work.

## Deploy
- Minimum viable pipeline: git push → pull on server → install → restart under a process
  manager (pm2/systemd) → smoke-check the live URL. Script it; never deploy by hand-typed
  steps.
- Zero-downtime when it matters: start new process → health-check → switch traffic → stop
  old (pm2 reload / blue-green). A visible 30s outage is fine for a side project; decide
  deliberately.
- **Migrations run before the code that needs them**, and must be backward-compatible one
  release back (expand → migrate → contract): add column, deploy code writing both, backfill,
  then drop the old. Never a destructive migration in the same deploy as the code change.
- Every deploy has a rollback: previous release kept runnable (git tag/release dir), DB
  changes reversible or tolerated by the previous code.

## Backups
- A backup is only real after a **tested restore**. Schedule the restore drill, not just
  the dump.
- 3-2-1 lite for small apps: automated daily dump, stored off the server, retention ≥ 14
  days, restore documented as commands.

## Runbooks + audit
- Any procedure you did twice under stress gets a runbook: exact commands, expected
  output, rollback. The incident post-mortem is a runbook draft.
- Operational actions that change user data (refunds, credit grants, deletions) go through
  committed, idempotent scripts with `--dry-run` — never an interactive DB shell.

## Orchestration ladder (when each is overkill)
cron (periodic batch) → job queue (BullMQ-class: per-event, retries, visibility) →
workflow engine (Temporal-class: multi-step, long-running, compensation) → k8s (you have
a platform team). Solo founder default: cron + a queue; anything above needs a proven need.

## Sources
Google SRE book (release engineering, ch. 8; postmortem culture) · AWS Well-Architected
Operational Excellence Pillar · Refactoring Databases (expand/contract) · PM2/systemd docs.
