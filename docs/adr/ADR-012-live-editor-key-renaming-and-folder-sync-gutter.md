# ADR-012: Live Editor Key Renaming In-Place Patching & Distinct Folder-Sync Gutter Controls

## Status
Accepted

## Context
1. **Key Modifications Not Recorded (Reverting to Previous Value)**:
   - Users reported that when editing keys in the always-editable Live Editor mode, changes appeared to be lost and reverted back to the old key name upon blur or saving.
   - *Root Cause*: In `src/App.tsx`, `handleLiveEditLine` previously checked `if (originalKey && newValue !== undefined)` and unconditionally called `patchRawTextScalar(targetDoc.rawText, originalKey, ...)`. In `inPlacePatcher.ts`, `patchRawTextScalar` matched lines where `k === originalKey`, updated only the value, and retained the old key name. Consequently, `patchedText` was returned with the old key intact, overwriting `targetDoc.data`'s renamed key tree and causing the line to visually revert back on blur.
   - When keys change, the system also needs to dynamically re-evaluate whether the field is now an ignored field (or ceased to be one, e.g. Kubernetes `generation`, `resourceVersion`), recompute semantic diff statuses, and maintain Option A alignment.
2. **Visual Distinction for Block / Group Merging**:
   - The central action gutter (`DiffGutter.tsx`) previously rendered identical single-line merge arrows (`→` and `←`) for both individual primitive rows and entire complex objects/arrays. Users requested a dedicated "folder sync" button for groups/blocks to clearly distinguish syncing an entire subtree from single-line scalar changes.

## Decision
1. **In-Place Key Renaming (`patchRawTextKeyRename`)**:
   - Implemented `patchRawTextKeyRename` in `src/diff/inPlacePatcher.ts`:
     - Safely locates the line matching `oldKey` (handling YAML `oldKey:`, JSON `"oldKey":`, TOML `oldKey =`, and TOML section headers `[oldKey]`).
     - Replaces `oldKey` with `newKey` while preserving indentation, line order, comments, and structure.
     - Formats keys according to specification (e.g. quoted for JSON or keys with special characters).
   - In `App.tsx`'s `handleLiveEditLine`:
     - Detects `isKeyRenamed = Boolean(originalKey && newKey && originalKey !== newKey)`.
     - Calls `renameKeyAtPath` to update `targetDoc.data`.
     - Calls `patchRawTextKeyRename` to update `targetDoc.rawText`.
     - Updates `leftRaw` or `rightRaw`, triggering `computeSemanticDiff` to immediately re-evaluate ignored fields (via `isFieldIgnored`), recompute diff statuses, and re-align keys according to Option A.
2. **Dedicated Folder Sync Controls (`DiffGutter.tsx`)**:
   - Added `isGroup` detection in `DiffGutter.tsx`:
     ```tsx
     const isGroup = Boolean(
       row.left?.isBlockHeader ||
       row.right?.isBlockHeader ||
       (row.left && (row.left.valueType === 'object' || row.left.valueType === 'array')) ||
       (row.right && (row.right.valueType === 'object' || row.right.valueType === 'array'))
     );
     ```
   - When `isGroup` is true, renders a distinctive `FolderSync` icon button with enhanced group border styling and clear tooltip (`"Sync entire group Left ▸ Right"` / `"Sync entire group Right ◂ Left"`).
   - When `isGroup` is false, renders standard single-line `ArrowRight` and `ArrowLeft` buttons.

## Consequences
- Key modifications are permanently recorded in both document data and raw text buffers.
- Changing a key dynamically recalculates whether the property matches `ignoredFields`:
  - Renaming an ignored field (`generation`) to an unignored field (`customGen`) converts it from `ignored_diff` to an active diff (`modified`).
  - Renaming an unignored field to an ignored field (`resourceVersion`) tags it as `ignored_diff`.
- Semantic diffs, Option A alignments, and bottom split inspector update immediately.
- Users have an unambiguous visual difference between single-line merges (`→` / `←`) and subtree group merges (`FolderSync`).
- Verified via interactive Playwright browser testing and 22 unit tests.
