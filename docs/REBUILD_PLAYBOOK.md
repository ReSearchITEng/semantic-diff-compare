# SemantiCompare — Complete Rebuild Playbook

This document provides the complete architectural specification, data contracts, and module-by-module implementation blueprint required to rebuild **SemantiCompare** from scratch or port it to a desktop runtime (Tauri / Electron).

---

## 1. Dependencies & Runtime Stack

- **Runtime**: Client-side TypeScript + React 19 + Vite + Tailwind CSS v4
- **Core Parsing Libraries**:
  - `yaml` (`^2.x`): Full YAML 1.2 parsing and formatting.
  - `smol-toml` (`^1.x`): Fast, spec-compliant TOML v1.0 parsing and serialization.
  - `lucide-react`: UI iconography.
- **Zero Backend Requirement**: All parsing, repair, semantic alignment, patching, and formatting execute deterministically in pure TypeScript modules under `/src/diff/`, completely decoupled from React.

---

## 2. Clean Architecture Separation

```text
/src
├── diff/                        # Pure TypeScript domain engine (100% unit-testable via node:test)
│   ├── types.ts                 # Core interfaces: ParsedDocument, AlignedDiffRow, DiffCell, DiffOptions
│   ├── jsoncRepair.ts           # Comment extraction, single-quote normalization & truncated JSON repair
│   ├── yamlLinter.ts            # YAML tab indentation detector, tab-to-space converter & indent detector
│   ├── parser.ts                # Format autodetection & unified parser (JSON, JSONC, YAML, TOML)
│   ├── semanticDiff.ts          # Option A tree alignment, multiset list matching, folding & CRD filtering
│   ├── inPlacePatcher.ts        # Bracket-aware JSONPath getter/setter, selective tree merge & inline parser
│   ├── formatter.ts             # Format conversion (JSON/JSONC/YAML/TOML), prettify & pure JSON export
│   ├── diffReport.ts            # Structured Diff Report generator (Markdown, JSON, Plain Text)
│   ├── presets.ts               # Built-in interactive demo scenarios
│   └── diffEngine.test.ts       # Automated unit test suite (run via tsx --test)
└── components/                  # React UI layer
    ├── Header.tsx               # Top toolbar (presets, Undo/Redo, toggles, format menu, Export Report)
    ├── DiffPane.tsx             # Left/Right split pane with format switcher, folding & inline value editor
    ├── DiffGutter.tsx           # Central action gutter with ▸/◂ merge buttons & F7/F8 diff navigation
    ├── BottomLineInspector.tsx  # Optional Split Line Inspector bar with intra-line character diffing
    ├── StatusBar.tsx            # Live JSONPath breadcrumb, diff counters & bottom bar quick toggle
    ├── MergeAllModal.tsx        # Selective Merge All modal (skip vs. include ignorable CRD fields)
    ├── DiffReportModal.tsx      # Diff Report preview, copy & download modal (.md / .json / .txt)
    ├── IgnoredFieldsModal.tsx   # K8s CRD ignored fields filter editor
    ├── RawEditorModal.tsx       # Side-by-side raw text editor modal
    └── DocsModal.tsx            # In-app ADR & Developer Documentation reader
```

---

## 3. Core Data Contracts (`/src/diff/types.ts`)

### `ParsedDocument`
Represents a parsed pane document along with its detected formatting characteristics:
- `rawText: string` — Original text in the pane.
- `format: 'json' | 'jsonc' | 'yaml' | 'toml'` — Detected or explicitly selected syntax format.
- `data: any` — Normalized JavaScript value tree.
- `comments: CommentToken[]` — Extracted `//`, `/* */`, or `#` comments with 1-based line numbers.
- `indentStyle: { type: 'space' | 'tab'; size: number }` — Detected indentation style.
- `quoteStyle: 'single' | 'double'` — Detected string quote preference.
- `hasTrailingCommas: boolean` — Whether trailing commas were found.
- `repairInfo?: RepairInfo` — Present if aggressive JSONC auto-repair stepped in (`wasRepaired`, `breakpointLine`, `breakpointCol`, `repairsMade`).
- `yamlIssues: YamlTabIssue[]` — Line numbers and tab counts for illegal YAML tab indentation.

