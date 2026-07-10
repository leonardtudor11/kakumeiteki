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
