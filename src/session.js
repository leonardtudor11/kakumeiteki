import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function openSession({ dir, cwd, model, tier, slug = 'session', now = () => new Date() }) {
  mkdirSync(dir, { recursive: true });
  const startedAt = now().toISOString();
  const stamp = startedAt.replace(/[:.]/g, '-');
  const path = join(dir, `${stamp}-${slug}.jsonl`);
  writeLine(path, { v: 1, cwd, model, tier, startedAt });

  return {
    path,
    append(type, data = {}) {
      writeLine(path, { type, at: now().toISOString(), ...data });
    },
  };
}

export function readSession(path) {
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { header: lines[0], events: lines.slice(1) };
}

function writeLine(path, obj) {
  appendFileSync(path, JSON.stringify(obj) + '\n');
}
