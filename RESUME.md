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
- Before every push: sensitive sweep over the diff (grep for the owner's local home path,
  personal email domains, `ghp_` tokens, and private infra hostnames/IPs — the exact
  pattern lives in the owner's local notes, not here) + committer = noreply. Push
  standing-approved for this repo.
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

## Owner preferences that shaped this
- "do then talk" = mode-aware terseness, NOT action-before-consult.
- Awesome + free-to-copy (MIT), zero personal peril: no payment/auth/telemetry INSIDE the
  tool; it may KNOW about those domains via doctrine (IMPROVE.md §5.1b).
- Never sudo; never touch secret values.

## OPEN WORK (2026-07-10 end-of-session — next session starts here)

### 1. Lever A/B eval — DONE 2026-07-10, verdict: KEEP ALL THREE LEVERS
Measured (2×10×2, same protocol as baseline): qwen3.5:4b 11/20 → **13/20** (avg 116.6s → 131.3s),
qwen2.5-coder:3b 6/20 → **10/20** (avg ~flat 22.1s). fix-test went 0/2 → 2/2 on 3.5:4b (preload
of the named file unlocked a previously-impossible class); read-answer now 1 turn (read turn
eliminated); edit-precision 2/2 both models. Cost: 3.5:4b ~13% slower per task (longer prompt
prefill) — accepted for +2/+4 passes. **Open regression to investigate: 06-find-def 2/2 → 0/2 on
qwen3.5:4b only** (coder:3b still 2/2) — suspect preload/few-shot interaction; check the session
JSONLs before touching code.

### 2. UI rework (owner spec, 2026-07-10)
- **Statusbar invisible on owner's terminal — debug FIRST, before any redesign**: ask which
  terminal app + window size; test scroll region live (`printf '\x1b7\x1b[1;20r\x1b8'`);
  Terminal.app fakes truecolor and may mishandle DECSTBM. Fallback design if broken: inline
  status line printed after each turn instead of a pinned bar.
- **Banner too big**: target ≤10 char rows total. Options: crop mask to face, or scale grid.
- **Mask fidelity**: owner says current render "looks nothing like" the reference
  (~/Downloads/fierce-samurai-warrior-mask-retro-pixel-art-style_1292377-22955.avif; converted
  PNG + extraction scripts in the session scratchpad are gone — re-convert with sips). Half-block
  pixels can't match a smooth 626px image; get closer via better palette/contrast at ~44px, and
  offer iTerm2 (true truecolor) — optionally OSC-1337 inline-image path (real PNG) when the
  terminal supports it, pixel-grid fallback otherwise.
- **Claude-style welcome**: small mask LEFT + right column: KAKUMEITEKI v{x} · model · mode ·
  1-2 HONEST capability sentences (read/explain/single-file edits; name a playbook for plans;
  verify diffs). Then during prompting: tiny mask snippet + a salute ("⛩ ganbatte — go build").
- Keep all of it TTY-gated + KAKU_PLAIN escape. Grid invariants stay tested.

### 3. Direction (owner-agreed, in order, one prompt at a time)
1. Verified-confidence line (IMPROVE §2): every result ends `done — verified n/m` computed
   from actual checks. The single highest-trust feature.
2. Capability ladder: scorecard across 4-6 quantized models that fit 8GB (qwen3.5:4b,
   qwen2.5-coder:3b, qwen3:4b text-only, a ~1.5B floor, optional q5 variant) → README table
   "model → measured can/can't". This is the project's honest identity: the instrument.
3. Perfect the proven small-task classes (explain/find/constraint/single-edit) — speed + polish.
Honest scope statement stands: NOT a Claude Code replacement; value = private/offline niche +
measurement instrument + owned artifact.
