/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Cross-platform keyboard shortcuts and text navigation utilities.
 * Handles macOS (⌘ Command / ⌥ Option) alongside Windows/Linux (Ctrl / Alt).
 */

export interface KeyComboEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

/**
 * Calculates new cursor position jumping word-by-word (left or right).
 * Correctly distinguishes words (\w), punctuation/separators, and whitespace.
 */
export function calculateWordJump(text: string, currentPos: number, direction: -1 | 1): number {
  if (!text || text.length === 0) return 0;
  let pos = Math.max(0, Math.min(currentPos, text.length));

  if (direction === -1) {
    // Jump Left: skip whitespace first
    while (pos > 0 && /\s/.test(text[pos - 1])) {
      pos--;
    }
    if (pos > 0) {
      if (/[\w]/.test(text[pos - 1])) {
        // Skip word characters
        while (pos > 0 && /[\w]/.test(text[pos - 1])) {
          pos--;
        }
      } else {
        // Skip punctuation/symbol characters
        while (pos > 0 && !/\s/.test(text[pos - 1]) && !/[\w]/.test(text[pos - 1])) {
          pos--;
        }
      }
    }
    return Math.max(0, pos);
  }

  // Jump Right: if on whitespace, skip to start of token; then skip token
  const len = text.length;
  while (pos < len && /\s/.test(text[pos])) {
    pos++;
  }
  if (pos < len) {
    if (/[\w]/.test(text[pos])) {
      while (pos < len && /[\w]/.test(text[pos])) {
        pos++;
      }
    } else {
      while (pos < len && !/\s/.test(text[pos]) && !/[\w]/.test(text[pos])) {
        pos++;
      }
    }
  }

  return Math.min(len, pos);
}

/**
 * Detects Undo shortcut:
 * - Windows/Linux: Ctrl+Z
 * - macOS: ⌘Z (metaKey + 'z')
 */
export function isShortcutUndo(e: KeyComboEvent): boolean {
  const isModifier = e.ctrlKey || e.metaKey;
  return isModifier && !e.shiftKey && e.key.toLowerCase() === 'z';
}

/**
 * Detects Redo shortcut:
 * - Windows/Linux: Ctrl+Y or Ctrl+Shift+Z
 * - macOS: ⇧⌘Z (shiftKey + metaKey + 'z') or ⌘Y (metaKey + 'y')
 */
export function isShortcutRedo(e: KeyComboEvent): boolean {
  const isModifier = e.ctrlKey || e.metaKey;
  if (!isModifier) return false;

  const keyLower = e.key.toLowerCase();
  if (keyLower === 'y') return true;
  if (keyLower === 'z' && Boolean(e.shiftKey)) return true;

  return false;
}

/**
 * Detects Select All shortcut:
 * - Windows/Linux: Ctrl+A
 * - macOS: ⌘A
 */
export function isShortcutSelectAll(e: KeyComboEvent): boolean {
  return (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a';
}

/**
 * Detects Copy shortcut:
 * - Windows/Linux: Ctrl+C
 * - macOS: ⌘C
 */
export function isShortcutCopy(e: KeyComboEvent): boolean {
  return (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c';
}

/**
 * Detects Paste shortcut:
 * - Windows/Linux: Ctrl+V
 * - macOS: ⌘V
 */
export function isShortcutPaste(e: KeyComboEvent): boolean {
  return (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v';
}

/**
 * Detects word-by-word navigation:
 * - Windows/Linux: Ctrl+ArrowLeft / Ctrl+ArrowRight
 * - macOS: ⌥Option+ArrowLeft / ⌥Option+ArrowRight (and Ctrl+ArrowLeft/Right)
 */
export function isShortcutWordJump(e: KeyComboEvent): { isJump: boolean; direction: -1 | 1 } {
  const hasWordModifier = Boolean(e.ctrlKey || e.altKey);
  if (!hasWordModifier) return { isJump: false, direction: 1 };

  if (e.key === 'ArrowLeft') {
    return { isJump: true, direction: -1 };
  }
  if (e.key === 'ArrowRight') {
    return { isJump: true, direction: 1 };
  }

  return { isJump: false, direction: 1 };
}

/**
 * Detects macOS line jump:
 * - macOS: ⌘ArrowLeft (jump to line start) / ⌘ArrowRight (jump to line end)
 */
export function isShortcutLineJump(
  e: KeyComboEvent
): { isJump: boolean; to: 'start' | 'end' } {
  if (e.metaKey && e.key === 'ArrowLeft') {
    return { isJump: true, to: 'start' };
  }
  if (e.metaKey && e.key === 'ArrowRight') {
    return { isJump: true, to: 'end' };
  }
  return { isJump: false, to: 'start' };
}

/**
 * Detects file top / bottom jump:
 * - Windows/Linux: Ctrl+Home / Ctrl+End (or Ctrl+ArrowUp / Ctrl+ArrowDown)
 * - macOS: ⌘ArrowUp (top of buffer) / ⌘ArrowDown (bottom of buffer)
 */
export function isShortcutFileJump(
  e: KeyComboEvent
): { isJump: boolean; to: 'top' | 'bottom' } {
  if (e.metaKey || e.ctrlKey) {
    if (e.key === 'ArrowUp' || e.key === 'Home') {
      return { isJump: true, to: 'top' };
    }
    if (e.key === 'ArrowDown' || e.key === 'End') {
      return { isJump: true, to: 'bottom' };
    }
  }
  return { isJump: false, to: 'top' };
}
