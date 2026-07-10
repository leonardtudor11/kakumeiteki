export function createProvider(config, { fetchImpl = fetch } = {}) {
  if (config.provider === 'ollama') return createOllamaProvider(config, { fetchImpl });
  throw new Error(`provider "${config.provider}" is not implemented yet (openai-compat lands in Phase 3)`);
}

function createOllamaProvider(config, { fetchImpl }) {
  const { baseUrl, model, numCtx } = config;

  return {
    name: 'ollama',

    async preflight() {
      let res;
      try {
        res = await fetchImpl(`${baseUrl}/api/version`);
      } catch (err) {
        const code = err.cause?.code ?? err.message;
        throw new Error(`Ollama isn't running at ${baseUrl} — start the app or run \`ollama serve\` (${code})`);
      }
      if (!res.ok) throw new Error(`Ollama preflight failed: HTTP ${res.status} from ${baseUrl}/api/version`);
      return res.json();
    },

    async chat({ messages, tools = [], signal, onDelta } = {}) {
      const body = { model, messages, stream: true };
      if (tools.length) body.tools = tools;
      if (numCtx !== null) body.options = { num_ctx: numCtx };

      const res = await fetchImpl(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
      if (res.status === 404) {
        throw new Error(`model "${model}" not found on ${baseUrl} — try: ollama pull ${model}`);
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`ollama HTTP ${res.status}: ${detail.slice(0, 500)}`);
      }

      let content = '';
      const toolCalls = [];
      for await (const chunk of ndjsonLines(res.body)) {
        if (chunk.error) throw new Error(`ollama stream error: ${chunk.error}`);
        const msg = chunk.message;
        if (msg?.content) {
          content += msg.content;
          onDelta?.(msg.content);
        }
        if (msg?.tool_calls) {
          for (const tc of msg.tool_calls) {
            toolCalls.push({ name: tc.function.name, args: tc.function.arguments ?? {} });
          }
        }
        if (chunk.done) break;
      }
      return { role: 'assistant', content, toolCalls };
    },
  };
}

export async function* ndjsonLines(stream) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) yield JSON.parse(line);
    }
  }
  buffer += decoder.decode();
  const rest = buffer.trim();
  if (rest) yield JSON.parse(rest);
}
