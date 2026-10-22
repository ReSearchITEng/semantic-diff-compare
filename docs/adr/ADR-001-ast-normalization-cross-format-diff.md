# ADR-001: Cross-Format AST Normalization (JSON, JSONC, YAML, TOML)

- **Status:** Accepted
- **Date:** 2025-05
- **Iteration:** 1–3

## Context
Users frequently need to compare configuration payloads that represent the same logical structure across different serialization formats — for example, a Kubernetes manifest in **YAML** vs. a `kubectl get -o json` payload in **JSON**, or an application config migrated between **JSONC** and **TOML**. Traditional line-based diff tools (like `git diff` or standard text diff) fail completely across formats because every line differs syntactically (`"key": "value",` vs `key: value` vs `key = "value"`).

## Decision
1. **Unified Parse Document Contract (`ParsedDocument`)**:
   - Parse `json`, `jsonc`, `yaml`, and `toml` into a normalized JavaScript value tree (`data`) while recording source formatting metadata (`format`, `indentStyle`, `quoteStyle`, `comments`, `repairInfo`, `yamlIssues`).
2. **Format-Specific Cell Rendering (`formatKeyValue` in `semanticDiff.ts`)**:
   - Each pane renders its side of the aligned semantic tree using its own native syntax (`key: val` for YAML, `key = "val"` and `[section]` headers for TOML, `"key": "val"` for JSON/JSONC), even when the opposite pane uses a different format.
3. **Cross-Format Closing Delimiter Suppression**:
   - Brace-delimited formats (`json`, `jsonc`) use explicit closing lines (`}`, `]`), whereas indentation/section formats (`yaml`, `toml`) do not.
   - When comparing across formats where only one side uses braces (`bothHaveBraces === false`), standalone closing delimiter rows (`}` / `]`) are suppressed so every semantic property aligns 1-to-1 without false spacer rows.
4. **Interactive Per-Pane Format Conversion**:
   - Each pane header includes an interactive format switcher (`JSON | JSONC | YAML | TOML`) backed by `convertDocumentToFormat(doc, targetFormat)` so users can convert either side on the fly.

## Consequences
- **Positive:** Seamless semantic comparison between YAML, JSON, JSONC, and TOML with zero false-positive syntax diffs.
- **Positive:** Row-level merge (`▸` / `◂`) automatically translates the copied value into the target pane's native format.
