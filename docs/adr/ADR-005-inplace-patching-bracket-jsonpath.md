# ADR-005: Bracket-Safe JSONPath, In-Place Patching, Inline Editing & Intra-Line Diff

- **Status:** Accepted
- **Date:** 2025-05
- **Iteration:** 2–3

## Context
1. Configuration files (especially Kubernetes labels/annotations and TOML keys) frequently contain dots and slashes inside key names (e.g., `app.kubernetes.io/managed-by`). Naive dot-splitting (`path.split('.')`) breaks in-place patching.
2. Users requested the ability to edit values directly inline inside the diff viewer without switching to a separate raw text editor modal, plus a bottom Split Line Inspector that highlights exact character-level differences within a modified line.

## Decision
1. **Bracket-Escaped JSONPath (`buildChildPath` & `parsePathTokens`)**:
   - `buildChildPath` checks `/^[a-zA-Z_$][a-zA-Z0-9_$-]*$/`. Any key containing `.`, `/`, spaces, or special characters is formatted as `parentPath['escaped.key']`.
   - `parsePathTokens` parses dot segments, numeric array indices `[0]`, and single/double-quoted bracket keys `['app.kubernetes.io/name']` into an exact `(string | number)[]` path token array.
2. **Inline Value Editing (`inlineEditMode` & `parseInlineValue`)**:
   - When `Inline Edit` mode is enabled in the toolbar (default `true`), clicking any primitive value in `DiffPane` or `BottomLineInspector` turns the value cell into a compact inline `<input>` (`Enter` or blur commits, `Escape` cancels).
   - `parseInlineValue(rawInput)` converts `"true"`/`"false"` to booleans, `"null"` to `null`, numeric strings to `Number`, JSON literals to arrays/objects, and quoted/unquoted text to strings, then updates the pane via `setValueAtPath` + `serializePreservingFormat`.
3. **Intra-Line Character Diffing (`computeIntraLineDiff`)**:
   - Scans common prefix and common suffix between the formatted Left line and Right line to isolate `{ prefix, leftMid, rightMid, suffix }`, allowing `BottomLineInspector` to highlight the exact changed characters in amber (Left) and emerald (Right).

## Consequences
- **Positive:** Fast, spreadsheet-like inline editing directly in the diff rows with immediate semantic diff recomputation.
- **Positive:** 100% reliable row merging and inline editing even on complex Kubernetes annotations and dotted keys.
