import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { redactDeep } from './redact.js';

// Append-only machine-wide action log: one line per file-change outcome
// (applied / declined / blocked), non-read-only bash execution, scope grant and undo
// restore. Lives at <sessionDir>/audit.jsonl so it survives the deletion of individual
// session transcripts and answers "what did kaku change on this machine" in one place.
// Records paths and outcomes only — never file content; lines pass the redaction layer.
//
// Best-effort by design: a failing audit write warns once on stderr but never breaks a
// running turn — it is a record, not a gate.

export function createAuditLog({ file, root = '', session = '', now = () => new Date(), errput = process.stderr }) {
  let warned = false;
  return {
    file,
    append(event) {
      try {
        mkdirSync(dirname(file), { recursive: true });
        const line = redactDeep({ at: now().toISOString(), root, session, ...event });
        appendFileSync(file, JSON.stringify(line) + '\n');
      } catch (err) {
        if (!warned) {
          warned = true;
          errput.write(`warning: audit log write failed (${err.message}) — actions are NOT being recorded to ${file}\n`);
        }
      }
    },
  };
}

// bash commands can be long and may embed secrets; the session transcript keeps the
// redacted full text, the audit line keeps a redacted prefix.
export function trimCommand(command, max = 200) {
  return command.length > max ? `${command.slice(0, max)}…` : command;
}
