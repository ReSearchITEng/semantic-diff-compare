# ADR-011: Cross-Platform Keyboard Shortcuts (macOS ⌘ / Windows Ctrl), Word-by-Word Navigation, and Resilient Live Editor Undo/Redo

## Status
Accepted

## Context
In previous iterations, we introduced an always-editable Live Editor mode (`DiffPane.tsx`) where each diff line rendered a native transparent `<input data-live-row-input="true">` layered directly over a syntax-highlighted mirror layer.
Users reported three issues when interacting with the editor:
1. **`Ctrl+Z` (Undo) did not appear to work when editing rows**:
   - When users typed in the live row input, the browser's native undo manager intercepted `Ctrl+Z` inside the `<input>` DOM element.
   - History pushing was previously dependent on `isValueComplete` being `true`; if a user began editing a scalar or key (e.g. deleting a quote or typing mid-word), `isValueComplete` was `false` and no history snapshot was pushed to `undoStack`.
   - When `handleUndo` in `App.tsx` popped and restored `leftRaw`/`rightRaw`, `DiffPane.tsx` maintained an internal `focusedRowState` holding the user's uncommitted `draftText`. Because `activeLineText` checked `focusedRowState.draftText` first, the line continued displaying the user's un-reverted typing.
2. **Missing macOS shortcut equivalents**:
   - On macOS, standard text editor shortcuts rely on the Command key (`⌘` / `e.metaKey`):
     - Undo: `⌘Z` (`metaKey + z`)
     - Redo: `⇧⌘Z` (`shiftKey + metaKey + z`) or `⌘Y` (`metaKey + y`)
     - Select All: `⌘A` (`metaKey + a`)
     - Copy / Paste: `⌘C` / `⌘V`
   - Windows/Linux rely on `Ctrl` (`e.ctrlKey`): `Ctrl+Z`, `Ctrl+Y` / `Ctrl+Shift+Z`, `Ctrl+A`, `Ctrl+C`, `Ctrl+V`.
3. **Word-by-word caret navigation and line/file jumping**:
   - Windows/Linux uses `Ctrl+ArrowLeft` / `Ctrl+ArrowRight` to jump by word.
   - macOS uses `⌥Option+ArrowLeft` (`altKey`) / `⌥Option+ArrowRight` to jump by word.
   - macOS uses `⌘ArrowLeft` / `⌘ArrowRight` to jump to the start/end of the current line.
   - macOS uses `⌘ArrowUp` / `⌘ArrowDown` (and Windows `Ctrl+Home` / `Ctrl+End`) to jump to the start/end of the file buffer.

## Decision
1. **Decoupled Cross-Platform Keyboard Shortcut Utilities (`src/diff/keyboardShortcuts.ts`)**:
   - Created pure functions for detecting shortcuts:
     - `isShortcutUndo(e)`: Matches `(ctrlKey || metaKey) && !shiftKey && keyLower === 'z'`.
     - `isShortcutRedo(e)`: Matches `(ctrlKey || metaKey) && (keyLower === 'y' || (shiftKey && keyLower === 'z'))`.
     - `isShortcutSelectAll(e)`: Matches `(ctrlKey || metaKey) && keyLower === 'a'`.
     - `isShortcutCopy(e)`: Matches `(ctrlKey || metaKey) && keyLower === 'c'`.
     - `isShortcutPaste(e)`: Matches `(ctrlKey || metaKey) && keyLower === 'v'`.
     - `isShortcutWordJump(e)`: Matches `(ctrlKey || altKey)` with `ArrowLeft` (-1) or `ArrowRight` (1).
     - `isShortcutLineJump(e)`: Matches `metaKey` with `ArrowLeft` (start) or `ArrowRight` (end).
     - `isShortcutFileJump(e)`: Matches `(metaKey || ctrlKey)` with `ArrowUp` (top) or `ArrowDown` (bottom).
   - Created `calculateWordJump(text, currentPos, direction)`:
     - Correctly navigates across whitespace, word tokens (`\w`), and symbol/punctuation sequences symmetrically left and right.

2. **Immediate Pre-Edit History Capture**:
   - In `DiffPane.tsx`'s `onChange`, the very first keystroke on a row (`!focusedRowState?.hasPushedHistory`) immediately triggers `onPushHistory("Edit line in ... pane")`.
   - This captures the pristine document snapshot in `undoStack` prior to any modifications, regardless of whether intermediate tokens are complete, valid, or comments.

3. **Global and Input-Level State Synchronization via `undoRedoVersion`**:
   - Added `undoRedoVersion` state counter in `App.tsx` that increments on every `handleUndo()` and `handleRedo()`.
   - `DiffPane.tsx` listens to `undoRedoVersion` in a `useEffect` and resets `setFocusedRowState(null)`.
   - In `<input data-live-row-input="true">`, `onKeyDown` explicitly intercepts `isShortcutUndo` and `isShortcutRedo`:
     - Calls `e.preventDefault()` and `e.stopPropagation()` to stop native browser `<input>` undo conflicts.
     - Resets `setFocusedRowState(null)`.
     - Calls `onUndo()` / `onRedo()`.
   - This guarantees that whether the user triggers Undo via keyboard shortcut inside an active input, via the toolbar button, or via the global listener, the line instantly reflects the reverted state.

4. **Native Editor Navigation Support**:
   - `onKeyDown` intercepts `isShortcutWordJump` and sets the selection range calculated by `calculateWordJump`.
   - `onKeyDown` intercepts `isShortcutLineJump` (`⌘Left`/`⌘Right`) and sets caret to index `0` or `value.length`.
   - `onKeyDown` intercepts `isShortcutFileJump` (`⌘Up`/`⌘Down`) and calls `moveFocusToFileBoundary('top' | 'bottom')`.
   - Normal `ArrowUp`/`ArrowDown` continues to move between adjacent rows while preserving column offset.

5. **Updated Header Tooltips**:
   - `Header.tsx` tooltips now display both Windows/Linux and macOS equivalents: `Undo (Ctrl+Z / ⌘Z)` and `Redo (Ctrl+Y / ⇧⌘Z)`.

## Consequences
- Undo (`Ctrl+Z` / `⌘Z`) works reliably in all contexts: while typing in an input, when an input is blurred, and via toolbar buttons.
- Mac users get native `⌘Z`, `⇧⌘Z`, `⌥Left`/`⌥Right`, `⌘Left`/`⌘Right`, and `⌘Up`/`⌘Down` behavior without friction.
- Windows/Linux users get native `Ctrl+Z`, `Ctrl+Y`, `Ctrl+Left`/`Ctrl+Right`, and `Ctrl+Home`/`Ctrl+End` behavior.
- All 21 unit tests pass (`diffEngine.test.ts`), covering shortcut detection, caret calculation, TOML comment preservation, unordered array alignment, and format conversions.
