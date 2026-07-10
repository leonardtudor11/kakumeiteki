# KAKUMEITEKI — fully-local coding agent

*"Kakumeiteki" (革命的) = Japanese for "revolutionary". Name chosen by the owner. CLI binary can alias to `kaku` for typing ease — decide at Phase 1.*

## Context

Build a coding agent that runs 100% on the local machine: private, $0 marginal cost, model-agnostic. Two hard requirements from the owner:

1. **Strong regardless of hardware.** On a weak machine (like this one) it must still be a real product; on a beast machine it unlocks full power. Solved with capability tiers, not one-size-fits-all.
2. **Encodes the Claude Code harness + way of thinking.** Agent loop, permission-gated tools, read-before-edit, surgical diffs, verify-before-done, context budgeting, honest reporting. The harness discipline is the product — the model is a swappable part.

Output code standard: clean, self-explaining, near-zero comments, structured so any future agent can understand it cold, know what to improve, and how to debug (ARCHITECTURE.md + DEBUGGING.md + IMPROVE.md carry that knowledge, not inline noise).

the owner will taste-test a small model in the morning — plan includes a taste-test path that works before the harness is finished.

## Ground truth (re-verified 2026-07-10)

| Fact | Value | Consequence |
|---|---|---|
| Machine | Apple M1, **8 GB RAM** | micro-tier hardware; Metal caps a model's working set at ~⅔ of unified RAM (≈5.3 GB here) — that, not total RAM, is the real budget |
| Disk free | 22 GB | room for 3–4 small models, not for 30B+ |
| Node | v25.9.0 | ✓ built-in fetch + AbortController, no polyfills |
| Ollama | installed, `qwen3:1.7b` already pulled | runner exists; taste test possible immediately |
| ripgrep | available via Claude Code shim | use `rg` if present, fallback `grep -rn` |
| qwen2.5-coder sizes | 3b = **1.9 GB**, 7b = **4.7 GB** (ollama.com/library, checked today) | 3B q4 + 8k-ctx KV cache fits the 5.3 GB working set comfortably; 7B q4 is borderline — runs, swaps, close other apps |

### Ollama gotchas (verified 2026-07-10 — all three still true)

1. **`num_ctx` is not settable per-request on the OpenAI-compat `/v1` endpoint.** Only the native `/api/chat` accepts `options.num_ctx`. Workarounds on /v1 (env var `OLLAMA_CONTEXT_LENGTH`, Modelfile clone) are server-global — the native adapter is the correct fix and stays a core decision.
2. **Default context is small and the overflow is silent.** Serving from CLI defaults to 4096 (newer builds scale the default with VRAM, but on 8 GB it stays small). When the prompt exceeds `num_ctx`, Ollama **front-truncates silently** — only a server-side log line. Consequence: `context.js` must count tokens itself and enforce the budget client-side; never rely on the runner to complain.
3. **Changing `num_ctx` between requests forces a model reload** (slow on this hardware). Pin one `num_ctx` per session, chosen from the tier profile at session start.
4. **Don't trust the library "tools" tag.** Stock `qwen2.5-coder` templates have historically unreliable native tool-calling at small sizes (the community ships `*-tools` re-templates for exactly this reason); `qwen3` is natively tool-capable. The auto-detect probe (one real tool call at session start) decides per model — micro tier defaults to the fenced-JSON protocol regardless, and a passing probe can upgrade it to native.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Language | Plain JS, Node 20+, ESM | user standard; zero build step; no TS |
| Dependencies | ~zero (built-in fetch, hand-rolled SSE/NDJSON parse) | auditable, local-first, nothing to supply-chain-attack |
| Model API | Ollama native `/api/chat` adapter + generic OpenAI-compatible adapter, one interface | native adapter sets `num_ctx` per request (see gotchas above); generic adapter = LM Studio / llama.cpp / MLX / any future runner |
| Tool calling | native tool-calls when model supports; fenced-JSON text protocol + 1-shot repair loop as fallback | small models flub JSON; repair rescues most failures; `format:json` constraint as extra belt |
| Capability tiers | micro / standard / max profiles, auto-detected + configurable | "efficient regardless of capabilities" |
| Config | JSON, zero-dep (spec below) | matches zero-deps decision; documented keys, hard error on typos |
| Repo | new local-only git repo at `~/kakumeiteki` | git-leak-boundary rule: own repo (never git-init home), no remote unless decided later; cloud-handoff upload OK — generic tool code, no secrets/client work |
| Rollback unit | git commit per step | greenfield; every step reversible via `git reset` |

