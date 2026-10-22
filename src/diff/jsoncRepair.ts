/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ParseRepairInfo } from './types';

export interface RepairResult {
  repairedText: string;
  repairInfo: ParseRepairInfo;
  parsedData: any;
  comments: Record<string, string>; // extracted comments
}

/**
 * Strips comments from JSONC text while preserving line count/positions,
 * normalizing single-quoted strings to valid JSON double-quoted strings,
 * and collecting comments.
 */
export function extractAndStripComments(jsoncText: string): { cleanJson: string; comments: { line: number; text: string }[] } {
  let clean = '';
  const comments: { line: number; text: string }[] = [];
  let inString = false;
  let stringChar = '"';
  let isEscaped = false;
  let inSingleLineComment = false;
  let inMultiLineComment = false;
  let currentComment = '';
  let line = 1;

  for (let i = 0; i < jsoncText.length; i++) {
    const ch = jsoncText[i];
    const nextCh = jsoncText[i + 1];

    if (ch === '\n') {
      line++;
    }

    if (inSingleLineComment) {
      if (ch === '\n') {
        inSingleLineComment = false;
        comments.push({ line: line - 1, text: currentComment.trim() });
        currentComment = '';
        clean += '\n';
      } else {
        currentComment += ch;
      }
      continue;
    }

    if (inMultiLineComment) {
      if (ch === '*' && nextCh === '/') {
        inMultiLineComment = false;
        i++; // skip '/'
        comments.push({ line, text: currentComment.trim() });
        currentComment = '';
      } else {
        if (ch === '\n') clean += '\n'; // preserve line numbers
        currentComment += ch;
      }
      continue;
    }

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        // If single-quoted string had \' escape, emit ' without backslash in double-quoted JSON
        if (stringChar === "'" && ch === "'") {
          clean = clean.slice(0, -1) + "'";
        } else {
          clean += ch;
        }
      } else if (ch === '\\') {
        isEscaped = true;
        clean += ch;
      } else if (ch === stringChar) {
        inString = false;
        clean += '"'; // Always close with double quote for valid JSON
      } else if (stringChar === "'" && ch === '"') {
        // Escape inner double quote when converting single-quoted string to double-quoted
        clean += '\\"';
      } else {
        clean += ch;
      }
      continue;
    }

    // Check for comment start
    if (ch === '/' && nextCh === '/') {
      inSingleLineComment = true;
      i++; // skip second '/'
      currentComment = '';
      continue;
    }

    if (ch === '/' && nextCh === '*') {
      inMultiLineComment = true;
      i++; // skip '*'
      currentComment = '';
      continue;
    }

    // Check string start (both " and ' supported seamlessly)
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      isEscaped = false;
      clean += '"'; // Normalize opening quote to double quote for JSON.parse
      continue;
    }

    clean += ch;
  }

  if (inSingleLineComment && currentComment) {
    comments.push({ line, text: currentComment.trim() });
  }

  return { cleanJson: clean, comments };
}

/**
 * Aggressive Partial JSON Repair with Breakpoint Tracking.
 * Handles:
 * - Unclosed string literals
 * - Single-quoted strings normalized to double-quoted
 * - Trailing commas before } or ]
 * - Dangling keys or colons
 * - Unclosed braces { and brackets [
 * - Tracks exact breakpoint where the syntax failed.
 */
