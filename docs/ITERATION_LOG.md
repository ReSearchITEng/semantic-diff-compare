# SemantiCompare — Iteration Log & Lessons Learned

This file tracks every iteration of **SemantiCompare**, recording user requirements, root causes of bugs discovered during verification, architectural adjustments, and lessons learned. **Update this log at the end of every future iteration.**

---

## Iteration 1 — Initial Semantic JSONC & YAML Diff Engine
### Features Delivered
- Built core AST/CST normalization engine supporting JSON, JSONC (`//` and `/* */` comments), and YAML.
- Implemented Aggressive Partial JSONC Auto-Repair (`jsoncRepair.ts`) with exact breakpoint line/column tracking.
- Implemented Option A Semantic Alignment (`semanticDiff.ts`) where the Right pane visually reorders object keys to align with the Left pane.
- Added YAML Tab Linter (`yamlLinter.ts`) with red warning badges and 1-click `Convert Tabs to 2 Spaces`.
- Added Kubernetes CRD Ignored Fields modal (`managedFields`, `resourceVersion`, `creationTimestamp`, `uid`, `generation`).
- Added central action gutter (`▸` / `◂`) and live JSONPath status bar.

---

## Iteration 2 — Selective Merge All, Folding Fix, Quote Type Ignore, TOML & Mobile Landscape Fix
### User Feedback Addressed
1. *"When I merge all, ask if to ignore ignorable fields or do those also."*
2. *"The folding functionality does not work. It shows the `..}` but the lines do not disappear."*
3. *"Add in ignore the diff in quote types if not ignored already."*
4. *"Add support for TOML files as well."*
5. *"I checked the website from phone, and when I put the phone in landscape, the arrows in the middle do not work to copy from one side to the other, and are also misplaced or disappear."*

### Root Causes & Fixes Learned
- **Bug 1: Code Folding Did Not Hide Child Lines**
  - *Root Cause*: `DiffPane.tsx` rendered the `... }` badge when `foldedBlocks.has(blockId)` was true on the header row, but child rows only knew their immediate `blockId` (or none at all), so `DiffPane` never skipped rendering child rows.
  - *Fix*: Added `ancestorBlockIds: string[]` to `AlignedDiffRow`. During recursive AST traversal in `semanticDiff.ts`, every child row and closing footer row receives the full array of enclosing `ancestorBlockIds`. Both `DiffPane.tsx` and `DiffGutter.tsx` now filter out any row where `row.ancestorBlockIds?.some(id => foldedBlocks.has(id))`.
- **Bug 2: Dotted Kubernetes Label Keys Failed to Copy via Central Gutter Arrows**
  - *Root Cause*: Keys like `app.kubernetes.io/managed-by` were concatenated into JSONPath as `$.metadata.labels.app.kubernetes.io/managed-by` and split on `.`, creating `{ app: { kubernetes: { io/managed-by: ... } } }` instead of updating the flat label key.
  - *Fix*: Introduced `buildChildPath` to wrap keys containing `.` or `/` in bracket quotes (`$.metadata.labels['app.kubernetes.io/managed-by']`) and wrote a state-machine tokenizer `parsePathTokens` in `inPlacePatcher.ts`.
- **Bug 3: Mobile Landscape Central Gutter Misalignment**
  - *Root Cause*: Only `leftScrollRef` and `rightScrollRef` were scroll-synced; `DiffGutter` was not in the scroll-sync loop, and responsive visibility classes hid the split gutter below `md` (`768px`) viewports.
  - *Fix*: Added 3-way scroll synchronization (`leftScrollRef`, `gutterScrollRef`, `rightScrollRef`), enforced identical `h-6 min-h-[24px] max-h-[24px]` row heights and `pb-6` bottom padding across all three columns, and enabled split view at `sm` (`640px+`) with compact headers on short landscape viewports (`max-h-[500px]`).

---

