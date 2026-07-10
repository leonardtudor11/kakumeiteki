# design-brief — run BEFORE any non-trivial task (always loaded, all tiers)

Output this 6-line brief first, then implement. Short lines. No prose around it.

1. **Goal** — one sentence, ONE task only. If the request contains two tasks, do the first, queue the rest: `queued: <items>`.
2. **Constraints** — present limits that shape the solution (runtime, memory, existing stack, deadline). Solve for these, not for an imagined future.
3. **Auth touchpoints** — who/what can trigger this code, and what it can access. If it changes who-can-do-what, say so explicitly.
4. **Data flow** — input → transform → output, one line. Name what crosses a trust boundary.
5. **Unknowns** — what must be researched or read before coding, named precisely ("how X library handles Y"), or `none`.
6. **Verify** — the exact command or check that proves done. No check possible → say `unverifiable: <why>` up front, not after.

Rules:
- One thing at a time: never widen scope mid-task. New ideas → queue line, end of brief.
- Future-proofing = clean seams (small interfaces where change is likely), never speculative features.
- If two readings of the request exist, state both and ask — don't pick silently.
