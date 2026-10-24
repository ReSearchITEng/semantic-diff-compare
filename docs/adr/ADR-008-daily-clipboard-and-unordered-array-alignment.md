# ADR-008: Daily Clipboard UX (`Ctrl+A`, `Ctrl+C`, `Ctrl+V`) & Multi-Pass Unordered Array Alignment

- **Status**: Accepted
- **Iteration**: 5

## Context

1. **Daily Keyboard Copy/Paste/Select Friction in Diff Viewers**:
   - In standard DOM diff tables, pressing `Ctrl+A` selects text across both panes, headers, and status bars, and includes hidden action button labels (such as inline `"edit"` buttons or `"CRD Ignored"` badges).
   - Pressing `Ctrl+C` copies unformatted DOM fragments without leading indentation (when indentation is styled via CSS `padding-left`) and injects `"edit"` on every line.
   - Pressing `Ctrl+V` directly on a pane does nothing unless the user first opens a separate modal editor.
2. **Misalignment When `Ignore List Order` Is Checked**:
   - Previously, `ignoreListOrder: true` only paired array elements when `areValuesEqual(itemL, itemR)` returned `true` (100% deep equality).
   - Whenever an object inside an array had even a single modified property (e.g., Kubernetes `containers[0]`, `env[1]`, or `managedFields[0]`), `areValuesEqual` returned `false`, causing the entire object subtree to split into a false `deleted_right` block on the Left and a false `added_right` block at the bottom of the Right pane.
   - Furthermore, paired array items at different indices (`leftIdx !== rightIdx`) shared a single `path`, causing row merges or inline edits on reordered array items to target the wrong index on the Right document.

## Decision

1. **Zero-Noise Selection & Daily Clipboard Shortcuts (`DiffPane.tsx` & `App.tsx`)**:
   - **Pseudo-Element UI Labels**: All non-code UI badges (`edit`, `CRD Ignored`, `Repaired`, `Tab Error`, fold indicators, and line numbers) render their text via CSS `after:content-[attr(data-badge-label)]` / `after:content-[attr(data-line-num)]` with `user-select: none`. Because CSS pseudo-element content is never part of the DOM text tree, native browser selection (`Ctrl+A` or drag selection) can never capture `"edit"` or line numbers.
   - **Real Indentation & `data-line-text`**: Every code row renders actual monospace leading spaces (`' '.repeat(cell.indent)`) and stores its complete indented line in `data-line-text`.
   - **Active Pane Focus (`focusedSide: 'left' | 'right'`)**: Clicking or focusing either pane sets it as the active pane (indicated by a top cyan border and `Active · Ctrl+A / C / V` hint).
   - **Scoped `Ctrl+A`**: Selects all code rows inside the active pane only (`range.selectNodeContents(paneEl)`).
   - **Formatted `Ctrl+C` (`extractCleanPaneSelection`)**: Intercepts `copy` events; returns `doc.rawText` when the entire pane is selected, or joins `data-line-text` with `\n` when multiple lines are selected, preserving exact indentation.
   - **Direct `Ctrl+V` Paste**: Listens for global and pane `paste` events (plus a header `Paste` button), pushes an Undo snapshot (`pushHistory`), clears format override for automatic format detection (`JSON`/`JSONC`/`YAML`/`TOML`), and replaces the active pane's content immediately with a `"Pasted!"` confirmation badge.

2. **Multi-Pass Unordered Array Alignment (`alignUnorderedArrayItems` in `semanticDiff.ts`)**:
   - Enabled `ignoreListOrder: true` by default across presets.
   - Implemented a 4-pass matching pipeline when `ignoreListOrder` is active:
     1. **Pass 1 (Exact Match)**: Pairs items that are deeply semantically equal (`areValuesEqual`).
     2. **Pass 2 (Object Identity Key Match)**: Pairs remaining plain objects sharing an identity key (`name`, `id`, `key`, `containerPort`, `mountPath`, `path`, `host`, `service`, `app`, `uid`, `manager`).
     3. **Pass 3 (Structural Similarity Match)**: Pairs remaining composite items whose shared key schema and value similarity score is `>= 0.35` (e.g., `managedFields` entries where `manager` and `time` changed but `operation` and `apiVersion` match).
     4. **Pass 4 (Unmatched Items)**: Emits remaining Left items as `deleted_right` and remaining Right items as `added_right`.
   - **Distinct `left.path` and `right.path`**: `alignNodes` tracks both `path` (Left JSONPath) and `rightPath` (Right JSONPath) so reordered array elements (`$.containers[0].env[1].value` on Left vs `$.containers[1].env[0].value` on Right) merge and inline-edit at their exact respective indices.
