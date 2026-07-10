# Eval scorecard — model comparison

Models: qwen3.5:4b vs qwen2.5-coder:3b · 2 runs/task

| task | qwen3.5:4b pass | qwen2.5-coder:3b pass | qwen3.5:4b turns | qwen2.5-coder:3b turns | qwen3.5:4b sec | qwen2.5-coder:3b sec |
|---|---|---|---|---|---|---|
| 01-hello-tool | 2/2 | 2/2 | 2.0 | 2.5 | 36.5 | 15.3 |
| 02-read-answer | 2/2 | 2/2 | 2.0 | 2.0 | 28.3 | 10.3 |
| 03-fix-test | 0/2 | 0/2 | 4.5 | 3.5 | 71.2 | 27.5 |
| 04-add-function | 1/2 | 0/2 | 10.0 | 2.0 | 280.6 | 20.5 |
| 05-rename | 0/2 | 0/2 | 4.0 | 2.0 | 73.6 | 19.6 |
| 06-find-def | 2/2 | 2/2 | 2.0 | 2.0 | 33.5 | 13.7 |
| 07-find-vuln | 1/2 | 0/2 | 2.5 | 2.0 | 69.0 | 9.9 |
| 08-edit-precision | 1/2 | 0/2 | 3.0 | 4.0 | 70.3 | 20.6 |
| 09-edit-big-file | 0/2 | 0/2 | 5.0 | 4.0 | 377.4 | 49.4 |
| 10-constraint | 2/2 | 0/2 | 5.0 | 3.5 | 125.2 | 23.9 |

## Totals

- `qwen3.5:4b`: **11/20** (avg 116.6s)
- `qwen2.5-coder:3b`: **6/20** (avg 21.1s)
