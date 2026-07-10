# DEBUGGING

How to diagnose a misbehaving run. The session transcript is the primary evidence —
start there, not in the code.

## Reading a session JSONL

Sessions live in `sessionDir` (default `~/.kakumeiteki/sessions`, tilde expanded by the
CLI; eval runs use a temp dir). One file per session: `<timestamp>-session.jsonl`.

Line 1 is the header: `{v, cwd, model, tier, startedAt}`. `cwd` is the realpath'd jail
root — `--continue` matches sessions by it. Every following line is one event:
`{type, at, ...data}`, redacted before persist.

```
cat ~/.kakumeiteki/sessions/<id>.jsonl | head -5
grep -o '"type":"[a-z_]*"' <id>.jsonl | sort | uniq -c    # event histogram
```

## Event types

| type | written when | payload |
|---|---|---|
| `user_message` | task submitted | `content` |
| `assistant_message` | model reply complete | `content`, `toolCalls` |
| `tool_call` | before a tool runs | `name`, `args` |
| `tool_result` | after it returns | `name`, `ok`, `output` (redacted) |
| `repair` | unparseable/unknown tool call, first offense | `message` |
| `protocol_failed` | second consecutive parse failure — turn abandoned | `message` |
| `doom_nudge` | 3 identical calls (same name + args) — corrective nudge injected | `signature` |
| `doom_loop` | the nudge didn't help — turn aborted | `signature` |
| `compaction` | context budget exceeded mid-run | `before`, `after`, `dropped` |
| `cancelled` | Ctrl-C / AbortController mid-turn | — |
| `endpoint_error` | model endpoint died after retries | `message` |
| `turn_cap` | `maxTurns` hit without a final answer | `maxTurns` |
| `resumed` | session reopened via `--continue` / `--resume` | `from`, `restored`, `warnings` |

`rebuildMessages` (src/session.js) turns events back into a model-facing message array on
resume; meta events are skipped, and a `tool_call` with no `tool_result` (crash mid-turn)
gets a synthesized `[interrupted]` tool message.

## Failure signatures → what they mean

- **`protocol_failed`** — the model can't hold the tool JSON protocol even after one
  repair nudge. Typical for too-small models. Check the `repair` event's `message` for
  what the parser objected to (bad JSON / missing name / unknown tool).
- **`doom_loop`** — the model repeated one exact call ≥3 times and ignored the nudge.
  The `signature` field shows the frozen call. If the calls in the transcript are NOT
  identical (different args) and the guard still fired, the guard itself is the suspect.
- **`endpoint_error`** — Ollama died or unreachable mid-run after 3 attempts. The
  session is resumable: `kaku --continue`.
- **`turn_cap`** — ran out of turns. Look at the tail: was it making progress (raise
  `maxTurns`) or wandering (task too hard for the model tier)?
- **Weird model behavior with a LONG history — truncation suspect.** Ollama silently
  front-truncates any request over `num_ctx`; there is no client-visible error. The
  harness must therefore keep every request under budget itself (`src/context.js`:
  `budgetFor(numCtx)` reserves 1024 reply tokens, compaction triggers at 80% of the
  rest — checked every loop iteration AND when resuming an old session). If the model
  suddenly "forgets" the system prompt or the task, verify the message array actually
  fit: count it with `countMessages` against `budgetFor(numCtx).compactAt`, and look
  for a missing `compaction` event where you'd expect one.
- **A secret shows up in a transcript** — redaction bug, treat as P0. Every
  `session.append` passes `redactDeep`; every tool output passes `redact` in the loop.
  Reproduce with the R1–R8 control cases in `test/redact.test.js`.

## Running things

```
npm test                                # full offline suite (Node 25: bare `node --test`, no dir arg)
node --test test/loop.test.js          # one file
KAKU_LIVE=1 node --test test/e2e-live.test.js   # live smoke (needs Ollama + model pulled)
node eval/scorecard.js                 # full eval matrix (slow, loads models)
node --test --experimental-test-coverage       # where the holes are
```

One eval task programmatically:

```js
import { runTask } from './eval/run.js';
import { TASKS } from './eval/tasks/index.js';
import { createAgent } from './src/agent.js';
const task = TASKS.find((t) => t.id === '08-edit-precision');
console.log(await runTask(task, { config: {/* see eval/scorecard.js configFor */}, makeAgent: createAgent }));
```

## Known gotchas (learned the hard way)

- Node 25: `node --test <dir>` errors — use bare `node --test`.
- Nested `node --test` inherits `NODE_TEST_CONTEXT` and false-passes — strip it when a
  test spawns tests (see `eval/tasks/_helpers.js` runNodeTest).
- macOS `realpath`: `/var` → `/private/var`, and it does NOT case-fold. Always compare
  against `jail.root`, never a raw temp path.
- In-test HTTP mock server + `spawnSync` = deadlock (sync spawn blocks the event loop
  the server runs on). Spawn children async — see `test/cli-e2e.test.js`.
- Ollama `/v1` (OpenAI-compat) endpoint cannot set `num_ctx` per request — that is why
  the provider speaks native `/api/chat`.
- Changing `num_ctx` between requests forces a model reload — pin one per session.
