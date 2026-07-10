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
