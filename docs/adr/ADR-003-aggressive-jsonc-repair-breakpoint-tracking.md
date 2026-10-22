# ADR-003: State-Machine JSONC Repair & Breakpoint Tracking

- **Status:** Accepted
- **Date:** 2025-05
- **Iteration:** 1–2

## Context
Developers frequently paste truncated JSON/JSONC payloads from logs, streaming responses, or broken config files containing `//` comments, `/* */` block comments, single-quoted strings `'...'`, trailing commas, unclosed string literals, and missing closing braces `}` / `]`. Standard `JSON.parse` throws a fatal syntax error and prevents diffing.

## Decision
We implemented a two-phase custom state machine in `/src/diff/jsoncRepair.ts`:
1. **Phase 1 — Lexical Normalization (`extractAndStripComments`)**:
   - Scans character-by-character tracking string states (`"` and `'`), escape characters `\`, single-line comments `//`, and multi-line comments `/* */`.
   - Extracts comments into `CommentToken[]` while replacing them with newline-preserving whitespace so original line numbers remain intact.
   - Normalizes single-quoted `'...'` strings into valid JSON double-quoted `"..."` strings (escaping inner `"` and unescaping `\'`).
2. **Phase 2 — Truncation & Structural Auto-Repair (`repairJsonc`)**:
   - Strips trailing commas before `}` and `]` via regex and token inspection.
   - If `JSON.parse` still fails, scans the token stream tracking open `{` and `[` delimiters on a stack and string quote state.
   - Records the exact 1-based `breakpointLine` and `breakpointCol` where truncation/corruption occurred.
   - Auto-closes unclosed strings, supplies `null` for dangling `"key":` entries, strips trailing `:` or `,`, and appends closing `}` / `]` delimiters in LIFO stack order.

## Consequences
- **Positive:** Even severely truncated multi-level JSON/JSONC logs parse into valid trees and can be diffed semantically.
- **Positive:** The UI highlights the exact line where auto-repair stepped in with an amber `Auto-Repaired (Line X)` badge and `Repaired` row marker.