## Architecture

```
kakumeiteki/
  bin/kaku.js          CLI entry: REPL + one-shot `-p "task"`; flags: --model --mode --resume --continue
  src/
    loop.js            agent loop: model ⇄ tools until done / turn cap; AbortController cancel; doom-loop guard
    provider.js        chat client (ollama-native + openai-compat adapters); streaming, preflight, retry policy
    config.js          load + merge + validate config (precedence spec below)
    profiles.js        model capability profiles (ctx, tool mode, tier)
    prompt.js          system prompt builder — tiered (micro ~400 tok / full)
    toolcall.js        parse native + fenced-JSON fallback + repair
    tools/
      index.js         registry + JSON schemas (tier filters which are exposed)
      read.js write.js edit.js glob.js grep.js bash.js ls.js
    permissions.js     policy engine: safe/auto/readonly modes, path jail, command classifier + deny list
    context.js         token budget, per-tool output caps, compaction
    session.js         append-only JSONL transcript per session; resume/continue semantics
    ui.js              plain terminal rendering (no TUI dep): streamed deltas, fence buffering, Esc/Ctrl-C
  skills/              markdown playbooks (registry line in prompt, read on demand)
  eval/
    tasks/             10 verifiable fixture tasks
    run.js             bench runner → scorecard.md per model
  ARCHITECTURE.md      map: each file's single purpose, data flow, extension points
  DEBUGGING.md         how to read a transcript JSONL, common failure signatures
  IMPROVE.md           known upgrade paths (backlog for future agents)
  AGENT.md             the agent's own CLAUDE.md-equivalent (loaded at start)
```

### Config file (format is a deliverable of Phase 1)

- Global: `~/.kakumeiteki/config.json` · Project: `.kaku.json` at repo root.
- Precedence: **CLI flags > project `.kaku.json` > global config > built-in defaults + auto-detect.**
- Unknown key = startup error naming the key (typos must not be silently ignored).

```json
{
  "provider": "ollama",
  "baseUrl": "http://127.0.0.1:11434",
  "model": "qwen2.5-coder:3b",
  "tier": "auto",
  "numCtx": null,
  "mode": "build",
  "permissions": "safe",
  "maxTurns": 25,
  "bash": { "timeoutMs": 120000, "maxOutputBytes": 65536 },
  "sessionDir": "~/.kakumeiteki/sessions"
}
```

`provider`: `ollama` | `openai-compat`. `tier`: `auto` | `micro` | `standard` | `max`. `numCtx: null` = tier default. `permissions`: `safe` | `auto` | `readonly`.

### Sessions & resume

- One append-only JSONL per session: `sessions/<timestamp>-<slug>.jsonl`. Line 1 = header `{v, cwd, model, tier, startedAt}`; then one line per event (message, tool call, tool result, cancel, compaction).
- Redaction (see Security) is applied **before persist** — transcripts never contain secrets, because resume feeds them back to the model.
- `kaku --continue` = latest session for this cwd; `kaku --resume <id>` = explicit. Resume rebuilds the message array from JSONL; a dangling tool call with no result (crash/cancel mid-turn) gets a synthesized `[interrupted]` result so the chat history stays API-coherent; if the rebuilt prompt exceeds budget, compact on load; if current model/tier differs from the header, warn and use current.

### Interrupt / cancel

- Esc or Ctrl-C once during a turn: abort the in-flight model request (AbortController on fetch) and SIGTERM the bash child's process group (SIGKILL after 2 s grace); write a `cancelled` event; return to the REPL prompt. Partial streamed text stays in the JSONL flagged `partial: true` for debugging but is **excluded** from the message array sent onward.
- Ctrl-C at idle prompt (or twice within 1 s): save session, exit 0. Every session is resumable after any interrupt.

### Streaming render

