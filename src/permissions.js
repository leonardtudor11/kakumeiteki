import { realpathSync } from 'node:fs';
import { resolve, dirname, basename, join, sep } from 'node:path';

export class JailError extends Error {
  constructor(message) {
    super(message);
    this.name = 'JailError';
  }
}

export function createJail(projectRoot) {
  const root = realpathSync(projectRoot);

  return {
    root,
    resolve(input) {
      if (typeof input !== 'string' || input.length === 0) {
        throw new JailError('path must be a non-empty string');
      }
      if (input.includes('\0')) throw new JailError('path contains a null byte');
      if (input === '~' || input.startsWith('~/')) {
        throw new JailError(`path escapes project root: ${input}`);
      }
      const real = realDeepest(resolve(root, input));
      if (real !== root && !real.startsWith(root + sep)) {
        throw new JailError(`path escapes project root: ${input}`);
      }
      return real;
    },
  };
}

const SECRET_DIRS = new Set(['.ssh', '.aws', '.gnupg']);
const SECRET_ENV_EXCEPTIONS = new Set(['.env.example', '.env.sample', '.env.template']);
const SECRET_BASENAMES = [
  /^\.env(\..+)?$/,
  /\.(pem|key|p12|pfx|jks|keystore)$/,
  /^id_(rsa|ecdsa|ed25519)/,
  /^\.(netrc|npmrc|pypirc)$/,
  /credentials.*\.json$/,
  /^secrets\./,
];

export function isSecretPath(path) {
  const segments = path.split(sep).filter(Boolean);
  const base = segments.at(-1) ?? '';
  if (segments.some((segment) => SECRET_DIRS.has(segment))) return true;
  if (SECRET_ENV_EXCEPTIONS.has(base)) return false;
  return SECRET_BASENAMES.some((re) => re.test(base));
}

