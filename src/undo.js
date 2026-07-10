import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Pre-mutation backups + undo stack. One dir per session, next to the session JSONL
// (<stamp>-session.undo/): numbered pre-image blobs + manifest.jsonl. Mutating tools call
// record() BEFORE touching the file, so a backup exists for every change or the change
// does not happen. Blobs are verbatim copies, deliberately NOT redacted — a redacted
// backup could not restore the user's file (the manifest carries paths only, no content).

export function undoDirFor(sessionPath) {
  return sessionPath.replace(/\.jsonl$/, '.undo');
}

export function createUndoRecorder(sessionPath, { now = () => new Date() } = {}) {
  const dir = undoDirFor(sessionPath);
  // resumed sessions keep numbering monotonic across processes
  let n = readManifest(dir).entries.reduce((m, e) => Math.max(m, e.n), 0);
  return {
    dir,
    // content = pre-image when the caller already read it; otherwise read here.
    // Throws on an unreadable existing file: no backup -> no mutation.
    record({ path, real, op, content }) {
      mkdirSync(dir, { recursive: true });
      let existed = true;
      let pre = content;
      if (pre === undefined) {
        try {
          pre = readFileSync(real);
        } catch (err) {
          if (err.code !== 'ENOENT') throw err;
          existed = false;
        }
      }
      n += 1;
      if (existed) writeFileSync(join(dir, `${n}.blob`), pre);
      appendFileSync(join(dir, 'manifest.jsonl'), JSON.stringify({ n, at: now().toISOString(), op, path, real, existed }) + '\n');
    },
  };
}

export function readManifest(dir) {
  const file = join(dir, 'manifest.jsonl');
  if (!existsSync(file)) return { entries: [], undone: new Set() };
  const entries = [];
  const undone = new Set();
  for (const line of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const e = JSON.parse(line);
    if (e.undone) undone.add(e.undone);
    else entries.push(e);
  }
  return { entries, undone };
}

// Most recent entry not yet undone, or null. Repeated undo walks the stack backwards.
export function nextUndo(dir) {
  const { entries, undone } = readManifest(dir);
  for (let i = entries.length - 1; i >= 0; i--) if (!undone.has(entries[i].n)) return entries[i];
  return null;
}

// Put the file back to its pre-mutation state: rewrite the blob, or delete the file the
// op created. Marks the entry consumed in the manifest (append-only, crash-safe).
export function restore(dir, entry, { now = () => new Date() } = {}) {
  if (entry.existed) {
    const blob = readFileSync(join(dir, `${entry.n}.blob`));
    mkdirSync(dirname(entry.real), { recursive: true });
    writeFileSync(entry.real, blob);
  } else {
    rmSync(entry.real, { force: true });
  }
  appendFileSync(join(dir, 'manifest.jsonl'), JSON.stringify({ undone: entry.n, at: now().toISOString() }) + '\n');
}