- Both adapters always request streaming (Ollama native = NDJSON, openai-compat = SSE); parsers hand-rolled per zero-deps decision.
- ui.js prints text deltas as they arrive; tool calls execute only after the assistant message completes.
- Fenced-JSON protocol (micro tier): stream text normally, but once the opening tool fence is detected, stop echoing and buffer to fence close — never render half a tool call.
- Recent Ollama streams native tool-call deltas; the adapter must also handle runners that return tool calls only non-streamed (detect and buffer the whole response for tool turns).

### Endpoint failure recovery (model dies mid-turn)

- Preflight at session start: hit `baseUrl` (`/api/version` on Ollama). Down → actionable message ("Ollama isn't running — start the app or `ollama serve`"), exit 1.
- ECONNREFUSED / ECONNRESET / timeout / stream stalled >60 s mid-turn: discard the partial message, retry the same request up to 2× (1 s, 4 s backoff). Still failing → save session, print the `--resume` hint, exit 1. Transcript is never left with a dangling tool call (synthesized `[interrupted]` result).
- HTTP 404 model-not-found → suggest `ollama pull <model>`. HTTP 5xx → surface the response body in the error.

### Loop guards

- Hard turn cap: `maxTurns` (default 25) → stop with honest "hit turn cap" report, session saved.
- Doom-loop guard: 3 identical consecutive tool calls (same tool + same args) → inject one corrective nudge; if it repeats again, abort the turn with an honest failure message. Small local models loop badly; this is the #2 local failure after JSON flubbing.

## Capability tiers

| Tier | Model class | Ctx | Tools exposed | Behavior |
|---|---|---|---|---|
| micro | ≤4B (this Mac) | 8k | 4: read, edit, grep, bash | 1 tool/turn, compact prompt, aggressive output caps, fenced-JSON protocol (probe may upgrade to native) |
| standard | 7–14B | 16–32k | 7 (all) | native tool calls, parallel off |
| max | 32B+ / MoE, 64k+ ctx | 64k+ | all + `spawn` sub-agent | plan→act→verify pass, skills registry, parallel search |

Auto-detect at session start: query model list, probe one real tool call, cache profile. Manual override in config (`tier`).

## Behavior spec — the "way of thinking" the system prompt encodes

- Read before edit; exact-match string edits; smallest possible diff; match existing style.
- State assumptions; if ambiguous, ask before building — never pick silently.
- Every task → verifiable success criterion; run the verify command after changing; report actual output, never "should work".
- Lead with outcome; terse; no filler.
- No comment noise — code explains itself; constraints only.
- Security-first: flag issues found in passing even when unasked.
- Modes: `--mode build | refactor | audit` — same loop, different prompt emphasis (audit = security-review checklist).

## Security (both directions)

**Honesty first:** the bash deny-list is a **tripwire, not a sandbox** — regexes can be dodged with quoting, expansion, or encoding. The real guarantees are layered: (1) default-**ask** for anything not provably read-only, (2) realpath jail on all file tools, (3) bash cwd pinned to project root with timeout + output cap, (4) zero network from the agent core except the loopback model endpoint. The deny-list just makes the obvious disasters impossible even in `auto` mode.

### Command classification (permissions.js)

Commands are split into segments on `;` `&&` `||` `|` **respecting quotes** (light hand-rolled tokenizer, ~50 lines) — quoted strings are data, so `grep "rm -rf" src/` stays read-only. Any segment containing `$( … )`, backticks, or `eval` is demoted to ask-class at minimum. The whole command takes its **most restrictive** segment's class. Order of checks: deny → network → read-only allow → default mutate.

| Class | Examples | safe mode | auto mode | readonly mode |
|---|---|---|---|---|
| deny | table below | block | block | block |
| network | `curl` `wget` `ssh` `scp` `rsync` `nc`; `git push/pull/fetch/clone/remote`; `npm/npx/pnpm/yarn install/add/dlx/exec`; `pip install`; `brew install` | ask | **ask** (never auto) | block |
| read-only | `ls` `pwd` `cat` `head` `tail` `wc` `stat` `file` `du` `df` `which` `date`; `grep`/`rg`; `find` without `-delete`/`-exec`/`-ok`; `git status/diff/log/show/branch/blame`; any `--version`. A `>`/`>>` redirect ejects the segment from this class | auto | auto | auto |
| mutate | everything else (`mkdir` `mv` `cp` `touch` `rm` non-recursive in-jail, `node x.js`, `npm test`, `git add/commit`) | ask | auto | block |

