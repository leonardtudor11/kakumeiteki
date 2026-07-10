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

## 5. Knowledge layer — how the doctrine stays real and compounds

The fear this answers: a small model hallucinating confident advice. The doctrine files
(skills/) are the defense, and they harden in stages. Rule of the whole layer:
**nothing counts as learned until a verification artifact backs it.**

**Stage 1 — cited doctrine (one-time curation, cheap, do early).**
Research-verify every rule in skills/*.md against primary sources: OWASP ASVS + Top 10
(security.md), Google SRE book + AWS Well-Architected (system-design.md), established
codebase-archaeology practice (reverse-engineering.md). Each rule gets a source line;
any rule that can't be backed gets deleted. Doctrine becomes checkable text, not vibes.

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

## 6. Later, if earned

- Multi-model routing: cheap model for search/summarize turns, big model for edits (needs eval data first).
- MCP client support for external tools.
- Sub-agent `spawn` beyond max tier's basic version: parallel read-only explorers.
- Patch-format edits (unified diff) once eval shows a model that can emit them reliably.
