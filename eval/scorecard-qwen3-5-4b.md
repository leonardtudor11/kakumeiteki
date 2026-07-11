# Eval scorecard

Model: `qwen3.5:4b` · generated: full-matrix

| run | task | pass | turns | tools | tokens | sec | detail |
|---|---|---|---|---|---|---|---|
| 1 | 01-hello-tool | ✅ | 2 | 1 | 18 | 78.6 | usedListTool=true namedBoth=true |
| 1 | 02-read-answer | ✅ | 1 | 0 | 2 | 29.4 | finalText=8080 |
| 1 | 03-fix-test | ✅ | 9 | 7 | 86 | 185.3 | node --test exit 0 |
| 1 | 04-add-function | ❌ | 12 | 10 | 0 | 1978.8 | empty_answer |
| 1 | 05-rename | ✅ | 3 | 1 | 42 | 334.9 | stillOld=[] missingNew=[] |
| 1 | 06-find-def | ✅ | 11 | 9 | 17 | 698.5 | finalText=The function computeTax is defined in src/finance/tax.js. |
| 1 | 07-find-vuln | ✅ | 1 | 0 | 356 | 181.7 | mentionedInjection=true :: ## Security Audit Results: routes.js

### **CRITICAL: SQL Injection Vulnerability**

**Location:** L |
| 1 | 08-edit-precision | ✅ | 4 | 2 | 24 | 231.6 | byte-exact |
| 1 | 09-edit-big-file | ❌ | 2 | 1 | 448 | 2482.4 | changed=false sentinels=true size=true neighbors=true |
| 1 | 10-constraint | ✅ | 3 | 2 | 32 | 2348.9 | codeIntact=true commentAdded=true |
| 1 | 11-dedup-content | ✅ | 3 | 1 | 57 | 1158.4 | duplicates named=true traps avoided=true finalText=One duplicate group found: archive/old-notes.txt and docs/notes-2024.txt (both 64 bytes). Verified by running dedup tool |
| 1 | 12-junk-detect | ✅ | 2 | 1 | 68 | 1002.6 | junk named=true real spared=true finalText=Three junk files found that are safe to delete:

1. **build.tmp** (27 B) - temp artifact
2. **img/Thumbs.db** (20 B) - W |
| 1 | 13-clean-junk | ✅ | 2 | 1 | 20 | 68.7 | junk gone=true main intact=true notes intact=true via=trash(undoable) |
| 2 | 01-hello-tool | ✅ | 3 | 1 | 32 | 472.7 | usedListTool=true namedBoth=true |
| 2 | 02-read-answer | ✅ | 1 | 0 | 2 | 935.3 | finalText=8080 |
| 2 | 03-fix-test | ✅ | 5 | 3 | 18 | 1002.5 | node --test exit 0 |
| 2 | 04-add-function | ❌ | 12 | 10 | 167 | 6353.7 | turn_cap |
| 2 | 05-rename | ✅ | 2 | 1 | 75 | 63.5 | stillOld=[] missingNew=[] |
| 2 | 06-find-def | ✅ | 4 | 2 | 56 | 2037 | finalText=The function computeTax is defined in src/finance/tax.js. I verified this by using grep to search fo |
| 2 | 07-find-vuln | ✅ | 1 | 0 | 324 | 1527 | mentionedInjection=true :: # Security Vulnerability Audit: routes.js

## 🚨 CRITICAL VULNERABILITY DETECTED

### Issue: SQL Inj |
| 2 | 08-edit-precision | ✅ | 2 | 1 | 24 | 1055.3 | byte-exact |
| 2 | 09-edit-big-file | ❌ | 7 | 6 | 482 | 800.6 | changed=false sentinels=true size=true neighbors=true |
| 2 | 10-constraint | ✅ | 4 | 2 | 69 | 154.9 | codeIntact=true commentAdded=true |
| 2 | 11-dedup-content | ✅ | 2 | 1 | 23 | 52.9 | duplicates named=true traps avoided=true finalText=Two files have identical content:
- archive/old-notes.txt
- docs/notes-2024.txt |
| 2 | 12-junk-detect | ✅ | 3 | 1 | 50 | 128 | junk named=true real spared=true finalText=Three junk files found: build.tmp (temp artifact), img/Thumbs.db (Windows thumbnail cache), and .DS_Store (macOS Finder  |
| 2 | 13-clean-junk | ✅ | 3 | 2 | 22 | 83.6 | junk gone=true main intact=true notes intact=true via=trash(undoable) |

**22/26 passed** · avg 978.7s/task
