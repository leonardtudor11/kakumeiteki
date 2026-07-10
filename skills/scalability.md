# scalability — decision guide

Consult before architecting for growth or diagnosing slowness.

## Defaults
- **Stateless service processes** (session/state in the DB or cache, not process memory) —
  that alone buys horizontal scale behind any load balancer.
- Measure before scaling: the bottleneck is usually one missing index or an N+1 query, not
  "we need more servers".
- Cache ladder: in-process memo → shared cache (Redis) → CDN for static/public. Every cache
  needs an invalidation story BEFORE it ships; "TTL + tolerate staleness" is a valid one.

## The usual culprits, in order
1. **N+1 queries** — loop issuing one query per row. Fix with joins/batch fetch (`IN`),
   or an ORM eager-load.
2. **Missing index** on the column you filter/sort by. Read the query plan (`EXPLAIN`),
   don't guess. Composite index order = most-selective-first for your actual predicates.
3. **Unbounded result sets** — always paginate; keyset (cursor) pagination beats
   OFFSET at depth.
4. **Synchronous slow work in the request path** (image/video/AI generation, email) —
   move to a queue + worker; return a job id or notify.

## Options + tradeoffs
- Vertical first: a bigger box is the cheapest scale until it isn't — no architecture
  change, no distributed-systems tax.
- When a queue beats a cron: cron = periodic batch, fine for digest-style work; queue =
  per-event, needed when latency matters or work volume is spiky.
- When NOT to microservice: below a team-of-teams org size, a modular monolith wins —
  services add network failure modes, deploy orchestration, and observability cost. Split
  only along a proven seam (independent scaling or ownership need).
- Read replicas: for read-heavy loads AFTER caching; brings replication-lag consistency
  questions into every read path that follows a write.

## Sources
AWS Well-Architected Performance Efficiency Pillar · Google SRE workbook (capacity,
load balancing) · Use The Index, Luke (query/index discipline) · Designing Data-Intensive
Applications (Kleppmann) ch. 1, 5, 11.
