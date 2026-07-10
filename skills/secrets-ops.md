# secrets-ops — decision guide

Consult when handling API keys, credentials, or any value that must not leak.

## Storage ladder (climb only when the rung below hurts)
1. `.env` file, gitignored, `.env.example` committed with placeholder keys.
2. Team/multi-machine → secret manager CLI (Doppler, 1Password CLI) injecting env at start.
3. Cloud-native (AWS Secrets Manager / GCP Secret Manager / Vault) when infra is already
   there — gives audit trails + rotation hooks.

## Rotation (design for it from day one)
- **Dual-key overlap pattern**: issue new key → deploy with both accepted → verify traffic
  on new → revoke old. Zero-downtime rotation is a property you build in, not bolt on.
- Anything leaked rotates NOW, not after cleanup — treat scrollback/logs/AI-chat transcripts
  as leak surfaces.

## Git-leak prevention
- gitignore `.env*` (allow `.env.example`), `*.pem`, `*.key`, key stores.
- Pre-commit + CI secret scanning (gitleaks or trufflehog).
- A secret once pushed is compromised even after history rewrite — rotate first, then
  clean history (git-filter-repo), then force-push; caches and forks may retain the old
  objects.

## Hard rules
- Never log secrets; mask everything after the first 4 chars in any debug output.
- Different keys per environment; production keys never on dev machines.
- Secrets reach the process via env or manager API — never hardcoded, never in client
  bundles (anything shipped to a browser is public).
- Deploy scripts must not echo URLs/commands containing tokens (scrollback, CI logs,
  screen shares all persist them).

## Sources
OWASP Secrets Management Cheat Sheet · NIST SP 800-57 (key management lifecycle) ·
12factor.net/config · gitleaks/trufflehog docs.
