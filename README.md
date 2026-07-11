# KAKUMEITEKI 革命的

A fully-local coding agent. Your code never leaves your machine, the marginal cost is
zero, and the model is a swappable part — the Claude-Code-style harness discipline is
the product: permission-gated tools, read-before-edit, context budgeting, honest
failure reporting.

Plain JavaScript, Node 20+, **zero runtime dependencies**. No telemetry, no network
except your local Ollama.

## Quickstart

```bash
git clone https://github.com/leonardtudor11/kakumeiteki.git
cd kakumeiteki
npm link                  # makes `kaku` available everywhere (zero deps — nothing to install)
ollama pull qwen3.5:4b    # the default model (3.4 GB) — see the table below for your RAM
kaku doctor               # checks Node, Ollama, model — tells you EXACTLY what to fix
```

Then, inside any project directory:

```bash
kaku                      # interactive REPL (samurai banner, live status bar)
kaku -p "explain what server.js does"                    # one-shot: task, print, exit
kaku -p "in greet.js rename the greet function to hello" # single-file edits work well
```

Don't have Ollama? Install it from [ollama.com](https://ollama.com), start the app
(or `ollama serve`), and re-run `kaku doctor` — it walks you through every missing piece.

## What you get

- **REPL** with a pixel samurai banner, a bottom status bar (model · mode · live
  context %), and a ninja that peeks while the agent works.
- **One-shot mode** (`-p`) for scripts and pipes — plain output, exit code 0/1.
- **Built-in engineering playbooks**: cited decision guides (auth, payments, resilience,
  scalability, RAG, secrets, observability, operations, security) grounded in OWASP,
  Google SRE, AWS Well-Architected and the RFCs — served by the built-in `skill` tool.
  Honest usage note for small models: **name the playbook in your prompt**
  (`kaku --mode plan -p "consult the payments playbook, then plan Stripe checkout"`) —
  measured live, that produces a plan grounded in the cited rules; left to discover the
  playbook on its own, a 4B model tends to wander. Bigger models need less steering.
- **File preloading**: name a file in your task and its content rides along (secret
  files always excluded), so the model can skip the read round-trip.
- **Sessions**: every run is an append-only JSONL transcript. `kaku --continue` resumes
  the latest session for the directory; `kaku --resume <id>` picks one. Crash-safe.
- **Cancel**: Ctrl-C once cancels the turn, twice exits. Always resumable.
- **Undo**: every `edit`/`write` saves the file's pre-change version first (no backup →
  no change). `kaku undo` reverts the last change; run it again to walk further back.
  Honest limit: bash-made changes aren't covered — only the file tools are.
- **`kaku doctor`**: one command that verifies the setup and prints exact fixes.

## Flags

| flag | meaning |
|---|---|
| `-p "task"` | one-shot task (no REPL) |
| `--model <name>` | any Ollama model tag |
| `--mode build\|refactor\|audit\|plan` | audit + plan are read-only by design |
| `--permissions safe\|auto\|readonly` | `safe` (default) previews + asks before any change; `readonly` blocks all changes |
| `--continue` / `--resume [id]` | resume sessions |
| `--scope <dir>` | jail to another directory — explicit consent (`/` refused; home root or outside-home ask interactively) |
| `doctor` | setup check |
| `undo [--yes]` | revert the last file change (repeat to walk back; honours `--scope`) |

## Config

Optional. Project: `.kaku.json` at the repo root · global: `~/.kakumeiteki/config.json`.
Precedence: CLI flags > project > global > defaults. Unknown keys are hard errors, so
typos can't silently do nothing.

```json
{ "model": "qwen2.5-coder:3b", "mode": "build", "permissions": "safe", "maxTurns": 25 }
```

## What to honestly expect from a 3–4B local model

Measured on the built-in eval suite (13 script-checked tasks, no judgment calls —
`eval/scorecard.md`), on an M1 8 GB:

