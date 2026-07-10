import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { loadConfig, defaultPaths } from './config.js';
import { EndpointError } from './provider.js';
import { createAgent } from './agent.js';

const USAGE = `kaku — fully-local coding agent

usage:
  kaku [flags]              interactive REPL
  kaku -p "task" [flags]    one-shot: run task, print result, exit

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
  const out = { help: false, version: false, task: null, resume: null, cliFlags: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
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

  let agent;
  try {
    agent = await createAgent(config, {
      cwd,
      sessionDir: expandTilde(config.sessionDir),
      resume: parsed.resume ?? undefined,
    });
  } catch (err) {
    if (err instanceof EndpointError || /no resumable session/.test(err.message)) {
      console.error(err.message);
      return 1;
    }
    throw err;
  }
  for (const w of agent.warnings) console.error(`warning: ${w}`);

  if (parsed.task !== null) return runOnce(agent, parsed.task);

  console.error('REPL is not built yet — run a one-shot task: kaku -p "task"');
  return 1;
}

async function runOnce(agent, task) {
  const res = await agent.run(task, { onDelta: (text) => process.stdout.write(text) });
  process.stdout.write('\n');
  if (res.status === 'done') return 0;
  console.error(`[${res.status}]${res.error ? ` ${res.error}` : ''}`);
  return 1;
}

function expandTilde(path) {
  if (path === '~') return homedir();
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;
}

function readVersion() {
  return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
}
