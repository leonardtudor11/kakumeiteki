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
