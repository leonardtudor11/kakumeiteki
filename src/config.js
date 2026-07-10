import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULTS = {
  provider: 'ollama',
  baseUrl: 'http://127.0.0.1:11434',
  model: 'qwen3.5:4b',
  tier: 'auto',
  numCtx: null,
  mode: 'build',
  permissions: 'safe',
  maxTurns: 25,
  bash: { timeoutMs: 120000, maxOutputBytes: 65536 },
  sessionDir: '~/.kakumeiteki/sessions',
};

const ENUMS = {
  provider: ['ollama', 'openai-compat'],
  tier: ['auto', 'micro', 'standard', 'max'],
  mode: ['build', 'refactor', 'audit', 'plan'],
  permissions: ['safe', 'auto', 'readonly'],
};

export function defaultPaths(cwd = process.cwd()) {
  return {
    globalPath: join(homedir(), '.kakumeiteki', 'config.json'),
    projectPath: join(cwd, '.kaku.json'),
  };
}

export function loadConfig({ globalPath, projectPath, cliFlags = {} } = {}) {
  const layers = [
    [globalPath ? `global config (${globalPath})` : 'global config', readJsonIfExists(globalPath)],
    [projectPath ? `project config (${projectPath})` : 'project config', readJsonIfExists(projectPath)],
    ['CLI flags', cliFlags],
  ];
  const config = structuredClone(DEFAULTS);
  for (const [source, layer] of layers) {
    if (!layer) continue;
    validateKeys(layer, source);
    mergeLayer(config, layer);
  }
  validateValues(config);
  return config;
}

function readJsonIfExists(path) {
  if (!path) return null;
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`config file ${path} is not valid JSON: ${err.message}`);
  }
}

function validateKeys(layer, source) {
  for (const key of Object.keys(layer)) {
    if (!(key in DEFAULTS)) throw new Error(`unknown config key "${key}" in ${source}`);
    if (key === 'bash' && layer.bash !== null && typeof layer.bash === 'object') {
      for (const sub of Object.keys(layer.bash)) {
        if (!(sub in DEFAULTS.bash)) throw new Error(`unknown config key "bash.${sub}" in ${source}`);
      }
    }
  }
}

function mergeLayer(config, layer) {
  for (const [key, value] of Object.entries(layer)) {
    if (key === 'bash' && value !== null && typeof value === 'object') {
      Object.assign(config.bash, value);
    } else {
      config[key] = value;
    }
  }
}

function validateValues(config) {
  const fail = (key, why) => {
    throw new Error(`invalid config value for "${key}": ${why}`);
  };
  for (const [key, allowed] of Object.entries(ENUMS)) {
    if (!allowed.includes(config[key])) fail(key, `must be one of ${allowed.join(' | ')}, got ${JSON.stringify(config[key])}`);
  }
  for (const key of ['baseUrl', 'model', 'sessionDir']) {
    if (typeof config[key] !== 'string' || config[key] === '') fail(key, 'must be a non-empty string');
  }
  if (config.numCtx !== null && !isPosInt(config.numCtx)) fail('numCtx', 'must be null or a positive integer');
  if (!isPosInt(config.maxTurns)) fail('maxTurns', 'must be a positive integer');
  if (config.bash === null || typeof config.bash !== 'object') fail('bash', 'must be an object');
  for (const sub of ['timeoutMs', 'maxOutputBytes']) {
    if (!isPosInt(config.bash[sub])) fail(`bash.${sub}`, 'must be a positive integer');
  }
}

function isPosInt(v) {
  return Number.isInteger(v) && v > 0;
}
