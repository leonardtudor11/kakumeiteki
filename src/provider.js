export class EndpointError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EndpointError';
  }
}

const TRANSIENT_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT']);

export function createProvider(config, { fetchImpl = fetch, backoffMs = [1000, 4000] } = {}) {
  if (config.provider === 'ollama') return createOllamaProvider(config, { fetchImpl, backoffMs });
  throw new Error(`provider "${config.provider}" is not implemented yet (openai-compat lands in Phase 3)`);
}

function createOllamaProvider(config, { fetchImpl, backoffMs }) {
  const { baseUrl, model, numCtx } = config;

  async function chatOnce({ messages, tools = [], signal, onDelta }) {
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
      throw new EndpointError(`model "${model}" not found on ${baseUrl} — try: ollama pull ${model}`);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new EndpointError(`ollama HTTP ${res.status}: ${detail.slice(0, 500)}`);
    }

    let content = '';
    const toolCalls = [];
    for await (const chunk of ndjsonLines(res.body)) {
      if (chunk.error) throw new EndpointError(`ollama stream error: ${chunk.error}`);
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
  }

  return {
    name: 'ollama',

    async preflight() {
      let res;
      try {
        res = await fetchImpl(`${baseUrl}/api/version`);
      } catch (err) {
        const code = err.cause?.code ?? err.message;
        throw new EndpointError(`Ollama isn't running at ${baseUrl} — start the app or run \`ollama serve\` (${code})`);
      }
      if (!res.ok) throw new EndpointError(`Ollama preflight failed: HTTP ${res.status} from ${baseUrl}/api/version`);
      return res.json();
    },

    async chat(opts = {}) {
      const attempts = backoffMs.length + 1;
      let lastCode = '';
      for (let attempt = 0; attempt < attempts; attempt++) {
        try {
          return await chatOnce(opts);
        } catch (err) {
          if (err.name === 'AbortError') throw err;
          if (!isTransient(err) || attempt === attempts - 1) {
            if (isTransient(err)) {
              throw new EndpointError(`model endpoint failed after ${attempts} attempts (${transientCode(err)}) — is Ollama still running? Resume with --continue.`);
            }
            throw err;
          }
          lastCode = transientCode(err);
          await sleep(backoffMs[attempt], opts.signal);
        }
      }
      throw new EndpointError(`model endpoint unreachable (${lastCode})`);
    },
  };
}

function isTransient(err) {
  const code = err.cause?.code ?? err.code;
  if (TRANSIENT_CODES.has(code)) return true;
  return err instanceof TypeError && /fetch failed|terminated|network/i.test(err.message);
}

function transientCode(err) {
  return err.cause?.code ?? err.code ?? err.message;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('aborted', 'AbortError'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('aborted', 'AbortError'));
    }, { once: true });
  });
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
