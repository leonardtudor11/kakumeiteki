const NAME_KEYS = ['name', 'tool', 'tool_name'];
const ARGS_KEYS = ['args', 'arguments', 'parameters', 'params', 'input'];
const FENCE_RE = /```(\w+)?\n([\s\S]*?)```/g;

export function parseToolCalls(text, { toolNames = [] } = {}) {
  const content = typeof text === 'string' ? text : '';
  const known = new Set(toolNames);

  const fenced = [];
  let m;
  FENCE_RE.lastIndex = 0;
  while ((m = FENCE_RE.exec(content)) !== null) {
    const lang = (m[1] ?? '').toLowerCase();
    const body = m[2].trim();
    if (lang === 'tool') {
      fenced.push(body); // explicit tool intent: always an attempt, repair if malformed
    } else if (lang === 'json' || lang === '' || lang === 'jsonc') {
      if (looksLikeCall(body)) fenced.push(body);
    }
  }

  // an UNTERMINATED fence with tool intent must still count as an attempt — measured
  // live: a model emitted ```json {…call…} without the closing fence and the silence
  // ended its task as if that were a final answer
  if (!fenced.length) {
    const open = /```(\w+)?\n([\s\S]+)$/.exec(content);
    if (open) {
      const lang = (open[1] ?? '').toLowerCase();
      const body = open[2].trim();
      if (lang === 'tool' || ((lang === 'json' || lang === 'jsonc' || lang === '') && looksLikeCall(body))) fenced.push(body);
    }
  }

  const blocks = fenced.length ? fenced : bareCandidate(content);

  const calls = [];
  for (const block of blocks) {
    let obj;
    try {
      obj = JSON.parse(block);
    } catch {
      obj = leadingJson(block);
      if (obj === null) {
        return repair(`your tool call is not valid JSON. Emit exactly one \`\`\`tool fenced block containing {"name": "...", "args": {...}} and nothing else. Offending block: ${truncate(block)}`);
      }
    }
    const list = Array.isArray(obj) ? obj : [obj];
    for (const entry of list) {
      const norm = normalize(entry);
      if (!norm) {
        return repair(`your tool call is missing a recognizable "name"/"args" shape. Use {"name": "<tool>", "args": {...}}. Got: ${truncate(JSON.stringify(entry))}`);
      }
      if (known.size && !known.has(norm.name)) {
        return repair(`unknown tool "${norm.name}". Available tools: ${[...known].join(', ')}. Emit a corrected \`\`\`tool block.`);
      }
      calls.push(norm);
    }
  }
  return { calls, repair: null };
}

function normalize(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const nameKey = NAME_KEYS.find((k) => typeof entry[k] === 'string' && entry[k].trim());
  if (!nameKey) return null;
  const name = entry[nameKey].trim();

  let args = {};
  const argsKey = ARGS_KEYS.find((k) => k in entry);
  if (argsKey !== undefined) {
    args = coerceArgs(entry[argsKey]);
    if (args === null) return null;
  } else {
    const { [nameKey]: _n, ...rest } = entry;
    args = rest;
  }
  return { name, args };
}

function coerceArgs(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return {};
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

// A block that STARTS with a valid call but continues with prose still counts —
// measured live: a 3B appended its result sentence inside the fence and the parse
// failure ended the run as protocol_failed.
function leadingJson(block) {
  if (block[0] !== '{' && block[0] !== '[') return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = 0; i < block.length; i++) {
    const ch = block[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(block.slice(0, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function looksLikeCall(body) {
  if (!body.startsWith('{') && !body.startsWith('[')) return false;
  return NAME_KEYS.some((k) => body.includes(`"${k}"`));
}

function bareCandidate(content) {
  const trimmed = content.trim();
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && looksLikeCall(trimmed)) return [trimmed];
  return [];
}

function repair(message) {
  return { calls: [], repair: message };
}

function truncate(s, n = 200) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
