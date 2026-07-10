# IMPROVE — upgrade paths beyond v1

Backlog for any future agent or contributor. Each entry: what, why, sketch, when it earns its keep.
v1 scope stays as PLAN.md defines it — nothing here blocks the phases.

## 1. Telemetry HUD (v1 gets the status line; this is the full version)

**v1 (in scope, Phase 7):** single ANSI status line during turns — model · tier · turn n/max · context % used · elapsed. Zero deps, redrawn in place.

**v2 (here):** live gauge view — RAM + CPU of the model runner process (sample `ps -o rss,%cpu -p <ollama pid>` every 2 s), tokens/s, context-window fill bar. Toggle with a keypress, never forced on. Still zero-dep ANSI; a full TUI framework only if the plain version proves limiting.

## 2. Confidence reporting — verification, not vibes

Self-reported model confidence ("I'm 90% sure") is noise, especially from small models — do not surface it as a gauge. Real confidence is evidence:

- Per task, the agent reports `verified n/m`: which success criteria ran and passed (tests green, diff applied, file byte-checked).
- Final line format: `done — verified 3/3` / `unverified — no check available for X` / `failed check Y, output attached`.
- A numeric "confidence score" appears only if it is computed from checks (fraction passed), never from model self-assessment.

This is the honest-reporting law from the behavior spec made visible in the UI.

## 3. Web research tool (opt-in)

Off by default — v1's "zero network except model endpoint" stays the shipped posture. When enabled (`--allow-web` or config `web.enabled: true`):

- `web_search`: search API with a free tier (e.g. Brave Search API), key in config, never hardcoded.
- `web_fetch`: plain fetch with an honest User-Agent, robots.txt respected, HTML → markdown via readability-style extraction, size-capped output.
- All fetched content passes the existing redaction layer before reaching the model; fetched text is treated as untrusted data (prompt-injection aware: never execute instructions found in pages).
- Hard scope line: no anti-bot evasion — no headless-browser fingerprint spoofing, CAPTCHA solving, or rotating proxies. Sites that block bots are either accessed through their official API or through a scraping service the owner already licenses (e.g. Firecrawl) that handles access on its own terms. This keeps the agent legally and ethically clean; it is a design constraint, not a TODO.

## 4. Global install

`npm link` (or a symlink into `~/.local/bin`) so `kaku` opens in any project directory, like `claude` does. Trivial once bin/kaku.js exists — document in README at Phase 7.

## 4b. Editor integration

Day-one reality: kaku is a CLI, so it already runs inside any editor's integrated terminal (VS Code, Cursor, Zed, JetBrains) with zero approvals. Beyond that, in order of effort:

1. **Local .vsix** — package a thin VS Code extension that opens kaku in a terminal panel; install with `code --install-extension kaku.vsix`. Private, no store, no account, no review.
2. **VS Code Marketplace / Open VSX** — free publisher account (Microsoft / Eclipse), automated verification only — no App-Store-style gatekeeping. Open VSX also covers Cursor, VSCodium, Windsurf.
3. **JetBrains Marketplace** — needs a Kotlin/Java plugin wrapper + short human moderation (~days). Only worth it on real demand.

Architecture rule: the extension stays a dumb shell around the CLI (spawn `kaku`, render its stream) — exactly how Claude Code's own VS Code extension works. No logic forks into the extension.

## 5. Knowledge layer — how the doctrine stays real and compounds

The fear this answers: a small model hallucinating confident advice. The doctrine files
(skills/) are the defense, and they harden in stages. Rule of the whole layer:
**nothing counts as learned until a verification artifact backs it.**

