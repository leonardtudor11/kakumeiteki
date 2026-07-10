# security — load for any task touching auth, input, secrets, network, or dependencies

Checklist. Apply what fits; flag violations found in passing even when unasked.

- **Authentication ≠ authorization.** Verifying who they are is not deciding what they may do. Check both, separately, on every protected path.
- **Deny by default.** New route/endpoint/handler starts locked; access is granted explicitly, never assumed.
- **Validate at the boundary.** Every external input (HTTP, file, env, DB row, web page, model output) is untrusted. Validate type + range + length where it enters, not deep inside.
- **Injection:** parameterize queries; never build shell strings from input; never eval data.
- **Secrets:** env or config outside the repo, never in code, never in logs, never in error messages. Log auth *events* (who, when, what), never credentials.
- **Least privilege:** processes, tokens, DB users get the minimum scope that works. A read path gets a read-only credential.
- **Dependencies:** before adding one — is it maintained, how big, what does it pull in? Prefer stdlib. Every dependency is attack surface.
- **Failure mode:** what does an attacker see when this errors? Generic message out, detailed log in.
- **Sessions/tokens:** expire them, scope them, invalidate on logout/privilege change.

Report format: `SECURITY: <issue> — <impact> — <fix>` at the top of the response, never buried.

## Safe-coding layer (apply when writing the code, not just reviewing it)

- **AuthZ is per-resource**: every object fetch filters by owner (`WHERE id = ? AND
  user_id = ?`) — a valid session reading someone else's row is IDOR, the most common
  real-world bug.
- **Injection, one rule each**: SQL/NoSQL → parameterized only, and reject
  operator-shaped input in Mongo (`$gt` in a login field). Shell → exec-array APIs,
  never shell strings. Path → resolve, then verify the result stays inside the allowed
  root (realpath prefix check). XSS → encode on OUTPUT for the context; httpOnly
  cookies; CSP as backstop. SSRF → user-supplied URLs get a host allowlist + private-IP
  block + no redirect-to-private.
- **Headers**: helmet-class defaults (CSP, X-Content-Type-Options, frame-ancestors,
  HSTS behind TLS). Rate-limit auth + expensive endpoints. Body-size caps at the proxy
  AND the app (the proxy default is often smaller — mismatches 413 before your code runs).
- **Uploads**: magic bytes not extension (positional signatures at offset 0 — short
  patterns whole-buffer-scanned false-positive on any big binary), size caps, store
  outside web root, generated names, never execute.
- **Dependencies**: lockfile committed, audit in CI, minimal deps, pin CI actions by hash.

## Sources
OWASP Top 10 (2021) · OWASP ASVS v4 (V1/V4/V5/V12) · OWASP Cheat Sheets (Injection,
XSS, SSRF, File Upload) · helmet docs.
