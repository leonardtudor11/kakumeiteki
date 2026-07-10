# Eval scorecard

Model: `qwen2.5-coder:3b` · generated: full-matrix

| run | task | pass | turns | tools | tokens | sec | detail |
|---|---|---|---|---|---|---|---|
| 1 | 01-hello-tool | ✅ | 2 | 1 | 145 | 16.9 | usedListTool=true namedBoth=true |
| 1 | 02-read-answer | ✅ | 2 | 1 | 42 | 9.5 | finalText=8080
- Verified by checking the `config.js` file, which contains `PORT: 8080`. |
| 1 | 03-fix-test | ❌ | 4 | 4 | 327 | 25.4 | test failed: exit 1 |
| 1 | 04-add-function | ❌ | 2 | 0 | 195 | 20.4 | protocol_failed |
| 1 | 05-rename | ❌ | 2 | 6 | 251 | 23.9 | stillOld=[calc.js,cart.js,report.js] missingNew=[calc.js,cart.js,report.js] |
| 1 | 06-find-def | ✅ | 1 | 0 | 16 | 7.1 | finalText=```json
{"path": "src/components/compute-tax.js"}
``` |
| 1 | 07-find-vuln | ❌ | 2 | 1 | 35 | 8.3 | mentionedInjection=false :: <result>
No routes.js file found in the project.
</result> |
| 1 | 08-edit-precision | ❌ | 6 | 6 | 342 | 29.3 | got: "export const RETRIES = 3;\nexport const TIMEOUT = 30;\nexport const BACKOFF = 3;\n" |
| 1 | 09-edit-big-file | ❌ | 2 | 1 | 51 | 9.2 | changed=false sentinels=true size=true neighbors=true |
| 1 | 10-constraint | ❌ | 5 | 4 | 492 | 35.2 | codeIntact=true commentAdded=false |
| 2 | 01-hello-tool | ✅ | 3 | 2 | 113 | 13.7 | usedListTool=true namedBoth=true |
| 2 | 02-read-answer | ✅ | 2 | 1 | 21 | 11.2 | finalText=8080 |
| 2 | 03-fix-test | ❌ | 3 | 3 | 191 | 29.7 | test failed: exit 1 |
| 2 | 04-add-function | ❌ | 2 | 0 | 134 | 20.6 | protocol_failed |
| 2 | 05-rename | ❌ | 2 | 1 | 92 | 15.3 | stillOld=[calc.js,cart.js,report.js] missingNew=[calc.js,cart.js,report.js] |
| 2 | 06-find-def | ✅ | 3 | 2 | 176 | 20.3 | finalText=The function `computeTax` is defined in `src/finance/tax.js`. The previous result was correct, but t |
| 2 | 07-find-vuln | ❌ | 2 | 1 | 82 | 11.5 | mentionedInjection=false :: There is no file named `src/routes.js` in the project directory. This suggests there might be a mist |
| 2 | 08-edit-precision | ❌ | 2 | 1 | 66 | 11.8 | got: "export const RETRIES = 3;\nexport const TIMEOUT = 30;\nexport const BACKOFF = 3;\n" |
| 2 | 09-edit-big-file | ❌ | 6 | 5 | 298 | 89.6 | changed=false sentinels=true size=true neighbors=true |
| 2 | 10-constraint | ❌ | 2 | 1 | 121 | 12.6 | codeIntact=true commentAdded=false |

**6/20 passed** · avg 21.1s/task
