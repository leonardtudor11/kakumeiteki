// Confidence is evidence, not self-assessment (IMPROVE §2): kaku computes the
// verification line from what actually ran this turn. The model never writes it —
// measured live: a model claimed "all 5 tests passed" without running anything.

const NEEDS_CHECK = new Set(['edit', 'write']); // tool verifies mechanics, not intent
const SELF_VERIFYING = new Set(['rename', 'trash']); // output carries counted evidence

// One ledger per runTurn ON PURPOSE: the line certifies THIS turn's changes; earlier
// turns already carried their own. Resume does not need to reconstruct it.
export function createLedger() {
  return { events: [] };
}

export function recordTool(ledger, { name, args, ok, output }) {
  if (!ok) return;
  if (NEEDS_CHECK.has(name)) {
    ledger.events.push({ kind: 'change', tool: name, path: String(args?.path ?? '') });
  } else if (SELF_VERIFYING.has(name)) {
    ledger.events.push({ kind: 'selfverified', tool: name });
  } else if (name === 'bash') {
    ledger.events.push({ kind: 'check', command: firstLine(args?.command), exit: bashExit(output) });
  }
}

// true when a change that needs an external check has no bash run after it
export function hasUncheckedChanges(ledger) {
  const lastChange = ledger.events.findLastIndex((e) => e.kind === 'change');
  if (lastChange === -1) return false;
  return !ledger.events.slice(lastChange + 1).some((e) => e.kind === 'check');
}

export function verificationLine(ledger) {
  const changes = ledger.events.filter((e) => e.kind === 'change');
  const selfVerified = ledger.events.filter((e) => e.kind === 'selfverified');
  const checks = ledger.events.filter((e) => e.kind === 'check');

  if (!changes.length && !selfVerified.length) return null; // read-only turn — no fake rigor

  const parts = [];
  if (changes.length) parts.push(`changed: ${dedupe(changes.map((c) => c.path)).join(', ')}`);
  if (selfVerified.length) parts.push(`${selfVerified.map((e) => e.tool).join('+')} verified by tool output`);

  if (changes.length && !checks.length) return `UNVERIFIED — no check ran · ${parts.join(' · ')}`;
  if (hasUncheckedChanges(ledger)) return `UNVERIFIED — last change came after the last check · ${parts.join(' · ')}`;

  if (checks.length) {
    const passed = checks.filter((c) => c.exit === 0).length;
    const last = checks.at(-1);
    const verdict = last.exit === 0 ? `verified ${passed}/${checks.length}` : `check FAILED ${passed}/${checks.length}`;
    const outcome = typeof last.exit === 'number' ? `exit ${last.exit}` : last.exit;
    return `${verdict} · ${last.command} → ${outcome} · ${parts.join(' · ')}`;
  }
  return `self-verified · ${parts.join(' · ')}`;
}

function bashExit(output) {
  const text = String(output ?? '');
  if (/\[timed out after \d+ ms/.test(text)) return 'timeout';
  // the bash tool appends its marker LAST — take the last match so a command that
  // merely echoes "[exit N]" mid-output cannot spoof the verdict
  const markers = [...text.matchAll(/\[exit (\d+)\]/g)];
  if (markers.length) return Number(markers.at(-1)[1]);
  if (/\[killed by /.test(text)) return 'killed';
  return 0;
}

function firstLine(command) {
  const line = String(command ?? '').split('\n')[0].trim();
  return line.length > 80 ? line.slice(0, 80) + '…' : line;
}

function dedupe(list) {
  return [...new Set(list)];
}
