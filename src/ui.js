// One agent turn with streamed output and uniform result reporting — shared by the
// interactive REPL (tui.js), the plain REPL and one-shot -p (cli.js).
export async function runTurn(agent, task, { output, errput, signal } = {}) {
  const renderer = createDeltaRenderer((s) => output.write(s));
  let res;
  try {
    res = await agent.run(task, { signal, onDelta: (t) => renderer.push(t) });
  } catch (err) {
    res = { status: 'error', error: err.message };
  }
  renderer.flush();
  output.write('\n');
  if (res.status === 'error') errput.write(`[error] ${res.error}\nsession saved at ${agent.session.path} — resume with --continue\n`);
  else if (res.status !== 'done') errput.write(`[${res.status}]${res.error ? ` ${res.error}` : ''}\n`);
  return res;
}

export function createDeltaRenderer(write) {
  let inFence = false;
  let line = '';
  let mode = 'undecided';
  let out = '';

  function decide() {
    const trimmed = line.trimStart();
    if (trimmed.length < 3) return;
    if (trimmed.startsWith('```')) {
      mode = 'fence';
    } else if (inFence) {
      mode = 'suppress';
    } else {
      mode = 'stream';
      out += line;
    }
  }

  function endLine() {
    if (mode === 'undecided' && !inFence) out += line + '\n';
    else if (mode === 'stream') out += '\n';
    else if (mode === 'fence') inFence = !inFence;
    line = '';
    mode = 'undecided';
  }

  return {
    push(text) {
      out = '';
      for (const ch of text) {
        if (ch === '\n') {
          endLine();
        } else if (mode === 'stream') {
          out += ch;
        } else if (mode === 'undecided') {
          line += ch;
          decide();
        }
      }
      if (out) write(out);
    },
    flush() {
      if (mode === 'undecided' && !inFence && line) write(line);
      line = '';
      mode = 'undecided';
      inFence = false;
    },
  };
}