## Iteration 3 — Cross-Format YAML/JSON/TOML Diffing, Inline Edit Mode, Split Line Inspector & ADRs
### User Feedback Addressed
1. *"See if possible to add a way to compare YAML with JSON as well."*
2. *"Add TOML support."*
3. *"Make a mode that allows to edit inline even without going in edit mode."*
4. *"At the bottom, show full lines that are compared (make it optional)."*
5. *"At the end, create the ADRs and all dev. docs with all features and decisions that would allow to rebuild this app at a later stage and store it in some project folders, with all learnt info, and update it every iteration."*

### Architectural Decisions & Lessons Learned
- **Cross-Format YAML ↔ JSON ↔ TOML Alignment**:
  - When comparing YAML or TOML on one side against JSON/JSONC on the other side, JSON has opening/closing braces (`{`, `}`, `[`, `]`) whereas YAML/TOML do not.
  - *Lesson Learned*: Emitting standalone closing brace rows (`}`) when only one pane uses braces creates misaligned `<empty>` spacer rows at the end of every object block. By checking `bothHaveBraces = leftUsesBraces && rightUsesBraces` in `semanticDiff.ts`, closing brace rows are only emitted when both panes use brace syntax, producing a 1-to-1 line alignment between YAML, TOML, and JSON.
  - Added a per-pane Format Selector dropdown (`JSON | JSONC | YAML | TOML`) directly in `DiffPane.tsx` so users can convert either pane between formats on the fly or compare any format combination.
- **Inline Edit Mode (`inlineEditMode`)**:
  - Added an `Inline Edit` toggle in the top toolbar (enabled by default). When active, clicking a value or its inline edit icon in `DiffPane.tsx` (or in `BottomLineInspector.tsx`) opens an inline input right inside the 24px row without shifting layout height or requiring the raw editor modal.
- **Bottom Split Line Inspector (`BottomLineInspector.tsx`)**:
  - Stacked 2-row full-width panel docked above `StatusBar` showing the complete Left and Right lines for the selected row, with character-level prefix/middle/suffix diff highlighting (`computeIntraLineDiff`) and a toggle to hide/show the panel.

---

## Iteration 4 — Export Diff Report, Undo/Redo History & Two-Side Format Conversion Realignment Fix
### User Feedback Addressed
1. *"Export diff report"*
2. *"Add undo buttons"*
3. *"Bug: when I change from one format to another on one side, it works nice, but the moment I also change on the other side, it doesn't realign, and shown totally different, with all data shifted at the end."*
4. *"Rename the bottom line view to Split Line Inspector."*

### Root Causes & Fixes Learned
- **Bug: Two-Side Format Conversion Failing to Realign & Shifting Data to the End**
  - *Root Cause 1 (`JSONC` header comment vs `detectFormat`)*: `convertDocumentToFormat(doc, 'jsonc')` emitted `// Converted to JSONC\n{\n...}`. In `detectFormat(text)`, `trimmed.startsWith('{')` was checked *before* stripping leading `//` comments, so `detectFormat` misclassified the converted `JSONC` text as `yaml`. `YAML.parseDocument` then parsed the first line + `{ "firstKey"` as a single malformed YAML key `"// Converted to JSONC { \"firstKey\""`. When Left and Right had different first keys (e.g. `"package"` vs `"dependencies"` or `"name"` vs `"settings"`), converting both sides produced two completely unmatched root keys, marking all Left rows as deleted at the top and shifting all Right rows to the bottom as added.
  - *Root Cause 2 (`YAML` with tabs converted to `TOML`/`JSON`)*: In `parseDocument`, `YAML.parseDocument(rawText)` was called on the raw tab-indented YAML string before normalizing tabs, causing YAML syntax errors that flattened nested keys to the root object.
  - *Root Cause 3 (Non-deterministic `blockId` across format changes)*: `semanticDiff.ts` previously generated `block_${++rowCounter}` IDs. Switching between braceless (`YAML`/`TOML`) and braced (`JSON`/`JSONC`) formats changed `rowCounter` offsets, shifting folded block IDs.
  - *Fix*:
    1. Updated `detectFormat` in `parser.ts` to run `extractAndStripComments` first and inspect `cleanTrimmed.startsWith('{')` / `cleanTrimmed.startsWith('[')`, and verified `parseToml` before returning `'toml'`.
    2. Updated `convertDocumentToFormat` in `formatter.ts` to place the JSONC header comment inside `{` (`{\n  // JSONC configuration...\n`) and added `sanitizeForToml` so `null` values never cause `stringifyToml` to fail.
    3. Updated `parseDocument` to normalize YAML tabs via `convertTabsToSpaces(rawText, 2)` prior to `YAML.parseDocument` while still reporting `lintYamlTabs(rawText)` issues.
    4. Tracked `leftFormatOverride` and `rightFormatOverride` in `App.tsx` and changed `semanticDiff.ts` block IDs to deterministic `block_${path}`. Verified across all 96 `(preset x leftFormat x rightFormat)` combinations with 0 mismatches.
