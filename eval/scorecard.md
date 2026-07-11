# Eval scorecard — model comparison

Models: qwen3.5:4b vs qwen2.5-coder:3b · 2 runs/task

| task | qwen3.5:4b pass | qwen2.5-coder:3b pass | qwen3.5:4b turns | qwen2.5-coder:3b turns | qwen3.5:4b sec | qwen2.5-coder:3b sec |
|---|---|---|---|---|---|---|
| 01-hello-tool | 2/2 | 1/2 | 5.0 | 1.5 | 125.3 | 14.4 |
| 02-read-answer | 2/2 | 1/2 | 1.0 | 2.5 | 27.2 | 16.0 |
| 03-fix-test | 2/2 | 2/2 | 6.0 | 3.0 | 161.7 | 21.4 |
| 04-add-function | 2/2 | 0/2 | 7.5 | 5.0 | 213.9 | 59.3 |
| 05-rename | 2/2 | 1/2 | 2.5 | 3.5 | 65.0 | 44.4 |
| 06-find-def | 2/2 | 1/2 | 3.0 | 2.0 | 77.8 | 14.5 |
| 07-find-vuln | 2/2 | 2/2 | 1.0 | 7.5 | 107.2 | 60.3 |
| 08-edit-precision | 2/2 | 2/2 | 6.5 | 3.0 | 145.3 | 20.2 |
| 09-edit-big-file | 0/2 | 0/2 | 2.0 | 3.0 | 273.1 | 52.2 |
| 10-constraint | 2/2 | 0/2 | 7.5 | 3.0 | 162.1 | 20.5 |
| 11-dedup-content | 2/2 | 1/2 | 2.5 | 2.0 | 76.8 | 13.9 |
| 12-junk-detect | 2/2 | 1/2 | 2.5 | 2.0 | 87.0 | 16.3 |
| 13-clean-junk | 2/2 | 2/2 | 3.0 | 2.0 | 84.2 | 14.1 |

## Totals

- `qwen3.5:4b`: **24/26** (avg 123.6s)
- `qwen2.5-coder:3b`: **14/26** (avg 28.3s)

<!-- HISTORY — measured ground truth below; the runner replaces only the table above this line -->

## Capability ladder (2026-07-11, in progress) — Track 4, local models only

Protocol: TASK_FILTER=all (no head-table writes), RUNS=2, caffeinate, same eval config
as the gate (micro tier, 12-turn cap, 8192 ctx). Ladder rungs recorded here as they run.

### Rung: qwen3:1.7b — 18/26 (avg 113.4s, 49.2 min wall)

| task | pass | turns | sec |
|---|---|---|---|
| 01-hello-tool | 2/2 | 10.0 | 132.5 |
| 02-read-answer | 2/2 | 1.0 | 9.9 |
| 03-fix-test | 2/2 | 3.0 | 52.0 |
| 04-add-function | 0/2 | 7.5 | 518.4 |
| 05-rename | 2/2 | 7.0 | 220.7 |
| 06-find-def | 0/2 | 9.0 | 170.2 |
| 07-find-vuln | 2/2 | 1.0 | 25.5 |
| 08-edit-precision | 2/2 | 3.0 | 41.4 |
| 09-edit-big-file | 0/2 | 5.0 | 80.8 |
| 10-constraint | 0/2 | 4.0 | 135.1 |
| 11-dedup-content | 2/2 | 2.0 | 20.5 |
| 12-junk-detect | 2/2 | 2.0 | 33.1 |
| 13-clean-junk | 2/2 | 2.5 | 34.0 |

The headline the whole project exists to measure: a 1.7B model scores 18/26 on this
harness — ABOVE qwen2.5-coder:3b's 14/26 — because the tool-driven classes carry it
(machine-assistant 6/6, rename 2/2, edit-precision 2/2). Its failures are exactly the
reasoning-heavy classes (04 create-from-spec, 06 find-def, 10 constraint, 09 big-file).
Harness makes simple things reliable; the model still sets the reasoning ceiling.

Pending rungs: qwen3:4b (pulled, run interrupted — resume with
`TASK_FILTER=01,...,13 RUNS=2 node eval/scorecard.js qwen3:4b` under caffeinate).


## Full-matrix gate (2026-07-11, post confidence line + ergonomics waves) — CLEAN TIMING

Headline: `qwen3.5:4b` **24/26** (avg 123.6s — first clean full-matrix timing; the old
978.7s table was sleep-contaminated) · `qwen2.5-coder:3b` **14/26** (avg 28.3s).

