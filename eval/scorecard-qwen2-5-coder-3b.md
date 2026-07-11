# Eval scorecard

Model: `qwen2.5-coder:3b` · generated: full-matrix

| run | task | pass | turns | tools | tokens | sec | detail |
|---|---|---|---|---|---|---|---|
| 1 | 01-hello-tool | ✅ | 2 | 1 | 43 | 15.5 | usedListTool=true namedBoth=true |
| 1 | 02-read-answer | ✅ | 4 | 2 | 158 | 21.8 | finalText=The port number in `config.js` is 8080.

I've verified that this is correct by r |
| 1 | 03-fix-test | ❌ | 2 | 1 | 89 | 15.4 | test failed: exit 1 |
| 1 | 04-add-function | ❌ | 3 | 2 | 131 | 18.6 | test failed: exit 1 |
| 1 | 05-rename | ❌ | 11 | 19 | 1466 | 98.6 | stillOld=[calc.js,cart.js,report.js] missingNew=[calc.js,cart.js,report.js] |
| 1 | 06-find-def | ❌ | 12 | 14 | 1648 | 98.8 | finalText=Great! The `computeTax` function is now imported into `src/app.js`. If you have any more tasks or ne |
| 1 | 07-find-vuln | ✅ | 2 | 1 | 299 | 23.6 | mentionedInjection=true :: The most serious issue identified in `routes.js` is the use of string concatenation to build SQL que |
| 1 | 08-edit-precision | ✅ | 3 | 2 | 244 | 23.9 | byte-exact |
| 1 | 09-edit-big-file | ❌ | 4 | 4 | 268 | 31.7 | changed=false sentinels=true size=true neighbors=true |
| 1 | 10-constraint | ❌ | 10 | 9 | 363 | 34.6 | codeIntact=true commentAdded=false |
| 1 | 11-dedup-content | ✅ | 2 | 1 | 41 | 13.4 | duplicates named=true traps avoided=true finalText=Done. The identified true duplicates are `archive/old-notes.txt` and `docs/notes-2024.txt`. |
| 1 | 12-junk-detect | ✅ | 2 | 1 | 80 | 15.9 | junk named=true real spared=true finalText=```plaintext
build.tmp: temp file, 27 B
img/Thumbs.db: Windows thumbnail cache, 20 B
.DS_Store: macOS Finder litter, 15  |
| 1 | 13-clean-junk | ✅ | 2 | 1 | 23 | 12.7 | junk gone=true main intact=true notes intact=true via=trash(undoable) |
| 2 | 01-hello-tool | ✅ | 5 | 4 | 222 | 23.2 | usedListTool=true namedBoth=false |
| 2 | 02-read-answer | ❌ | 2 | 1 | 45 | 14.2 | finalText=Port number in config.js is now 3000. |
| 2 | 03-fix-test | ❌ | 2 | 1 | 46 | 14.6 | test failed: exit 1 |
| 2 | 04-add-function | ❌ | 7 | 5 | 848 | 68.5 | test failed: exit 1 |
| 2 | 05-rename | ❌ | 9 | 7 | 432 | 41.5 | stillOld=[cart.js,report.js] missingNew=[report.js] |
| 2 | 06-find-def | ✅ | 3 | 2 | 126 | 18 | finalText=<tool_error>Could not find "function computeTax(amount, rate)" in src/finance/tax.js. Please check t |
| 2 | 07-find-vuln | ✅ | 2 | 1 | 267 | 22.5 | mentionedInjection=true :: The most serious issue identified is the use of string concatenation to build SQL queries, which can |
| 2 | 08-edit-precision | ❌ | 12 | 12 | 313 | 38.3 | turn_cap |
| 2 | 09-edit-big-file | ❌ | 2 | 1 | 77 | 14.3 | changed=false sentinels=true size=true neighbors=true |
| 2 | 10-constraint | ❌ | 3 | 1 | 105 | 17.8 | codeIntact=false commentAdded=false |
| 2 | 11-dedup-content | ✅ | 2 | 1 | 50 | 14 | duplicates named=true traps avoided=true finalText=Done. To verify:

1. `archive/old-notes.txt` and `docs/notes-2024.txt` have identical content.

The task is complete. |
| 2 | 12-junk-detect | ✅ | 2 | 1 | 30 | 13.6 | junk named=true real spared=true finalText=Done. Safe to delete: `build.tmp`, `img/Thumbs.db`, `.DS_Store`. |
| 2 | 13-clean-junk | ✅ | 2 | 1 | 51 | 13.9 | junk gone=true main intact=true notes intact=true via=trash(undoable) |

**13/26 passed** · avg 28.4s/task
