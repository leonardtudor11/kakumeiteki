// Zero-dep change previews for the safe-mode confirm prompt. Deliberately NOT a diff
// algorithm: edit is an exact-string replacement so old/new ARE the change; write trims
// the common prefix/suffix lines and shows the middle. Capped so a huge file cannot
// flood the prompt.
const CAP = 12;

const sign = (lines, s) => lines.map((l) => `${s} ${l}`);
const cap = (lines) => (lines.length > CAP ? [...lines.slice(0, CAP), `… ${lines.length - CAP} more lines`] : lines);

export function previewEdit({ path, old, new: replacement, count = 1 }) {
  const head = `edit ${path}${count > 1 ? ` (${count} occurrences)` : ''}:`;
  return [head, ...cap(sign(old.split('\n'), '-')), ...cap(sign(replacement.split('\n'), '+'))].join('\n');
}

export function previewWrite({ path, before, content }) {
  const newLines = content.split('\n');
  if (before === undefined) {
    return [`write ${path} (new file, ${newLines.length} lines):`, ...cap(sign(newLines, '+'))].join('\n');
  }
  const oldLines = before.split('\n');
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start++;
  let endOld = oldLines.length;
  let endNew = newLines.length;
  while (endOld > start && endNew > start && oldLines[endOld - 1] === newLines[endNew - 1]) { endOld--; endNew--; }
  const removed = oldLines.slice(start, endOld);
  const added = newLines.slice(start, endNew);
  if (!removed.length && !added.length) return `overwrite ${path}: (no textual change)`;
  return [`overwrite ${path}:`, ...cap(sign(removed, '-')), ...cap(sign(added, '+'))].join('\n');
}
