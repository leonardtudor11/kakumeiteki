# session notes

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

**Next: Phase 4** — context budget + compaction + session resume. Gate: 30-turn scripted session every request ≤ budget (asserted from request log), ≥1 compaction, state-carry probe answered, `--resume` continues. Mostly mock-testable. Est 1.5h.
