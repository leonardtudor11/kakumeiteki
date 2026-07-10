# KAKUMEITEKI — fully-local coding agent

*"Kakumeiteki" (革命的) = Japanese for "revolutionary". Name chosen by the owner. CLI binary can alias to `kaku` for typing ease — decide at Phase 1.*

## Context

Build a coding agent that runs 100% on the local machine: private, $0 marginal cost, model-agnostic. Two hard requirements from the owner:

1. **Strong regardless of hardware.** On a weak machine (like this one) it must still be a real product; on a beast machine it unlocks full power. Solved with capability tiers, not one-size-fits-all.
2. **Encodes the Claude Code harness + way of thinking.** Agent loop, permission-gated tools, read-before-edit, surgical diffs, verify-before-done, context budgeting, honest reporting. The harness discipline is the product — the model is a swappable part.

Output code standard: clean, self-explaining, near-zero comments, structured so any future agent can understand it cold, know what to improve, and how to debug (ARCHITECTURE.md + DEBUGGING.md + IMPROVE.md carry that knowledge, not inline noise).

the owner will taste-test a small model in the morning — plan includes a taste-test path that works before the harness is finished.

## Ground truth (checked 2026-07-10)

| Fact | Value | Consequence |
|---|---|---|
| Machine | Apple M1, **8 GB RAM** | micro-tier hardware; 3–4B models comfortable, 7B q4 borderline (expect swapping) |
| Disk free | 22 GB | room for 3–4 small models, not for 30B+ |
| Node | v25.9.0 | ✓ built-in fetch, no polyfills |
| Ollama | installed, `qwen3:1.7b` already pulled | runner exists; taste test possible immediately |
| ripgrep | available via Claude Code shim | use `rg` if present, fallback `grep -rn` |

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Language | Plain JS, Node 20+, ESM | user standard; zero build step; no TS |
| Dependencies | ~zero (built-in fetch, hand-rolled SSE parse) | auditable, local-first, nothing to supply-chain-attack |
| Model API | Ollama native `/api/chat` adapter + generic OpenAI-compatible adapter, one interface | **gotcha:** Ollama's OpenAI-compat endpoint doesn't let you set `num_ctx`; default 4k context kills agents. Native adapter sets it explicitly. Generic adapter = LM Studio / llama.cpp / MLX / any future runner |
| Tool calling | native tool-calls when model supports; fenced-JSON text protocol + 1-shot repair loop as fallback | small models flub JSON; repair rescues most failures; `format:json` constraint as extra belt |
| Capability tiers | micro / standard / max profiles, auto-detected + configurable | "efficient regardless of capabilities" |
| Repo | new local-only git repo at `~/kakumeiteki` | git-leak-boundary rule: own repo (never git-init home), no remote unless decided later; cloud-handoff upload OK — generic tool code, no secrets/client work |
| Rollback unit | git commit per step | greenfield; every step reversible via `git reset` |

## Architecture

```
kakumeiteki/
  bin/kaku.js          CLI entry: REPL + one-shot `-p "task"` mode
  src/
    loop.js            agent loop: model ⇄ tools until done / turn cap
    provider.js        chat client (ollama-native + openai-compat adapters, streaming)
    profiles.js        model capability profiles (ctx, tool mode, tier)
    prompt.js          system prompt builder — tiered (micro ~400 tok / full)
    toolcall.js        parse native + fenced-JSON fallback + repair
    tools/
      index.js         registry + JSON schemas (tier filters which are exposed)
      read.js write.js edit.js glob.js grep.js bash.js ls.js
    permissions.js     policy engine: safe/auto/readonly modes, path jail, command classes
    context.js         token budget, per-tool output caps, compaction
    session.js         JSONL transcript per session, resume
    ui.js              plain terminal rendering (no TUI dep)
  skills/              markdown playbooks (registry line in prompt, read on demand)
  eval/
    tasks/             10 verifiable fixture tasks
    run.js             bench runner → scorecard.md per model
  ARCHITECTURE.md      map: each file's single purpose, data flow, extension points
  DEBUGGING.md         how to read a transcript JSONL, common failure signatures
  IMPROVE.md           known upgrade paths (backlog for future agents)
  AGENT.md             the agent's own CLAUDE.md-equivalent (loaded at start)
```

## Capability tiers

| Tier | Model class | Ctx | Tools exposed | Behavior |
|---|---|---|---|---|
| micro | ≤4B (this Mac) | 8k | 4: read, edit, grep, bash | 1 tool/turn, compact prompt, aggressive output caps, fenced-JSON protocol |
| standard | 7–14B | 16–32k | 7 (all) | native tool calls, parallel off |
| max | 32B+ / MoE, 64k+ ctx | 64k+ | all + `spawn` sub-agent | plan→act→verify pass, skills registry, parallel search |

Auto-detect at session start: query model list, probe one tool call, cache profile. Manual override in config.

## Behavior spec — the "way of thinking" the system prompt encodes