### Deny-list (all modes, matched per parsed segment)

| ID | Pattern (JS regex) | Blocks |
|---|---|---|
| D1 | `/^\s*(sudo|doas)\b/` | privilege escalation |
| D2 | `rm` with any `-r`/`-f` flag combo whose resolved target is outside the jail, or is `/`, `~`, `$HOME` — checked by **arg resolution**, regex trigger `/\brm\s+(-\S+\s+)*(\/|~|\$HOME)/` | recursive delete outside project |
| D3 | `/\b(curl|wget)\b[^;&|]*\|\s*(ba|z|da)?sh\b/` | pipe-to-shell |
| D4 | `/\bbase64\b[^;&|]*\|\s*(ba|z)?sh\b/` | decode-and-run |
| D5 | `/\bgit\s+push\b.*(\s--force(-with-lease)?\b|\s-f\b)/` | force push |
| D6 | `/\bchmod\b\s.*\b(777|a\+rwx|\+s)\b/` | world-writable / setuid |
| D7 | `/(>|>>|\btee\b)\s*\/(etc|usr|bin|sbin|System|Library|private\/etc|dev\/(disk|rdisk|sd))/` | writes to system paths / raw devices |
| D8 | `/\bdd\b[^;&|]*\bof=\/dev\//` · `/\bmkfs\b/` · `/\bdiskutil\s+(erase|partition)/` | disk destruction |
| D9 | `/:\(\)\s*\{\s*:\|\:&\s*\}\s*;\s*:/` | fork bomb |
| D10 | `/\b(shutdown|reboot|halt)\b/` | host power |
| D11 | `/\b(nc|ncat|netcat)\b[^;&|]*\s-e\b|\/dev\/tcp\//` | reverse shell |
| D12 | `/\blaunchctl\s+(bootstrap|load|submit)\b/` · `/\bcrontab\b\s+(?!-l\b)/` | persistence outside repo |
| D13 | `/\bkill(all)?\b\s+(-9\s+)?(-1|1)\b/` | killing init / all processes |
| D14 | `/\bgit\s+config\s+(--global|--system)\b/` | global git tampering |

Control cases (must **pass**, guarding against over-blocking): `grep "rm -rf" src/` · `git commit -m "fix sudo docs"` · `rm build/tmp.txt` (in-jail, non-recursive) · `cat notes/curl-examples.md`.

### Path jail (all file tools: read/write/edit/glob/grep/ls)

Jail root = `realpath(projectRoot)` captured at session start. Every path: `resolve(root, input)` → `realpath` of the deepest **existing** ancestor (target may not exist yet for writes) → result must equal root or start with `root + sep`. Test suite (Phase 2, re-run in Phase 5):

| ID | Attempt | Expected |
|---|---|---|
| S1 | read `/etc/passwd` | refuse |
| S2 | read `../../../../etc/passwd` | refuse |
| S3 | read `src/../../../etc/hosts` | refuse |
| S4 | dir symlink escape: `evil → /etc`, read `evil/hosts` | refuse (realpath catches it) |
| S5 | file symlink escape: `key → ~/.ssh/id_rsa` | refuse |
| S6 | absolute path **inside** root | allow (control) |
| S7 | read `~/anything` | refuse |
| S8 | path containing `\0` | clean error, no crash |
| S9 | `/USERS/...` case trick (APFS case-insensitive) | canonicalized by realpath; in-jail → allow normalized |
| S10 | write `../evil.js` | refuse |
| S11 | edit through symlink pointing outside | refuse |
| S12 | glob/grep rooted at `..` or absolute outside | clamp to jail / refuse |

Bash cannot be realpath-jailed — stated openly. Mitigations: cwd pinned to jail root every call, command classes above, `timeoutMs` (default 120 s), `maxOutputBytes` (default 64 KB, truncation marker appended).

