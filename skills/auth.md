# auth — decision guide

Consult before building login, sessions, tokens, or third-party sign-in.

## Defaults (pick unless a tradeoff below bites)
- Server-rendered or same-origin app → **cookie sessions**: httpOnly, Secure, SameSite=Lax,
  server-side session store, rotate session id on login.
- Public API / mobile clients → **short-lived JWT access token (≤15 min) + rotating refresh
  token** stored httpOnly; revoke refresh tokens server-side.
- Third-party sign-in → **OAuth 2.0 authorization-code flow with PKCE**. Never the implicit
  flow (deprecated by the OAuth Security BCP).
- Passwords → **argon2id** (or bcrypt cost ≥ 12 if argon2 unavailable), per-user salt is
  built in; add a server-side pepper only if you can store it outside the DB.

## Options + tradeoffs
- Sessions vs JWT: sessions revoke instantly and are simpler to reason about; JWTs scale
  without shared state but CANNOT be revoked before expiry — that is why the access token
  must be short-lived and paired with a revocable refresh token.
- Where to store tokens in a browser: httpOnly cookie beats localStorage (XSS reads
  localStorage; it cannot read httpOnly). CSRF then returns → SameSite + anti-CSRF token
  on state-changing routes.
- "Roll your own" vs managed (Auth0/Clerk/Supabase): managed wins when you need SSO/MFA
  fast; own wins on cost + data control for simple email+password.

## Hard rules
- Verify JWT signature AND `aud`/`iss`/`exp` — a decode without verify is not auth.
- Rate-limit and constant-time-compare every credential check.
- Never log tokens or passwords; never put secrets in JWT claims (they are only base64).
- Password reset: single-use, expiring, hashed-at-rest token; revoke sessions on reset.
- Account enumeration: same response for "no such user" and "wrong password".

## Sources
OWASP ASVS v4 (V2 Authentication, V3 Session Mgmt) · OWASP Cheat Sheets (Authentication,
Session Management, Password Storage) · RFC 6749/6750 + OAuth 2.0 Security BCP (RFC 9700) ·
oauth.net/2/pkce.
