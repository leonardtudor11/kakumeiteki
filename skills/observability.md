# observability — decision guide

Consult before adding logging/metrics/alerting, or when debugging blind spots.

## Ladder by scale (right-size, don't gold-plate)
1. **Solo/side project**: structured logs (JSON lines, one event per line) + an uptime
   pinger (healthchecks.io / UptimeRobot) + process manager logs (pm2 logs). That's it.
2. **Real users**: + error tracking (Sentry-class) with release tagging — stack traces
   grouped by cause beat grepping logs.
3. **Growth**: + metrics/dashboards (Prometheus + Grafana, or hosted) and log
   aggregation (Loki-class).
4. **Multiple services**: OpenTelemetry for traces — instrument once, export anywhere;
   OTel is the vendor-neutral standard, so start any NEW instrumentation with its SDK.

## Structured logging rules
- One JSON object per event: `{ts, level, msg, requestId, userId?, ...}`. Human prose
  goes in `msg`; everything you'd filter by is a field.
- Correlate: generate a request id at the edge, thread it through every log line and
  outbound call.
- Never log secrets, tokens, passwords, full card numbers, or raw PII — log ids.
- Log decisions, not just events: "refund denied: card mismatch" beats "refund failed".

## Alerting
- **Alert on symptoms users feel** (error rate, latency p99, job-queue age), not causes
  (CPU%) — causes go on dashboards for diagnosis.
- Every alert must be actionable; an alert nobody acts on gets deleted or demoted.
- SLO framing even informally: "99% of requests < 500ms this month" turns arguments into
  arithmetic (error budgets).

## Sources
Google SRE book (ch. 6 Monitoring Distributed Systems; SLO chapter) · OpenTelemetry docs
(signals: traces/metrics/logs) · Sentry/12-factor logs guidance.
