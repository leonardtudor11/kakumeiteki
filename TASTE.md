# Phase 0 — taste test

Models under test: `qwen2.5-coder:3b` (challenger) vs `qwen3:1.7b` (incumbent).
Criteria below were written BEFORE running any probe. Each probe is pass/fail — no vibes.
Run each prompt against both models: `ollama run <model>` then paste the prompt.

Verdict table at bottom stays empty until probes actually run.

---

## Probe A — write function per spec

**Prompt:**

```
Write a JavaScript function slugify(title) that: lowercases the input,
replaces every run of characters that are not a-z or 0-9 with a single
hyphen, and strips leading/trailing hyphens. Reply with only the code,
no explanation.
```

**Pass criteria:** paste the returned function into the check below; all 5 must print `true`.

```js
// node taste-check-a.mjs  (paste model's function above this block)
const cases = [
  ["Hello World", "hello-world"],
  ["  --Foo!! Bar--  ", "foo-bar"],
  ["A  B__C", "a-b-c"],
  ["already-slugged", "already-slugged"],
  ["", ""],
];
for (const [input, want] of cases) console.log(slugify(input) === want, JSON.stringify(input));
```

---

## Probe B — find the bug

**Prompt:**

```
This function sometimes returns wrong totals and sometimes crashes.
Find the bug. Name the exact line and explain in two sentences max.

function sumOrders(orders) {
  let total = 0;
  for (let i = 0; i <= orders.length; i++) {
    total += orders[i].amount;
  }
  return total;
}
```

**Pass criteria:** answer identifies the loop condition `i <= orders.length` as reading one past the end (`orders[orders.length]` is undefined → crash on `.amount`). Must name the condition or the line; a generic "check your array bounds" without pointing at `<=` = fail.

---

## Probe C — exact-string edit (the skill the harness depends on most)

**Prompt:**

```
Here is a file:

export function getData(url) {
  return fetch(url).then(r => r.json());
}

export function getDataTwice(url) {
  return Promise.all([getData(url), getData(url)]);
}

Reply with ONLY a JSON object {"old": "...", "new": "..."} such that
replacing the exact substring old with new renames getData to fetchData
on its definition line only, leaving every other line untouched.
old must appear exactly once in the file.
```

**Pass criteria (all three):**
1. Reply parses as JSON with string fields `old` and `new` (strip code fences if present — fences alone are not a fail).
2. `old` occurs exactly once in the file text.
3. After replacement: file contains `export function fetchData(url)`, still contains both `getData(url)` call sites inside `getDataTwice`, and `getDataTwice` itself is unrenamed.

---

## Scorecard (fill only after running)

| Probe | qwen2.5-coder:3b | qwen3:1.7b |
|---|---|---|
| A — function per spec | FAIL (4/5 — trailing hyphen survives: `"foo-bar-"`) | FAIL (4/5 — leading AND trailing survive: `"-foo-bar-"`) |
| B — find the bug | PASS (named `i <= orders.length`, out-of-bounds `.amount`) | PASS (same, correct) |
| C — exact-string edit | FAIL (`old: "getData"` — occurs 4×, not unique; would also rename `getDataTwice`) | FAIL (identical answer, identical flaw; its own reasoning even asserted "appears once" — wrong) |

**Verdict:** `qwen2.5-coder:3b` adopted as default model — wins on tiebreakers, not on score.

- Strict score is a 1/3 tie. Tiebreakers all favor coder:3b: ~2× faster wall-clock (probe C: 4 s vs 9 s), no chain-of-thought flooding (qwen3 emits hundreds of lines of `Thinking...` per probe — poison for context budget), better instruction discipline (qwen3 broke "two sentences max" on B; both fenced code despite "only the code", fences alone not a fail per criteria).
- JSON discipline on C: both returned clean parseable JSON. The failure is *reasoning about uniqueness*, not formatting.
- **Design consequence (the real Phase 0 payoff):** neither model can produce a unique exact-match anchor unaided. The harness edit tool must verify `old` uniqueness itself and drive the repair loop with the violation ("occurs 4×, widen the anchor") — already in PLAN.md as the fenced-protocol repair loop; Phase 2/3 must treat uniqueness verification as a hard gate, not an optional nicety. Probe A shows edge-case blindness (boundary hyphens) — success criteria in eval tasks must include boundary cases, never happy-path only.

Run conditions: M1 8 GB, Ollama, one model resident at a time, 2026-07-10.

---

## Addendum 2026-07-10 pm — landscape refresh (web research)

Phase 0 was a 2-model convenience bake-off, not a survey. Refreshed the field via web search (my training cutoff Jan 2026 was ~6 months stale). Findings:

- **New default candidate: `qwen3.5:4b`** (3.4 GB, verified on pull — multimodal 4B, heavier than a text-only 4B; my ~2.5 GB pre-pull estimate was wrong) — newer than qwen2.5-coder:3b, reported stronger instruction-following + tool-calling (Unsloth chat-template fixes). Fits 8 GB with 8k ctx but needs other apps closed. Adopted as config default; qwen2.5-coder:3b (1.9 GB) retained as fallback and the lighter option under memory pressure.
- **Gemma 4 rejected**: fails tool-calls / agentic work per HN + r/LocalLLaMA — disqualifying for a tool-driven harness.
- **Qwen3.6 (27B/35B-A3B)** is the mid-2026 coding leader but too big for 8 GB.
- **Ollama now MLX-backed on Apple Silicon** (official preview): +15–30% throughput, −10% memory. Update Ollama.
- The Phase 0 binding lessons (edit-anchor uniqueness must be harness-enforced; eval criteria must include boundary cases) are model-independent and still hold — they are why the harness works regardless of which small model wins.
- **Final pick deferred to the Phase 6 eval scorecard**: qwen3.5:4b vs qwen2.5-coder:3b on real tasks, not vibes. Harness is model-agnostic (config `model`), so no lock-in.
