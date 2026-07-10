import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { read } from './_helpers.js';

function bigFile() {
  const lines = ['// SENTINEL-START'];
  for (let i = 0; i < 240; i++) lines.push(`export function pad${i}() { return ${i}; }`);
  lines.push('export function targetFn() {', '  return 1;', '}');
  for (let i = 0; i < 240; i++) lines.push(`export function tail${i}() { return ${i}; }`);
  lines.push('// SENTINEL-END');
  return lines.join('\n') + '\n';
}

const SOURCE = bigFile();
const LINE_COUNT = SOURCE.split('\n').length;

export default {
  id: '09-edit-big-file',
  name: 'edit inside a large file',
  mode: 'build',
  setup(dir) {
    writeFileSync(join(dir, 'big.js'), SOURCE);
  },
  task: 'In big.js, find the function targetFn and change it so it returns 42 instead of 1. Do not modify any other function in the file.',
  check(dir) {
    const after = read(dir, 'big.js');
    const changed = /function targetFn\(\)\s*\{\s*return 42;\s*\}/.test(after);
    const sentinelsIntact = after.includes('// SENTINEL-START') && after.includes('// SENTINEL-END');
    const sizeIntact = after.split('\n').length === LINE_COUNT;
    const neighborsIntact = after.includes('export function pad239()') && after.includes('export function tail0()');
    const pass = changed && sentinelsIntact && sizeIntact && neighborsIntact;
    return { pass, detail: `changed=${changed} sentinels=${sentinelsIntact} size=${sizeIntact} neighbors=${neighborsIntact}` };
  },
};
