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
| A — function per spec | | |
| B — find the bug | | |
| C — exact-string edit | | |

**Verdict:** _pending_

Notes worth recording: response speed (seconds), any instruction-following drift (extra prose when told code-only), fence/JSON discipline.
