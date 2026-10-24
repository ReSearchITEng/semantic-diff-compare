# SemantiCompare — Developer Documentation & Architecture Decision Records (ADRs)

Welcome to the engineering documentation and rebuild repository for **SemantiCompare**, a semantic diff, merge, and live editing engine for **JSON, JSONC, YAML, and TOML**.

---

## Folder Structure

```text
/docs
├── README.md                                                     # Documentation index & architecture map
├── REBUILD_PLAYBOOK.md                                           # Step-by-step blueprint to rebuild the app from scratch
├── ITERATION_LOG.md                                              # Chronological log of iterations, fixes & lessons learned
└── adr/
    ├── ADR-001-ast-normalization-cross-format-diff.md            # Cross-format JSON/JSONC/YAML/TOML comparison engine
    ├── ADR-002-option-a-semantic-key-alignment.md                # Option A key rearrangement, list multiset & code folding
    ├── ADR-003-aggressive-jsonc-repair-breakpoint-tracking.md    # State-machine JSONC repair & breakpoint tracking
    ├── ADR-004-k8s-crd-ignored-fields-selective-merge.md         # K8s CRD ignorable fields & selective Merge All
    ├── ADR-005-inplace-patching-bracket-jsonpath.md              # Bracket JSONPath, inline editing & intra-line diffing
    ├── ADR-006-three-way-scroll-sync-mobile-landscape.md         # 3-way scroll sync & mobile landscape responsiveness
    ├── ADR-007-undo-redo-diff-report-and-format-realignment.md   # Multi-step Undo/Redo, Diff Reports & format realignment
    ├── ADR-008-daily-clipboard-and-unordered-array-alignment.md  # Daily clipboard UX (Ctrl+A/C/V) & multi-pass list ordering
    ├── ADR-009-always-editable-live-editor-and-paste-validation.md # Always-editable live editor & paste validation notification
    └── ADR-010-toml-comment-preservation-and-docker-deployment.md  # TOML comment preservation & production Docker deployment
```

---

## Core Capabilities Summary

1. **Multi-Format & Cross-Format Diffing (`JSON` ↔ `JSONC` ↔ `YAML` ↔ `TOML`)**
   - Automatically detects format from raw text or allows instant per-pane conversion via the pane header selector.
   - Normalizes documents into a format-agnostic semantic tree while retaining original formatting metadata (indentation width, tabs vs. spaces, quote style, comments).
   - Suppresses mismatched structural delimiters (`{}` / `[]`) when comparing brace-based formats (`JSON`/`JSONC`) against indentation/section-based formats (`YAML`/`TOML`).

2. **Semantic Alignment (Option A) & Code Folding**
   - Rearranges keys in the Right pane to match the Left pane's key hierarchy and ordering so reordered keys never trigger false diffs.
   - Pushes keys unique to the Right pane to the bottom of their parent block, aligned against blank spacer rows on the Left.
   - Tracks `ancestorBlockIds: string[]` with deterministic path-based block IDs (`block_${path}`) on every child and footer row so collapsing any parent object/array hides all nested descendants in O(1) lookup time.

3. **Inline Value Editing & Multi-Step Undo / Redo**
   - Users can click or double-click any primitive value directly inside the Left or Right diff pane (or in the bottom Split Line Inspector) to edit it in place without entering Raw Edit mode.
   - Full **Undo / Redo** stack (`Ctrl+Z` / `Ctrl+Y` and toolbar buttons) tracks every row merge, full merge, inline edit, format conversion, and raw text update.

4. **Split Line Inspector (Optional Bottom Panel)**
   - Displays the full Left and Right lines for the currently selected row stacked vertically across the bottom of the viewport.
   - Computes character-level prefix/middle/suffix differences (`computeIntraLineDiff`) to highlight exact intra-line character edits.
   - Can be toggled on/off from the top toolbar or bottom status bar.

5. **Exportable Semantic Diff Reports (`.md`, `.json`, `.txt`)**
   - Generates structured comparison reports summarizing statistics and listing every modified, added, deleted, and optionally ignored path with its Left and Right values.

6. **Aggressive JSONC Auto-Repair & YAML Tab Linter**
   - Character-by-character state machine strips `//` and `/* */` comments, normalizes single-quoted `'...'` strings, closes truncated string literals, removes trailing commas, and closes unclosed `{}`/`[]` blocks while recording the exact 1-based line and column where repair began.
   - Detects illegal `\t` indentation in YAML files, flags offending rows with a red `Tab Error` badge, and provides a 1-click `Convert Tabs to 2 Spaces` action.

7. **Kubernetes CRD Ignored Fields & Selective Merge All**
   - Configurable list of ignored keys/subpaths (`managedFields`, `resourceVersion`, `creationTimestamp`, `uid`, `generation`).
   - Renders differences inside ignored fields as muted `CRD Ignored` rows (`ignored_diff`).
   - When clicking `Merge All ▸` or `◂ Merge All`, prompts the user whether to **Skip Ignorable Fields (Recommended)** or **Merge Everything (Include Ignorable Fields)**.
