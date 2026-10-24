/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import YAML from 'yaml';
import { stringify as stringifyToml } from 'smol-toml';
import { DocumentFormat, ParsedDocument } from './types';
import { convertTabsToSpaces } from './yamlLinter';

/**
 * Recursively prepares a JavaScript value tree for TOML serialization.
 * TOML v1.0 does not have a native null keyword, so null properties are converted
 * to empty strings "" (or omitted if undefined) so stringifyToml never fails.
 */
function sanitizeForToml(val: any): any {
  if (val === null || val === undefined) {
    return '';
  }
  if (Array.isArray(val)) {
    return val.map((item) => sanitizeForToml(item));
  }
  if (typeof val === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        out[k] = sanitizeForToml(v);
      }
    }
    return out;
  }
  return val;
}

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
      const rootObj = Array.isArray(data) ? { items: data } : data;
      return stringifyToml(sanitizeForToml(rootObj)).trimEnd();
    } catch {
      return JSON.stringify(data, null, indentSize);
    }
  }
  if (targetFormat === 'yaml') {
    return YAML.stringify(data, { indent: indentSize }).trimEnd();
  }
  if (targetFormat === 'jsonc') {
    const jsonStr = JSON.stringify(data, null, indentSize);
    if (jsonStr.startsWith('{\n')) {
      return `{\n  // JSONC configuration (comments & trailing commas supported)\n${jsonStr.slice(2)}`;
    }
    return `// JSONC configuration\n${jsonStr}`;
  }
  return JSON.stringify(data, null, indentSize);
}

/**
 * Prettifies document data into formatted multiline text.
 */
export function prettifyOpened(doc: ParsedDocument, indentSize = 2): string {
  return convertDocumentToFormat(doc, doc.format, indentSize);
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
  return convertDocumentToFormat(
    targetDoc,
    sourceDoc.format,
    sourceDoc.indentStyle.size || 2
  );
}

/**
 * Normalizes YAML tabs to 2 spaces.
 */
export function normalizeTabsToSpaces(rawText: string): string {
  return convertTabsToSpaces(rawText, 2);
}
