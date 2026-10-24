# ADR-006: 3-Way Scroll Synchronization & Mobile Landscape Layout

- **Status:** Accepted
- **Date:** 2025-05
- **Iteration:** 2

## Context
In a 2-pane split diff layout separated by a central action gutter (`▸` / `◂` buttons per row), any vertical misalignment between the Left pane, Central Gutter, and Right pane causes merge arrows to point to the wrong lines or disappear off-screen. On mobile phones in landscape orientation (e.g., `667x375` or `740x360`), standard desktop headers consume too much vertical space and `md:` (`768px`) breakpoints hide the split view.

## Decision
1. **Strict 24px Row Height Invariance**:
   - Every row in `DiffPane` (including empty alignment spacers and inline edit inputs) and every row in `DiffGutter` is locked to `h-6 min-h-[24px] max-h-[24px] shrink-0`.
   - All three scrollable containers share identical vertical padding (`py-1 pb-6`).
2. **3-Way Lockstep Scroll Sync**:
   - `App.tsx` maintains three refs: `leftScrollRef`, `gutterScrollRef`, and `rightScrollRef`.
   - Scrolling any of the three containers immediately synchronizes `scrollTop` across the other two inside a `requestAnimationFrame` guard (`isSyncingScroll`).
3. **Mobile Landscape Breakpoints (`sm:` + `max-h-[500px]:`)**:
   - Split-pane and central gutter visibility use `sm:` (`640px+`) instead of `md:` (`768px+`) so phones rotated to landscape always display both panes and the central merge gutter side by side.
   - Compact height modifiers (`max-h-[500px]:py-1`, `max-h-[500px]:h-8`) shrink chrome headers on landscape phones to maximize visible diff rows.

## Consequences
- **Positive:** Pixel-accurate row alignment between Left, Gutter, and Right across desktop, tablet, and phone landscape viewports.
- **Positive:** Touch-friendly (`touch-manipulation`) `▸` and `◂` merge buttons work reliably on mobile devices.