- **Feature: Multi-Step Undo / Redo (`undoStack` & `redoStack`)**
  - Added snapshot-based Undo and Redo in `App.tsx` and `Header.tsx` (`Ctrl+Z` / `Ctrl+Y` + toolbar buttons) covering row merges, full merges, inline edits, format conversions, pane swaps, and raw edits.
- **Feature: Export Semantic Diff Report (`diffReport.ts` & `DiffReportModal.tsx`)**
  - Added `Export Report` button in `Header.tsx` opening a modal that generates, previews, copies, and downloads reports in **Markdown (`.md`)**, **JSON (`.json`)**, and **Plain Text (`.txt`)**, with an option to include or exclude ignored CRD fields.
- **Terminology Cleanup**:
  - Standardized all UI labels, HTML metadata, and documentation to use **Split Line Inspector**.

---

## Iteration 5 — Daily Clipboard UX (`Ctrl+A`, `Ctrl+C`, `Ctrl+V`) & Multi-Pass `Ignore List Order` Array Alignment
### User Feedback Addressed
1. *"The copy to clipboard button works perfect, but using shortcuts some issues: While Ctrl+A (to select all) works it selects things like 'edit:'. And then copy/paste of the text (ctrl+C, or +V) has even more issues: Paste (ctrl+v) does not do anything, while +c (copy) brings hidden things like 'edit' for each line, and is not formatted. Think of daily experience."*
2. *"When I do ignore list order (which in UI shows by default unchecked), there are issues, misaligning."*

### Root Causes & Fixes Learned
- **Bug 1: `Ctrl+A` and `Ctrl+C` Capturing Hidden `"edit"` Buttons and Losing Indentation**
  - *Root Cause*: Inline `"edit"` buttons (`<button class="opacity-0 ..."><span>edit</span></button>`) and badges (`CRD Ignored`, `Repaired`, `Tab Error`) contained real DOM text nodes inside the selectable diff pane, and line indentation was applied via CSS `paddingLeft` rather than leading whitespace characters. Native browser selection (`Ctrl+A` or drag-select) crossed both panes and concatenated unindented text with `"edit"` on every primitive row.
  - *Fix*:
    1. Converted all non-code row labels (`edit`, `CRD Ignored`, `Repaired`, `Tab Error`, fold indicators, and line numbers) to CSS pseudo-elements (`after:content-[attr(data-badge-label)]` / `after:content-[attr(data-line-num)]`) with `select-none`. Pseudo-element content is excluded from the DOM text tree and browser Selection API by specification.
    2. Rendered actual leading indentation spaces (`' '.repeat(cell.indent)`) and attached `data-line-text` to every code row.
    3. Added active pane tracking (`focusedSide: 'left' | 'right'`), scoped `Ctrl+A` to select only the active pane's code rows, and intercepted `copy` / `Ctrl+C` via `extractCleanPaneSelection` to output clean `doc.rawText` or multi-line indented `data-line-text`.
