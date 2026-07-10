import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNodeTest } from './_helpers.js';

const TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from './slugify.js';
const cases = [
  ['Hello World', 'hello-world'],
  ['  --Foo!! Bar--  ', 'foo-bar'],
  ['A  B__C', 'a-b-c'],
  ['already-slugged', 'already-slugged'],
  ['', ''],
];
for (const [input, want] of cases) {
  test('slugify ' + JSON.stringify(input), () => assert.equal(slugify(input), want));
}
`;

export default {
  id: '04-add-function',
  name: 'add function per spec',
  mode: 'build',
  setup(dir) {
    writeFileSync(join(dir, 'slugify.test.js'), TEST);
    writeFileSync(join(dir, 'package.json'), '{ "type": "module" }\n');
  },
  task:
    'Create slugify.js exporting a function slugify(title) that: lowercases the input, replaces every run of characters that are not a-z or 0-9 with a single hyphen, and strips leading and trailing hyphens. The tests in slugify.test.js must pass, including the empty-string and boundary-hyphen cases.',
  check(dir) {
    return runNodeTest(dir);
  },
};
