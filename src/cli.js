import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as readline from 'node:readline/promises';

import { loadConfig, defaultPaths } from './config.js';
import { EndpointError } from './provider.js';
import { createAgent } from './agent.js';
import { runTurn } from './ui.js';
import { runDoctor } from './doctor.js';
import { showBanner, showWelcome } from './banner.js';
import { runReplInteractive } from './tui.js';

const USAGE = `kaku — fully-local coding agent

usage:
  kaku [flags]              interactive REPL
  kaku -p "task" [flags]    one-shot: run task, print result, exit
  kaku doctor               check Node, Ollama and the model; prints exact fixes

flags:
  -p <task>            one-shot task
  --model <name>       override model
  --mode <mode>        build | refactor | audit | plan
  --permissions <p>    safe | auto | readonly
  --continue           resume latest session for this directory
  --resume [id]        resume session by id (no id = latest)
  -h, --help           show this help
  --version            print version`;

const VALUE_FLAGS = { '--model': 'model', '--mode': 'mode', '--permissions': 'permissions' };

export function parseArgv(argv) {
  const out = { help: false, version: false, command: null, task: null, resume: null, cliFlags: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === 'doctor' && out.command === null && i === 0) {
      out.command = 'doctor';
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
  if (process.stdout.isTTY && !process.env.KAKU_PLAIN && !process.env.NO_COLOR) {
    const version = readVersion();
    await showBanner(process.stdout, { version });
    showWelcome(process.stdout, { version, model: config.model, mode: config.mode, permissions: config.permissions });
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

function expandTilde(path) {
  if (path === '~') return homedir();
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;
}

function readVersion() {
  return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
}
