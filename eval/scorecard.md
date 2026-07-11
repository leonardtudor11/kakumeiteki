# Eval scorecard — model comparison

Models: qwen3.5:4b vs qwen2.5-coder:3b · 2 runs/task

| task | qwen3.5:4b pass | qwen2.5-coder:3b pass | qwen3.5:4b turns | qwen2.5-coder:3b turns | qwen3.5:4b sec | qwen2.5-coder:3b sec |
|---|---|---|---|---|---|---|
| 01-hello-tool | 2/2 | 2/2 | 2.0 | 5.0 | 53.4 | 23.1 |
| 02-read-answer | 2/2 | 1/2 | 1.0 | 1.5 | 29.5 | 9.1 |
| 03-fix-test | 2/2 | 1/2 | 4.5 | 3.0 | 140.9 | 11.8 |
| 04-add-function | 1/2 | 0/2 | 7.0 | 8.0 | 231.0 | 42.3 |
| 05-rename | 0/2 | 0/2 | 8.0 | 6.0 | 231.3 | 34.6 |
| 06-find-def | 0/2 | 2/2 | 3.5 | 2.5 | 85.0 | 12.5 |
| 07-find-vuln | 2/2 | 2/2 | 1.0 | 2.0 | 71.3 | 18.4 |
| 08-edit-precision | 2/2 | 2/2 | 2.0 | 2.0 | 52.8 | 12.1 |
| 09-edit-big-file | 0/2 | 0/2 | 2.5 | 2.5 | 330.4 | 40.1 |
| 10-constraint | 2/2 | 0/2 | 2.5 | 4.5 | 87.3 | 17.0 |

## Totals

- `qwen3.5:4b`: **13/20** (avg 131.3s)
- `qwen2.5-coder:3b`: **10/20** (avg 22.1s)

## Machine-assistant classes — baseline BEFORE purpose-built tools (2026-07-11)

Tasks 11–13 solved with the generic toolset only (bash/glob/read); the dedup / junk-scan /
safe-delete tools land after this measurement so their value is A/B-proven, not asserted.
2 runs/task, same protocol as the main table. Partial run via `TASK_FILTER=11,12,13` (writes
no scorecard files; this section recorded manually from the run output).

| task | qwen3.5:4b pass | qwen2.5-coder:3b pass | qwen3.5:4b turns | qwen2.5-coder:3b turns | qwen3.5:4b sec | qwen2.5-coder:3b sec |
|---|---|---|---|---|---|---|
| 11-dedup-content | 2/2 | 0/2 | 7.0 | 3.0 | 210.3 | 19.6 |
| 12-junk-detect | 0/2 | 0/2 | 4.5 | 2.0 | 152.2 | 11.1 |
| 13-clean-junk | 2/2 | 0/2 | 7.0 | 4.5 | 185.6 | 16.8 |

Subset totals: `qwen3.5:4b` **4/6** (avg 182.7s) · `qwen2.5-coder:3b` **0/6** (avg 15.8s).

Failure modes (from kept transcripts):
- 3.5:4b junk-detect: named `.DS_Store` + `build.tmp` but missed `img/Thumbs.db` — searched
  the root only, never recursed. Thoroughness gap a deterministic tree-walking scan closes.
- coder:3b dedup: ADVISED an md5sum pipeline instead of executing it (explains-not-acts).
- coder:3b clean-junk: never issued the delete.

Targets for the tools (Track 2): dedup + junk-detect + clean in ≤2 turns, <60s on 3.5:4b,
and coder:3b lifted off 0/6 — measured on this same table after the tools ship.

## A/B: dedup tool shipped (2026-07-11) — task 11 re-measured

| model | pre-tool | post-tool | delta |
|---|---|---|---|
| qwen3.5:4b | 2/2 · 7.0 turns · 210.3s | **3/3 · 2.0 turns · 58.8s** (n=3) | 3.6× faster, 100% pass |
| qwen2.5-coder:3b | 0/2 (advised, never acted) | **2/2 · 2.0 turns · 10.4s** | off the floor entirely |

Targets (≤2 turns, <60s on 3.5:4b, coder:3b >0) all met. Two tool-ergonomics bugs were
found BY these runs and fixed mid-measurement (each regression-tested):
- a nonexistent scan dir silently reported "no duplicate files found" — the model guessed
  a subdir name and the tool confirmed a falsehood; now a loud error the repair loop
  recovers from (same fix applied to glob, which had the identical lie).
- `{"path": ""}` was rejected ("path must be a non-empty string") and doom-looped a run —
  small models send "" for "no value"; empty string now means project root.

## A/B: junkscan tool shipped (2026-07-11) — task 12 re-measured (n=3)

| model | pre-tool | post-tool | delta |
|---|---|---|---|
| qwen3.5:4b | 0/2 (missed subdir Thumbs.db) | **3/3 · 2.7 turns · 80.4s** | gap closed |
| qwen2.5-coder:3b | 0/2 | **2/3 · 2.7 turns · 18.5s** | off the floor |

3.5:4b's only machine-assistant miss is gone — the deterministic tree walk finds what the
model's shallow root listing missed. coder:3b's one residual failure is answer discipline,
not detection: the kept transcript shows it called the tool, received the correct 3-file
list, recited it correctly mid-run, then wrote a final message contradicting its own
evidence ("didn't find any files"). Model ceiling, not tool defect.

Machine-assistant subset after two tools: 3.5:4b 8/9 measured passes across tasks 11–12
post-tool runs (vs 2/4 baseline), coder:3b 4/5 (vs 0/4).

## A/B: trash tool shipped (2026-07-11) — task 13 re-measured (n=3)

| model | pre-tool | post-tool | delta |
|---|---|---|---|
| qwen3.5:4b | 2/2 via raw `rm` · 185.6s (unrecoverable) | **3/3 · 3.0 turns · 90.2s** | 2× faster AND undoable |
| qwen2.5-coder:3b | 0/2 (never deleted) | **3/3 · 2.0 turns · 11.6s** | off the floor |

Safety signal (verification runs, `via=` detail): BOTH models chose `trash` over bash `rm`
unprompted — every deletion in those runs was restorable with `kaku undo`.

### Machine-assistant classes: final tally after the three tools

| task | 3.5:4b base → tooled | coder:3b base → tooled |
|---|---|---|
| 11-dedup | 2/2 · 210s → 3/3 · 59s | 0/2 → 2/2 · 10s |
| 12-junk | 0/2 → 3/3 · 80s | 0/2 → 2/3 · 19s |
| 13-clean | 2/2 · 186s (rm) → 3/3 · 90s (trash) | 0/2 → 3/3 · 12s |
| **subset** | **4/6 → 9/9** | **0/6 → 7/8** |

The thesis is now measured, not asserted: tool-driven machine-assistant tasks are
honest-useful even at the 3B tier, and the 4B does them slowly but reliably.
