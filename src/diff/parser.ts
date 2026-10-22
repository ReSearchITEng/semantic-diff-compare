/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import YAML from 'yaml';
import { parse as parseToml } from 'smol-toml';
import { DocumentFormat, ParsedDocument, YamlLintIssue } from './types';
import { repairJsonc } from './jsoncRepair';
import { detectIndentation, detectQuoteStyle, lintYamlTabs } from './yamlLinter';

/**
 * Detects whether the input string is likely JSON, JSONC, TOML, or YAML.
 */
export function detectFormat(text: string): DocumentFormat {
  const trimmed = text.trim();
  if (!trimmed) return 'json';

  // Check for JSONC comments
  const hasJsoncComment = /\/\/.*$|\/\*[\s\S]*?\*\//m.test(trimmed);

  // If starts with {, definitely JSON or JSONC
  if (trimmed.startsWith('{')) {
    return hasJsoncComment ? 'jsonc' : 'json';
  }

  // Check for TOML indicators:
  // 1. [section] or [[array_of_tables]] on its own line followed by key = value
  // 2. Top-level `key = value` assignment
  const lines = trimmed.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('//'));
  const hasTomlSectionHeader = lines.some((l) => /^\[\[?[a-zA-Z0-9_."-]+\]\]?\s*(#.*)?$/.test(l));
  const hasTomlAssignment = lines.some((l) => /^[a-zA-Z0-9_.-]+\s*=\s*.+$/.test(l));

  if (hasTomlAssignment && (hasTomlSectionHeader || !trimmed.startsWith('['))) {
    return 'toml';
  }

  // If starts with [, check if it's a JSON array
  if (trimmed.startsWith('[')) {
    return hasJsoncComment ? 'jsonc' : 'json';
  }

  // If contains typical YAML indicators: "key: value", leading "---", or "# comment"
  if (/^---/m.test(trimmed) || /^[\w.-]+:\s/m.test(trimmed) || /^[\w.-]+:$/m.test(trimmed) || /^#/m.test(trimmed)) {
    return 'yaml';
  }

  // Default heuristic: try JSON parse, then TOML, then YAML
  try {
    JSON.parse(trimmed);
    return 'json';
  } catch {
    if (hasTomlSectionHeader || hasTomlAssignment) {
      return 'toml';
    }
    return 'yaml';
  }
}

/**
 * Parses a raw document string (JSON, JSONC, YAML, or TOML) into a normalized ParsedDocument.
 */
export function parseDocument(rawText: string, forcedFormat?: DocumentFormat): ParsedDocument {
  const format = forcedFormat || detectFormat(rawText);
  const indentStyle = detectIndentation(rawText);
  const quoteStyle = detectQuoteStyle(rawText);
  const comments: Record<string, string> = {};

  if (format === 'toml') {
    const lines = rawText.split('\n');
    lines.forEach((line, idx) => {
      const commentMatch = line.match(/#(.*)$/);
      if (commentMatch) {
        comments[`line_${idx + 1}`] = commentMatch[1].trim();
      }
    });

    try {
      const data = rawText.trim() ? parseToml(rawText) : {};
      return {
        format: 'toml',
        rawText,
        data,
        parseError: null,
        indentStyle,
        quoteStyle,
        comments,
      };
    } catch (err: any) {
      return {
        format: 'toml',
        rawText,
        data: {},
        parseError: err.message || 'Failed to parse TOML',
        indentStyle,
        quoteStyle,
        comments,
      };
    }
  }

  if (format === 'yaml') {
    // Check for tab indentation issues
    const yamlIssues: YamlLintIssue[] = lintYamlTabs(rawText);

    try {
      // Use YAML.parseDocument to also extract comments if needed
      const doc = YAML.parseDocument(rawText);
      const data = doc.toJSON() ?? {};

      // Collect YAML comments if any
      const lines = rawText.split('\n');
      lines.forEach((line, idx) => {
        const commentMatch = line.match(/#(.*)$/);
        if (commentMatch) {
          comments[`line_${idx + 1}`] = commentMatch[1].trim();
        }
      });

      return {
        format: 'yaml',
        rawText,
        data,
        parseError: doc.errors.length > 0 ? doc.errors[0].message : null,
        yamlIssues,
        indentStyle,
        quoteStyle,
        comments,
      };
    } catch (err: any) {
      return {
        format: 'yaml',
        rawText,
        data: {},
        parseError: err.message || 'Failed to parse YAML',
        yamlIssues,
        indentStyle,
        quoteStyle,
        comments,
      };
    }
  }

  // JSON or JSONC
  // Use repair engine to handle comments, single quotes, trailing commas, and partial/broken payloads
  const repairResult = repairJsonc(rawText);

  return {
    format,
    rawText,
    data: repairResult.parsedData,
    parseError: null,
    repairInfo: repairResult.repairInfo,
    indentStyle,
    quoteStyle,
    comments: repairResult.comments,
  };
}
