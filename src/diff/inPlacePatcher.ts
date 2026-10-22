/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import YAML from 'yaml';
import { stringify as stringifyToml } from 'smol-toml';
import { ParsedDocument } from './types';
import { isFieldIgnored, buildChildPath } from './semanticDiff';

/**
 * Parses a JSONPath string into an array of property keys (string) and array indices (number).
 * Supports:
 * - Standard dot notation: $.spec.replicas
 * - Array index notation: $.containers[0].image
 * - Bracket-quoted keys (with dots/slashes): $.metadata.labels['app.kubernetes.io/managed-by']
 */
export function parsePathTokens(path: string): (string | number)[] {
  if (!path || path === '$') return [];
  const clean = path.replace(/^\$\.?/, '');
  const tokens: (string | number)[] = [];

  let i = 0;
  while (i < clean.length) {
    if (clean[i] === '.') {
      i++;
      continue;
    }

    if (clean[i] === '[') {
      const quoteChar = clean[i + 1];
      if (quoteChar === "'" || quoteChar === '"') {
        // Quoted key inside brackets: ['...'] or ["..."]
        let key = '';
        i += 2; // skip ['
        while (i < clean.length) {
          if (clean[i] === '\\' && i + 1 < clean.length) {
            key += clean[i + 1];
            i += 2;
            continue;
          }
          if (clean[i] === quoteChar && clean[i + 1] === ']') {
            i += 2; // skip ']
            break;
          }
          key += clean[i];
          i++;
        }
        tokens.push(key);
      } else {
        // Numeric index inside brackets: [0]
        const closeIdx = clean.indexOf(']', i);
        if (closeIdx !== -1) {
          const inner = clean.slice(i + 1, closeIdx);
          const num = parseInt(inner, 10);
          tokens.push(isNaN(num) ? inner : num);
          i = closeIdx + 1;
        } else {
          break;
        }
      }
      continue;
    }

    // Read until next '.' or '['
    let end = i;
    while (end < clean.length && clean[end] !== '.' && clean[end] !== '[') {
      end++;
    }
    const segment = clean.slice(i, end);
    if (segment) {
      tokens.push(segment);
    }
    i = end;
  }

  return tokens;
}

/**
 * Sets a value in an object or array at a specified JSONPath (e.g., "$.spec.replicas" or "$.metadata.labels['app.kubernetes.io/name']").
 */
export function setValueAtPath(obj: any, path: string, value: any): any {
  if (path === '$' || !path) {
    return value !== undefined ? JSON.parse(JSON.stringify(value)) : {};
  }

  const cloned = JSON.parse(JSON.stringify(obj ?? {}));
  const tokens = parsePathTokens(path);
  if (tokens.length === 0) return cloned;

  let curr = cloned;
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
    const nextToken = tokens[i + 1];

    if (typeof token === 'number') {
      if (!Array.isArray(curr)) curr = [];
      while (curr.length <= token) curr.push(typeof nextToken === 'number' ? [] : {});
      curr = curr[token];
    } else {
      // Fallback: if remaining tokens form a single dotted key already in curr
      const remainingJoined = tokens.slice(i).join('.');
      if (
        curr &&
        typeof curr === 'object' &&
        !(token in curr) &&
        Object.prototype.hasOwnProperty.call(curr, remainingJoined)
      ) {
        if (value === undefined) {
          delete curr[remainingJoined];
        } else {
          curr[remainingJoined] = JSON.parse(JSON.stringify(value));
        }
        return cloned;
      }

      if (curr[token] === undefined || curr[token] === null) {
        curr[token] = typeof nextToken === 'number' ? [] : {};
      }
      curr = curr[token];
    }
  }

  const lastToken = tokens[tokens.length - 1];
  if (value === undefined) {
    if (typeof lastToken === 'number' && Array.isArray(curr)) {
      curr.splice(lastToken, 1);
    } else if (curr && typeof curr === 'object') {
      delete curr[lastToken];
    }
  } else {
    const valCopy = JSON.parse(JSON.stringify(value));
    if (typeof lastToken === 'number' && Array.isArray(curr)) {
      curr[lastToken] = valCopy;
    } else if (curr && typeof curr === 'object') {
      curr[lastToken] = valCopy;
    }
  }

  return cloned;
}

/**
 * Gets value at JSONPath from data tree.
 */
export function getValueAtPath(obj: any, path: string): any {
  if (path === '$' || !path) return obj;
  const tokens = parsePathTokens(path);

  let curr = obj;
  for (let i = 0; i < tokens.length; i++) {
    if (curr === undefined || curr === null) return undefined;
    const token = tokens[i];
    if (typeof token === 'string' && !(token in curr)) {
      // Check if remaining tokens form a single dotted key in curr
      const remainingJoined = tokens.slice(i).join('.');
      if (Object.prototype.hasOwnProperty.call(curr, remainingJoined)) {
        return curr[remainingJoined];
      }
    }
    curr = curr[token];
  }
  return curr;
}

