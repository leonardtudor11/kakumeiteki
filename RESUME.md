# KAKUMEITEKI — resume context

Fully-local coding agent. Plain JS, zero deps, Node 20+, ESM. Any Ollama model behind a
Claude-Code-style harness; the harness discipline is the product, the model is swappable.
Repo `~/kakumeiteki`, pushed to github.com/leonardtudor11/kakumeiteki (public, MIT, noreply-clean).

## State: **v1 SHIPPED** (2026-07-10). All 7 phases + gate PASSED. 236 offline tests green.

- Full harness: config / provider (native /api/chat, retry) / loop (repair, doom-guard,
  compaction, cancel) / 7 jailed tools / tiered prompt / JSONL sessions + resume /
  R1–R8 redaction / permissions (S1–S12 jail, D1–D14 deny, classifier) / agent.js integration.
- Real CLI: REPL (banner + status bar + ninja) / one-shot `-p` / `--continue`/`--resume` /
  y/N confirm for ask-class bash / Ctrl-C cancel-exit semantics / `kaku doctor` onboarding.
- Docs: README (quickstart) + ARCHITECTURE + DEBUGGING + AGENT + PLAN + IMPROVE + TASTE.
- **Phase 7 gate PASSED**: fresh repo-only session explained the architecture (10 cited
  claims) and fixed the planted compact-on-resume bug from docs alone — evidence on branch
  `gate-planted-bug` (`103cb5d`). Main never carried the bug.
- Eval verdict (scorecard.md): qwen3.5:4b 11/20 (116.6s avg) vs qwen2.5-coder:3b 6/20
  (21.1s). numCtx lever tested + DEAD: 3.5:4b's 6 GB working set is weights+buffers, not
  KV — spills the 5.3 GB Metal ceiling at ANY ctx. numCtx stays 8192 (IMPROVE.md §5b.4).

Run: `npm test` (bare `node --test`, offline) · `node eval/scorecard.js` (loads models!) ·
`KAKU_LIVE=1 node --test test/e2e-live.test.js` (live smoke).

## Hardware (hard constraints)
- Apple M1, 8 GB RAM, Metal working-set ceiling ≈ 5.3 GB. Warn before loading a model.
- Models pulled: `qwen3.5:4b` (default) + `qwen2.5-coder:3b` (fast fallback).

## NEXT (all optional — backlog lives in IMPROVE.md)
- §5b latency levers 1–3: pre-load named files, few-shot the read→edit→done flow,
  explicit early-stop (cheap prompt/agent-layer wins measured to matter).
- §5.1b doctrine playbooks (auth/payments/resilience/…) + §2 verified-confidence line.
- §1 telemetry HUD v2, §6 multi-model routing (needs eval data), openai-compat adapter.
- Owner-side: live Ctrl-C interrupt drill in a real TTY (offline tests cover the logic).

## Execution rules (KEEP DOING)
- ultraplan drip: ONE step at a time (prereq → do → verify → rollback), wait for "go".
- git commit per step via `git commit -F -` heredoc (zsh eats ``` in -m).
- Before every push: sensitive sweep (`git grep -iE "__LOCAL_HOME__|yahoo|@gmail|ghp_[a-z]|tailscale|164\.90|100\.103"`
  over the diff) + committer = noreply. Push standing-approved for this repo.
- Live tests behind `KAKU_LIVE=1`; clean /tmp/kaku-eval-sessions after eval runs.
- Update session-notes.md + .claude/learning-log.md at close. `.claude/` + session-notes
  are local-only (gitignored).

## Gotchas (do not rediscover)
- Node 25: bare `node --test` only. Nested test runs must strip NODE_TEST_CONTEXT.
- macOS realpath: /var→/private/var, no case-folding — assert against `jail.root`.
- Ollama /v1 can't set num_ctx; native /api/chat + client-side token counting.
- Ollama front-truncates silently — the budget is enforced client-side, loop AND resume.
- In-test mock HTTP server + spawnSync = event-loop deadlock — spawn children async.
- Terminal.app fakes truecolor; iTerm2 renders the banner properly. KAKU_PLAIN=1 opts out.
- Small models can't judge edit-anchor uniqueness — the edit tool enforces it (TASTE.md).

## Owner (the owner) preferences that shaped this
- "do then talk" = mode-aware terseness, NOT action-before-consult.
- Awesome + free-to-copy (MIT), zero personal peril: no payment/auth/telemetry INSIDE the
  tool; it may KNOW about those domains via doctrine (IMPROVE.md §5.1b).
- Never sudo; never touch secret values.
