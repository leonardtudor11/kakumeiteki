import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as readline from 'node:readline/promises';

import { loadConfig, defaultPaths } from './config.js';
import { EndpointError } from './provider.js';
import { createAgent } from './agent.js';
import { createJail } from './permissions.js';
import { latestSessionFor, reopenSession } from './session.js';
import { undoDirFor, nextUndo, restore } from './undo.js';
import { runTurn } from './ui.js';
import { runDoctor } from './doctor.js';
import { showBanner, showWelcome } from './banner.js';
import { runReplInteractive } from './tui.js';

const USAGE = `kaku — fully-local coding agent

usage:
  kaku [flags]              interactive REPL
  kaku -p "task" [flags]    one-shot: run task, print result, exit
  kaku doctor               check Node, Ollama and the model; prints exact fixes
  kaku undo                 revert the last file change from this directory's latest session

flags:
  -p <task>            one-shot task
  --model <name>       override model
  --mode <mode>        build | refactor | audit | plan
  --permissions <p>    safe | auto | readonly
  --continue           resume latest session for this directory
  --resume [id]        resume session by id (no id = latest)
  --yes                skip the undo confirmation
  -h, --help           show this help
  --version            print version`;

const VALUE_FLAGS = { '--model': 'model', '--mode': 'mode', '--permissions': 'permissions' };

export function parseArgv(argv) {
  const out = { help: false, version: false, command: null, task: null, resume: null, yes: false, cliFlags: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === 'doctor' || arg === 'undo') && out.command === null && i === 0) {
      out.command = arg;
    } else if (arg === '--yes') {
      out.yes = true;
    } else if (arg === '-h' || arg === '--help') {
      out.help = true;
    } else if (arg === '--version') {
      out.version = true;
    } else if (arg === '-p') {
      const val = argv[++i];
      if (val === undefined) throw new Error('-p requires a task string');
      out.task = val;
    } else if (arg in VALUE_FLAGS) {
      const val = argv[++i];
      if (val === undefined) throw new Error(`${arg} requires a value`);
      out.cliFlags[VALUE_FLAGS[arg]] = val;
    } else if (arg === '--continue') {
      setResume(out, true);
    } else if (arg === '--resume') {
      const next = argv[i + 1];
      setResume(out, next !== undefined && !next.startsWith('-') ? argv[++i] : true);
    } else {
      throw new Error(`unknown flag "${arg}"`);
    }
  }
  return out;
}

function setResume(out, value) {
  if (out.resume !== null) throw new Error('use --continue or --resume, once');
  out.resume = value;
}