/**
 * Merges sourceData into targetData.
 * When includeIgnoredFields is true, overwrites everything with sourceData.
 * When includeIgnoredFields is false, skips any key/subpath matching ignoredFields,
 * preserving targetData's values for those ignorable fields (or omitting source-only ignored fields).
 */
export function mergeDataTrees(
  sourceData: any,
  targetData: any,
  ignoredFields: string[],
  includeIgnoredFields: boolean,
  currentPath = '$'
): any {
  if (includeIgnoredFields || !ignoredFields || ignoredFields.length === 0) {
    return JSON.parse(JSON.stringify(sourceData ?? {}));
  }

  if (
    sourceData === null ||
    targetData === null ||
    typeof sourceData !== 'object' ||
    typeof targetData !== 'object' ||
    Array.isArray(sourceData) !== Array.isArray(targetData)
  ) {
    return sourceData !== undefined ? JSON.parse(JSON.stringify(sourceData)) : undefined;
  }

  if (Array.isArray(sourceData)) {
    return JSON.parse(JSON.stringify(sourceData));
  }

  // Both are plain objects
  const result: Record<string, any> = {};
  const allKeys = new Set([...Object.keys(targetData), ...Object.keys(sourceData)]);

  for (const key of allKeys) {
    const childPath = buildChildPath(currentPath, key);
    const ignored = isFieldIgnored(key, childPath, ignoredFields);

    if (ignored) {
      // Keep target's existing value for ignored field (if present in target)
      if (Object.prototype.hasOwnProperty.call(targetData, key)) {
        result[key] = JSON.parse(JSON.stringify(targetData[key]));
      }
    } else {
      // Use source's value (recursing if object)
      if (Object.prototype.hasOwnProperty.call(sourceData, key)) {
        result[key] = mergeDataTrees(
          sourceData[key],
          targetData[key],
          ignoredFields,
          includeIgnoredFields,
          childPath
        );
      }
      // If key is not in sourceData and not ignored, it is deleted from target
    }
  }

  return result;
}

/**
 * Serializes data object to text, preserving target document's format, indent style, and quote style.
 */
export function serializePreservingFormat(
  data: any,
  targetDoc: ParsedDocument,
  options?: { pureJson?: boolean }
): string {
  if (options?.pureJson || targetDoc.format === 'json') {
    const indent = targetDoc.indentStyle.type === 'tab' ? '\t' : ' '.repeat(targetDoc.indentStyle.size || 2);
    return JSON.stringify(data, null, indent);
  }

  if (targetDoc.format === 'toml') {
    try {
      return stringifyToml(data ?? {}).trimEnd();
    } catch {
      return JSON.stringify(data, null, 2);
    }
  }

  if (targetDoc.format === 'yaml') {
    const yamlStr = YAML.stringify(data, {
      indent: targetDoc.indentStyle.size || 2,
    });
    return yamlStr.trimEnd();
  }

  // JSONC format
  const indent = targetDoc.indentStyle.type === 'tab' ? '\t' : ' '.repeat(targetDoc.indentStyle.size || 2);
  return JSON.stringify(data, null, indent);
}

/**
 * Parses a user-entered inline string into an appropriate JavaScript primitive or object/array.
 * Supports booleans, numbers, null, quoted strings, JSON arrays/objects, or bare strings.
 */
export function parseInlineValue(rawInput: string): any {
  const trimmed = rawInput.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;

  // Numeric check
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!Number.isNaN(num)) return num;
  }

  // Double-quoted string or JSON literal
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('{') && trimmed.endsWith('}'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fall through if invalid JSON
    }
  }

  // Single-quoted string
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }

  return rawInput;
}

export interface IntraLineDiff {
  prefix: string;
  leftMid: string;
  rightMid: string;
  suffix: string;
}

/**
 * Computes prefix/middle/suffix character-level diff between two lines for the
 * Beyond Compare-style bottom line comparison panel.
 */
export function computeIntraLineDiff(leftText: string, rightText: string): IntraLineDiff {
  if (leftText === rightText) {
    return { prefix: leftText, leftMid: '', rightMid: '', suffix: '' };
  }

  let prefixLen = 0;
  const minLen = Math.min(leftText.length, rightText.length);
  while (prefixLen < minLen && leftText[prefixLen] === rightText[prefixLen]) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen &&
    leftText[leftText.length - 1 - suffixLen] === rightText[rightText.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  return {
    prefix: leftText.slice(0, prefixLen),
    leftMid: leftText.slice(prefixLen, leftText.length - suffixLen),
    rightMid: rightText.slice(prefixLen, rightText.length - suffixLen),
    suffix: suffixLen > 0 ? leftText.slice(leftText.length - suffixLen) : '',
  };
}