- **Bug 2: `Ctrl+V` Doing Nothing on Diff Panes**
  - *Root Cause*: Pasting required opening the Raw Editor modal because no `paste` event handler existed on the diff panes or window.
  - *Fix*: Added global and pane-level `paste` event handlers (plus a header `Paste` button next to `Copy`) that paste clipboard text directly into the active pane with full Undo history (`Ctrl+Z`), automatic format detection (`JSON`/`JSONC`/`YAML`/`TOML`), and a `"Pasted!"` confirmation badge.
- **Bug 3: `Ignore List Order` Misaligning Arrays with Modified Objects**
  - *Root Cause*: In `semanticDiff.ts`, `options.ignoreListOrder` previously only matched array elements on 100% deep equality (`areValuesEqual`). Any object in a list with even one modified child field (such as Kubernetes `containers[0]`, `env[1]`, or `managedFields[0]`) failed `areValuesEqual` and split into disconnected `deleted_right` + `added_right` blocks. Additionally, `ignoreListOrder` defaulted to `false` in `presets.ts`.
  - *Fix*: Enabled `ignoreListOrder: true` by default in `presets.ts` and implemented `alignUnorderedArrayItems` in `semanticDiff.ts` using a 4-pass pipeline (Exact Match → Object Identity Key Match on `name`/`id`/`key`/`containerPort` → Structural Similarity Match `>= 0.35` → Unmatched Delete/Add) and tracked separate `left.path` and `right.path` across reordered array indices.

---

## Iteration 6 — Always-Editable Live Editor Panes & Validated Clipboard Paste with Error Notifications
### User Feedback Addressed
1. *"I want option (and the default way) for both panes to be editable all the time, so when I write it would immediately write, like a normal editor. Same way for copy/paste experience, so I can use it like a live editor."*
2. *"Update the `handlePasteIntoPane` function to include a validation step that checks if the pasted content is valid JSON/YAML before updating the state, and if invalid, display a temporary error notification in the UI."*

### Architectural Decisions & Lessons Learned
- **Always-Editable Live Editor Mode (`inlineEditMode = true` by default)**:
  - *Previous Limitation*: Rows in `DiffPane.tsx` were rendered as static `<span>` elements requiring a double-click or clicking a hover pencil icon to open a small boxed input with Save/Cancel buttons. Typing on a line did nothing until that sub-mode was opened and confirmed.
  - *Solution*: Implemented a Dual-Layer Live Line Editor on every editable row in both panes when **Live Editor** is enabled (default ON, toggleable in `Header.tsx`). Each row renders a syntax-highlighted mirror layer (`aria-hidden="true"`) underneath a pixel-aligned transparent native `<input data-live-row-input="true">` with a visible cyan caret (`caret-cyan-300`).
  - *Preventing Cursor Jump on Live Keystrokes*: Keyed rows by their canonical JSONPath (`${side}_${cell.path}_${type}`) instead of sequential `rowCounter` IDs, and bound the focused input to `focusedRowState.draftText` while calling `onLiveEditLine` (`parseEditedLine` / `renameKeyAtPath`) on every valid value change. This updates semantic diff statuses, central gutter merge arrows, and the Split Line Inspector in real time on every keystroke without unmounting the input or resetting `selectionStart`.
- **Paste Validation (`validatePastedDocument`) & Temporary UI Error Notification**:
  - Added `validatePastedDocument` in `src/diff/parser.ts` to verify that pasted clipboard text is valid JSON, JSONC, YAML, or TOML representing a structured object or array.
  - Updated `handlePasteIntoPane` in `src/App.tsx` to validate clipboard text before mutating `leftRaw` or `rightRaw`. When invalid content is pasted, state remains untouched and a temporary `role="alert"` notification banner (`data-testid="paste-error-notification"`) is displayed with the syntax error reason and auto-dismissed after 5 seconds.