const TEXT_DENY_RULES = [
  ['D3', /\b(curl|wget)\b[^;&|]*\|\s*(ba|z|da)?sh\b/, 'pipe-to-shell'],
  ['D4', /\bbase64\b[^;&|]*\|\s*(ba|z)?sh\b/, 'decode-and-run'],
  ['D8a', /\bdd\b[^;&|]*\bof=\/dev\//, 'raw device write'],
  ['D9', /:\(\)\s*\{\s*:\|\:&\s*\}\s*;\s*:/, 'fork bomb'],
  ['D11a', /\b(nc|ncat|netcat)\b[^;&|]*\s-e\b/, 'reverse shell'],
  ['D11b', /\/dev\/tcp\//, 'reverse shell via /dev/tcp'],
  ['D12a', /\blaunchctl\s+(bootstrap|load|submit)\b/, 'persistence via launchctl'],
  ['D12b', /\bcrontab\b\s+(?!-l\b)/, 'persistence via crontab'],
];

const SYSTEM_PATH_RE = /^\/(etc|usr|bin|sbin|System|Library|private\/etc|dev\/(disk|rdisk|sd))/;
const NETWORK_CMDS = new Set(['curl', 'wget', 'ssh', 'scp', 'rsync', 'nc', 'ncat', 'netcat', 'ftp', 'telnet', 'npx']);
const NETWORK_GIT_SUBS = new Set(['push', 'pull', 'fetch', 'clone', 'remote']);
const NETWORK_PKG_SUBS = {
  npm: new Set(['install', 'i', 'add', 'ci', 'update', 'exec', 'link', 'publish']),
  pnpm: new Set(['install', 'i', 'add', 'update', 'dlx', 'exec', 'publish']),
  yarn: new Set(['install', 'add', 'upgrade', 'dlx', 'publish']),
  pip: new Set(['install', 'download']),
  pip3: new Set(['install', 'download']),
  brew: new Set(['install', 'upgrade', 'tap']),
};
const READONLY_CMDS = new Set(['ls', 'pwd', 'cat', 'head', 'tail', 'wc', 'stat', 'file', 'du', 'df', 'which', 'date', 'grep', 'rg', 'echo', 'printf']);
const READONLY_GIT_SUBS = new Set(['status', 'diff', 'log', 'show', 'branch', 'blame']);
const FIND_MUTATING_FLAGS = new Set(['-delete', '-exec', '-execdir', '-ok', '-okdir']);
const RANK = { 'read-only': 0, mutate: 1, ask: 2, deny: 3 };

export function splitSegments(command) {
  const segments = [];
  let seg = newSegment();
  let word = '';
  let wordQuoted = false;
  let state = 'normal';

  const pushWord = () => {
    if (word) seg.words.push({ text: word, quoted: wordQuoted });
    word = '';
    wordQuoted = false;
  };
  const pushSeg = () => {
    pushWord();
    seg.text = seg.text.trim();
    if (seg.text) segments.push(seg);
    seg = newSegment();
  };

  let i = 0;
  while (i < command.length) {
    const c = command[i];
    if (state === 'single') {
      seg.text += c;
      if (c === "'") state = 'normal';
      else word += c;
      i++;
      continue;
    }
    if (state === 'double') {
      seg.text += c;
      if (c === '"') {
        state = 'normal';
      } else {
        if (c === '`' || (c === '$' && command[i + 1] === '(')) seg.hasSubstitution = true;
        word += c;
      }
      i++;
      continue;
    }
    if (c === "'") { state = 'single'; wordQuoted = true; seg.text += c; i++; continue; }
    if (c === '"') { state = 'double'; wordQuoted = true; seg.text += c; i++; continue; }
    if (c === '\\') {
      const next = command[i + 1];
      seg.text += c + (next ?? '');
      if (next) word += next;
      i += next ? 2 : 1;
      continue;
    }
    if (c === '`') { seg.hasSubstitution = true; seg.text += c; i++; continue; }
    if (c === '$' && command[i + 1] === '(') { seg.hasSubstitution = true; seg.text += c; i++; continue; }
    if (c === ';' || c === '\n' || c === '(' || c === ')') { pushSeg(); i++; continue; }
    if (c === '|') { i += command[i + 1] === '|' ? 2 : 1; pushSeg(); continue; }
    if (c === '&') { i += command[i + 1] === '&' ? 2 : 1; pushSeg(); continue; }
    if (c === '>') {
      let j = i + 1;
      if (command[j] === '>') j++;
      while (command[j] === ' ') j++;
      if (command[j] === '&') { i = j + 1; continue; }
      let target = '';
      let quote = null;
      while (j < command.length) {
        const t = command[j];
        if (quote) {
          if (t === quote) quote = null;
          else target += t;
          j++;
          continue;
        }
        if (t === "'" || t === '"') { quote = t; j++; continue; }
        if (/[\s;|&()]/.test(t)) break;
        target += t;
        j++;
      }
      if (target !== '/dev/null') {
        seg.hasRedirect = true;
        if (target) seg.redirectTargets.push(target);
      }
      i = j;
      continue;
    }
    if (/\s/.test(c)) { pushWord(); seg.text += c; i++; continue; }
    seg.text += c;
    word += c;
    i++;
  }
  pushSeg();
  return segments;
}

function newSegment() {
  return { text: '', words: [], hasSubstitution: false, hasRedirect: false, redirectTargets: [] };
}

export function classifyCommand(command, { jail }) {
  if (typeof command !== 'string' || !command.trim()) return { class: 'mutate', reason: 'empty command' };

  for (const [id, re, label] of TEXT_DENY_RULES) {
    if (re.test(command)) return { class: 'deny', reason: `${id}: ${label}` };
  }

  let worst = { class: 'read-only', reason: 'read-only' };
  for (const seg of splitSegments(command)) {
    const cls = classifySegment(seg, jail);
    if (RANK[cls.class] > RANK[worst.class]) worst = cls;
    if (worst.class === 'deny') break;
  }
  return worst;
}

function classifySegment(seg, jail) {
  const words = seg.words;
  let idx = 0;
  while (idx < words.length && !words[idx].quoted && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[idx].text)) idx++;
  const cmdWord = words[idx]?.text ?? '';
  const cmd = basename(cmdWord);
  const rest = words.slice(idx + 1);
  const unquoted = (w) => !w.quoted;
  const sub = rest.find((w) => unquoted(w) && !w.text.startsWith('-'))?.text ?? '';

  if (cmd === 'sudo' || cmd === 'doas') return { class: 'deny', reason: 'D1: privilege escalation' };
  if (cmd.startsWith('mkfs')) return { class: 'deny', reason: 'D8: filesystem creation' };
  if (cmd === 'diskutil' && /^(erase|partition)/i.test(sub)) return { class: 'deny', reason: 'D8: disk destruction' };
  if (cmd === 'shutdown' || cmd === 'reboot' || cmd === 'halt') return { class: 'deny', reason: 'D10: host power' };
  if ((cmd === 'kill' || cmd === 'killall') && rest.some((w) => unquoted(w) && (w.text === '-1' || w.text === '1'))) {
    return { class: 'deny', reason: 'D13: killing init / all processes' };
  }
  if (cmd === 'git' && sub === 'push' && rest.some((w) => unquoted(w) && (w.text === '-f' || w.text === '--force' || w.text === '--force-with-lease'))) {
    return { class: 'deny', reason: 'D5: force push' };
  }
  if (cmd === 'git' && sub === 'config' && rest.some((w) => unquoted(w) && (w.text === '--global' || w.text === '--system'))) {
    return { class: 'deny', reason: 'D14: global git tampering' };
  }
  if (cmd === 'chmod' && rest.some((w) => unquoted(w) && /^(777|a\+rwx|\+s|u\+s|g\+s)$/.test(w.text))) {
    return { class: 'deny', reason: 'D6: world-writable / setuid' };
  }
  if (cmd === 'tee' && rest.some((w) => SYSTEM_PATH_RE.test(w.text))) {
    return { class: 'deny', reason: 'D7: write to system path' };
  }
  if (seg.redirectTargets.some((t) => SYSTEM_PATH_RE.test(t))) {
    return { class: 'deny', reason: 'D7: redirect to system path' };
  }
  if (cmd === 'rm') {
    const rmClass = classifyRm(rest, jail);
    if (rmClass) return rmClass;
  }

  const askFloor = seg.hasSubstitution || cmd === 'eval';

  let base;
  if (NETWORK_CMDS.has(cmd)) base = { class: 'ask', reason: `network: ${cmd}` };
  else if (cmd === 'git' && NETWORK_GIT_SUBS.has(sub)) base = { class: 'ask', reason: `network: git ${sub}` };
  else if (NETWORK_PKG_SUBS[cmd]?.has(sub) || (cmd === 'yarn' && sub === '')) base = { class: 'ask', reason: `network: ${cmd} ${sub}`.trim() };
  else if (cmd === 'git' && READONLY_GIT_SUBS.has(sub) && !seg.hasRedirect) base = { class: 'read-only', reason: `read-only: git ${sub}` };
  else if (cmd === 'find' && !rest.some((w) => unquoted(w) && FIND_MUTATING_FLAGS.has(w.text)) && !seg.hasRedirect) base = { class: 'read-only', reason: 'read-only: find' };
  else if (READONLY_CMDS.has(cmd) && !seg.hasRedirect) base = { class: 'read-only', reason: `read-only: ${cmd}` };
  else if (rest.some((w) => unquoted(w) && w.text === '--version') && !seg.hasRedirect) base = { class: 'read-only', reason: 'read-only: --version' };
  else base = { class: 'mutate', reason: `mutate: ${cmd || 'unknown'}` };

  if (askFloor && RANK[base.class] < RANK.ask) {
    return { class: 'ask', reason: seg.hasSubstitution ? 'command substitution' : 'eval' };
  }
  return base;
}

function classifyRm(rest, jail) {
  const recursiveOrForce = rest.some(
    (w) => !w.quoted && (/^-[a-zA-Z]*[rRf]/.test(w.text) || w.text === '--recursive' || w.text === '--force'),
  );
  let afterDashes = false;
  let outside = false;
  for (const w of rest) {
    if (!afterDashes && w.text === '--' && !w.quoted) { afterDashes = true; continue; }
    if (!afterDashes && !w.quoted && w.text.startsWith('-')) continue;
    const target = w.text;
    if (target === '/' || target === '~' || target.startsWith('~/') || target.includes('$')) {
      outside = true;
      break;
    }
    try {
      jail.resolve(target);
    } catch {
      outside = true;
      break;
    }
  }
  if (outside) {
    return recursiveOrForce
      ? { class: 'deny', reason: 'D2: recursive/forced delete outside project' }
      : { class: 'ask', reason: 'rm targeting outside project' };
  }
  return null;
}

const ACTION_TABLE = {
  deny: { safe: 'block', auto: 'block', readonly: 'block' },
  ask: { safe: 'ask', auto: 'ask', readonly: 'block' },
  mutate: { safe: 'ask', auto: 'auto', readonly: 'block' },
  'read-only': { safe: 'auto', auto: 'auto', readonly: 'auto' },
};

export function actionForCommand(command, permissions, { jail }) {
  const { class: cls, reason } = classifyCommand(command, { jail });
  return { action: ACTION_TABLE[cls][permissions], class: cls, reason };
}

function realDeepest(abs) {
  let existing = abs;
  const tail = [];
  for (;;) {
    try {
      const real = realpathSync(existing);
      return tail.length ? join(real, ...tail) : real;
    } catch (err) {
      if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
        throw new JailError(`cannot resolve path: ${err.code ?? err.message}`);
      }
      const parent = dirname(existing);
      if (parent === existing) throw new JailError(`cannot resolve path: ${abs}`);
      tail.unshift(basename(existing));
      existing = parent;
    }
  }
}
