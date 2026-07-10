import { appendFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function openSession({ dir, cwd, model, tier, slug = 'session', now = () => new Date() }) {
  mkdirSync(dir, { recursive: true });
  const startedAt = now().toISOString();
  const stamp = startedAt.replace(/[:.]/g, '-');
  const path = join(dir, `${stamp}-${slug}.jsonl`);
  writeLine(path, { v: 1, cwd, model, tier, startedAt });
  return sessionHandle(path, now);
}

export function reopenSession(path, { now = () => new Date() } = {}) {
  if (!existsSync(path)) throw new Error(`cannot resume — session file not found: ${path}`);
  return sessionHandle(path, now);
}

function sessionHandle(path, now) {
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

// Rebuild the model-facing message array from logged events. Meta events (tool_call,
// compaction, cancelled, endpoint_error, protocol_failed, turn_cap, doom_loop) are skipped.
// A tool call left without its result (crash/cancel mid-turn) gets a synthesized
// [interrupted] result so the chat history stays API-coherent.
export function rebuildMessages(events) {
  const messages = [];
  let pending = [];

  const flushInterrupted = () => {
    for (const call of pending) messages.push({ role: 'tool', name: call.name, content: '[interrupted]' });
    pending = [];
  };

  for (const e of events) {
    switch (e.type) {
      case 'user_message':
        flushInterrupted();
        messages.push({ role: 'user', content: e.content ?? '' });
        break;
      case 'assistant_message':
        flushInterrupted();
        messages.push({ role: 'assistant', content: e.content ?? '', toolCalls: e.toolCalls ?? [] });
        pending = [...(e.toolCalls ?? [])];
        break;
      case 'tool_result':
        messages.push({ role: 'tool', name: e.name, content: e.output ?? '' });
        if (pending.length) pending.shift();
        break;
      case 'repair':
        messages.push({ role: 'user', content: `[tool protocol error] ${e.message}` });
        break;
      case 'doom_nudge':
        messages.push({ role: 'user', content: '[loop guard] repeated tool call detected — try a different approach.' });
        break;
      default:
        break;
    }
  }
  flushInterrupted();
  return messages;
}

export function loadSession(path) {
  const { header, events } = readSession(path);
  return { header, messages: rebuildMessages(events) };
}

export function latestSessionFor(dir, cwd) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  let best = null;
  for (const f of files) {
    const path = join(dir, f);
    let header;
    try {
      header = readSession(path).header;
    } catch {
      continue;
    }
    if (header?.cwd !== cwd) continue;
    if (!best || (header.startedAt ?? '') > best.startedAt) best = { path, startedAt: header.startedAt ?? '' };
  }
  return best?.path ?? null;
}

export function resolveSessionPath(sessionDir, idOrPath) {
  if (existsSync(idOrPath)) return idOrPath;
  const candidate = idOrPath.endsWith('.jsonl') ? idOrPath : `${idOrPath}.jsonl`;
  const inDir = join(sessionDir, candidate);
  if (existsSync(inDir)) return inDir;
  throw new Error(`session not found: ${idOrPath}`);
}

function writeLine(path, obj) {
  appendFileSync(path, JSON.stringify(obj) + '\n');
}
