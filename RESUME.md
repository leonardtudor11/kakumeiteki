# KAKUMEITEKI — resume context

Fully-local coding agent. Plain JS, zero deps, Node 20+, ESM. Runs any Ollama model via a
Claude-Code-style harness. The harness discipline is the product; the model is swappable.
Repo `~/kakumeiteki`, pushed to github.com/leonardtudor11/kakumeiteki (public, MIT, noreply-clean).

## State: Phases 0–6 DONE. HEAD `4220cae` pushed. 190 offline tests + 1 live, all green.

Run tests: `npm test` (bare `node --test` — NOT `node --test test/`, Node 25 rejects the dir arg).
Live eval: `node eval/scorecard.js` (needs Ollama + models pulled). Live agent test:
`KAKU_LIVE=1 node --test test/e2e-live.test.js`.

### Hardware (hard constraints)
- Apple M1, **8 GB RAM**. Metal working-set ceiling ≈ **5.3 GB** (⅔ of unified RAM) — that, not
  total RAM, is the budget for model weights + KV cache.
- ~28 GB disk free. Ollama installed, now MLX-backed on Apple Silicon.
- Models pulled: `qwen3.5:4b` (3.4 GB, DEFAULT) and `qwen2.5-coder:3b` (1.9 GB, fallback).

### Architecture (all built + tested)
```
bin/kaku.js          STILL A STUB — Phase 7 builds the real CLI
src/
  config.js          load/merge/validate (CLI>project>global>default, hard error on unknown key)
  provider.js        ollama-native /api/chat adapter, per-request num_ctx, NDJSON stream,
                     EndpointError + connection retry (2x backoff), preflight
  loop.js            agent loop: native+fenced tool calls, 1-shot repair, doom-loop guard,
                     turn cap, compaction wiring (optional budget), redaction of tool output,
                     cancel (AbortError→cancelled), EndpointError→endpoint_error status
  toolcall.js        parse native + fenced ```tool/```json + bare JSON, liberal key normalize,
                     repair signal on bad JSON/missing name/unknown tool
  prompt.js          tiered system prompt (micro ~compact / full numbered laws), mode-aware
                     (build/refactor/audit/plan; audit+plan forbid edits), self-audit footer
  context.js         token est (chars/3.5, over-counts), budget 80% threshold, deterministic
                     compact() (keep system+task+recent+summary-marker, NO llm call)
  session.js         append-only JSONL (redacted before persist), rebuildMessages (+[interrupted]
                     for dangling tool calls), loadSession/latestSessionFor/resolveSessionPath/reopenSession
  redact.js          R1-R8 secret regexes, redact()/redactDeep(), [REDACTED:R#]
  permissions.js     realpath path jail (S1-S12), isSecretPath deny-globs, splitSegments (quote-aware
                     tokenizer), classifyCommand (D1-D14 deny + network/mutate/read-only classes),
                     actionForCommand (safe/auto/readonly mode table)
  agent.js           createAgent() = the integration layer (provider+jail+tools+prompt+session+loop
                     + resume option). THE CLI WILL REUSE THIS.
  tools/             read write edit(anchor-uniqueness) glob grep ls bash(classifier-gated,minimal-env,
                     group-kill) + walk(shared) + index(registry)
eval/
  run.js             runTask/runSuite/renderScorecard (metrics from session events)
  tasks/01..10.js    10 verifiable tasks, each a SCRIPT check (no judgment)
  scorecard.js       full-matrix runner; writes scorecard.md + per-model files
ARCHITECTURE.md DEBUGGING.md AGENT.md   <-- Phase 7 must CREATE these (do not exist yet)
PLAN.md TASTE.md IMPROVE.md RESUME.md   exist
```

### Eval scorecard verdict (2026-07-10, full matrix, both models x2 runs)
- **qwen3.5:4b: 11/20** (avg 116.6s/task) — better brain, wins add-function/find-vuln/edit-precision/
  constraint, never lost a task coder:3b won.
