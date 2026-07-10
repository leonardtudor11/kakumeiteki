# Eval scorecard

Model: `qwen3.5:4b` · generated: full-matrix

| run | task | pass | turns | tools | tokens | sec | detail |
|---|---|---|---|---|---|---|---|
| 1 | 01-hello-tool | ✅ | 2 | 1 | 16 | 50.2 | usedListTool=true namedBoth=true |
| 1 | 02-read-answer | ✅ | 1 | 0 | 2 | 26 | finalText=8080 |
| 1 | 03-fix-test | ✅ | 3 | 2 | 0 | 76.2 | node --test exit 0 |
| 1 | 04-add-function | ✅ | 12 | 11 | 175 | 385.1 | node --test exit 0 |
| 1 | 05-rename | ❌ | 12 | 16 | 0 | 342.4 | stillOld=[report.js] missingNew=[report.js] |
| 1 | 06-find-def | ❌ | 5 | 4 | 0 | 133.4 | finalText= |
| 1 | 07-find-vuln | ✅ | 1 | 0 | 272 | 67 | mentionedInjection=true :: ## Security Audit: routes.js

### Critical Vulnerability: SQL Injection

**Location:** `/user` endpo |
| 1 | 08-edit-precision | ✅ | 2 | 1 | 0 | 46.1 | byte-exact |
| 1 | 09-edit-big-file | ❌ | 3 | 2 | 391 | 335.9 | changed=false sentinels=true size=true neighbors=true |
| 1 | 10-constraint | ✅ | 3 | 2 | 27 | 107.4 | codeIntact=true commentAdded=true |
| 2 | 01-hello-tool | ✅ | 2 | 1 | 19 | 56.6 | usedListTool=true namedBoth=true |
| 2 | 02-read-answer | ✅ | 1 | 0 | 2 | 33 | finalText=8080 |
| 2 | 03-fix-test | ✅ | 6 | 5 | 0 | 205.6 | node --test exit 0 |
| 2 | 04-add-function | ❌ | 2 | 1 | 0 | 76.9 | test failed: exit 1 |
| 2 | 05-rename | ❌ | 4 | 3 | 0 | 120.1 | stillOld=[calc.js,cart.js,report.js] missingNew=[calc.js,cart.js,report.js] |
| 2 | 06-find-def | ❌ | 2 | 1 | 0 | 36.6 | finalText= |
| 2 | 07-find-vuln | ✅ | 1 | 0 | 298 | 75.5 | mentionedInjection=true :: ## Security Audit Findings

### CRITICAL: SQL Injection Vulnerability

**Location:** `app.get('/user |
| 2 | 08-edit-precision | ✅ | 2 | 1 | 2 | 59.4 | byte-exact |
| 2 | 09-edit-big-file | ❌ | 2 | 1 | 693 | 324.8 | changed=false sentinels=true size=true neighbors=true |
| 2 | 10-constraint | ✅ | 2 | 1 | 0 | 67.3 | codeIntact=true commentAdded=true |

**13/20 passed** · avg 131.3s/task