- Read before edit; exact-match string edits; smallest possible diff; match existing style.
- State assumptions; if ambiguous, ask before building — never pick silently.
- Every task → verifiable success criterion; run the verify command after changing; report actual output, never "should work".
- Lead with outcome; terse; no filler.
- No comment noise — code explains itself; constraints only.
- Security-first: flag issues found in passing even when unasked.
- Modes: `--mode build | refactor | audit` — same loop, different prompt emphasis (audit = security-review checklist).

## Security (both directions)

**Agent is safe:**
- Path jail: all file tools resolve + realpath-check against project root; refuse outside.
- Bash policy: read-only commands auto-allowed; mutating commands ask (mode `safe`); deny-list always blocks (`rm -rf` outside root, `sudo`, `curl|sh`, force-push, `chmod 777`, writes to `/dev`, `/etc`).
- Secret hygiene: never read `.env*`, `*.pem`, `id_rsa*` without explicit ask; redact key-shaped strings (sk-, ghp_, AKIA, PEM blocks) from tool output before it reaches the model.
- Zero network except the model endpoint (loopback). No telemetry.
- Bash timeouts + output byte caps.

**Agent is good at security:** audit mode prompt + eval task #7 (find planted vuln) keep it measurable.

## Phases

| Phase | Goal | Gate | Est |
|---|---|---|---|
| 0 | Runner ready + morning taste test | small model answers 3 probe prompts; quality noted | 20m |
| 1 | Repo skeleton, config, provider client, loop vs mock model | mock conversation round-trips green | 1h |
| 2 | 7 tools + permission engine + path jail | tool unit checks green; jail refuses escape | 2h |
| 3 | Live brain: tiered prompt, tool protocol + repair | qwen3:1.7b (or 3B) completes file-edit task e2e | 2h |
| 4 | Context: budget, truncation, compaction | 30-turn session stays under ctx, no crash | 1h |
| 5 | Security hardening: adversarial suite | every escape/deny/secret test blocked | 1.5h |
| 6 | Eval suite (10 tasks) + scorecard runner | scorecard.md produced for ≥1 model | 2h |
| 7 | Agent-friendly docs + modes + polish | fresh Claude session navigates repo + fixes planted bug using docs only | 1h |

Execution follows ultraplan drip: one step at a time, each step = prereq → do → verify → rollback (git). Full step detail delivered live, not dumped here.

**Immediate first action on approval:** `mkdir ~/kakumeiteki && git init` (inside project dir only — never home), copy this plan in as `PLAN.md`, commit, relaunch ultraplan cloud handoff from that repo for remote refinement.

### Phase 0 — morning taste test (works today, no harness needed)

```
ollama pull qwen2.5-coder:3b        # ~1.9 GB, best coding model that fits 8 GB comfortably
```
Then 3 probe prompts (supplied at execution): (a) write function per spec, (b) find bug in 20-line snippet, (c) exact-string edit instruction — the skill the harness depends on most. Compare against already-pulled `qwen3:1.7b`. Rollback: `ollama rm`.

Model guidance by RAM (reference, not commitment):
| RAM | Daily driver | Stretch |
|---|---|---|
| 8 GB (now) | qwen2.5-coder:3b / qwen3:4b | 7B q4 — works, swaps, close other apps |
| 16 GB | qwen2.5-coder:7b | 14B q4 |
| 32 GB+ | qwen3-coder 30B-A3B MoE class | 32B dense |

## Eval tasks (Phase 6)

1 hello-tool (list files) · 2 read-and-answer · 3 fix failing test · 4 add function per spec · 5 rename across 3 files · 6 find definition in noisy repo · 7 find planted vuln · 8 edit-precision (diff size scored) · 9 edit inside 500-line file · 10 instruction-following under constraint.
Score per task: pass/fail (auto-checked) + turns + tokens + seconds → `scorecard.md`. This is how any future model gets judged objectively before adoption.

## Verification (end-to-end, after Phase 7)

1. `node bin/kaku.js -p "add slugify() to fixture, make tests pass"` on fixture repo → tests green, diff minimal.
2. Eval suite full run → scorecard produced.
3. Security suite → 100% blocked.
4. Fresh-agent test: new Claude session pointed at repo, asked "explain the architecture, then fix this planted bug" — succeeds using ARCHITECTURE.md/DEBUGGING.md only. This is the acceptance test for the "no comments needed" standard.

## Risks

| Risk | Mitigation |
|---|---|
| Small models unreliable at tool JSON (the #1 local failure) | fenced protocol + repair loop + `format:json`; eval task 1 catches regressions |
| 8 GB RAM pressure | micro tier default; warn if model size + ctx > safe headroom |
| Ollama default 4k ctx silently truncating | native adapter always sets `num_ctx` explicitly |
| Context overflow mid-task | 80% budget → compact (summary + open-task state), hard caps on tool output |
| Scope creep (product dreams) | tiers designed in, gold-plating out — Karpathy #2; IMPROVE.md holds the wishlist |