- **qwen2.5-coder:3b: 6/20** (avg 21.1s) — faster (fits GPU at 1.9GB), shallower.
- Both 0/2 on fix-test, rename, edit-big-file = the hard ceiling of a ~3-4B local model.
- **numCtx lever TESTED + DEAD (Phase 7 step 0, 2026-07-10):** at num_ctx=4096 the working set is
  6.0GB (vs 6.1GB @ 8192) — KV was ~0.1GB all along; multimodal weights + buffers alone exceed the
  5.3GB Metal ceiling. Still 33% CPU spill, timings equal/slower. numCtx stays 8192. Details in
  IMPROVE.md §5b item 4.

## NEXT: Phase 7 (FINAL) — ship v1

**(a) Build the real CLI (`bin/kaku.js`)** — currently a stub. Needs:
- argv parse (zero-dep): `-p "task"` one-shot; no `-p` = REPL. Flags `--model --mode --resume [id]
  --continue --permissions`.
- config load: `loadConfig({ ...defaultPaths(cwd), cliFlags })` from config.js.
- confirm callback for ask-class bash (prompt y/N on stdin) → pass to createAgent.
- REPL: read line → agent.run(task, {onDelta: write stdout}) → print result + self-audit; Ctrl-C once
  = cancel turn (AbortController), twice/idle = save+exit.
- `--continue` → createAgent({resume:true}); `--resume <id>` → createAgent({resume:id}). Print the
  drift warnings agent.warnings.
- Preflight failure (EndpointError) → actionable message + exit 1.

**(b) Docs (the "no comments, docs carry it" standard):**
- ARCHITECTURE.md — each file's single purpose + data flow (loop ⇄ provider ⇄ tools) + extension points.
- DEBUGGING.md — how to read a session JSONL, event types, failure signatures (protocol_failed,
  doom_loop, endpoint_error, turn_cap), how to run one eval task.
- AGENT.md — the agent's own CLAUDE.md-equivalent (loaded at start): the behavior laws.

**Gate (acceptance test):** a FRESH Claude session with repo-only context explains the architecture,
then fixes a pre-committed planted bug → its fixture test goes green, asking ZERO out-of-repo questions,
citing which doc answered which question. Plant the bug BEFORE finalizing docs (no teaching to the test).

## Execution rules (KEEP DOING)
- **ultraplan drip**: ONE step at a time — prereq → do → verify → rollback (git). Wait for "go" between
  steps. Never dump the whole phase.
- **git commit per step.** Message via `git commit -F -` heredoc (zsh EATS triple-backticks in `-m`).
  End messages with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Before every push: sensitive sweep** (`git grep -iE "__LOCAL_HOME__|yahoo|@gmail|ghp_[a-z]|tailscale|
  164\.90|100\.103"` over the diff) + confirm committer = noreply. Push is standing-approved for this repo.
- **Warn before loading a model / eating RAM.** Live tests behind `KAKU_LIVE=1` so `npm test` stays
  offline+fast. Clean up /tmp/kaku-eval-sessions after eval runs.
- Update session-notes.md + .claude/learning-log.md at phase close. `.claude/` is gitignored (stays local).

## Gotchas (learned, do not rediscover)
- Node 25: `node --test <dir>` breaks → bare `node --test`.
- zsh eats ``` in commit `-m` → use `-F -` heredoc.
- macOS realpath does NOT case-fold + /var vs /private/var → always assert against `jail.root`, not raw temp path.
- Nested `node --test` inherits NODE_TEST_CONTEXT → won't fail on assertion (false-pass). Strip it
  (see eval/tasks/_helpers.js runNodeTest).
- Ollama /v1 endpoint can't set num_ctx + silently front-truncates → native /api/chat adapter + client-side
  token count (over-estimate).
- Doom-guard trips on identical repeated calls before compaction engages → vary args in compaction tests.
- Small models can't produce unique edit anchors unaided → edit tool enforces uniqueness + repair (DONE).

## Owner (the owner) preferences that shaped this
- "do then talk" = mode-aware terseness (act + terse outcome; plan mode = research+options+recommendation),
  NOT action-before-consult.
- Wants it awesome + free-to-copy (MIT) with zero personal peril: NO payment infra / keys / liability in
  the tool itself — it KNOWS about auth/payments/etc (doctrine playbooks in IMPROVE.md §5.1b) but CONTAINS none.
- Never run sudo; never touch secret values.
