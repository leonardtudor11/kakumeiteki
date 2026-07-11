# Eval scorecard — model comparison

Models: qwen3.5:4b vs qwen2.5-coder:3b · 2 runs/task

| task | qwen3.5:4b pass | qwen2.5-coder:3b pass | qwen3.5:4b turns | qwen2.5-coder:3b turns | qwen3.5:4b sec | qwen2.5-coder:3b sec |
|---|---|---|---|---|---|---|
| 01-hello-tool | 2/2 | 2/2 | 2.5 | 3.5 | 275.6 | 19.4 |
| 02-read-answer | 2/2 | 1/2 | 1.0 | 3.0 | 482.3 | 18.0 |
| 03-fix-test | 2/2 | 0/2 | 7.0 | 2.0 | 593.9 | 15.0 |
| 04-add-function | 0/2 | 0/2 | 12.0 | 5.0 | 4166.3 | 43.5 |
| 05-rename | 2/2 | 0/2 | 2.5 | 10.0 | 199.2 | 70.0 |
| 06-find-def | 2/2 | 1/2 | 7.5 | 7.5 | 1367.8 | 58.4 |
| 07-find-vuln | 2/2 | 2/2 | 1.0 | 2.0 | 854.4 | 23.1 |
| 08-edit-precision | 2/2 | 1/2 | 3.0 | 7.5 | 643.4 | 31.1 |
| 09-edit-big-file | 0/2 | 0/2 | 4.5 | 3.0 | 1641.5 | 23.0 |
| 10-constraint | 2/2 | 0/2 | 3.5 | 6.5 | 1251.9 | 26.2 |
| 11-dedup-content | 2/2 | 2/2 | 2.5 | 2.0 | 605.7 | 13.7 |
| 12-junk-detect | 2/2 | 2/2 | 2.5 | 2.0 | 565.3 | 14.8 |
| 13-clean-junk | 2/2 | 2/2 | 2.5 | 2.0 | 76.2 | 13.3 |

## Totals

- `qwen3.5:4b`: **22/26** (avg 978.7s)
- `qwen2.5-coder:3b`: **13/26** (avg 28.4s)
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

## A/B: rename tool shipped (2026-07-11) — task 05 re-measured (n=3)

| model | pre-tool | post-tool | delta |
|---|---|---|---|
| qwen3.5:4b | 0/2 · 8.0 turns · 231.3s | **3/3 · 2.3 turns · 63.0s** | impossible class unlocked |
| qwen2.5-coder:3b | 0/2 | 0/3 · 5.7 turns · 27.7s | unchanged — never discovers the tool |

Honest split: structure lifted the 4B where prompt levers couldn't; the 3B kept editing
file-by-file with hallucinated anchors and never reached for `rename` (discovery ceiling —
recorded, not spun). Transcripts also exposed a real harness gap, now fixed: an
UNTERMINATED ```json fence containing a valid tool call was silently treated as a final
answer, ending a run on a syntax hiccup. The parser now treats an open fence with tool
intent as an attempt (parse or repair).

## Full-matrix gate (2026-07-11, 13 tasks × 2 models × 2 runs) — post-tools verdict

Headline: `qwen3.5:4b` **22/26** (was 13/20 on the classic 10 alone) · `qwen2.5-coder:3b`
**13/26** (was 6/20). Classic-10 subset: 3.5:4b **16/20** (+3 vs the lever run); tool wins
(05-rename, 11–13) all HOLD inside the full matrix.

**Timing columns of this run are INVALID for comparison** — the matrix ran ~7h wall-clock
overnight (avg 978.7s/task vs the usual ~131s); the machine almost certainly slept mid-run,
so wall-clock includes suspended time. Pass/fail is unaffected (every run completed).
Re-time selectively under `caffeinate` before quoting any speed numbers from this table.

Open flags (n=2 cells — remember 06-find-def: replay before believing):
- 04-add-function 3.5:4b 1/2 → 0/2, both runs hit the 12-turn cap. Kept transcripts exist;
  triage before any fix. Suspect: 12-tool registry crowding/distraction.
- coder:3b classic-10 drifted 10/20 → 7/20 (03, 06, 08 each −1) while its machine-assistant
  tasks went 0/6 → 6/6. Same suspect: tool-list size vs a 3B's attention. Needs replay.
