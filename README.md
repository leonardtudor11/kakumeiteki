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
kaku -p "add input validation to server.js"   # one-shot: do the task, print, exit
```

Don't have Ollama? Install it from [ollama.com](https://ollama.com), start the app
(or `ollama serve`), and re-run `kaku doctor` — it walks you through every missing piece.

## What you get

- **REPL** with a pixel samurai banner, a bottom status bar (model · mode · live
  context %), and a ninja that peeks while the agent works.
- **One-shot mode** (`-p`) for scripts and pipes — plain output, exit code 0/1.
- **Built-in engineering playbooks**: the agent consults cited decision guides (auth,
  payments, resilience, scalability, RAG, secrets, observability, operations, security)
  before designing in those domains — architecture and deploy advice grounded in OWASP,
  Google SRE, AWS Well-Architected and the RFCs, not vibes. Ask it to *plan* a feature
  (`--mode plan`) and it reads the relevant playbook first.
- **File preloading**: name a file in your task and its content rides along — the model
  skips the read round-trip (secret files always excluded).
- **Sessions**: every run is an append-only JSONL transcript. `kaku --continue` resumes
  the latest session for the directory; `kaku --resume <id>` picks one. Crash-safe.
- **Cancel**: Ctrl-C once cancels the turn, twice exits. Always resumable.
- **`kaku doctor`**: one command that verifies the setup and prints exact fixes.

## Flags

| flag | meaning |
|---|---|
| `-p "task"` | one-shot task (no REPL) |
| `--model <name>` | any Ollama model tag |
| `--mode build\|refactor\|audit\|plan` | audit + plan are read-only by design |
| `--permissions safe\|auto\|readonly` | `safe` (default) asks before mutations |
| `--continue` / `--resume [id]` | resume sessions |
| `doctor` | setup check |

## Config

Optional. Project: `.kaku.json` at the repo root · global: `~/.kakumeiteki/config.json`.
Precedence: CLI flags > project > global > defaults. Unknown keys are hard errors, so
typos can't silently do nothing.

```json
{ "model": "qwen2.5-coder:3b", "mode": "build", "permissions": "safe", "maxTurns": 25 }
```

## Which model?

| Your RAM | Daily driver | Notes |
|---|---|---|
| 8 GB | `qwen3.5:4b` (default) | most capable that runs; slower (spills past the Metal GPU ceiling) |
| 8 GB, speed first | `qwen2.5-coder:3b` | ~5× faster, fits GPU fully, shallower |
| 16 GB | `qwen2.5-coder:7b` / `qwen3.5:8b` | |
| 32 GB+ | qwen3-coder 30B MoE class | |

Judge any new model with the eval suite (`node eval/scorecard.js`) — 10 script-checked
tasks, pass/fail + turns + seconds, no vibes. Verdicts live in `eval/scorecard.md`.

## Security posture (honest version)

- All file tools are locked in a **realpath jail** under the project directory —
  symlink escapes and `../` tricks are tested (S1–S12).
- Bash commands are **classified** (deny / network / read-only / mutate); anything not
  provably read-only asks first in `safe` mode. The deny-list (D1–D14) is a tripwire,
  not a sandbox — the jail, default-ask and cwd-pinning are the real guarantees.
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
