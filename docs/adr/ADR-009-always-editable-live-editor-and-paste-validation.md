# ADR-009: Always-Editable Live Editor Panes & Paste Content Validation

- **Status**: Accepted
- **Iteration**: 6
- **Context**:
  Developers using a side-by-side semantic comparison tool expect both panes to behave like a true live editor by default—where clicking anywhere on a line places the cursor immediately and typing writes directly into the document without first clicking a secondary "edit" icon, double-clicking, or confirming a popup input box. Additionally, when pasting content into a pane via `Ctrl+V` or the Paste toolbar button, invalid or unstructured clipboard content should be caught before corrupting the document state, with a clear temporary error notification shown in the UI.

## Decision

1. **Always-Editable Live Editor Mode (Default ON, Toggleable in Header)**:
   - Renamed the top toolbar toggle to **Live Editor** (`inlineEditMode = true` by default).
   - When **Live Editor** is enabled, every non-footer code line in both Left and Right `DiffPane` components renders a Dual-Layer Live Line Editor:
     - **Visual Syntax Layer (`aria-hidden="true"`)**: Renders leading indentation spaces and syntax-colored tokens (`renderSyntaxText`) using exact `12px` monospace metrics.
     - **Interactive Native `<input data-live-row-input="true">` Layer**: Positioned directly over the syntax layer (`bg-transparent text-transparent caret-cyan-300`), giving the user an immediate native text caret at the exact character clicked.
   - **Stable Row Keys (`${side}_${cell.path}_${type}`)**: Rows are keyed by their canonical JSONPath rather than transient row indices so React never unmounts the focused `<input>` while `computeSemanticDiff` re-runs on every keystroke.
   - **Immediate Live Writing & History Coalescing**:
     - Typing a value change (`parseEditedLine`) immediately updates the underlying document (`handleLiveEditLine`), refreshing diff colors, central gutter merge arrows, the Split Line Inspector, and status bar counters on every keystroke while keeping the user's cursor locked in place.
     - Undo snapshots (`pushHistory`) are coalesced once per row edit session (`shouldPushHistory`), so `Ctrl+Z` cleanly reverts the entire edit rather than one character at a time.
     - `ArrowUp`, `ArrowDown`, and `Enter` navigate smoothly between adjacent editable rows while preserving horizontal column offset (`selectionStart`).

2. **Clipboard Paste Validation (`validatePastedDocument` & `handlePasteIntoPane`)**:
   - Added `validatePastedDocument(rawText)` in `src/diff/parser.ts` to verify that pasted content is valid JSON, JSONC, YAML, or TOML representing a structured object or array before updating state.
   - Updated `handlePasteIntoPane` in `src/App.tsx` to run `validatePastedDocument(text)`:
     - **Valid Content**: Clears any active error banner, records an Undo snapshot, updates `leftRaw` or `rightRaw`, and displays the `"Pasted!"` badge.
     - **Invalid Content**: Rejects the paste without modifying pane state and displays a temporary `role="alert"` error notification banner (`data-testid="paste-error-notification"`) at the top of the workspace (plus an `"Invalid Paste"` badge in the target pane header) that auto-dismisses after 5 seconds or on manual close.

## Consequences
- Zero-friction live editing across both panes by default while retaining the option to toggle **Live Editor** off for read-only inspection.
- Invalid clipboard pastes never overwrite or blank out a developer's active comparison session.
