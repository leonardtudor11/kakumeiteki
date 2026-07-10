# KAKUMEITEKI — resume context

Fully-local coding agent. Plain JS, zero deps, Node 20+, ESM. Any Ollama model behind a
Claude-Code-style harness; the harness discipline is the product, the model is swappable.
Repo `~/kakumeiteki`, pushed to github.com/leonardtudor11/kakumeiteki (public, MIT, noreply-clean).

## State: **v1.1 SHIPPED** (UI rework 2026-07-11, commit f436ce2). 270 tests, 269 pass, 1 skip.

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

### 2. UI rework — DONE 2026-07-11 (v1.1, commits e859640 + f436ce2)
- **Mask fidelity**: replaced hand-drawn MASK with grids machine-derived from the reference AVIF
  (sips AVIF→PNG→BMP → per-cell downsample → median-cut palette; dev tooling was in scratchpad,
  gone now — re-derive from `~/Downloads/fierce-samurai...22955.avif` if needed). SPLASH 76×78
  (startup hero), SMALL 24×24 (narrow fallback), TINY 12×12. Renderer grades the palette for dark
  terminals + maps to xterm-256 on Apple_Terminal (which mangles truecolour). `src/mask-data.js`.
- **Statusbar was invisible → root-caused**: DECSTBM pinned bar glitches against readline in the
  owner's terminal (probe confirmed interleaving). RETIRED. Interactive terminals now use a custom
  zero-dep line editor (`src/tui.js`): `readline.emitKeypressEvents` parser + own sticky render —
  bordered input box that grows with the text, status bar pinned below. Pipes/tests keep plain
  readline (`runReplPlain`), so `repl.test.js` is untouched.
- **Status bar** (`renderStatusBar`): cwd · model + numCtx window · live token gauge (green→
  yellow→red) · ↯ compaction warning · mode. Mode = feudal-role kanji coloured per mode
  (侍 build / 匠 refactor / 検 audit / 忍 plan). Shift+Tab cycles + `agent.setMode` rebuilds the
  system prompt so behaviour actually changes.
- **Welcome card** (`showWelcome`): session line (model · kanji mode · perms) + honest capability
  lines. NO small mask — small half-block masks render rough in a real terminal font; the splash
  carries the art, "less is more" (owner). Flow: splash (once) → welcome card (once) → clean REPL.
- All TTY-gated + KAKU_PLAIN/NO_COLOR escape. 270 tests (269 pass, 1 skip).
- **Owner-approved.** Design decisions locked; see §"OPEN — next session" for the wrap items.

### 3. Direction (owner-agreed, in order, one prompt at a time)
1. Verified-confidence line (IMPROVE §2): every result ends `done — verified n/m` computed
   from actual checks. The single highest-trust feature.
2. Capability ladder: scorecard across 4-6 quantized models that fit 8GB (qwen3.5:4b,
   qwen2.5-coder:3b, qwen3:4b text-only, a ~1.5B floor, optional q5 variant) → README table
   "model → measured can/can't". This is the project's honest identity: the instrument.
3. Perfect the proven small-task classes (explain/find/constraint/single-edit) — speed + polish.
Honest scope statement stands: NOT a Claude Code replacement; value = private/offline niche +
measurement instrument + owned artifact.

## OPEN — next session (2026-07-11 end-of-session, context cleared; start HERE)

Owner refined the vision this session: on modest hardware (his M1 8GB, 3–4B model) be
**genuinely useful, slow but real** — coding help AND "around the machine" work (safe edits,
rearrangements, decluttering, deleting junk/caches, finding duplicate/copy files, little
optimizations, recommendations). On better hardware (bigger local model or `openai-compat`
cloud, same harness) be **great**. KEY INSIGHT: the machine-assistant tasks are a *sweet spot*
for a small model because they're **tool-driven, not reasoning-driven** — a hash-compare/dedup
tool, junk-pattern rules, safe file ops do the heavy lifting; the model just orchestrates +
explains + confirms. That's honest-useful at any tier. Honesty ethos unchanged: `eval/scorecard.md`
is ground truth; the harness makes things SAFE + makes SIMPLE things RELIABLE; the MODEL sets the
capability ceiling; never pretend otherwise.

### A. Refactor review (owner asked — do FIRST, cheap, before new features)
Review the codebase for anything to clean up / consolidate, especially the new v1.1 UI files:
`src/tui.js` (biggest, new — the raw-mode editor; check the sticky-render cursor math, the
confirm/streaming/mode-cycle interleave, resize handling), `src/banner.js`, `src/statusbar.js`,
`src/cli.js` (the interactive/plain branch), `src/mask-data.js`. Look for: duplicated colour/ANSI
constants across banner+statusbar+tui, dead code (old MASK/renderMaskRows/PALETTE in banner.js are
now unused by production but still tested — decide keep-vs-remove + migrate tests), the tui.js
"v1 caveat" (status bar not pinned during streaming — is it worth adding?). Keep it surgical.

### B. Deep research + phased ultraplan: "stronger + safe" (5 tracks)
1. **Safety net** — pre-edit backups + `kaku undo` (rollback last change), diff-preview-before-apply,
   explicit out-of-cwd scope consent (currently jailed to cwd), action audit log. Prereq to letting
   it touch the wider machine.
2. **Machine-assistant tools** — dedup (content hash), junk/cache/temp detection (pattern rules),
   safe move/delete (confirm + undo), declutter suggestions, recommendations. Tool-driven → useful
   even at 3–4B. New tools inherit ALL jail/redaction/size defenses (learning-log: preload lesson).
3. **Capability by structure** — decompose→do→verify→repair loop, named-playbook/skills library
   (playbooks already on the reliable list per eval). Squeezes more coding out of small models.
4. **Model strategy** — smooth path to bigger local models + `openai-compat` cloud adapter
   (IMPROVE §6); tier-appropriate behaviour; RAM warnings for the 8GB ceiling.
5. **Measurement** — extend `eval/scorecard.js` to the new capabilities (machine-assistant tasks,
   decomposed multi-step) so every claim stays measured, not vibes.
Run it as a proper deep-research pass THEN a phased ultraplan; execute track by track.

### C. PDF install guide (agreed, pending) — do after A/B or when owner asks
Clean, intuitive, step-by-step, nothing fancy, with the terminal visuals (splash render, welcome
card, the box). macOS + Windows. Blockers to note honestly: package.json is `private:true` +
not on npm (share via GitHub clone + `npm install -g .`, zero deps); **Windows is untested** —
needs a modern terminal (Windows Terminal / VS Code, NOT legacy cmd.exe) for truecolor/256/kanji/
raw-mode. Build HTML → headless-Chrome print-to-pdf (check Chrome present) or offer the HTML.

### Still open from earlier (unchanged)
- §1 above: 06-find-def regression 2/2 → 0/2 on qwen3.5:4b only — check session JSONLs first.
