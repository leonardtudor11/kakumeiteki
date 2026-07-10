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
