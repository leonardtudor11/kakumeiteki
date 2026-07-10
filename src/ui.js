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
