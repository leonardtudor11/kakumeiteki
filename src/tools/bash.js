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

function execute(command, { cwd, timeoutMs, maxOutputBytes, signal, platform = process.platform }) {
  const win = platform === 'win32';
  return new Promise((resolvePromise, rejectPromise) => {
    // PowerShell, not cmd.exe: it aliases ls/cat/rm/cp/mv/pwd, so the POSIX-shaped
    // commands a model emits mostly work as-is. -NoProfile keeps the user's profile
    // (and its aliases) out of the sandbox.
    const { file, args } = shellInvocation(platform, command);
    const child = spawn(file, args, {
      cwd,
      env: minimalEnv(platform),
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(win ? { windowsHide: true } : { detached: true }),
    });

    const chunks = [];
    let total = 0;
    let truncated = false;
    let timedOut = false;
    let aborted = false;

    const killGroup = () => {
      if (win) {
        // no process groups on Windows: taskkill /T walks the child tree, /F is SIGKILL.
        // A shell that spawned node would otherwise survive the kill and keep the pipe open.
        try {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        } catch {}
        return;
      }
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

// PowerShell, not cmd.exe: it aliases ls/cat/rm/cp/mv/pwd, so the POSIX-shaped commands
// a small model emits mostly work as-is. -NoProfile keeps the user's own profile and
// aliases out of the sandbox.
export function shellInvocation(platform, command) {
  return platform === 'win32'
    ? { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', command] }
    : { file: '/bin/bash', args: ['-c', command] };
}

// Parent secrets stay out of the child. On Windows the shell itself will not start
// without SystemRoot/COMSPEC, and npm/node need PATHEXT + the AppData pair — so the
// minimal set is genuinely different, not just PATH with another name.
export function minimalEnv(platform = process.platform) {
  const keep =
    platform === 'win32'
      ? ['Path', 'PATH', 'PATHEXT', 'SystemRoot', 'SystemDrive', 'COMSPEC', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMFILES', 'PROGRAMDATA']
      : ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TERM', 'TMPDIR'];
  return Object.fromEntries(keep.map((k) => [k, process.env[k]]).filter(([, v]) => v !== undefined));
}
