# reverse-engineering — load when facing an unfamiliar codebase or system

Map before touching. Order matters:

1. **Entry points first.** Find where execution starts: main/index, route tables, handlers, cron/schedulers, CLI commands. List them.
2. **Trace ONE path end-to-end** — a single request/action from entry to response, naming each file it passes through — before generalizing about anything. One true path beats ten guessed ones.
3. **Read the tests.** They encode intent the code doesn't show: what behavior is protected, what edge cases mattered to the authors.
4. **List external surfaces:** network calls out, ports listened on, files read/written, env vars consumed, DB tables touched. This is the system's real shape.
5. **Mark the auth gates** along the traced path: where identity is checked, where permissions are checked, what happens without them.
6. **Write the map down** (files, flow, surfaces, gates) BEFORE changing anything. The map is the deliverable of the first pass; changes are a second pass.
7. **Follow the data, not the folder names.** Directory structure lies; a value's journey from input to storage doesn't.

Convention: findings as `file:line` references so they're checkable. Never assert behavior you haven't traced or run.
