# Eval scorecard

Model: `qwen3.5:4b` · generated: full-matrix

| run | task | pass | turns | tools | tokens | sec | detail |
|---|---|---|---|---|---|---|---|
| 1 | 01-hello-tool | ✅ | 2 | 1 | 18 | 40.1 | usedListTool=true namedBoth=true |
| 1 | 02-read-answer | ✅ | 2 | 1 | 2 | 28.7 | finalText=8080 |
| 1 | 03-fix-test | ❌ | 7 | 6 | 0 | 108.3 | test failed: exit 1 |
| 1 | 04-add-function | ❌ | 10 | 9 | 0 | 220.6 | test failed: exit 1 |
| 1 | 05-rename | ❌ | 2 | 1 | 0 | 34.7 | stillOld=[calc.js,cart.js,report.js] missingNew=[calc.js,cart.js,report.js] |
| 1 | 06-find-def | ✅ | 2 | 1 | 18 | 32.7 | finalText=The function `computeTax` is defined in `src/finance/tax.js`. |
| 1 | 07-find-vuln | ❌ | 2 | 1 | 0 | 33.4 | mentionedInjection=false ::  |
| 1 | 08-edit-precision | ❌ | 2 | 1 | 0 | 41.2 | got: "export const RETRIES = 3;\nexport const TIMEOUT = 30;\nexport const BACKOFF = 3;\n" |
| 1 | 09-edit-big-file | ❌ | 2 | 1 | 125 | 296.9 | changed=false sentinels=true size=true neighbors=true |
| 1 | 10-constraint | ✅ | 5 | 4 | 36 | 130.4 | codeIntact=true commentAdded=true |
| 2 | 01-hello-tool | ✅ | 2 | 1 | 18 | 32.8 | usedListTool=true namedBoth=true |
| 2 | 02-read-answer | ✅ | 2 | 1 | 2 | 27.9 | finalText=8080 |
| 2 | 03-fix-test | ❌ | 2 | 1 | 0 | 34.1 | test failed: exit 1 |
| 2 | 04-add-function | ✅ | 10 | 9 | 0 | 340.7 | node --test exit 0 |
| 2 | 05-rename | ❌ | 6 | 5 | 0 | 112.4 | stillOld=[calc.js,cart.js,report.js] missingNew=[calc.js,cart.js,report.js] |
| 2 | 06-find-def | ✅ | 2 | 1 | 6 | 34.3 | finalText=src/finance/tax.js |
| 2 | 07-find-vuln | ✅ | 3 | 2 | 233 | 104.7 | mentionedInjection=true :: ## Security Vulnerability: SQL Injection

**Location:** `routes.js`, line 6

```javascript
const row |
| 2 | 08-edit-precision | ✅ | 4 | 3 | 23 | 99.3 | byte-exact |
| 2 | 09-edit-big-file | ❌ | 8 | 7 | 296 | 457.9 | changed=false sentinels=true size=true neighbors=true |
| 2 | 10-constraint | ✅ | 5 | 4 | 0 | 120 | codeIntact=true commentAdded=true |

**11/20 passed** · avg 116.6s/task
