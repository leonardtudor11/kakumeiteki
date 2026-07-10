# ARCHITECTURE

Kakumeiteki is a fully-local coding agent: a Claude-Code-style harness around any
Ollama-served model. The harness discipline (permission-gated tools, read-before-edit,
context budgeting, honest failure reporting) is the product; the model is a swappable part.

Plain JavaScript, Node 20+, ESM, zero runtime dependencies. No network access except the
loopback model endpoint.

## File map — one purpose per file

| File | Single purpose |
|---|---|
| `bin/kaku.js` | thin entry: `process.exitCode = await main()` |
| `src/cli.js` | argv parsing (`parseArgv`), `main()` wiring, one-shot `runOnce`, interactive `runRepl` |
| `src/ui.js` | `createDeltaRenderer` — streams model deltas, suppresses fenced tool-call blocks |
| `src/config.js` | `DEFAULTS` + `loadConfig` (CLI > project `.kaku.json` > global > defaults; unknown key = hard error) |
| `src/agent.js` | `createAgent` — the integration layer; everything below is assembled here |
| `src/provider.js` | Ollama-native `/api/chat` adapter: NDJSON streaming, per-request `num_ctx`, preflight, transient retry (2×, backoff), `EndpointError` |
| `src/loop.js` | `runTurn` — the agent loop: model ⇄ tools until done, repair, doom-guard, turn cap, compaction, cancel |
| `src/toolcall.js` | `parseToolCalls` — native + fenced ```` ```tool ```` + bare-JSON parsing, liberal key normalization, repair signal |
| `src/prompt.js` | `buildSystemPrompt` — tiered (micro compact / full numbered laws), mode-aware emphasis |
| `src/context.js` | client-side token estimate (`chars/3.5`, over-counts), `budgetFor`, `needsCompaction`, deterministic `compact` |
| `src/session.js` | append-only JSONL transcript; `rebuildMessages` for resume; `latestSessionFor` / `resolveSessionPath` |
| `src/redact.js` | R1–R8 secret regexes; `redact` / `redactDeep`, replacement `[REDACTED:R#]` |
| `src/permissions.js` | `createJail` (realpath path jail), `isSecretPath` deny-globs, `splitSegments` + `classifyCommand` + `actionForCommand` (bash policy) |
| `src/preload.js` | speed lever: task names an in-jail file → its content (redacted, capped) rides the first user message, skipping the read turn |
| `src/doctor.js` | `kaku doctor` — Node/Ollama/model checks with exact fix commands |
| `src/undo.js` | pre-mutation backups (blob + manifest per session) + the undo stack behind `kaku undo` |
| `src/banner.js` / `src/mask-data.js` / `src/statusbar.js` | terminal chrome: machine-derived splash mask + renderer, status line, welcome card (TTY-only) |
| `src/tui.js` | interactive raw-mode line editor: bordered input box, pinned status bar, mode cycle (TTY-only; pipes get plain readline) |
| `src/tools/` | `read write edit ls glob grep bash skill` + `index.js` registry; `walk.js` shared traversal |
| `skills/` | doctrine playbooks (auth, payments, resilience, scalability, rag, secrets-ops, observability, operations, security…) served read-only by the `skill` tool |
| `eval/` | 10 script-checked tasks + `run.js` harness + `scorecard.js` full-matrix runner |

## Data flow

```
bin/kaku.js
  └─ cli.main(): parseArgv → loadConfig → createAgent → runOnce | runRepl
       └─ agent.js createAgent():
            createJail(cwd)          realpath jail root — every file tool checks against it
            createProvider(config)   + await preflight()  (fail fast if Ollama is down)
            createTools({jail, config, confirm})
            buildSystemPrompt({tier, mode, tools, cwd})
            openSession | resume: loadSession → rebuildMessages → compact if over budget
            returns { run(task, {signal, onDelta}) → runTurn(...) }

runTurn (loop.js), per iteration:
  1. compact messages if over budget          (context.js)
  2. provider.chat(messages) → assistant       (provider.js, streams via onDelta)
  3. resolve tool calls                        (native, else toolcall.js parse)
     · unparseable → one repair nudge; second failure → status protocol_failed
     · no calls → status done
  4. doom-guard: 3 identical (name+args) calls → nudge; repeat → status doom_loop
  5. execute tools; outputs redacted           (redact.js) and appended as role:tool
  every step appends a typed event to the session JSONL (session.js)
```

Statuses `runTurn` can return: `done`, `protocol_failed`, `doom_loop`, `empty_answer`,
`cancelled`, `endpoint_error`, `turn_cap`. See DEBUGGING.md for what each signature means.
`done` means the protocol completed with a non-empty answer — it does not certify the
answer is correct; that is what verify steps and the eval suite are for.

## The contracts that hold it together

- **Tool shape**: `{ name, schema, run(args, {signal}) → string }`. Registry in
  `src/tools/index.js` maps name → tool; the loop knows nothing about individual tools.
  The `skill` tool is the one deliberate read outside the jail: a fixed, shipped
  `skills/` dir, basename-whitelisted, read-only.
- **Provider shape**: `{ name, preflight(), chat({messages, tools, signal, onDelta}) → {role, content, toolCalls} }`.
  The loop never touches HTTP.
- **Message array is the only model-facing state.** The session JSONL is the only
  persistent state; `rebuildMessages` reconstructs the array from it. A dangling tool
  call (crash mid-turn) gets a synthesized `[interrupted]` result to stay API-coherent.
- **Budget is enforced client-side.** Ollama silently front-truncates prompts over
  `num_ctx` (no error, only a server log line). `context.js` over-counts on purpose and
  compaction triggers at 80% of the input budget — both in the loop and on resume.
- **Everything persisted or shown to the model passes redaction** (`redact.js`):
  tool outputs in the loop, every JSONL line in `session.append`.

## Security model (short form; spec in PLAN.md)

Layered, honestly stated: the bash deny-list (D1–D14) is a tripwire, not a sandbox.
The real guarantees are (1) default-ask for anything not provably read-only,
(2) the realpath jail on all file tools (S1–S12 tested), (3) bash cwd pinned to the
jail root with timeout + output cap, (4) zero network in the agent core except the
loopback model endpoint. Secret files are deny-globbed (`isSecretPath`); secret
strings are regex-redacted (R1–R8).

## Capability tiers

`micro` (≤4B models, this machine): 1 tool per turn, compact prompt, fenced-JSON tool
protocol. `standard` / `max` exist as config values; their prompts get the full
numbered laws and native tool calls. `tier: "auto"` currently resolves to micro
(`tierFor` in agent.js) — hardware probing is future work (IMPROVE.md).

## Extension points

- **New tool**: create `src/tools/<name>.js` returning the tool shape, register in
  `src/tools/index.js`. The jail must wrap every path it touches.
- **New provider**: implement the provider shape in `src/provider.js` behind
  `config.provider` (the `openai-compat` branch is reserved for this).
- **New mode**: add an entry to `MODE_EMPHASIS` in `src/prompt.js` and to the `mode`
  enum in `src/config.js`. Audit and plan modes must keep forbidding edits.
- **New playbook**: drop a cited `skills/<name>.md` (defaults + tradeoffs + hard rules +
  `## Sources`) — the `skill` tool picks it up automatically; the lint test in
  `test/skill-tool.test.js` enforces the shape. Lessons capture is IMPROVE.md §5 Stage 2.

## Invariants a change must not break

1. `npm test` green (offline, no model, no network — mock providers and loopback-only
   HTTP fixtures).
2. Security suite: 100% of attack cases blocked AND 100% of control cases allowed
   (over-blocking is a bug too).
3. No new runtime dependency without an explicit owner decision.
4. Every model-visible or persisted string passes redaction.
5. Client-side budget enforcement stays — never trust the runner to complain.