**Reliable:** read code and answer questions about it · find definitions and usages ·
list/explore project structure · follow output constraints · a single precise edit in a
small file (works, not guaranteed — verify the diff) · consult a playbook you name and
apply it to a plan.

**Machine-assistant (measured 2026-07-11, tool-driven — the tools do the heavy lifting):**
find duplicate files by content (`dedup`) · spot junk/cache/OS litter (`junkscan`) ·
delete safely with undo (`trash` — both tested models chose it over `rm` unprompted).
Post-tool scores: qwen3.5:4b 9/9, qwen2.5-coder:3b 7/8 — versus 4/6 and 0/6 with generic
tools only. Full A/B history in `eval/scorecard.md`.

**Not reliable at this size — don't pretend otherwise:** fixing a failing test ·
renaming across multiple files · edits deep inside large files · any multi-step task
that requires holding a plan across many tool calls. Both tested models scored 0/2 on
each of these.

The harness is what makes the reliable list reliable (forced read-before-edit, unique
edit anchors, repair loops, honest failure statuses) — it cannot add reasoning the model
doesn't have. When a task fails, kaku says so (`turn_cap`, `doom_loop`, …) instead of
pretending. Judge any new model with `node eval/scorecard.js` and trust the table, not
the vibes.

## Which model?

| Your RAM | Daily driver | Notes |
|---|---|---|
| 8 GB | `qwen3.5:4b` (default) | most capable that runs; slower (spills past the Metal GPU ceiling) |
| 8 GB, speed first | `qwen2.5-coder:3b` | ~5× faster, fits GPU fully, shallower |
| 16 GB | `qwen2.5-coder:7b` / `qwen3.5:8b` | |
| 32 GB+ | qwen3-coder 30B MoE class | |

Judge any new model with the eval suite (`node eval/scorecard.js`) — 13 script-checked
tasks (coding + machine-assistant), pass/fail + turns + seconds, no vibes. Verdicts live
in `eval/scorecard.md`. `TASK_FILTER=11,12 node eval/scorecard.js` re-measures a subset.

## Security posture (honest version)

- All file tools are locked in a **realpath jail** under the project directory —
  symlink escapes and `../` tricks are tested (S1–S12). `--scope <dir>` moves the jail
  only with explicit consent: `/` is never allowed, and the home root or anything
  outside it demands an interactive yes on top of the flag.
- Bash commands are **classified** (deny / network / read-only / mutate); anything not
  provably read-only asks first in `safe` mode. The deny-list (D1–D14) is a tripwire,
  not a sandbox — the jail, default-ask and cwd-pinning are the real guarantees.
- File edits/writes go through the **same permission gate**: `readonly` blocks them,
  `safe` shows a diff preview and asks, and every applied change is backed by
  `kaku undo`.
- An **audit log** (`<sessionDir>/audit.jsonl`, append-only) records every file-change
  outcome (applied/declined/blocked), non-read-only bash run, `--scope` grant and undo
  restore — paths and outcomes only, never file content, secrets redacted. One place to
  answer "what did kaku change on this machine".
- Secret files (`.env`, keys, `~/.ssh`, …) are refused; secret strings (API keys, JWTs,
  PEM blocks) are **redacted** from everything the model sees or the transcript stores.
- Zero network from the agent core except your local Ollama endpoint.

## Docs

| file | read it when |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | you want the file map, data flow, extension points |
| [DEBUGGING.md](DEBUGGING.md) | a run misbehaved — transcripts, failure signatures |
| [AGENT.md](AGENT.md) | the behavior laws the agent lives by |
| [PLAN.md](PLAN.md) | the full v1 spec and its phase gates |
| [IMPROVE.md](IMPROVE.md) | the earned-upgrade backlog (web tool, RAG, routing…) |

`npm test` — 236 offline tests, no model needed. `KAKU_PLAIN=1` disables the banner
and status bar.

## License

MIT. Banner mask adapted from a retro pixel-art samurai reference (quantized and
recolored for the terminal).
