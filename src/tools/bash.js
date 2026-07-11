import { spawn } from 'node:child_process';
import { actionForCommand } from '../permissions.js';
import { trimCommand } from '../audit.js';

export function createBashTool({ jail, config, confirm, audit }) {
  const { timeoutMs, maxOutputBytes } = config.bash;

  return {
    name: 'bash',
    schema: {
      type: 'function',
      function: {
        name: 'bash',
        description: 'Run a shell command in the project root. Output is capped; long-running commands time out.',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'the shell command to run' },
          },
          required: ['command'],
        },
      },
    },
    async run({ command } = {}, { signal } = {}) {
      if (typeof command !== 'string' || !command.trim()) throw new Error('command is required');

      const { action, class: cls, reason } = actionForCommand(command, config.permissions, { jail });
      // read-only commands stay out of the audit log — it records what could change the machine
      const auditBash = (outcome) => { if (cls !== 'read-only') audit?.append({ kind: 'bash', class: cls, command: trimCommand(command), outcome }); };
      if (action === 'block') {
        auditBash('blocked');
        throw new Error(`command blocked (${reason})`);
      }
      if (action === 'ask') {
        const approved = confirm ? await confirm({ command, class: cls, reason }) : false;
        if (!approved) {
          auditBash('declined');
          throw new Error(`command requires approval and was declined (${reason})`);
        }
      }
      auditBash('run');
      return execute(command, { cwd: jail.root, timeoutMs, maxOutputBytes, signal });
    },
  };
}

function execute(command, { cwd, timeoutMs, maxOutputBytes, signal }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('/bin/bash', ['-c', command], {
      cwd,
      detached: true,
      env: minimalEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const chunks = [];
    let total = 0;
    let truncated = false;
    let timedOut = false;
    let aborted = false;

    const killGroup = () => {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {}
      setTimeout(() => {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {}
      }, 2000).unref();
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killGroup();
    }, timeoutMs);

    const onAbort = () => {
      aborted = true;
      killGroup();
    };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });

    const push = (chunk) => {
      if (truncated) return;
      chunks.push(chunk);
      total += chunk.length;
      if (total > maxOutputBytes) {
        truncated = true;
        killGroup();
      }
    };
    child.stdout.on('data', push);
    child.stderr.on('data', push);

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };

    child.on('error', (err) => {
      cleanup();
      rejectPromise(err);
    });

    child.on('close', (code, killSignal) => {
      cleanup();
      if (aborted) return rejectPromise(new DOMException('bash command aborted', 'AbortError'));

      let text = Buffer.concat(chunks).subarray(0, maxOutputBytes).toString('utf8');
      if (truncated) text += `\n[output truncated at ${maxOutputBytes} bytes — process killed]`;
      if (timedOut) text += `\n[timed out after ${timeoutMs} ms — process killed. The command may be stuck — if it runs code you just wrote, check that code for an infinite loop before retrying.]`;
      else if (!truncated && code !== 0 && code !== null) text += `\n[exit ${code}]`;
      else if (!truncated && code === null && killSignal) text += `\n[killed by ${killSignal}]`;
      resolvePromise(text.trim() || '(no output)');
    });
  });
}

function minimalEnv() {
  const keep = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TERM', 'TMPDIR'];
  return Object.fromEntries(keep.map((k) => [k, process.env[k]]).filter(([, v]) => v !== undefined));
}
