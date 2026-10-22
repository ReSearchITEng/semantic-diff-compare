# ADR-002: Option A Semantic Key Alignment, Multiset Lists & Code Folding

- **Status:** Accepted
- **Date:** 2025-05
- **Iteration:** 1–2

## Context
In maps/objects (JSON objects, YAML mappings, TOML tables), key order has no semantic meaning. However, when two files have keys in different orders, standard diff tools mark moved blocks as deletions and additions. Furthermore, users need collapsible code blocks that reliably hide all nested rows across both panes and the central gutter simultaneously.

## Decision
1. **Option A Visual Rearrangement**:
   - The Left pane serves as the canonical key order reference.
   - When building `AlignedDiffRow[]`, the engine visits keys present in the Left object first, pairing them with matching keys from the Right object regardless of their original position in the Right document.
   - Keys that exist *only* in the Right object are emitted afterward, aligned against blank spacer rows (`left: undefined`) on the Left pane.
2. **Toggleable Multiset Array Comparison (`ignoreListOrder`)**:
   - By default, arrays are compared index-by-index (`0..N`).
   - When `Ignore List Order` is enabled, `alignArraysIgnoringOrder` performs a greedy bipartite match using `areValuesEqual(..., true)` to pair semantically identical list items before pairing remaining modified items.
3. **Ancestor-Tracked Code Folding (`ancestorBlockIds`)**:
   - Every collapsible object or array header row is assigned a deterministic `blockId` (`block-${path}`).
   - As `buildAlignedRows` recurses into children, it passes `[...ancestorBlockIds, currentBlockId]` down to all nested rows and closing footer rows.
   - A row is hidden whenever `row.ancestorBlockIds.some(id => foldedBlocks.has(id))` evaluates to `true`.

## Consequences
- **Positive:** Reordered object keys never produce visual noise.
- **Positive:** Folding any block at any depth immediately hides all nested rows and their corresponding gutter merge buttons in O(depth) time, preserving 3-way vertical scroll alignment.