- 04-add-function on 3.5:4b: **2/2 IN the full matrix** — the phantom-prefix +
  ergonomics fixes hold under gate conditions, not just in isolated replays.
- 09-edit-big-file stays 0/2 on both models — the honest ceiling class, unchanged.
- coder:3b wobble profile shifted (01/02/05/06/11/12 each 1/2) but total 13→14; its
  passes concentrate where tools carry the task. 05-rename 1/2 is its first-ever rename
  pass (was 0/7 lifetime) — the verify/ergonomics waves may have nudged discovery; n=2,
  do not oversell.
- Verify-nudge caused NO regression at gate scale; 3.5:4b total rose 22→24.

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

BOTH FLAGS RESOLVED 2026-07-11 — see "Flag triage + micro-ergonomics fix waves" below.

## Flag triage + micro-ergonomics fix waves (2026-07-11, all replays under caffeinate)

**Flag 2 (coder:3b classic drift) — verdict: VARIANCE.** Replay ×3: 08 3/3 (fully
recovered), 06 2/3 (its historical wobble — failure is the old fabricate-after-failed-glob
mode, no new mechanism), 03 1/3 (two mechanical deaths, both fixed below). No registry
effect visible in transcripts.

**Flag 1 (04-add-function, 3.5:4b) — verdict: REAL, and NOT registry crowding.** 0/3
replay (0/5 combined post-tool-wave, avg 397s clean). Kept transcripts pinned three
mechanisms, fixed in two waves:

Wave 1 (`aaf2c5e`..`57c0c6d`): few-shot examples primed `src/` path invention (both models
copied the example's `src/app.js` prefix — 3 sightings); a valid fenced call with trailing
prose inside the fence died protocol_failed; a bash timeout on the model's own infinite
loop (`slug.slice(-1)`) gave zero diagnostic; the native-path unknown-tool error (a
hallucinated `move`) named no alternatives.

Wave 2 (`db67e0a`): the deeper poison — models re-derive the cwd BASENAME as a phantom
subdirectory ("working in …/proj" → paths like `proj/slugify.js`; write silently seeded a
nested copy the model flailed between). Deterministic counter: phantomPrefixHint on 7
tools' not-found errors + write refuses to seed the phantom dir + one micro-prompt rule.

Measured A/B (n=3 per round):

| round | 03 coder:3b | 04 qwen3.5:4b |
|---|---|---|
| pre-fix replay | 1/3 | 0/3 (avg 397.4s) |
| post wave 1 | **3/3** (24.6s avg) | 0/3 — src/ gone, `proj/` phantom exposed |
| post wave 2 | — | **2/3** (341.7s avg, 7.0 turns) |

04's residual failure is MODEL CEILING, not harness: the guard redirected both phantom
writes and the model recovered to the right path, then claimed "all 5 tests passed"
WITHOUT ever running them — fabricated verification. That lie is exactly what the
verified-confidence line (IMPROVE §2, next on the roadmap) is designed to catch.

Suite: 332 tests, 331 pass, 1 skip. Every fix regression-tested offline; both waves
reviewer-audited before push.

## A/B: verified-confidence line shipped (2026-07-11, `631e227`) — IMPROVE §2

The harness now computes a per-turn verification line from the evidence ledger
(edit/write need a bash check after them; rename/trash self-verify via tool output;
exit codes parsed from kaku's own trailing marker). Final answer with unchecked changes
draws ONE verify-nudge, then stands with a loud UNVERIFIED label. The model cannot
write the line. Measured (n=3, caffeinate):

| task | pre | post | verdict |
|---|---|---|---|
| 04-add-function 3.5:4b | 2/3 · 341.7s | 2/3 · 371.8s (9.3 turns) | rate held; failure MODE changed — see below |
| 08-edit-precision coder:3b | 3/3 replay (1/2 gate) | 2/3 · 24.8s | historical wobble; verify-nudge never fired in the failure (zero edits applied → ledger rightly empty; classic anchor hallucination + doom loop) |
| 13-clean-junk coder:3b | 3/3 | 3/3 · 2.0 turns | zero friction on the self-verifying trash path — as designed |

The qualitative win: 04's pre-feature failure FABRICATED "all 5 tests passed" (nothing
ran). Post-feature, the failed run ran the real test unprompted on turn 2, saw the
actual failing case, and died honestly iterating on its regex until turn cap — with the
phantom-prefix hint visibly redirecting two `proj/` relapses mid-run. Fabrication →
honest iteration is the behavior this feature exists to buy; n=3, so watch it, but the
direction is measured, not asserted.

Suite: 344 tests, 343 pass, 1 skip.
