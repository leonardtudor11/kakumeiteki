# resilience — decision guide

Consult when calling anything that can fail: external APIs, databases, model endpoints.

## Defaults
- **Timeout on every outbound call.** No exceptions. A missing timeout is an unbounded
  queue of stuck work. Pick p99-of-normal × 2-3, not "30s because default".
- **Retry only idempotent operations**, with exponential backoff + full jitter, small
  budget (2-3 attempts). Retrying non-idempotent writes duplicates them.
- **Fail fast and loudly at startup** (missing config, unreachable dependency);
  **degrade gracefully at runtime** (serve stale cache / reduced feature / honest error).
- User-visible degraded mode beats a hard 500: "search is temporarily unavailable" while
  the rest of the page works.

## Options + tradeoffs
- Circuit breaker: worth it once a flaky dependency can take your whole service down
  (open after N consecutive failures, half-open probe). Overkill for a single low-traffic
  call — a timeout + retry budget is enough.
- Queue-and-drain vs synchronous: if the caller doesn't need the result NOW, enqueue
  (survives downstream outages, absorbs spikes) — at the cost of eventual consistency and
  a queue to operate.
- Retry storms: backoff without jitter synchronizes clients into waves — always jitter.

## Patterns that bite back
- Retrying on the wrong errors: 4xx (except 429) are permanent — retrying them wastes the
  budget and hides the bug. Retry 5xx/timeouts/connection-reset; honor Retry-After on 429.
- A "fallback value" that looks like real data corrupts downstream state — fallbacks must
  be marked as such or be refusals.
- Health checks that only prove the process is up: check the dependency the traffic
  actually needs (DB ping), but keep it cheap and cached.

## Sources
Google SRE book (ch. "Handling Overload", "Addressing Cascading Failures") · AWS
Architecture Blog "Exponential Backoff and Jitter" · AWS Well-Architected Reliability
Pillar · Release It! (Nygard) circuit-breaker pattern.