export async function main(argv = process.argv.slice(2), { cwd = process.cwd() } = {}) {
  let parsed;
  try {
    parsed = parseArgv(argv);
  } catch (err) {
    console.error(err.message);
    console.error('see: kaku --help');
    return 1;
  }
  if (parsed.help) {
    console.log(USAGE);
    return 0;
  }
  if (parsed.version) {
    console.log(readVersion());
    return 0;
  }

  let config;
  try {
    config = loadConfig({ ...defaultPaths(cwd), cliFlags: parsed.cliFlags });
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  if (parsed.command === 'doctor') return runDoctor(config);
  if (parsed.command === 'undo') return runUndo(config, { cwd, yes: parsed.yes });

  const confirmRef = { fn: null };
  let agent;
  try {
    agent = await createAgent(config, {
      cwd,
      sessionDir: expandTilde(config.sessionDir),
      confirm: (req) => (confirmRef.fn ? confirmRef.fn(req) : false),
      resume: parsed.resume ?? undefined,
    });
  } catch (err) {
    if (err instanceof EndpointError || /no resumable session|not implemented|corrupt session/.test(err.message)) {
      console.error(err.message);
      return 1;
    }
    throw err;
  }
  for (const w of agent.warnings) console.error(`warning: ${w}`);

  if (parsed.task !== null) return runOnce(agent, parsed.task);
  // Same gate as the interactive editor below — piped stdin gets no chrome either.
  if (process.stdin.isTTY && process.stdout.isTTY && !process.env.KAKU_PLAIN && !process.env.NO_COLOR) {
    await showBanner(process.stdout, { version: readVersion() });
    showWelcome(process.stdout, { model: config.model, mode: config.mode, permissions: config.permissions });
  }
  return runRepl(agent, { confirmRef, config });
}

async function runOnce(agent, task) {
  const res = await runTurn(agent, task, { output: process.stdout, errput: process.stderr });
  return res.status === 'done' ? 0 : 1;
}

// Interactive terminals get the rich editor (src/tui.js); pipes/tests get the plain
// readline loop below (keeps output clean and behaviour deterministic for the test suite).
export async function runRepl(agent, opts = {}) {
  const { input = process.stdin, output = process.stdout } = opts;
  const env = process.env;
  if (input.isTTY && output.isTTY && !env.KAKU_PLAIN && !env.NO_COLOR) {
    return runReplInteractive(agent, opts);
  }
  return runReplPlain(agent, opts);
}

async function runReplPlain(agent, {
  input = process.stdin,
  output = process.stdout,
  errput = process.stderr,
  confirmRef = { fn: null },
  config = {},
} = {}) {
  const rl = readline.createInterface({ input, output });
  let abort = null;
  let questionAbort = null;
  let exiting = false;
  let lastInterrupt = 0;

  confirmRef.fn = async ({ command, class: cls }) => {
    const answer = await rl
      .question(`\nallow ${cls} command: ${command}\n[y/N] `, abort ? { signal: abort.signal } : {})
      .catch(() => 'n');
    return /^y(es)?$/i.test(answer.trim());
  };

  const onInterrupt = () => {
    const now = Date.now();
    const doublePress = now - lastInterrupt < 1000;
    lastInterrupt = now;
    if (abort) {
      if (doublePress) exiting = true;
      abort.abort();
    } else {
      exiting = true;
      questionAbort?.abort();
    }
  };
  process.on('SIGINT', onInterrupt);
  rl.on('SIGINT', onInterrupt);

  try {
    while (!exiting) {
      questionAbort = new AbortController();
      let line;
      try {
        line = await rl.question('kaku> ', { signal: questionAbort.signal });
      } catch {
        break;
      } finally {
        questionAbort = null;
      }
      const task = line.trim();
      if (!task) continue;
      if (task === 'exit' || task === 'quit') break;

      abort = new AbortController();
      await runTurn(agent, task, { output, errput, signal: abort.signal });
      abort = null;
    }
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    confirmRef.fn = null;
    rl.close();
  }
  return 0;
}

// kaku undo: revert the most recent not-yet-undone file change recorded for this
// directory's latest session. Needs no model/provider — pure file operation. Repeated
// invocations walk the undo stack backwards. Exported for tests.
export async function runUndo(config, {
  cwd = process.cwd(), yes = false,
  input = process.stdin, output = process.stdout, errput = process.stderr,
} = {}) {
  const jail = createJail(cwd);
  const sessionPath = latestSessionFor(expandTilde(config.sessionDir), jail.root);
  if (!sessionPath) {
    errput.write(`no session found for ${jail.root} — nothing to undo\n`);
    return 1;
  }
  const dir = undoDirFor(sessionPath);
  const entry = nextUndo(dir);
  if (!entry) {
    errput.write('nothing to undo\n');
    return 1;
  }
  // A manifest is data, not authority: refuse entries pointing outside this directory's jail.
  if (entry.real !== jail.root && !entry.real.startsWith(jail.root + '/')) {
    errput.write(`refusing: recorded path ${entry.real} is outside ${jail.root}\n`);
    return 1;
  }
  const action = entry.existed ? 'restore pre-change version of' : 'delete (was created by that change)';
  output.write(`undo #${entry.n} (${entry.op} at ${entry.at}): ${action} ${entry.path}\n`);
  if (!yes) {
    const rl = readline.createInterface({ input, output });
    const answer = await rl.question('[y/N] ').catch(() => 'n');
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
      output.write('undo cancelled\n');
      return 1;
    }
  }
  restore(dir, entry);
  reopenSession(sessionPath).append('undo_restore', { n: entry.n, op: entry.op, path: entry.path });
  output.write(entry.existed ? `restored ${entry.path}\n` : `removed ${entry.path}\n`);
  return 0;
}

function expandTilde(path) {
  if (path === '~') return homedir();
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;
}

function readVersion() {
  return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
}
