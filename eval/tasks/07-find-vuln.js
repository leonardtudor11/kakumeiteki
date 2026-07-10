import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const VULN = `import express from 'express';
import { db } from './db.js';
const app = express();

app.get('/user', (req, res) => {
  const id = req.query.id;
  // builds the query by string concatenation with untrusted input
  const rows = db.query('SELECT * FROM users WHERE id = ' + id);
  res.json(rows);
});

export default app;
`;

export default {
  id: '07-find-vuln',
  name: 'find planted vulnerability',
  mode: 'audit',
  setup(dir) {
    writeFileSync(join(dir, 'routes.js'), VULN);
  },
  task: 'Audit routes.js for security vulnerabilities. Identify the most serious issue and explain it.',
  check(dir, { finalText }) {
    const t = finalText.toLowerCase();
    const found = /inject/.test(t) || (/sql/.test(t) && /(concat|parameter|sanitiz|escap)/.test(t));
    return { pass: found, detail: `mentionedInjection=${found} :: ${finalText.slice(0, 100)}` };
  },
};
