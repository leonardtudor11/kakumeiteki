# Eval scorecard

Model: `qwen2.5-coder:3b` · generated: full-matrix

| run | task | pass | turns | tools | tokens | sec | detail |
|---|---|---|---|---|---|---|---|
| 1 | 01-hello-tool | ✅ | 5 | 4 | 382 | 26.3 | usedListTool=true namedBoth=false |
| 1 | 02-read-answer | ✅ | 1 | 0 | 47 | 8.6 | finalText=```json
{"name": "edit", "args": {"path": "config.js", "old": "export const PORT |
| 1 | 03-fix-test | ✅ | 2 | 1 | 67 | 9.9 | node --test exit 0 |
| 1 | 04-add-function | ❌ | 12 | 12 | 867 | 58.2 | turn_cap |
| 1 | 05-rename | ❌ | 2 | 1 | 131 | 13.6 | stillOld=[calc.js,cart.js,report.js] missingNew=[calc.js,cart.js,report.js] |
| 1 | 06-find-def | ✅ | 3 | 2 | 202 | 15.1 | finalText=The file `src/finance/tax.js` does not define the function `computeTax`. There is no such function i |
| 1 | 07-find-vuln | ✅ | 2 | 1 | 157 | 13.1 | mentionedInjection=true :: The most serious issue identified in the `routes.js` file is SQL injection due to the use of string  |
| 1 | 08-edit-precision | ✅ | 2 | 1 | 65 | 10.2 | byte-exact |
| 1 | 09-edit-big-file | ❌ | 3 | 3 | 326 | 22.1 | changed=false sentinels=true size=true neighbors=true |
| 1 | 10-constraint | ❌ | 1 | 0 | 57 | 9.9 | codeIntact=true commentAdded=false |
| 2 | 01-hello-tool | ✅ | 5 | 4 | 251 | 19.8 | usedListTool=true namedBoth=false |
| 2 | 02-read-answer | ❌ | 2 | 1 | 63 | 9.5 | finalText=The config file does not contain a PORT number. Please provide the correct path  |
| 2 | 03-fix-test | ❌ | 4 | 3 | 107 | 13.7 | test failed: exit 1 |
| 2 | 04-add-function | ❌ | 4 | 2 | 362 | 26.4 | test failed: exit 1 |
| 2 | 05-rename | ❌ | 10 | 15 | 729 | 55.6 | stillOld=[cart.js,report.js] missingNew=[] |
| 2 | 06-find-def | ✅ | 2 | 1 | 53 | 9.9 | finalText=`src/finance/tax.js` |
| 2 | 07-find-vuln | ✅ | 2 | 1 | 439 | 23.8 | mentionedInjection=true :: The issue identified is improper handling of untrusted input in the SQL query. By using string conca |
| 2 | 08-edit-precision | ✅ | 2 | 1 | 143 | 13.9 | byte-exact |
| 2 | 09-edit-big-file | ❌ | 2 | 1 | 46 | 58.1 | changed=false sentinels=true size=true neighbors=true |
| 2 | 10-constraint | ❌ | 8 | 6 | 282 | 24.1 | codeIntact=true commentAdded=false |

**10/20 passed** · avg 22.1s/task
