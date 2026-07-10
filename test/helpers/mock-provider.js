export function createMockProvider(turns) {
  let next = 0;
  const requests = [];

  return {
    name: 'mock',
    requests,

    async preflight() {
      return { version: 'mock' };
    },

    async chat({ messages, tools = [], signal, onDelta } = {}) {
      requests.push({ messages: structuredClone(messages), tools });
      const turn = turns[next++];
      if (!turn) throw new Error(`mock script exhausted after ${turns.length} turns`);
      if (turn.hang) await hangUntilAborted(signal);
      signal?.throwIfAborted();

      const text = turn.text ?? '';
      for (const piece of chunkText(text)) {
        await Promise.resolve();
        signal?.throwIfAborted();
        onDelta?.(piece);
      }
      return { role: 'assistant', content: text, toolCalls: turn.toolCalls ?? [] };
    },
  };
}

function hangUntilAborted(signal) {
  return new Promise((_, reject) => {
    const abort = () => reject(new DOMException('mock chat aborted', 'AbortError'));
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function* chunkText(text, size = 8) {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}
