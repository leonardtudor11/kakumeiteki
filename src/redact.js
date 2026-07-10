// Secret redaction. Applied to every tool output and every transcript line before persist —
// resume feeds the transcript back to the model, so a leaked secret would recirculate.
// Over-redaction is acceptable; leaking is not. Replacement token: [REDACTED:R#].
// PEM (R4) runs first because it is a multiline block; the generic assignment rule (R8) runs
// last so the specific token shapes tag before it.

const RULES = [
  ['R4', /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g],
  ['R1', /sk-[A-Za-z0-9_-]{20,}/g],
  ['R2', /(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{20,}/g],
  ['R3', /AKIA[0-9A-Z]{16}/g],
  ['R3', /aws_secret_access_key\s*[:=]\s*\S{20,}/gi],
  ['R5', /xox[baprs]-[A-Za-z0-9-]{10,}/g],
  ['R6', /AIza[0-9A-Za-z_-]{35}/g],
  ['R7', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g],
  ['R8', /\b(?:api[_-]?key|secret|token|password|passwd)["']?\s*[:=]\s*["']?[^\s"']{16,}/gi],
];

export function redact(text) {
  if (typeof text !== 'string' || text === '') return text;
  let out = text;
  for (const [id, re] of RULES) out = out.replace(re, `[REDACTED:${id}]`);
  return out;
}

export function redactDeep(value) {
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v);
    return out;
  }
  return value;
}
