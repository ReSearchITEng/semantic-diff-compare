/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import YAML from 'yaml';
import { parse as parseToml } from 'smol-toml';
import { DocumentFormat, ParsedDocument, YamlLintIssue } from './types';
import { extractAndStripComments, repairJsonc } from './jsoncRepair';
import { convertTabsToSpaces, detectIndentation, detectQuoteStyle, lintYamlTabs } from './yamlLinter';

/**
 * Detects whether the input string is likely JSON, JSONC, TOML, or YAML.
 * Strips leading/inline // and /* *\/ comments before inspecting root delimiters
 * so JSONC payloads with top-level header comments are never misclassified as YAML.
 */
export function detectFormat(text: string): DocumentFormat {
  const trimmed = text.trim();
  if (!trimmed) return 'json';

  // Check for JSONC comments (single-line // or block /* */ outside strings)
  const { cleanJson, comments } = extractAndStripComments(trimmed);
  const cleanTrimmed = cleanJson.trim();
  const hasJsoncComment = comments.length > 0;
  const hasTrailingComma = /,\s*[}\]]/.test(cleanTrimmed);

  // If stripped of // and /* */ comments it starts with '{', it is definitely JSON or JSONC
  if (cleanTrimmed.startsWith('{')) {
    return hasJsoncComment || hasTrailingComma ? 'jsonc' : 'json';
  }

  // Check for TOML indicators:
  // 1. [section] or [[array_of_tables]] on its own line
  // 2. Top-level or section `key = value` assignment (including quoted keys)
  const lines = trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('//'));
  const hasTomlSectionHeader = lines.some((l) => /^\[\[?[^\]\n]+\]\]?\s*(#.*)?$/.test(l));
  const hasTomlAssignment = lines.some((l) => /^([a-zA-Z0-9_.-]+|"[^"]+"|'[^']+')\s*=\s*.+$/.test(l));

  if (hasTomlAssignment && (hasTomlSectionHeader || !cleanTrimmed.startsWith('['))) {
    try {
      parseToml(trimmed);
      return 'toml';
    } catch {
      // Fall through if not valid TOML
    }
  }

  // If starts with '[' and wasn't valid TOML, it is a JSON/JSONC array
  if (cleanTrimmed.startsWith('[')) {
    return hasJsoncComment || hasTrailingComma ? 'jsonc' : 'json';
  }

  // If contains typical YAML indicators: "key: value", leading "---", or "# comment"
  if (
    /^---/m.test(trimmed) ||
    /^[\w.-]+:\s/m.test(trimmed) ||
    /^[\w.-]+:$/m.test(trimmed) ||
    /^#/m.test(trimmed)
  ) {
    return 'yaml';
  }

  // Default heuristic: try JSON parse, then TOML, then YAML
  try {
    JSON.parse(cleanTrimmed);
    return hasJsoncComment ? 'jsonc' : 'json';
  } catch {
    if (hasTomlSectionHeader || hasTomlAssignment) {
      try {
        parseToml(trimmed);
        return 'toml';
      } catch {
        // Fall through
      }
    }
    return 'yaml';
  }
}

/**
 * Parses a raw document string (JSON, JSONC, YAML, or TOML) into a normalized ParsedDocument.
 */
export function parseDocument(rawText: string, forcedFormat?: DocumentFormat): ParsedDocument {
  const detected = detectFormat(rawText);
  // Use forcedFormat only if provided and consistent with rawText, or fallback safely
  const format = forcedFormat || detected;
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
      const parsed = rawText.trim() ? parseToml(rawText) : {};
      // Normalize prototype-less TOML tables into standard plain JS objects
      const data = JSON.parse(JSON.stringify(parsed));
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
    // Check for illegal tab indentation issues on the original rawText
    const yamlIssues: YamlLintIssue[] = lintYamlTabs(rawText);
    // Normalize tabs to 2 spaces before parsing so YAML hierarchy is preserved even when tabs exist
    const parseableYaml = yamlIssues.length > 0 ? convertTabsToSpaces(rawText, 2) : rawText;

    try {
      const doc = YAML.parseDocument(parseableYaml);
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

export interface PasteValidationResult {
  valid: boolean;
  error?: string;
  detectedFormat?: DocumentFormat;
}

/**
 * Validates whether pasted content is valid JSON, JSONC, YAML, or TOML representing
 * a structured object or array before updating pane state.
 */
export function validatePastedDocument(rawText: string): PasteValidationResult {
  if (!rawText || !rawText.trim()) {
    return {
      valid: false,
      error: 'Clipboard content is empty.',
    };
  }

  const trimmed = rawText.trim();

  // Strip JSONC comments to inspect if it starts with JSON delimiters '{' or '['
  const { cleanJson, comments } = extractAndStripComments(trimmed);
  const cleanTrimmed = cleanJson.trim();

  // Case 1: Starts with '{' -> Must be valid JSON or JSONC object
  if (cleanTrimmed.startsWith('{')) {
    if (!cleanTrimmed.endsWith('}')) {
      return {
        valid: false,
        error: 'Invalid JSON syntax: Missing closing brace "}".',
      };
    }
    const withoutTrailingCommas = cleanTrimmed.replace(/,(\s*[}\]])/g, '$1');
    try {
      const parsed = JSON.parse(withoutTrailingCommas);
      if (parsed !== null && typeof parsed === 'object') {
        return {
          valid: true,
          detectedFormat:
            comments.length > 0 || withoutTrailingCommas !== cleanTrimmed ? 'jsonc' : 'json',
        };
      }
    } catch (err: any) {
      // Also allow single-quoted JSONC if valid when single quotes are normalized
      try {
        const normalizedQuotes = withoutTrailingCommas.replace(
          /'([^'\\]*(?:\\.[^'\\]*)*)'/g,
          '"$1"'
        );
        const parsedJsonc = JSON.parse(normalizedQuotes);
        if (parsedJsonc !== null && typeof parsedJsonc === 'object') {
          return { valid: true, detectedFormat: 'jsonc' };
        }
      } catch {
        // Fall through to return original JSON.parse error
      }
      return {
        valid: false,
        error: `Invalid JSON syntax: ${err.message || 'Malformed JSON object.'}`,
      };
    }
  }

  // Case 2: Check for TOML before JSON array (since TOML sections start with '[section]')
  const nonCommentLines = trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('//'));
  const hasTomlSectionHeader = nonCommentLines.some((l) =>
    /^\[\[?[^\]\n]+\]\]?\s*(#.*)?$/.test(l)
  );
  const hasTomlAssignment = nonCommentLines.some((l) =>
    /^([a-zA-Z0-9_.-]+|"[^"]+"|'[^']+')\s*=\s*.+$/.test(l)
  );

  if (hasTomlSectionHeader || (hasTomlAssignment && !cleanTrimmed.startsWith('['))) {
    try {
      const parsedToml = parseToml(trimmed);
      if (parsedToml && typeof parsedToml === 'object' && Object.keys(parsedToml).length > 0) {
        return { valid: true, detectedFormat: 'toml' };
      }
    } catch (err: any) {
      return {
        valid: false,
        error: `Invalid TOML syntax: ${err.message || 'Malformed TOML content.'}`,
      };
    }
  }

  // Case 3: Starts with '[' (and wasn't TOML) -> Must be valid JSON or JSONC array
  if (cleanTrimmed.startsWith('[')) {
    if (!cleanTrimmed.endsWith(']')) {
      return {
        valid: false,
        error: 'Invalid JSON syntax: Missing closing bracket "]".',
      };
    }
    const withoutTrailingCommas = cleanTrimmed.replace(/,(\s*[}\]])/g, '$1');
    try {
      const parsed = JSON.parse(withoutTrailingCommas);
      if (Array.isArray(parsed)) {
        return {
          valid: true,
          detectedFormat:
            comments.length > 0 || withoutTrailingCommas !== cleanTrimmed ? 'jsonc' : 'json',
        };
      }
    } catch (err: any) {
      return {
        valid: false,
        error: `Invalid JSON array syntax: ${err.message || 'Malformed JSON array.'}`,
      };
    }
  }

  // Case 4: YAML validation
  // Ensure there is at least one YAML mapping key:value or sequence item '- '
  const hasYamlStructure = nonCommentLines.some(
    (l) =>
      /^([a-zA-Z0-9_./-]+|"[^"]+"|'[^']+')\s*:(?:\s+.*|$)/.test(l) ||
      /^-\s+.+/.test(l) ||
      l === '---'
  );
  if (!hasYamlStructure) {
    return {
      valid: false,
      error:
        'Invalid JSON/YAML content: Expected a structured JSON, YAML, or TOML object or array.',
    };
  }

  try {
    const normalizedYaml = convertTabsToSpaces(trimmed, 2);
    const yamlDoc = YAML.parseDocument(normalizedYaml);
    if (yamlDoc.errors && yamlDoc.errors.length > 0) {
      return {
        valid: false,
        error: `Invalid YAML syntax: ${yamlDoc.errors[0].message.split('\n')[0]}`,
      };
    }
    const data = yamlDoc.toJSON();
    if (data === null || typeof data !== 'object') {
      return {
        valid: false,
        error: 'Invalid YAML content: Root value must be a mapping (object) or sequence (array).',
      };
    }
    return {
      valid: true,
      detectedFormat: 'yaml',
    };
  } catch (err: any) {
    return {
      valid: false,
      error: `Invalid YAML syntax: ${err.message || 'Unable to parse YAML.'}`,
    };
  }
}