### `AlignedDiffRow`
Represents a single horizontally aligned row across the Left pane, Central Gutter, and Right pane:
- `id: string` — Stable row identifier.
- `left?: DiffCell` — Cell metadata for the Left pane (`undefined` when row is a spacer on the Left).
- `right?: DiffCell` — Cell metadata for the Right pane (`undefined` when row is a spacer on the Right).
- `status: 'unchanged' | 'modified' | 'added_right' | 'deleted_right' | 'ignored_diff' | 'comment_diff' | 'spacer'`
- `path: string` — Exact JSONPath (e.g. `$.spec.template.spec.containers[0].image` or `$.metadata.labels['app.kubernetes.io/name']`).
- `blockId?: string` — Unique ID if this row opens or closes a collapsible block.
- `ancestorBlockIds?: string[]` — Ordered list of all enclosing parent `blockId`s. A row is hidden when any ID in `ancestorBlockIds` is present in the `foldedBlocks` set.

---

## 4. Step-by-Step Algorithmic Rules

### Step 1: Format Detection (`detectFormat` in `parser.ts`)
1. Inspect trimmed text:
   - Starts with `{` or `[`:
     - If it contains `//`, `/*`, trailing commas `,}`, `,]`, or single-quoted keys/strings, classify as `jsonc`; otherwise `json`.
   - Contains `[section]` headers on their own lines and `key = value` assignments without `:` mappings:
     - Verify with `parseToml(trimmed)`; if valid, classify as `toml`.
   - Otherwise classify as `yaml`.

### Step 2: Aggressive JSONC Auto-Repair (`repairJsonc` in `jsoncRepair.ts`)
1. Scan character-by-character tracking string state (`"` or `'`), escape sequences `\`, line comments `//`, and block comments `/* */`.
2. Convert single-quoted strings `'...'` into valid escaped double-quoted JSON strings `"..."` while preserving line breaks so line numbers remain accurate.
3. Strip trailing commas before `}` or `]`.
4. If `JSON.parse` still fails (truncated payload):
   - Record the end of the input as `breakpointOffset`, `breakpointLine`, and `breakpointCol`.
   - Close any unclosed string literal `"`.
   - Strip any dangling `:` or `,` at the truncation point; if a key was left without a value (e.g. `"reason":`), append `null`.
   - Pop the open `{` / `[` stack in reverse order and append matching `}` / `]` delimiters.

### Step 3: Option A Semantic Alignment (`computeSemanticDiff` in `semanticDiff.ts`)
1. **Cross-Format Delimiter Rule**:
   - Compute `leftUsesBraces = leftDoc.format === 'json' || leftDoc.format === 'jsonc'` and `rightUsesBraces = rightDoc.format === 'json' || rightDoc.format === 'jsonc'`.
   - Only emit standalone closing `}` or `]` footer rows when `bothHaveBraces` is true, preventing orphan spacer lines when comparing YAML or TOML against JSON.
2. **Object Alignment**:
   - Iterate keys in `leftObj` first. For each key, if present in `rightObj`, align them on the same row and recurse. If missing in `rightObj`, emit `deleted_right` on Left and `undefined` spacer on Right.
   - Next, iterate keys in `rightObj` that were not in `leftObj`. Emit `undefined` spacer on Left and `added_right` on Right.
3. **Array Alignment**:
   - When `ignoreListOrder` is `false`, align index-by-index `0..max(left.length, right.length)`.
   - When `ignoreListOrder` is `true`, greedily pair each `leftArr[i]` with an unmatched `rightArr[j]` where `areValuesEqual(leftArr[i], rightArr[j], true)` is true before falling back to positional pairing.

### Step 4: Bracket-Safe JSONPath & In-Place Patching (`inPlacePatcher.ts`)
1. Keys containing `.`, `/`, `[`, `]`, or whitespace are emitted using bracket-quoted syntax: `$.metadata.labels['app.kubernetes.io/managed-by']`.
2. `parsePathTokens(path)` tokenizes both dot segments and bracket-quoted segments so `getValueAtPath` and `setValueAtPath` never split dotted Kubernetes label keys into nested objects.
3. `mergeDataTrees(source, target, ignoredFields, includeIgnoredFields)` recursively merges `source` into `target`. When `includeIgnoredFields === false`, any key matching `ignoredFields` retains `target[key]` untouched.

---

## 5. Verification Commands

```bash
# 1. Run pure-logic unit tests (13 tests covering JSONC repair, YAML tabs, TOML, folding, cross-format, inline edit)
./node_modules/.bin/tsx --test src/diff/diffEngine.test.ts

# 2. Type-check & production bundle build
npm run build
```