### Secret hygiene

**File deny-globs** (read/edit/grep refuse; explicit per-file user approval overrides): `.env` `.env.*` (except `.env.example|.env.sample|.env.template`) · `*.pem` `*.key` `*.p12` `*.pfx` `*.jks` `*.keystore` · `id_rsa*` `id_ecdsa*` `id_ed25519*` · `.netrc` `.npmrc` `.pypirc` · `**/.ssh/**` `**/.aws/**` `**/.gnupg/**` · `*credentials*.json` `secrets.*`. Control cases that must stay readable: `env.js`, `environment.md`, `.env.example`.

**Redaction regexes** — applied to every tool output **and** every transcript line before persist; replacement `[REDACTED:R#]`. Over-redaction is acceptable; leaking is not.

| ID | Pattern | Catches |
|---|---|---|
| R1 | `/sk-[A-Za-z0-9_-]{20,}/g` | OpenAI/Anthropic-style keys (`sk-proj-`, `sk-ant-` included) |
| R2 | `/(gh[pousr]|github_pat)_[A-Za-z0-9_]{20,}/g` | GitHub tokens |
| R3 | `/AKIA[0-9A-Z]{16}/g` + `/aws_secret_access_key\s*[:=]\s*\S{20,}/gi` | AWS |
| R4 | `/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g` | PEM blocks |
| R5 | `/xox[baprs]-[A-Za-z0-9-]{10,}/g` | Slack |
| R6 | `/AIza[0-9A-Za-z_-]{35}/g` | Google API |
| R7 | `/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g` | JWT |
| R8 | `/\b(api[_-]?key|secret|token|password|passwd)["']?\s*[:=]\s*["']?[^\s"']{16,}/gi` | generic assignments |

Control case: ordinary code like `const token = parseToken(x)` must survive untouched (R8 requires a ≥16-char literal value).

**Network:** the agent core makes zero network calls except `baseUrl` (loopback) from provider.js. No telemetry. Bash-originated network falls under the `network` command class (always ask).

**Agent is good at security:** audit mode prompt + eval task #7 (find planted vuln) keep it measurable.

## Phases

| Phase | Goal | Gate (objective, one line — details below) | Est |
|---|---|---|---|
| 0 | Runner ready + morning taste test | 3 probes scored pass/fail against criteria written **before** running; verdict in TASTE.md | 20m |
| 1 | Repo skeleton, config, provider client, loop vs mock model, cancel skeleton | `node --test` green: config precedence, mock 2-round-trip loop, abort test | 1.5h |
| 2 | 7 tools + permission engine + path jail | tool unit tests green; S1–S12 = 0 escapes; classifier table incl. control cases = 0 false blocks | 2h |
| 3 | Live brain: tiered prompt, tool protocol + repair, endpoint-death handling | scripted e2e edit passes byte-exact ≤10 turns; repair fires exactly once on injected garbage; ollama killed mid-turn → clean exit + resumable session | 2h |
| 4 | Context budget + compaction + session resume | 30-turn scripted session: every request ≤ budget (asserted from request log), ≥1 compaction, state-carry probe answered, `--resume` continues | 1.5h |
| 5 | Security hardening: adversarial suite | D1–D14 + S1–S12 + R1–R8 + secret-globs: 100% attacks blocked **and** 100% control cases allowed, via `node --test` | 1.5h |
| 6 | Eval suite (10 tasks) + scorecard runner | runner completes all 10 tasks twice without crashing; scorecard.md has pass/fail + turns + tokens + seconds per task; every pass-check is a script | 2h |
| 7 | Agent-friendly docs + modes + polish | fresh Claude session, repo-only context: explains architecture + fixes pre-committed planted bug → fixture test green, zero out-of-repo questions | 1h |

Gate details:

