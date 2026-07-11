# session notes

## 2026-07-11 — UI rework v1.1 (mask + pinned editor + kanji modes)

Commits `e859640` (mask engine) + `f436ce2` (tui integration). Suite: **270 tests, 269 pass, 1 skip**.
Owner-approved, design locked. Session ended for context clearance — next work in RESUME.md §"OPEN — next session".

- **Mask**: hand-drawn MASK → machine-derived grids from the reference AVIF (sips → BMP → per-cell
  downsample → median-cut palette; dev tooling was scratchpad-only). SPLASH 76×78 startup hero looks
  great; SMALL 24×24 crisp; grade for dark terminals + xterm-256 on Apple_Terminal. `src/mask-data.js`.
- **Pinned bar was the hard part**: DECSTBM scroll-region bar glitches with readline (probed live in
  owner's terminal — interleaves). Retired. Built `src/tui.js`: custom zero-dep line editor
  (`readline.emitKeypressEvents` parser + own sticky rendering) — bordered input box that grows with
  the text, status bar pinned below, word-nav/history/in-box y/N confirm, Shift+Tab mode cycle wired
  to `agent.setMode` (rebuilds system prompt). Pipes/tests keep plain readline → `repl.test.js` intact.
- **Status bar**: model · numCtx window · live token gauge · ↯ compaction · mode-as-kanji
  (侍 build / 匠 refactor / 検 audit / 忍 plan), coloured per mode.
- **Welcome card**: session + honest capability lines, NO small mask (renders rough small; splash
  carries the art). Flow: splash → welcome → clean REPL. Owner: "less is more."
- Owner refined direction: useful-at-small-tier via **tool-driven machine-assistant** tasks
  (dedup/declutter/junk/safe file ops); great-at-high-tier via bigger models. Research plan in RESUME §B.

## 2026-07-10 — Phase 2 complete (steps 1–6)

Commits `975b293..f11a3a5` (+ spec commits `1a99e56`, `f7137d5`), suite: **106 pass / 0 fail**.

| Gate requirement | Proof |
|---|---|
| tool unit tests green | 7 tools (read/write/edit/ls/glob/grep/bash), `test/tools-*.test.js` |
| S1–S12 = 0 escapes | `test/jail.test.js` + prefix-collision extra; S9 corrected: macOS realpath doesn't case-fold → refuse (deny-by-default), PLAN updated |
| classifier + controls = 0 false blocks | `test/classifier.test.js`: 36 deny attacks blocked in all modes, 14 controls pass |

Key deliveries: realpath path jail; edit tool enforces old-anchor uniqueness (Phase 0 binding rule, regression on TASTE probe C fixture); secret deny-globs in read/write/edit/grep from birth; quote-aware command classifier (deny > ask > mutate > read-only, structural + full-text rules); bash tool classifier-gated w/ minimal env, cwd pin, group-kill on timeout/cap/abort.

Hardenings beyond PLAN (all flagged in commits): plain `rm` outside jail → ask; `&`/newline/`()` as separators (no hiding attacks behind background/subshell); bash args touching secret files → ask (closes read-tool bypass); parent env stripped for bash children.

Spec updates from owner: mode-aware verbosity + `plan` mode + post-task self-audit (PLAN behavior spec); domain playbooks incl. ops layer — auth/oauth, payments, resilience, scalability, RAG, secrets rotation (automated day-one), observability, operations/orchestration (IMPROVE.md Stage 1b).

**Next: Phase 3** — live brain: tiered prompt, tool protocol + fenced-JSON repair, endpoint-death handling. Gate: scripted e2e edit byte-exact ≤10 turns; repair fires exactly once on injected garbage; ollama killed mid-turn → clean exit + resumable session. First step that touches a live model (RAM warning applies).

## 2026-07-10 — Phase 1 complete (steps 1–6)

Commits `ad99973..3af0638`, suite: **37 pass / 0 fail**, zero deps, zero network in tests.

| Gate | Requirement | Proof |
|---|---|---|
| (a) | config precedence CLI > project > global > defaults; hard error on unknown key | `test/config.test.js` (14 tests: precedence chain, unknown top-level/nested/CLI key, enums, malformed JSON names file) |
| (b) | mock provider drives loop ≥2 tool round-trips to final message, correct JSONL event sequence | `test/loop.test.js` — exact sequence `user_message → (assistant_message → tool_call → tool_result) ×2 → assistant_message` |
| (c) | AbortController mid-mock-turn → `cancelled` event, clean return | `test/cancel.test.js` — mid-first-turn, after-round-trip (no dangling tool call), pre-aborted |

Built: `src/config.js`, `src/provider.js` (ollama-native adapter, per-request `num_ctx`, NDJSON parser, preflight, 404→`ollama pull` hint), `src/session.js` (append-only JSONL, header + events, readback), `src/loop.js` (turn cap, tool-error feedback, cancel path), `test/helpers/mock-provider.js`.

Deferred by design (per PLAN phases): openai-compat adapter (P3), doom-loop guard (P3), redaction-before-persist (P5), resume/compaction (P4), partial-text `partial:true` persistence (P3/4).

## 2026-07-10 — Phase 2 complete (steps 1–5)

Commits `975b293..f11a3a5` (+ spec sync `f7137d5`, MIT `2d452f2`, playbooks `1a99e56`). Suite: **106 pass / 0 fail**, zero deps, tests sandboxed (temp dirs, no network, no model).

| Gate part | Proof |
|---|---|
| S1–S12 path jail, 0 escapes | `test/jail.test.js` — realpath jail + prefix-collision + deepest-existing-ancestor for writes; S9 corrected (macOS realpath does not case-fold → deny-by-default) |
| 7 tools, unit-tested | read/write/edit (`test/tools-file.test.js`), ls/glob/grep (`test/tools-search.test.js`), bash (`test/tools-bash.test.js`) |
| classifier: 36 deny attacks blocked all modes, 14 controls 0 false blocks | `test/classifier.test.js` |

Security highlights: edit enforces `old`-anchor uniqueness (Phase 0 binding rule, regression-tested on probe C fixture); secret deny-globs in all file tools + bash args; bash minimal-env (parent secrets stripped), cwd-pinned, group-kill on timeout/cap/abort; ask-class needs explicit approval callback (absent/declined = not executed). Hardened beyond PLAN: plain `rm` outside jail → ask; `&`/newline/`()` are segment separators.

Deferred to later phases: redaction-before-persist (P5), R1–R8 regex suite (P5), tiered tool exposure via profiles (P3), doom-loop guard (P3).

## 2026-07-10 — Phase 3 complete (steps 1–4), model swapped to qwen3.5:4b

Commits `b157b01..b733da7` (+ model swap `f951737`, size fix `8e1b77c`). Suite: **137 offline pass / 0 fail + 1 live (KAKU_LIVE=1)**.

| Gate part | Proof |
|---|---|
| (a) scripted e2e edit byte-exact ≤10 turns | `test/e2e-live.test.js` LIVE: qwen3.5:4b, status=done, 8 turns, greet.js Hello→Hi byte-exact, 163s |
| (b) repair fires exactly once on garbage | `test/protocol-loop.test.js` (mock, deterministic) |
| (c) ollama death mid-turn → clean + resumable | `test/resilience.test.js` EndpointError→endpoint_error status, session intact |

Built: `src/toolcall.js` (native + fenced-JSON + liberal normalization + repair signal), `src/prompt.js` (micro/full tiered, mode-aware, self-audit), `src/agent.js` (integration layer: provider+jail+tools+prompt+session+loop — CLI reuses it), loop.js repair loop + doom-loop guard, provider.js EndpointError + connection retry.

**Live capability data (qwen3.5:4b, M1 8GB):** one-word edit took 8 turns / 7 tool calls / 163s. Converges only because the harness enforces read-before-edit + anchor uniqueness + repair + turn cap. This is the honest small-model signal — slow, needs guardrails, but reliable within budget.

Deferred: stream-stall watchdog (>60s no-data) — process-kill = socket reset, already covered; profiles.js auto-detect probe (micro hardcoded for now); redaction R1–R8 (Phase 5).

## 2026-07-10 — Phase 4 complete (steps 1–4)

Commits `d603ccd..28c5578`. Suite: **158 offline pass / 0 fail + 1 live**.

| Gate criterion | Proof (`test/gate-phase4.test.js`, 30-turn session) |
|---|---|
| every request ≤ budget | 0 of ~29 requests over 2048 tokens (asserted from mock request log) |
| ≥1 compaction | fired, each shrank token count |
| state-carry post-compaction | ORCHID-42 from original task survives in final request |
| `--resume` continues | rebuilt full transcript, reopened same file, new turn appended, fact still present |

Built: `src/context.js` (conservative token estimator chars/3.5, budget 80% threshold, deterministic `compact()` = keep system + task + recent window + protocol-agnostic summary marker), loop.js optional-budget compaction wiring, session.js resume layer (`rebuildMessages` w/ `[interrupted]` synthesis, `loadSession`, `latestSessionFor`, `resolveSessionPath`, `reopenSession`), agent.js resume option (fresh prompt + rebuilt history + compact-on-load + model/tier drift warning).

Design: compaction is deterministic (no LLM call → no hallucinated summary); system prompt regenerated on resume (not replayed) so changed tier/mode takes effect.

## 2026-07-10 — Phase 5 complete (steps 1–3)

Commits `c54be1c..f955c32`. Suite: **176 offline pass / 0 fail + 1 live**.

Built: `src/redact.js` (R1–R8 regexes + `redact()`/`redactDeep()`, PEM/specific before generic R8). Wired redaction into `loop.js` (tool output before it reaches model messages OR transcript) and `session.js` append (every persisted line via redactDeep — catches assistant text + user-pasted secrets; critical because resume replays transcript to the model). `test/gate-phase5.test.js` = consolidated proof: 100% attacks blocked + 100% controls allowed across D1–D14 (23 attacks), S1–S12, R1–R8, secret-globs.

Security posture now complete across both directions: realpath jail + deny-list classifier + minimal-env bash (Phase 2) + secret redaction never persisting/recirculating (Phase 5). Honest limit still stated in-code: deny-list is a tripwire, jail + default-ask + minimal-env + redaction are the real guarantees.

## 2026-07-10 — Phase 6 complete (steps 1–3)

Commits `15719bc..5f2548a`. Suite: **190 offline pass / 0 fail + 1 live**.

Built: `eval/run.js` (runTask/runSuite/renderScorecard), `eval/tasks/` (10 verifiable tasks, each a script check), `eval/scorecard.js` (full-matrix runner), `test/eval-harness.test.js` + `test/eval-tasks.test.js` (runner + every check validated as a real gate offline).

**Gate PASSED — full matrix (both models × 2 runs × 10 tasks = 40 live runs, zero crashes):**

| Model | Score | Avg speed |
|---|---|---|
| qwen3.5:4b | **11/20** | 116.6s/task |
| qwen2.5-coder:3b | 6/20 | 21.1s/task |

Verdict: 3.5:4b is the better brain (wins add-function, find-vuln, edit-precision, constraint; never lost a task coder:3b won) but slow on 8GB. Both fail the hardest multi-step tasks (fix-test, rename, edit-big-file 0/2 each) — the real ceiling of a ~3-4B local model.

**Measured slowness cause (big finding):** `ollama ps` showed 3.5:4b at 6.1GB @ num_ctx=8192 spilling 32% to CPU (past ~5.3GB Metal ceiling). num_ctx=4096 likely keeps it GPU-resident for est 3-5× speedup — top lever in IMPROVE.md 5b, worth testing.

Real bug fixed: nested `node --test` inherits NODE_TEST_CONTEXT and won't exit non-zero → broken fixtures false-pass. Check now strips it (would have corrupted every eval).

**Next: Phase 7 (FINAL)** — docs (ARCHITECTURE.md/DEBUGGING.md/AGENT.md) + build the real CLI (bin/kaku.js still a STUB: argv parse, REPL, one-shot -p, --resume/--continue, config load) + modes polish. Gate: fresh Claude session with repo-only context explains architecture + fixes a pre-committed planted bug → fixture test green, zero out-of-repo questions. Est 1h+CLI. This is the acceptance test for the "no comments, docs carry it" standard.

## 2026-07-10 — Phase 7 complete → v1.0.0 SHIPPED

Commits `724de5a..2f0ac9e` (main) + `gate-planted-bug` branch. Suite: **236 offline pass / 0 fail**.

- **Step 0**: numCtx=4096 hypothesis REFUTED by measurement — working set 6.0GB vs 6.1GB @8192 (KV was ~0.1GB; multimodal weights+buffers exceed the 5.3GB Metal ceiling at ANY ctx), timings equal/slower. numCtx stays 8192.
- **Steps 1–3 (real CLI)**: parseArgv (unknown flag = hard error), one-shot `-p` with streamed fence-suppressed output, REPL (readline/promises + per-question AbortSignal), y/N confirm for ask-class bash, Ctrl-C cancel/exit semantics, `--continue`/`--resume` verified offline (mock Ollama HTTP server, request-capture assertions) AND live (pong recall drill).
- **Steps 4–6 (docs gate)**: planted compact-on-resume bug in the ONE uncovered src branch (found via coverage), fixture test red on branch only; wrote ARCHITECTURE/DEBUGGING/AGENT after planting; **GATE PASSED** — fresh repo-only session explained the architecture (10 cited claims) + fixed the bug in 1 line via the intended doc trail, zero out-of-repo questions. Evidence: branch `103cb5d`.
- **Step 7 (owner asks + ship)**: samurai banner (44x40 pixel grid extracted from owner's reference via ffmpeg+quantize+mirror+denoise), DECSTBM bottom status bar (name·model·mode·live ctx%), working-ninja indicator, `kaku doctor` onboarding, README quickstart, v1.0.0.
- Hygiene: sweep-pattern text + first name scrubbed from public tree (history still has old fragments — flagged to owner).

v1 verification: PLAN end-to-end items all passed (live one-shot, eval scorecard, security suite, fresh-agent test); live TTY Ctrl-C drill = owner-side check.

## 2026-07-10 (later) — v1.1 capability drop: doctrine layer + speed levers

Commits `d6ae193..c61b3f1`. Suite: **249 offline pass / 0 fail**.

- **IMPROVE 5b levers 1-3 shipped**: src/preload.js (task-named in-jail files attached to the first user message — redacted, 6KB/file cap, 2 files max, secret-globs excluded; oversized falls back to the read tool), micro-prompt few-shot read→edit→done example + skip-the-read hint, early-stop line both tiers.
- **IMPROVE 5.1b doctrine layer shipped**: 9 cited playbooks in skills/ (auth, payments, resilience, scalability, rag, secrets-ops, observability, operations + safe-coding extension of security.md) + built-in read-only `skill` tool (serves from the tool's own install dir — deliberate, whitelisted out-of-jail read). Registry line rides the tool list. **Live-verified**: qwen3.5:4b consulted payments playbook and answered from it.
- Docs refreshed to stay gate-truthful; playbook lint test enforces size + Sources on every doctrine file.
- **History purge BLOCKED by permission classifier** (git filter-repo = destructive, needs explicitly named owner approval). Backup bundle ready at .claude/pre-purge-2026-07-10.bundle; replacements file prepared. Awaiting owner's explicit go.

## 2026-07-11 (later) — refactor review shipped + find-def triage closed

Commits `ed0620d..5a2b52f` (6). Suite: **268 tests, 267 pass, 1 skip, 0 fail** (net −3 dead tests, +2 new).

**Refactor review (owner-approved R1–R8, all shipped):**
- R1+R2 `ed0620d`: dead hand-drawn mask pipeline (MASK/PALETTE/renderMaskRows) + unused TINY grid removed — −121 lines; grid tests already covered the render invariants.
- R3 `31f18b5`: ANSI constants single-sourced in statusbar.js (was 3× duplicated).
- R4 `ae4c1c4`: REAL BUG — cursor rendered on the box border when prompt+line filled the width exactly; layout math now pure `boxLayout()` (+1 cursor cell, trailing space materializes the wrap), regression-tested.
- R8 `f696552`: forward-delete key.
- R5 `ad4f499`: `runTurn()` in ui.js dedupes the 3× renderer+error-report block (tui loop / plain loop / one-shot); -p mid-run provider errors now report uniformly instead of raw throw.
- R6+R7 `809f6bf`: banner gate now matches editor gate (piped stdin → no chrome); dead `version` param dropped.
- Pinned-bar-during-streaming caveat: KEEP AS-IS (decision, not omission) — DECSTBM measured-glitchy, delta-repaint = the partial-line bug class; box returns instantly post-turn.

**Phase 0 — 06-find-def "regression" triage: NOT REPRODUCIBLE, verdict variance.**
6/6 fresh live runs pass on qwen3.5:4b (32–56s, clean grep→answer); 2/6 rescued by empty-reply nudge. A/B's 0/2 at n=2 was noise around that wobble, not lever damage. Levers stay. Eval runner now keeps failed runs' transcripts (`5a2b52f`) so the next anomaly is replayable — n per cell should rise when scorecard runs matter (measurement track).

**Next**: Phase 2 of the stronger+safe plan — safety net (pre-edit backups + `kaku undo` first step), drip execution, awaiting go.

**Post-refactor live drive found a shipped v1.1 bug (`b46fbde`)**: interactive `exit`/Ctrl-C left a zombie kaku — stdin never paused, event loop never drained; offline suite was green throughout. Fixed (input.pause() in cleanup), regression-tested with the first mock-TTY tests of the editor loop (test/tui-editor.test.js, 271 tests now), and live-verified via expect-driven pty (clean EOF, exit 0). Owner: if you had lingering kaku processes after quitting, this was why — `ps aux | grep kaku` and kill any strays once.

## 2026-07-11 (later) — Track 1 "safety net" COMPLETE (4 steps, drip-executed)

Commits `8b51c60`, `0110553`, `383dc28`, `0374c14`. Suite grew 279→299 (298 pass, 1 skip).

1. **Undo** (`8b51c60`): pre-mutation blob+manifest per session; `kaku undo` walks the stack, jail-checked, audited. Live-verified roundtrip.
2. **Permissions gate + diff preview** (`0110553`): closed real gap — edit/write ignored `--permissions` entirely (readonly didn't block file edits!). Now: readonly blocks · safe asks with coloured diff preview · auto applies. Undo records only after approval.
3. **`--scope <dir>`** (`383dc28`): consented out-of-cwd jail. `/` refused; home root/outside-home need interactive yes; prefix-trap tested. Live-verified all three guardrail paths + scoped model run.
4. **Audit log** (`0374c14`): `<sessionDir>/audit.jsonl` — file outcomes, non-read-only bash, scope grants, undo restores. Redacted, paths only, best-effort (warns once, never breaks a turn). Live-verified applied→restored trail.

Machine-assistant tools (Track 2) now unblocked — every prereq from RESUME §B.1 shipped.

## 2026-07-11 (later) — Tracks "measurement" + "machine-assistant" landed

Commits `5958d92..3cd489d`. Suite 302→318 (317 pass, 1 skip). Everything A/B-measured per ethos.

- **Eval**: 3 new task classes (11-dedup / 12-junk / 13-clean), both-directions check proofs, `TASK_FILTER` subset runs, baseline recorded BEFORE tools existed.
- **Tools**: `dedup` (SHA-256 groups), `junkscan` (conservative rules, recursive), `trash` (undo-store-backed deletion, batch-validated, gated+audited).
- **Measured**: 3.5:4b machine-assistant subset 4/6→9/9 (and 2–3.6× faster); coder:3b 0/6→7/8. Both models chose `trash` over `rm` unprompted — deletions undoable by default.
- **Live-measured tool-bug lessons** (fixed + regression-tested): silent-empty on missing dir = falsehood amplifier (dedup + glob); `""` optional params from small models; "measure the tool the day you ship it" now doctrine.

## 2026-07-11 (close) — rename tool + parser fix + full-matrix gate

Commits `d2cda48`, `830fa7e`. Suite **323 / 322 pass / 1 skip**. Wiki updated (3 lessons: zombie-exit pty drive · small-model tool ergonomics · baseline-before-tool A/B).

- **rename tool**: 3.5:4b 0/2→3/3 on the measured-dead class (231s→63s); coder:3b honest 0/3 (never discovers it — recorded, not spun). Parser fix from same transcripts: unterminated ```json fence with a valid call no longer dies silently.
- **Full-matrix gate**: 3.5:4b **22/26** (classic-10: 16/20, +3, no confirmed regressions; tool wins hold). coder:3b **13/26** (machine-assistant 6/6!).
- **Timing columns invalid** — 7h overnight run, machine slept; re-time under `caffeinate` before quoting speeds.
- **Open flags (n=2, replay before believing)**: 04-add-function 1/2→0/2 (both turn-capped) · coder:3b classic-10 drift 10/20→7/20. Shared suspect: 12-tool registry crowding small-model attention. 17 kept failure transcripts on disk for triage.

**Next session start here**: (1) triage 04 + coder drift from kept transcripts — if tool-list crowding confirmed, candidate fix = tier-aware tool registry (micro tier gets a trimmed list); (2) caffeinate re-time; (3) then Track 4 (openai-compat + capability ladder) / verified-confidence line / PDF guide (§C still owed). RESUME.md itself now stale — owner call pending on session-notes tracking mismatch.

## 2026-07-11 (later) — flag triage closed: NOT registry crowding; two ergonomics fix waves

Commits `52ce2f4`..`db67e0a` (5). Suite **332 / 331 pass / 1 skip**. Owner decision: session-notes.md
stays tracked (RESUME.md claim fixed, `52ce2f4`). All replays under caffeinate — clean timings.

- **Old /tmp transcripts were gone** (macOS swept them) — refreshed via TASK_FILTER replays, n=3/cell.
- **Flag 2 (coder:3b drift): variance.** 08 3/3, 06 2/3 (historical wobble), 03 1/3 with two
  mechanical, fixable deaths. Registry-crowding hypothesis: not supported by transcripts.
- **Flag 1 (04, 3.5:4b): real — 0/5 post-wave.** Root causes were NOT the 12-tool registry:
  - Wave 1 (`aaf2c5e` `0c57116` `57c0c6d`): few-shot `src/app.js` primed path invention (both
    models); valid fenced call + trailing prose inside the fence → protocol_failed (leadingJson
    fallback now extracts it); bash timeout on the model's own infinite loop gave no diagnostic
    (hint added); native-path unknown-tool error now lists available tools (the `move` hallucination).
  - Wave 2 (`db67e0a`): THE real poison — model re-derives cwd basename as a phantom subdir
    ("working in …/proj" → `proj/slugify.js`; write silently seeded a nested copy). Deterministic
    counter: phantomPrefixHint on 7 tools + write guard refusing the phantom seed + 1 prompt rule.
- **Measured**: 03 coder:3b 1/3 → 3/3 post wave 1 · 04 3.5:4b 0/3 → 0/3 → **2/3** post wave 2.
- **04's residual failure = fabricated verification** ("all 5 tests passed", never ran them) —
  direct evidence for the verified-confidence line (IMPROVE §2) as the next highest-value feature.
- Both waves cavecrew-reviewer-audited pre-push; audit found the glob/trash/dedup/junkscan hint
  gaps + ..-path hint hygiene, all addressed. Sensitive sweep clean on every push.
