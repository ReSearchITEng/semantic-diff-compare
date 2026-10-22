/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import YAML from 'yaml';
import { stringify as stringifyToml } from 'smol-toml';
import { DocumentFormat, ParsedDocument } from './types';
import { convertTabsToSpaces } from './yamlLinter';

/**
 * Converts a parsed document's data to any target format (json, jsonc, yaml, toml).
 */
export function convertDocumentToFormat(
  doc: ParsedDocument,
  targetFormat: DocumentFormat,
  indentSize = 2
): string {
  const data = doc.data ?? {};
  if (targetFormat === 'toml') {
    try {
      return stringifyToml(data).trimEnd();
    } catch {
      return JSON.stringify(data, null, indentSize);
    }
  }
  if (targetFormat === 'yaml') {
    return YAML.stringify(data, { indent: indentSize }).trimEnd();
  }
  if (targetFormat === 'jsonc') {
    return `// Converted to JSONC\n${JSON.stringify(data, null, indentSize)}`;
  }
  return JSON.stringify(data, null, indentSize);
}

/**
 * Prettifies document data into formatted multiline text.
 */
export function prettifyOpened(doc: ParsedDocument, indentSize = 2): string {
  if (doc.format === 'toml') {
    try {
      return stringifyToml(doc.data ?? {}).trimEnd();
    } catch {
      return JSON.stringify(doc.data, null, indentSize);
    }
  }
  if (doc.format === 'yaml') {
    return YAML.stringify(doc.data, { indent: indentSize }).trimEnd();
  }
  return JSON.stringify(doc.data, null, indentSize);
}

/**
 * Minifies/condenses document into compact single-line JSON.
 */
export function prettifyCondensed(doc: ParsedDocument): string {
  return JSON.stringify(doc.data);
}

/**
 * Strips comments and trailing commas to export pure valid JSON.
 */
export function exportPureJson(doc: ParsedDocument, indentSize = 2): string {
  return JSON.stringify(doc.data, null, indentSize);
}

/**
 * Adopts format of source document and applies it to target document's data.
 */
export function adoptFormat(sourceDoc: ParsedDocument, targetDoc: ParsedDocument): string {
  if (sourceDoc.format === 'toml') {
    try {
      return stringifyToml(targetDoc.data ?? {}).trimEnd();
    } catch {
      return JSON.stringify(targetDoc.data, null, 2);
    }
  }

  if (sourceDoc.format === 'yaml') {
    return YAML.stringify(targetDoc.data, {
      indent: sourceDoc.indentStyle.size || 2,
    }).trimEnd();
  }

  const indent = sourceDoc.indentStyle.type === 'tab' ? '\t' : ' '.repeat(sourceDoc.indentStyle.size || 2);
  return JSON.stringify(targetDoc.data, null, indent);
}

/**
 * Normalizes YAML tabs to 2 spaces.
 */
export function normalizeTabsToSpaces(rawText: string): string {
  return convertTabsToSpaces(rawText, 2);
}
