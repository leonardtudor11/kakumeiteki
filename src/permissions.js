import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, dirname, basename, join, sep } from 'node:path';

export class JailError extends Error {
  constructor(message) {
    super(message);
    this.name = 'JailError';
  }
}

export function createJail(projectRoot, { platform = process.platform } = {}) {
  const root = realpathSync(projectRoot);
  // NTFS is case-insensitive: C:\Users\me\proj and C:\USERS\ME\PROJ are the SAME directory,
  // so a case-sensitive prefix test would refuse legitimate in-jail paths. macOS keeps the
  // strict compare on purpose — realpath there does not case-fold, so a case variant is a
  // different name and deny-by-default is correct (S9 in the jail suite).
  const fold = platform === 'win32' ? (s) => s.toLowerCase() : (s) => s;
  const foldedRoot = fold(root);

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
      const foldedReal = fold(real);
      if (foldedReal !== foldedRoot && !foldedReal.startsWith(foldedRoot + sep)) {
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
  /_history$/,
];

export function isSecretPath(path) {
  // split on BOTH separators: a Windows path reaching a POSIX-built check ("C:\Users\me\.ssh\id_rsa")
  // would otherwise be one long segment and match nothing
  const segments = path.split(/[\\/]+/).filter(Boolean);
  const base = segments.at(-1) ?? '';
  if (segments.some((segment) => SECRET_DIRS.has(segment))) return true;
  if (SECRET_ENV_EXCEPTIONS.has(base)) return false;
  return SECRET_BASENAMES.some((re) => re.test(base));
}

// Small models re-derive the cwd's basename as a phantom subdirectory — "working in
// …/myapp" plus absolute paths in error output becomes paths like myapp/file.js.
// Measured on 04-add-function: all three failed runs died on this confusion.
export function phantomPrefixHint(jail, path) {
  const parts = String(path).split('/');
  const base = basename(jail.root);
  if (!base || parts[0] !== base) return '';
  const stripped = parts.slice(1).join('/');
  if (!stripped) return ` — you are already inside "${base}"`;
  // never hint a path that walks upward — the jail would refuse it anyway
  if (parts.includes('..') || !existsSync(join(jail.root, stripped))) return '';
  return ` — you are already inside "${base}"; did you mean "${stripped}"?`;
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

// The bash tool runs PowerShell on Windows, so the POSIX deny-list alone is blind:
// Remove-Item -Recurse -Force, iwr|iex and RunAs elevation are the native spellings of
// rm -rf, curl|sh and sudo. PowerShell is case-insensitive → these match case-insensitively.
const WIN_TEXT_DENY_RULES = [
  ['W3', /\b(iwr|irm|curl|wget|invoke-webrequest|invoke-restmethod)\b[^;&|]*\|\s*(iex|invoke-expression)\b/i, 'download-and-run (pipe to Invoke-Expression)'],
  ['W4', /\[\s*(system\.)?convert\s*\]::frombase64string[^;&|]*\|\s*(iex|invoke-expression)\b/i, 'decode-and-run'],
  ['W1', /\bstart-process\b[^;&|]*-verb\s+runas\b/i, 'privilege escalation (RunAs)'],
  ['W12', /\b(register-scheduledtask|schtasks(\.exe)?\s+\/create|new-service|sc(\.exe)?\s+create)\b/i, 'persistence via scheduled task / service'],
  ['W13', /\bvssadmin(\.exe)?\s+delete\s+shadows\b/i, 'shadow-copy destruction'],
  ['W8', /\b(format-volume|clear-disk|initialize-disk|format(\.com)?\s+[a-z]:|diskpart)\b/i, 'disk destruction'],
  ['W14', /\bset-executionpolicy\b/i, 'weakening PowerShell execution policy'],
  ['W7', /\b(reg(\.exe)?\s+(add|delete)|set-itemproperty\b[^;&|]*hk(lm|cu):)/i, 'registry tampering'],
  ['W6', /\b(takeown(\.exe)?\b|icacls\b[^;&|]*\/grant\b[^;&|]*(everyone|users)\s*:\s*(f|m))/i, 'ownership / permission grab'],
  ['W15', /\bnet(\.exe)?\s+(user|localgroup)\b[^;&|]*\/add\b/i, 'account creation'],
  ['W10', /\b(restart-computer|stop-computer|shutdown(\.exe)?\s+\/[rs])\b/i, 'host power'],
  ['W16', /\bbcdedit\b/i, 'boot configuration tampering'],
];

// Matched against the raw command: these bypass segment classification entirely.
const WIN_TEXT_ASK_RULES = [
  ['W2b', /&\s*\(/, 'dynamic invocation — the call operator with an expression'],
  ['W2c', /\$env:\w+\s+[/-]/i, 'command name taken from an environment variable'],
];

// Windows' equivalent of SYSTEM_PATH_RE. Writing here is how you own the machine.
const WIN_SYSTEM_PATH_RE = /^([a-z]:[\\/](windows|winnt|program files|programdata|system32)|\\\\|hk(lm|cu|cr|u):)/i;

// A shell wrapper hides its payload from the classifier — the payload is re-classified.
const WIN_SHELLS = new Set(['cmd', 'powershell', 'pwsh', 'wsl', 'bash', 'sh']);
// Living-off-the-land runners: no legitimate use from a coding agent, all deny.
const WIN_LOLBINS = new Set(['mshta', 'rundll32', 'regsvr32', 'wscript', 'cscript', 'certutil', 'bitsadmin', 'msiexec']);
const WIN_ENCODED_FLAG_RE = /^-(e|ec|enc|encoded|encodedcommand)$/i;

// cmdlet (and cmd.exe builtin) equivalents of rm — same recursive/force + outside-jail logic
const WIN_DELETE_CMDS = new Set(['remove-item', 'ri', 'del', 'erase', 'rd', 'rmdir']);
const WIN_NETWORK_CMDS = new Set(['invoke-webrequest', 'iwr', 'invoke-restmethod', 'irm', 'start-bitstransfer', 'winget', 'choco', 'scoop']);
const WIN_READONLY_CMDS = new Set(['dir', 'gci', 'get-childitem', 'gc', 'get-content', 'type', 'sls', 'select-string', 'get-location', 'gl', 'measure-object', 'get-date', 'where.exe', 'write-output', 'write-host']);

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

// win: backslash is a PATH SEPARATOR, not an escape character. Parsing "C:\Windows" with
// POSIX escaping silently yields "C:Windows" — which no longer looks absolute, so every
// downstream jail/deny check on that path fails open. PowerShell escapes with a backtick.
export function splitSegments(command, { win = false } = {}) {
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
      if (win) { seg.text += c; word += c; i++; continue; }
      const next = command[i + 1];
      seg.text += c + (next ?? '');
      if (next) word += next;
      i += next ? 2 : 1;
      continue;
    }
    // backtick is PowerShell's escape character: i`wr is just iwr to the shell, and would
    // otherwise walk straight past every rule that matches on the command name
    if (c === '`' && win) {
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
      while (command[j] === ' ' || command[j] === '\t') j++;
      if (command[j] === '&') {
        // >&N / >&- duplicates a descriptor; >&FILE redirects stdout+stderr to FILE
        if (/[0-9-]/.test(command[j + 1] ?? '')) {
          j++;
          while (/[0-9-]/.test(command[j] ?? '')) j++;
          i = j;
          continue;
        }
        j++;
        while (command[j] === ' ' || command[j] === '\t') j++;
      }
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

export function classifyCommand(command, { jail, platform = process.platform } = {}) {
  if (typeof command !== 'string' || !command.trim()) return { class: 'mutate', reason: 'empty command' };

  const win = platform === 'win32';
  const textRules = win ? [...TEXT_DENY_RULES, ...WIN_TEXT_DENY_RULES] : TEXT_DENY_RULES;
  // test the deny rules against the shell's OWN reading of the string too: PowerShell
  // strips backticks, so `i`wr … | i`ex` is iwr … | iex by the time it runs
  const deTicked = win ? command.replace(/`/g, '') : command;
  for (const [id, re, label] of textRules) {
    if (re.test(command) || re.test(deTicked)) return { class: 'deny', reason: `${id}: ${label}` };
  }

  let worst = { class: 'read-only', reason: 'read-only' };
  for (const seg of splitSegments(command, { win })) {
    const cls = classifySegment(seg, jail, win);
    if (RANK[cls.class] > RANK[worst.class]) worst = cls;
    if (worst.class === 'deny') break;
  }

  if (win && worst.class !== 'deny') {
    for (const [id, re, label] of WIN_TEXT_ASK_RULES) {
      if (re.test(command) && RANK.ask > RANK[worst.class]) worst = { class: 'ask', reason: `${id}: ${label}` };
    }
  }
  return worst;
}

function classifySegment(seg, jail, win = false) {
  const words = seg.words;
  let idx = 0;
  while (idx < words.length && !words[idx].quoted && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[idx].text)) idx++;
  const cmdWord = words[idx]?.text ?? '';
  // PowerShell resolves names case-insensitively and .exe is optional — match how it dispatches
  const cmd = win ? basename(cmdWord).toLowerCase().replace(/\.(exe|com|cmd|bat|ps1)$/, '') : basename(cmdWord);
  const rest = words.slice(idx + 1);
  const unquoted = (w) => !w.quoted;
  const sub = rest.find((w) => unquoted(w) && !w.text.startsWith('-'))?.text ?? '';

  if (cmd === 'sudo' || cmd === 'doas') return { class: 'deny', reason: 'D1: privilege escalation' };
  let winReadOnly = false;
  if (win) {
    if (cmd === 'runas') return { class: 'deny', reason: 'W1: privilege escalation' };
    if (WIN_LOLBINS.has(cmd)) return { class: 'deny', reason: `W17: script/binary runner (${cmd})` };
    // an opaque base64 payload cannot be classified — refuse rather than guess
    if (rest.some((w) => !w.quoted && WIN_ENCODED_FLAG_RE.test(w.text))) {
      return { class: 'deny', reason: 'W18: encoded command (opaque payload)' };
    }
    // a shell wrapper hides its command from classification: re-classify the payload and
    // keep the worse of {ask, payload} — "cmd /c del /s /q C:\Windows" must still deny
    if (WIN_SHELLS.has(cmd)) {
      const payload = rest
        .filter((w) => !/^([-/](c|k|command|file|nop|noprofile|noninteractive|w|windowstyle|ep|executionpolicy))$/i.test(w.text))
        .map((w) => w.text)
        .join(' ')
        .trim();
      const inner = payload ? classifyCommand(payload, { jail, platform: 'win32' }) : null;
      if (inner && RANK[inner.class] >= RANK.ask) return { class: inner.class, reason: `W19: via ${cmd} — ${inner.reason}` };
      return { class: 'ask', reason: `W19: nested shell (${cmd})` };
    }
    if (cmdWord.startsWith('$') || cmdWord.startsWith('&')) {
      return { class: 'ask', reason: 'W2b: dynamic command name' };
    }
    if (cmd === 'iex' || cmd === 'invoke-expression') return { class: 'ask', reason: 'W2: Invoke-Expression' };
    if (WIN_DELETE_CMDS.has(cmd)) {
      const delClass = classifyRm(rest, jail, true);
      if (delClass) return delClass;
      return { class: 'mutate', reason: `mutate: ${cmd}` };
    }
    if (WIN_NETWORK_CMDS.has(cmd)) return { class: 'ask', reason: `network: ${cmd}` };
    // NOT an early return: a read-only command still has to face the secret-file and
    // outside-the-jail checks below (Get-Content C:\Users\other\.ssh\id_rsa is not "fine")
    if (WIN_READONLY_CMDS.has(cmd) && !seg.hasRedirect && !seg.hasSubstitution) winReadOnly = true;
  }
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
    const rmClass = classifyRm(rest, jail, win);
    if (rmClass) return rmClass;
  }

  const secretArg = rest.find((w) => isSecretPath(w.text));

  // D7's Windows twin: writing into C:\Windows, Program Files, ProgramData or the registry.
  // Quoting is NOT considered here — "C:\Program Files\x" is the same path with or without
  // the quotes that its space forces you to type.
  if (win && !winReadOnly) {
    const sysTarget = [...rest, ...seg.redirectTargets.map((t) => ({ text: t }))].find((w) => WIN_SYSTEM_PATH_RE.test(w.text));
    if (sysTarget) return { class: 'deny', reason: `W7: writes to a system path: ${sysTarget.text}` };
    // anything that changes state and reaches outside the jail gets a human in the loop
    const outside = rest.find((w) => isOutsideWindowsPath(w.text, jail));
    if (outside) return { class: 'ask', reason: `W20: touches a path outside the project: ${outside.text}` };
  }

  let base;
  if (winReadOnly) base = { class: 'read-only', reason: `read-only: ${cmd}` };
  else if (NETWORK_CMDS.has(cmd)) base = { class: 'ask', reason: `network: ${cmd}` };
  else if (cmd === 'git' && NETWORK_GIT_SUBS.has(sub)) base = { class: 'ask', reason: `network: git ${sub}` };
  else if (NETWORK_PKG_SUBS[cmd]?.has(sub) || (cmd === 'yarn' && sub === '')) base = { class: 'ask', reason: `network: ${cmd} ${sub}`.trim() };
  else if (cmd === 'git' && READONLY_GIT_SUBS.has(sub) && !seg.hasRedirect) base = { class: 'read-only', reason: `read-only: git ${sub}` };
  else if (cmd === 'find' && !rest.some((w) => unquoted(w) && FIND_MUTATING_FLAGS.has(w.text)) && !seg.hasRedirect) base = { class: 'read-only', reason: 'read-only: find' };
  else if (READONLY_CMDS.has(cmd) && !seg.hasRedirect) base = { class: 'read-only', reason: `read-only: ${cmd}` };
  else if (rest.some((w) => unquoted(w) && w.text === '--version') && !seg.hasRedirect) base = { class: 'read-only', reason: 'read-only: --version' };
  else base = { class: 'mutate', reason: `mutate: ${cmd || 'unknown'}` };

  if (RANK[base.class] < RANK.ask) {
    if (seg.hasSubstitution) return { class: 'ask', reason: 'command substitution' };
    if (cmd === 'eval') return { class: 'ask', reason: 'eval' };
    if (secretArg) return { class: 'ask', reason: `touches potential secret file: ${secretArg.text}` };
    // PowerShell expands $vars inside double quotes, so a quoted argument is not inert:
    // "$env:USERPROFILE\..\Windows" is a real path we cannot resolve statically
    if (win) {
      const dynamic = rest.find((w) => w.text.includes('$'));
      if (dynamic) return { class: 'ask', reason: `W2d: value expanded at runtime: ${dynamic.text}` };
    }
    if (base.class === 'read-only' && jail) {
      const outside = rest.find((w) => isOutsideJailPath(w.text, jail, win));
      if (outside) return { class: 'ask', reason: `reads outside the project: ${outside.text}` };
    }
  }
  return base;
}

// A Windows absolute path (C:\… or \\server\share) must be judged textually: jail.resolve
// speaks the HOST's path dialect, so on any non-Windows host "C:\Windows" would look like a
// harmless relative name and land inside the jail. Compared case-insensitively, as NTFS is.
const WIN_ABSOLUTE_RE = /^([a-z]:[\\/]|\\\\)/i;

function isOutsideWindowsPath(text, jail) {
  if (/^\$env:/i.test(text)) return true; // $env:USERPROFILE and friends
  // C:foo is drive-RELATIVE — it resolves against that drive's own current directory,
  // which is not necessarily the jail. Treat as outside; we cannot prove otherwise.
  if (/^[a-z]:(?![\\/])./i.test(text)) return true;
  // a prefix test cannot see through ".." — C:\proj\..\..\Windows starts with the root
  // and still lands outside it. Any upward segment means we cannot prove containment.
  if (/(^|[\\/])\.\.([\\/]|$)/.test(text)) return true;
  if (!WIN_ABSOLUTE_RE.test(text)) return false;
  const root = jail?.root?.toLowerCase() ?? '';
  const target = text.toLowerCase().replace(/\//g, '\\');
  return !(target === root || target.startsWith(root.endsWith('\\') ? root : root + '\\'));
}

function isOutsideJailPath(text, jail, win = false) {
  if (text === '~' || text.startsWith('~/') || text.includes('$HOME')) return true;
  if (win && isOutsideWindowsPath(text, jail)) return true;
  if (!text.startsWith('/')) return false;
  if (text === '/dev/null') return false;
  try {
    jail.resolve(text);
    return false;
  } catch {
    return true;
  }
}

function classifyRm(rest, jail, win = false) {
  // cmd.exe switches are /s /q /f — on Windows they are flags, not paths (without this,
  // "/s" resolves to C:\s, reads as an outside target, and blocks a legitimate delete)
  const isWinSwitch = (w) => win && !w.quoted && /^\/[a-z]$/i.test(w.text);
  const recursiveOrForce = rest.some(
    (w) =>
      !w.quoted &&
      (/^-[a-zA-Z]*[rRf]/.test(w.text) ||
        w.text === '--recursive' ||
        w.text === '--force' ||
        (isWinSwitch(w) && /^\/[sqf]$/i.test(w.text))),
  );
  let afterDashes = false;
  let outside = false;
  for (const w of rest) {
    if (!afterDashes && w.text === '--' && !w.quoted) { afterDashes = true; continue; }
    if (!afterDashes && !w.quoted && w.text.startsWith('-')) continue;
    if (isWinSwitch(w)) continue;
    const target = w.text;
    if (target === '/' || target === '~' || target.startsWith('~/') || target.includes('$')) {
      outside = true;
      break;
    }
    if (win && isOutsideWindowsPath(target, jail)) {
      outside = true; // C:\, C:\Windows, \\server\share — absolute and not under the root
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

export function actionForCommand(command, permissions, { jail, platform = process.platform } = {}) {
  const { class: cls, reason } = classifyCommand(command, { jail, platform });
  return { action: ACTION_TABLE[cls][permissions], class: cls, reason };
}

// File tools (edit/write) are mutate-class by definition — same action table as bash:
// safe asks (with a diff preview), auto applies, readonly blocks. Tools built without a
// config (programmatic/test use) get 'auto'; every real path goes through createTools
// with a loaded config.
export function actionForFileChange(permissions) {
  return ACTION_TABLE.mutate[permissions] ?? 'auto';
}

// --scope consent policy: jailing somewhere other than the launch directory is an
// explicit per-invocation grant. The filesystem root is never allowed; the whole home
// directory, or anything outside it, needs an interactive yes on top of the flag.
export function scopeConsent(realDir, { home = homedir() } = {}) {
  if (realDir === '/') return { level: 'refuse', reason: 'jailing to the filesystem root is never allowed' };
  if (realDir === home) return { level: 'confirm', reason: 'your ENTIRE home directory — every personal file in it' };
  if (!realDir.startsWith(home + '/')) return { level: 'confirm', reason: `a directory outside your home (${realDir})` };
  return { level: 'ok', reason: '' };
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
