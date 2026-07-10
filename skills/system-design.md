# system-design — load when designing a feature, service, or architecture

Present constraints beat imagined futures. In order:

1. **Boring first.** Proven tech the project already uses > new tech. Monolith until measured pain. One datastore until a real access pattern demands a second.
2. **Seams, not speculation.** Put a small interface where change is *likely* (payment provider, model backend, storage). Everywhere else, direct and simple. A seam costs one indirection; a framework costs the project.
3. **Scaling ladder — climb only on measurement:** measure → cache → queue the slow work → replicate reads → shard. Skipping rungs on faith is how systems get complicated and slow.
4. **Every external call** (network, DB, subprocess) needs: timeout, retry-or-fail decision, and an answer to "what does the user see when this is down?"
5. **State the 10× line.** One sentence: what breaks first if load grows 10×? Knowing the bottleneck is enough; fixing it now usually isn't the task.
6. **Data outlives code.** Schema/format decisions deserve 3× the care of code decisions — code refactors in an afternoon, migrations bleed for weeks.
7. **Communication between parts:** prefer in-process call > queue > HTTP, simplest that satisfies the coupling you actually need. Async only where the caller genuinely shouldn't wait.

Deliverable when designing: constraints → chosen shape → seams → 10× line → what was deliberately NOT built.
