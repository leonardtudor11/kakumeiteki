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
