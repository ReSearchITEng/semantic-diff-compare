# SemantiCompare — Iteration Log & Lessons Learned

This file tracks every iteration of **SemantiCompare**, recording user requirements, root causes of bugs discovered during verification, architectural adjustments, and lessons learned. **Update this log at the end of every future iteration.**

---

## Iteration 1 — Initial Semantic JSONC & YAML Diff Engine
### Features Delivered
- Built core AST/CST normalization engine supporting JSON, JSONC (`//` and `/* */` comments), and YAML.
- Implemented Aggressive Partial JSONC Auto-Repair (`jsoncRepair.ts`) with exact breakpoint line/column tracking.
- Implemented Option A Semantic Alignment (`semanticDiff.ts`) where the Right pane visually reorders object keys to align with the Left pane.
- Added YAML Tab Linter (`yamlLinter.ts`) with red warning badges and 1-click `Convert Tabs to 2 Spaces`.
- Added Kubernetes CRD Ignored Fields modal (`managedFields`, `resourceVersion`, `creationTimestamp`, `uid`, `generation`).
- Added Beyond Compare central action gutter (`▸` / `◂`) and live JSONPath status bar.

---

## Iteration 2 — Selective Merge All, Folding Fix, Quote Type Ignore, TOML & Mobile Landscape Fix
### User Feedback Addressed
1. *"When I merge all, ask if to ignore ignorable fields or do those also."*
2. *"The folding functionality does not work. It shows the `..}` but the lines do not disappear."*
3. *"Add in ignore the diff in quote types if not ignored already."*
4. *"Add support for TOML files as well."*
5. *"I checked the website from phone, and when I put the phone in landscape, the arrows in the middle do not work to copy from one side to the other, and are also misplaced or disappear."*

### Root Causes & Fixes Learned
- **Bug 1: Code Folding Did Not Hide Child Lines**
  - *Root Cause*: `DiffPane.tsx` rendered the `... }` badge when `foldedBlocks.has(blockId)` was true on the header row, but child rows only knew their immediate `blockId` (or none at all), so `DiffPane` never skipped rendering child rows.
  - *Fix*: Added `ancestorBlockIds: string[]` to `AlignedDiffRow`. During recursive AST traversal in `semanticDiff.ts`, every child row and closing footer row receives the full array of enclosing `ancestorBlockIds`. Both `DiffPane.tsx` and `DiffGutter.tsx` now filter out any row where `row.ancestorBlockIds?.some(id => foldedBlocks.has(id))`.
- **Bug 2: Dotted Kubernetes Label Keys Failed to Copy via Central Gutter Arrows**
  - *Root Cause*: Keys like `app.kubernetes.io/managed-by` were concatenated into JSONPath as `$.metadata.labels.app.kubernetes.io/managed-by` and split on `.`, creating `{ app: { kubernetes: { io/managed-by: ... } } }` instead of updating the flat label key.
  - *Fix*: Introduced `buildChildPath` to wrap keys containing `.` or `/` in bracket quotes (`$.metadata.labels['app.kubernetes.io/managed-by']`) and wrote a state-machine tokenizer `parsePathTokens` in `inPlacePatcher.ts`.
- **Bug 3: Mobile Landscape Central Gutter Misalignment**
  - *Root Cause*: Only `leftScrollRef` and `rightScrollRef` were scroll-synced; `DiffGutter` was not in the scroll-sync loop, and responsive visibility classes hid the split gutter below `md` (`768px`) viewports.
  - *Fix*: Added 3-way scroll synchronization (`leftScrollRef`, `gutterScrollRef`, `rightScrollRef`), enforced identical `h-6 min-h-[24px] max-h-[24px]` row heights and `pb-6` bottom padding across all three columns, and enabled split view at `sm` (`640px+`) with compact headers on short landscape viewports (`max-h-[500px]`).

---

## Iteration 3 — Cross-Format YAML/JSON/TOML Diffing, Inline Edit Mode, Bottom Line Inspector & ADRs
### User Feedback Addressed
1. *"See if possible to add a way to compare YAML with JSON as well."*
2. *"Add TOML support."*
3. *"Make a mode that allows to edit inline even without going in edit mode."*
4. *"At the bottom, show full lines that are compared like Beyond Compare does (make it optional)."*
5. *"At the end, create the ADRs and all dev. docs with all features and decisions that would allow to rebuild this app at a later stage and store it in some project folders, with all learnt info, and update it every iteration."*

### Architectural Decisions & Lessons Learned
- **Cross-Format YAML ↔ JSON ↔ TOML Alignment**:
  - When comparing YAML or TOML on one side against JSON/JSONC on the other side, JSON has opening/closing braces (`{`, `}`, `[`, `]`) whereas YAML/TOML do not.
  - *Lesson Learned*: Emitting standalone closing brace rows (`}`) when only one pane uses braces creates misaligned `<empty>` spacer rows at the end of every object block. By checking `bothHaveBraces = leftUsesBraces && rightUsesBraces` in `semanticDiff.ts`, closing brace rows are only emitted when both panes use brace syntax, producing a 1-to-1 line alignment between YAML, TOML, and JSON.
  - Added a per-pane Format Selector dropdown (`JSON | JSONC | YAML | TOML`) directly in `DiffPane.tsx` so users can convert either pane between formats on the fly or compare any format combination.
- **Inline Edit Mode (`inlineEditMode`)**:
  - Added an `Inline Edit` toggle in the top toolbar (enabled by default). When active, clicking a value or its inline edit icon in `DiffPane.tsx` (or in `BottomLineInspector.tsx`) opens an inline input right inside the 24px row without shifting layout height or requiring the raw editor modal.
- **Beyond Compare Bottom Line Comparison Inspector (`BottomLineInspector.tsx`)**:
  - Stacked 2-row full-width panel docked above `StatusBar` showing the complete Left and Right lines for the selected row, with character-level prefix/middle/suffix diff highlighting (`computeIntraLineDiff`) and a toggle to hide/show the panel.