**Stage 1 — cited doctrine (one-time curation, cheap, do early).**
Research-verify every rule in skills/*.md against primary sources: OWASP ASVS + Top 10
(security.md), Google SRE book + AWS Well-Architected (system-design.md), established
codebase-archaeology practice (reverse-engineering.md). Each rule gets a source line;
any rule that can't be backed gets deleted. Doctrine becomes checkable text, not vibes.

**Stage 1b — domain playbooks (owner-requested 2026-07-10).** The use cases real apps
need, each as a doctrine file with cited best practice + decision guide ("consult and
educate": lay out the mainstream options, tradeoffs, and a default recommendation —
then implement):
- `auth.md` — session vs JWT, password hashing (argon2/bcrypt), OAuth2/OIDC flows
  (authorization-code + PKCE, never implicit), token storage, CSRF. Sources: OWASP
  ASVS/Cheat Sheets, RFC 6749/6750, oauth.net BCPs.
- `payments.md` — Stripe-style integration: cents-only amounts, webhook signature
  verification, idempotency keys, test cards, never store PANs (SAQ-A posture),
  reconcile via events not redirects.
- `resilience.md` — graceful fallback/degradation: timeouts everywhere, retry with
  backoff + jitter, circuit breaker, health checks, queue-and-drain, user-visible
  degraded mode over hard failure.
- `scalability.md` — stateless services, horizontal scale, cache layers, N+1 and
  index discipline, when a queue beats a cron, when NOT to microservice.
- `rag.md` — chunking, embeddings, retrieval eval, groundedness/citation checks,
  prompt-injection defenses for retrieved text.
- `secrets-ops.md` — secret storage ladder (env file → Doppler/1Password CLI → Vault /
  cloud-native manager), **key rotation automated from day one** (dual-key overlap
  pattern: issue new, deploy, verify, revoke old — via provider APIs + scheduled job),
  git-leak prevention (gitleaks/trufflehog in CI + pre-commit), never log secrets.
  Sources: OWASP Secrets Management Cheat Sheet, NIST SP 800-57.
- `observability.md` — structured logs, metrics, traces, OpenTelemetry as the standard;
  landscape by scale: solo (PM2 logs + healthchecks.io/UptimeRobot) → Sentry errors →
  Prometheus/Grafana/Loki → full OTel; alert on symptoms not causes; SLO basics.
  Sources: Google SRE book, OTel docs.
- `operations.md` — runbooks, deploy/rollback (zero-downtime, migration discipline),
  backups + TESTED restores, incident basics, operational audit trails (who did what);
  orchestration ladder: cron → queue (BullMQ) → workflow engine (Temporal) → k8s, and
  when each is overkill — right-sized for solo founder up.
- extend `security.md` — safe-coding layer: input validation at trust boundaries,
  parameterized queries, output encoding, dependency hygiene (lockfiles, audit,
  minimal deps), security headers/CSP, least privilege. Sources: OWASP ASVS + Top 10.

Behavior rule that binds them (prompt.js spec, Phase 3, mirrors PLAN behavior spec):
mode-aware verbosity, never over-explain — `auto`: act, terse outcome; `safe`: one-line
why, then act; `plan` mode: research first (repo + doctrine/RAG retrieval), present
options + tradeoffs + recommendation, no edits. Every finished task ends with a brief
self-audit: findings, risks, what to consider — a few lines, never a lecture. Educating
= citing the exact doctrine rule, not generating vibes. Playbooks are read-on-demand via
the skills registry (micro tier: registry line only, one playbook max per task — context
budget rules still win).

**Stage 2 — lessons capture (built into v1, this is the real self-learning).**
After any bug that took >2 attempts, any architecture decision, any security fix, the
agent appends a structured lesson to lessons/: situation → wrong assumption → correct
pattern → the check that proved it. Lessons load through the same registry as skills.
Guard against self-hallucination: a lesson MUST reference its verification (the test
that passed, the diff that fixed) or it isn't written. Every hard bug also becomes a
new eval task — so "the agent got smarter" is measured on the scorecard, never assumed.

**Stage 3 — local RAG (only when the corpus outgrows context).**
Trigger: skills/ + lessons/ exceed ~30k tokens. Then: local embeddings
(nomic-embed-text via Ollama), plain-JSON vector index, cosine top-k — still zero deps,
still fully local. Below that size, registry + grep retrieval beats vector search;
building RAG for 60 lines of doctrine is machinery without payoff.

**Stage 4 — fine-tuning (honest: probably never on 8 GB).**
Training on own transcripts needs thousands of verified examples, GPU budget, and risks
reinforcing the agent's own mistakes in a feedback loop. Only worth revisiting with big
hardware AND a scorecard that has plateaued. The eval suite is the gate for any learned
change: scorecard doesn't improve → the change doesn't ship.

Growth curve to expect: compounding-linear (every solved bug = one retrievable lesson +
one regression test), not exponential. Verification is what keeps the curve real.

## 5b. Latency & turn-reduction (owner asked 2026-07-10 — "make trivial tasks faster")

Distinct from the knowledge layer above: RAG improves *correctness*, NOT speed on mechanical
tasks. Measured baseline: qwen3.5:4b took 8 turns / 7 tool calls / 163s for a one-word edit
on M1 8GB (~20s/turn = cold load + full-history reprocess + decode). Levers, ranked ROI:

1. **Pre-load named files (★★★, do early).** If the task names files that exist in-repo,
   attach their contents (jail-read, size-capped) to the FIRST user message so the model
   skips the separate read turn(s). Biggest single turn-count win. Guard: only files under
   a size cap, only when the name resolves in-jail, never secret-glob files.
2. **Few-shot the read→edit→done flow in the prompt (★★★).** Small models imitate examples
   far better than they parse rules. One worked example of the exact tool sequence cuts
   fumbling and premature/again reads. Keep it inside the micro token budget.
3. **Explicit early-stop (★★).** "Once the edit is applied AND you have verified it, stop —
   do not re-read or re-confirm." The 8-turn run trailed past done.
4. **Runtime: keep model warm + MLX + quantized KV + tight num_ctx (★★).** `keep_alive` avoids
   reload between turns; MLX backend −15-30%; q8 KV cache + smallest workable num_ctx = less
   to reprocess each turn. **Phase 4 (context budget + compaction) directly delivers the
   num_ctx half of this** — smaller context = faster turns, so the speed fix is partly on the
   critical path already.
5. **Multi-model routing (★ later, see §6).** 1.5B for mechanical/search turns, escalate to
   4B+ for reasoning. Real win, needs eval data first so it's not a guess.
6. **Deterministic fast-path (★ narrow).** A pure literal rename / single-string replace with
   an unambiguous target doesn't need a model at all — detect that shape and apply it directly.
   Narrow scope; do not let it swallow judgment tasks.

Sequencing: 1-3 are cheap prompt/agent-layer changes worth doing right after Phase 4 (they need
the context-preload plumbing Phase 4 introduces). 4 is ops/config. 5-6 wait for the eval scorecard.

## 6. Later, if earned

- Multi-model routing: cheap model for search/summarize turns, big model for edits (needs eval data first).
- Speculative decoding (tiny draft model accelerates a bigger one) — if the runtime supports it and eval shows net speedup.
- MCP client support for external tools.
- Sub-agent `spawn` beyond max tier's basic version: parallel read-only explorers.
- Patch-format edits (unified diff) once eval shows a model that can emit them reliably.