- **P0:** probes = (a) write function per spec, (b) find bug in 20-line snippet, (c) produce an exact old/new string pair that a scripted replace applies cleanly — the skill the harness depends on most. Expected answers written down first; each probe pass/fail, no "quality noted" vibes. Compare `qwen2.5-coder:3b` vs `qwen3:1.7b`; winner + notes in TASTE.md.
- **P1:** tests assert (a) precedence CLI > project > global > default and hard error on unknown key; (b) mock provider drives loop through ≥2 tool round-trips to a final message, JSONL event sequence matches expected; (c) AbortController mid-mock-turn → `cancelled` event written, process returns to prompt.
- **P3:** fixture repo + fixed task string; gate = target file byte-equal to expected, ≤10 turns, no human input. Repair test: inject malformed fenced JSON once → exactly one repair attempt → success or clean tool-error. Death test: `kill` the ollama process mid-stream → retry path runs, then actionable error, exit 1, `--resume` works.
- **P4:** budget assertion reads provider request log (tokens counted client-side per gotcha #2). State-carry probe: after compaction, ask a question whose answer only existed pre-compaction; correct answer = compaction preserved open-task state.
- **P7:** the planted bug is committed to a fixture **before** the docs are finalized (no teaching to the test); success requires the fresh session to cite which doc answered which question.

Execution follows ultraplan drip: one step at a time, each step = prereq → do → verify → rollback (git). Full step detail delivered live, not dumped here.

**Immediate first action on approval:** `mkdir ~/kakumeiteki && git init` (inside project dir only — never home), copy this plan in as `PLAN.md`, commit, relaunch ultraplan cloud handoff from that repo for remote refinement.

### Phase 0 — morning taste test (works today, no harness needed)

```
ollama pull qwen2.5-coder:3b        # 1.9 GB (verified) — best coding model that fits 8 GB comfortably
```
Then the 3 probe prompts above (supplied at execution). Rollback: `ollama rm`.

Model guidance by RAM (reference, not commitment):
| RAM | Daily driver | Stretch |
|---|---|---|
| 8 GB (now) | qwen2.5-coder:3b / qwen3:4b | 7B q4 (4.7 GB) — works, swaps, close other apps |
| 16 GB | qwen2.5-coder:7b | 14B q4 |
| 32 GB+ | qwen3-coder 30B-A3B MoE class | 32B dense |

## Eval tasks (Phase 6)

1 hello-tool (list files) · 2 read-and-answer · 3 fix failing test · 4 add function per spec · 5 rename across 3 files · 6 find definition in noisy repo · 7 find planted vuln · 8 edit-precision (diff size scored) · 9 edit inside 500-line file · 10 instruction-following under constraint.
Score per task: pass/fail (auto-checked script per task — no judgment calls) + turns + tokens + seconds → `scorecard.md`. This is how any future model gets judged objectively before adoption.

## Verification (end-to-end, after Phase 7)

1. `node bin/kaku.js -p "add slugify() to fixture, make tests pass"` on fixture repo → tests green, diff minimal.
2. Eval suite full run → scorecard produced.
3. Security suite → 100% attacks blocked, 100% control cases allowed.
4. Interrupt drill: Ctrl-C mid-generation → prompt back <1 s; kill ollama mid-turn → clean error; `--continue` resumes both sessions.
5. Fresh-agent test: new Claude session pointed at repo, asked "explain the architecture, then fix this planted bug" — succeeds using ARCHITECTURE.md/DEBUGGING.md only. This is the acceptance test for the "no comments needed" standard.

## Risks

| Risk | Mitigation |
|---|---|
| Small models unreliable at tool JSON (the #1 local failure) | fenced protocol + repair loop + `format:json`; eval task 1 catches regressions |
| Doom loops (the #2 local failure) | identical-call guard + turn cap; turn counts scored in eval |
| 8 GB RAM pressure | micro tier default; warn if model size + ctx KV > ~5.3 GB Metal working set |
| Ollama silent front-truncation at `num_ctx` | native adapter pins `num_ctx`; context.js counts tokens client-side and never trusts the runner |
| Model endpoint dies mid-turn | preflight + 2× retry + synthesized `[interrupted]` results + always-resumable JSONL |
| Deny-list regex bypass | stated as tripwire-not-sandbox; default-ask + path jail + cwd pin are the real guarantees |
| Context overflow mid-task | 80% budget → compact (summary + open-task state), hard caps on tool output |
| Scope creep (product dreams) | tiers designed in, gold-plating out — Karpathy #2; IMPROVE.md holds the wishlist |
