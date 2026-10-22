/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { YamlLintIssue } from './types';

/**
 * Lints YAML text for illegal tab indentation.
 * The YAML specification strictly forbids tab characters ('\t') for indentation.
 */
export function lintYamlTabs(yamlText: string): YamlLintIssue[] {
  const issues: YamlLintIssue[] = [];
  const lines = yamlText.split('\n');

  lines.forEach((lineText, index) => {
    // Only check leading whitespace (indentation)
    const match = lineText.match(/^[\t ]+/);
    if (!match) return;

    const leadingWhitespace = match[0];
    const tabCount = (leadingWhitespace.match(/\t/g) || []).length;

    if (tabCount > 0) {
      const firstTabCol = leadingWhitespace.indexOf('\t') + 1;
      issues.push({
        line: index + 1,
        col: firstTabCol,
        message: `Illegal tab character found in YAML indentation (Line ${index + 1}). YAML requires spaces.`,
        tabCount,
      });
    }
  });

  return issues;
}

/**
 * Converts all tabs to standard spaces (default: 2 spaces per tab).
 */
export function convertTabsToSpaces(text: string, spacesPerTab = 2): string {
  const replacement = ' '.repeat(spacesPerTab);
  return text
    .split('\n')
    .map((line) => {
      // Replace tabs in leading indentation
      const match = line.match(/^[\t ]+/);
      if (!match) return line;
      const leading = match[0].replace(/\t/g, replacement);
      return leading + line.slice(match[0].length);
    })
    .join('\n');
}

/**
 * Autodetects indentation style (tab vs spaces, indent size).
 */
export function detectIndentation(text: string): { type: 'space' | 'tab'; size: number } {
  const lines = text.split('\n');
  let tabLines = 0;
  const spaceCounts: Record<number, number> = {};

  for (const line of lines) {
    if (/^\t+/.test(line)) {
      tabLines++;
    } else {
      const match = line.match(/^( +)[^\s]/);
      if (match) {
        const len = match[1].length;
        if (len > 0) {
          spaceCounts[len] = (spaceCounts[len] || 0) + 1;
        }
      }
    }
  }

  if (tabLines > 5 && tabLines > Object.keys(spaceCounts).length) {
    return { type: 'tab', size: 1 };
  }

  // Find greatest common divisor or common step (typically 2 or 4)
  const count2 = spaceCounts[2] || 0;
  const count4 = spaceCounts[4] || 0;

  if (count4 > count2 && count4 > 2) {
    return { type: 'space', size: 4 };
  }

  return { type: 'space', size: 2 };
}

/**
 * Autodetects predominant quote style (' or ")
 */
export function detectQuoteStyle(text: string): 'single' | 'double' {
  const singleQuotes = (text.match(/'/g) || []).length;
  const doubleQuotes = (text.match(/"/g) || []).length;
  return singleQuotes > doubleQuotes ? 'single' : 'double';
}
