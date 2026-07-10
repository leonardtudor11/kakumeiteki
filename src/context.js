const CHARS_PER_TOKEN = 3.5; // conservative (over-estimates) — Ollama front-truncates silently on overflow
const MESSAGE_OVERHEAD = 4; // role + framing tokens per message
const RESPONSE_RESERVE = 1024; // headroom kept free for the model's reply

export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function countMessage(message) {
  let total = MESSAGE_OVERHEAD;
  total += estimateTokens(message.content ?? '');
  if (message.toolCalls?.length) total += estimateTokens(JSON.stringify(message.toolCalls));
  if (message.name) total += estimateTokens(message.name);
  return total;
}

export function countMessages(messages) {
  return messages.reduce((sum, m) => sum + countMessage(m), 0);
}

export function budgetFor(numCtx, { reserve = RESPONSE_RESERVE, compactRatio = 0.8 } = {}) {
  const input = Math.max(0, numCtx - reserve);
  return { numCtx, reserve, input, compactAt: Math.floor(input * compactRatio) };
}

export function needsCompaction(messages, budget) {
  return countMessages(messages) > budget.compactAt;
}

// Deterministic compaction — no model call, no hallucination risk.
// Preserves: system prompt(s), the original task (first non-system message),
// a recent window, and a summary marker standing in for the dropped middle.
export function compact(messages, budget, { keepRecent = 6 } = {}) {
  if (!needsCompaction(messages, budget)) return { messages, compacted: false, dropped: 0 };

  const system = messages.filter((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');
  if (rest.length <= 2) return { messages, compacted: false, dropped: 0 };

  const firstTask = rest[0];
  let recentStart = Math.max(1, rest.length - keepRecent);
  while (recentStart < rest.length && rest[recentStart].role === 'tool') recentStart++;

  const dropped = rest.slice(1, recentStart);
  if (!dropped.length) return { messages, compacted: false, dropped: 0 };

  const recent = rest.slice(recentStart);
  const marker = { role: 'user', content: summarize(dropped) };
  const build = () => [...system, firstTask, marker, ...recent];

  let out = build();
  while (countMessages(out) > budget.compactAt && recent.length > 1) {
    recent.shift();
    while (recent.length && recent[0].role === 'tool') recent.shift();
    out = build();
  }
  return { messages: out, compacted: true, dropped: dropped.length };
}

function summarize(dropped) {
  const counts = {};
  for (const m of dropped) {
    if (m.role === 'tool' && m.name) counts[m.name] = (counts[m.name] ?? 0) + 1;
  }
  const parts = Object.entries(counts).map(([n, c]) => `${n}×${c}`).join(', ');
  return `[${dropped.length} earlier messages compacted to save context${parts ? `; tool calls made: ${parts}` : ''}. Full detail is in the session transcript. Continue the task.]`;
}