export function repairJsonc(rawText: string): RepairResult {
  const trimmed = rawText.trim();
  const repairInfo: ParseRepairInfo = {
    wasRepaired: false,
    repairsMade: [],
  };

  if (!trimmed) {
    return {
      repairedText: '{}',
      repairInfo,
      parsedData: {},
      comments: {},
    };
  }

  // 1. First strip comments and normalize single quotes while retaining positions
  const { cleanJson, comments } = extractAndStripComments(rawText);
  const commentsMap: Record<string, string> = {};
  comments.forEach((c) => {
    commentsMap[`line_${c.line}`] = c.text;
  });

  // Try standard JSON.parse first
  try {
    const data = JSON.parse(cleanJson);
    return {
      repairedText: rawText,
      repairInfo: { wasRepaired: false, repairsMade: [] },
      parsedData: data,
      comments: commentsMap,
    };
  } catch (err: any) {
    // Needs repair!
  }

  // 2. Perform aggressive repair with breakpoint tracking
  let text = cleanJson;
  const repairs: string[] = [];
  let breakpointOffset: number | undefined;

  // Analyze braces and string states
  const stack: ('{' | '[')[] = [];
  let inString = false;
  let stringStartOffset = -1;
  let isEscaped = false;
  let lastNonWhitespaceIndex = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (ch === '\\') {
        isEscaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      stringStartOffset = i;
      continue;
    }

    if (ch === '{' || ch === '[') {
      stack.push(ch);
    } else if (ch === '}') {
      if (stack.length > 0 && stack[stack.length - 1] === '{') {
        stack.pop();
      }
    } else if (ch === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === '[') {
        stack.pop();
      }
    }

    if (!/\s/.test(ch)) {
      lastNonWhitespaceIndex = i;
    }
  }

  // Case A: Unclosed string at EOF or truncation
  if (inString) {
    breakpointOffset = stringStartOffset;
    const trimmedEnd = text.trimEnd();
    text = trimmedEnd + '"' + text.slice(trimmedEnd.length);
    repairs.push('Auto-closed unclosed string literal');
  }

  // Case B: Remove trailing commas before closing braces, or at end
  const trailingCommaRegex = /,\s*([}\]])/g;
  if (trailingCommaRegex.test(text)) {
    text = text.replace(trailingCommaRegex, '$1');
    repairs.push('Removed trailing comma before closing bracket');
  }

  // Remove trailing comma or dangling colon at the very end
  const trailingDanglingRegex = /,\s*$/;
  if (trailingDanglingRegex.test(text.trimEnd())) {
    const trimmedEnd = text.trimEnd();
    breakpointOffset = breakpointOffset ?? (trimmedEnd.length - 1);
    text = trimmedEnd.replace(/,\s*$/, '');
    repairs.push('Removed trailing comma at end of payload');
  }

  // If ends with a colon e.g. `"key": `
  if (/:\s*$/.test(text.trimEnd())) {
    const trimmedEnd = text.trimEnd();
    breakpointOffset = breakpointOffset ?? (trimmedEnd.length - 1);
    text = trimmedEnd + ' null';
    repairs.push('Supplied null value for dangling property key');
  }

  // Case C: Close missing braces and brackets
  const remainingStack: ('{' | '[')[] = [];
  let inStr2 = false;
  let isEsc2 = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr2) {
      if (isEsc2) isEsc2 = false;
      else if (ch === '\\') isEsc2 = true;
      else if (ch === '"') inStr2 = false;
      continue;
    }
    if (ch === '"') {
      inStr2 = true;
      continue;
    }
    if (ch === '{' || ch === '[') {
      remainingStack.push(ch);
    } else if (ch === '}' && remainingStack[remainingStack.length - 1] === '{') {
      remainingStack.pop();
    } else if (ch === ']' && remainingStack[remainingStack.length - 1] === '[') {
      remainingStack.pop();
    }
  }

  if (remainingStack.length > 0) {
    if (breakpointOffset === undefined) {
      breakpointOffset = lastNonWhitespaceIndex >= 0 ? lastNonWhitespaceIndex : text.length;
    }
    const closingChars = remainingStack
      .reverse()
      .map((b) => (b === '{' ? '}' : ']'))
      .join('');
    text += '\n' + closingChars;
    repairs.push(`Auto-closed ${remainingStack.length} missing bracket(s): ${closingChars}`);
  }

  // Try parsing the repaired text
  let parsedData: any = {};
  try {
    parsedData = JSON.parse(text);
  } catch (err: any) {
    // If still failing, try wrapping in object if it looks like key-values
    try {
      const wrapped = '{' + text + '}';
      parsedData = JSON.parse(wrapped);
      text = wrapped;
      repairs.push('Wrapped loose key-value pairs in root object');
    } catch {
      parsedData = {};
    }
  }

  // Calculate line & column for breakpointOffset
  let breakpointLine: number | undefined;
  let breakpointCol: number | undefined;
  if (breakpointOffset !== undefined && breakpointOffset >= 0) {
    let curLine = 1;
    let curCol = 1;
    for (let i = 0; i < Math.min(breakpointOffset, rawText.length); i++) {
      if (rawText[i] === '\n') {
        curLine++;
        curCol = 1;
      } else {
        curCol++;
      }
    }
    breakpointLine = curLine;
    breakpointCol = curCol;
  }

  return {
    repairedText: text,
    repairInfo: {
      wasRepaired: repairs.length > 0,
      breakpointOffset,
      breakpointLine,
      breakpointCol,
      repairsMade: repairs,
    },
    parsedData,
    comments: commentsMap,
  };
}
