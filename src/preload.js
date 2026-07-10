import { readFileSync, statSync } from 'node:fs';
import { isSecretPath } from './permissions.js';
import { redact } from './redact.js';

const PATH_RE = /[A-Za-z0-9_./-]*[A-Za-z0-9_-]+\.[A-Za-z]{1,6}/g;

// Speed lever: if the task names files that exist in-jail, attach their contents to the
// first user message so a small model skips the separate read turn(s).
export function preloadNamedFiles(task, { jail, maxFiles = 2, maxBytes = 6144 } = {}) {
  const seen = new Set();
  const blocks = [];
  for (const token of task.match(PATH_RE) ?? []) {
    if (blocks.length >= maxFiles) break;
    if (seen.has(token) || isSecretPath(token)) continue;
    seen.add(token);
    let abs;
    try {
      abs = jail.resolve(token);
    } catch {
      continue;
    }
    let stat;
    try {
      stat = statSync(abs);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size > maxBytes) continue;
    blocks.push(`--- ${token} (already read for you — do not call the read tool on it) ---\n${redact(readFileSync(abs, 'utf8'))}`);
  }
  return blocks.length ? `\n\n[context: named files preloaded]\n${blocks.join('\n')}` : '';
}
