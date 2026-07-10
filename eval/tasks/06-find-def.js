import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const NOISE = {
  'src/user.js': 'export function loadUser(id) { return db.get(id); }\n',
  'src/order.js': 'export function placeOrder(o) { return save(o); }\n',
  'src/format.js': 'export function formatMoney(n) { return `$${n}`; }\n',
  'src/logging.js': 'export function log(msg) { console.log(msg); }\n',
  'src/http.js': 'export function get(url) { return fetch(url); }\n',
  'src/finance/tax.js': 'export function computeTax(amount, rate) {\n  return amount * rate;\n}\n',
  'src/finance/discount.js': 'export function applyDiscount(p, d) { return p * (1 - d); }\n',
  'src/util/dates.js': 'export function today() { return new Date(); }\n',
};

export default {
  id: '06-find-def',
  name: 'find definition in noisy repo',
  mode: 'build',
  setup(dir) {
    for (const [rel, body] of Object.entries(NOISE)) {
      const full = join(dir, rel);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, body);
    }
  },
  task: 'Which file defines the function computeTax? Search the project and answer with the file path.',
  check(dir, { finalText }) {
    return { pass: /tax\.js/.test(finalText), detail: `finalText=${finalText.slice(0, 100)}` };
  },
};
