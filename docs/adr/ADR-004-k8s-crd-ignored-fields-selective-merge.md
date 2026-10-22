# ADR-004: Kubernetes CRD Ignored Fields & Selective Merge All

- **Status:** Accepted
- **Date:** 2025-05
- **Iteration:** 1–2

## Context
When comparing Kubernetes Custom Resource Definitions (CRDs) or live cluster manifests (`Deployment`, `Service`, `StatefulSet`), cluster-generated metadata fields (`managedFields`, `resourceVersion`, `creationTimestamp`, `uid`, `generation`) always differ between environments. Highlighting them as breaking red/amber diffs obscures real configuration drift, and blindly overwriting them during a full-document `Merge All` corrupts target cluster metadata.

## Decision
1. **Non-Critical Ignored Diff Status (`ignored_diff`)**:
   - `isFieldIgnored(key, fullPath, ignoredFields)` checks whether a property's key or JSONPath matches the user's configured filter list.
   - Value changes inside matching paths receive `status = 'ignored_diff'` instead of `'modified'`, `'added_right'`, or `'deleted_right'`.
   - The UI renders `ignored_diff` rows in a muted slate palette with a `CRD Ignored` tag and counts them separately in the status bar (`stats.ignoredDiff`).
2. **Interactive Selective Merge All (`MergeAllModal.tsx` + `mergeDataTrees`)**:
   - Clicking `Merge All ▸` or `◂ Merge All` opens a confirmation modal asking the user to choose between:
     - **Skip Ignorable Fields (Recommended)**: Calls `mergeDataTrees(source, target, ignoredFields, false)`, which recursively merges all non-ignored paths from `source` while preserving `target`'s existing values for all ignored fields.
     - **Merge Everything (Include Ignorable Fields)**: Calls `mergeDataTrees(source, target, ignoredFields, true)`, cloning the entire `source` tree onto `target`.

## Consequences
- **Positive:** Operators can safely sync Kubernetes manifests across staging and production without clobbering live cluster `resourceVersion` or `uid` fields.
