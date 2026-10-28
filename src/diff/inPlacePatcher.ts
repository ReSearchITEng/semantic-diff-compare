/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import YAML from 'yaml';
import { stringify as stringifyToml } from 'smol-toml';
import { DocumentFormat, ParsedDocument } from './types';
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

  // Partially typed double-quoted string while live typing (e.g. `"payment-ap`)
  if (trimmed.startsWith('"') && !trimmed.endsWith('"') && trimmed.length > 1) {
    return trimmed.slice(1);
  }
  if (trimmed.startsWith("'") && !trimmed.endsWith("'") && trimmed.length > 1) {
    return trimmed.slice(1);
  }

  return rawInput;
}

export interface ParsedLiveLine {
  key?: string;
  value?: any;
  isValueComplete: boolean;
  isKeyRenamed: boolean;
}

/**
 * Parses a full line edited inside the Live Editor pane into its key and value components.
 */
export function parseEditedLine(
  lineText: string,
  originalKey?: string,
  isBlockHeader?: boolean
): ParsedLiveLine {
  const trimmed = lineText.trim().replace(/,\s*$/, '');

  // Block header line (e.g. `"server": {`, `server:`, `[server]`)
  if (isBlockHeader) {
    const cleanedKey = trimmed
      .replace(/^\[|\]$/g, '')
      .replace(/:\s*[{[]?$/, '')
      .replace(/=\s*[{[]?$/, '')
      .trim()
      .replace(/^['"]|['"]$/g, '');
    return {
      key: cleanedKey || originalKey,
      isValueComplete: false,
      isKeyRenamed: Boolean(cleanedKey && originalKey && cleanedKey !== originalKey),
    };
  }

  // Array item row where originalKey is `[0]`, `[1]`, etc.
  if (originalKey && /^\[\d+\]$/.test(originalKey)) {
    const itemValStr = trimmed.replace(/^-\s*/, '').trim();
    const isValueComplete =
      itemValStr.length > 0 && itemValStr !== '-' && itemValStr !== '"' && itemValStr !== "'";
    return {
      key: originalKey,
      value: isValueComplete ? parseInlineValue(itemValStr) : undefined,
      isValueComplete,
      isKeyRenamed: false,
    };
  }

  // Key-value line (`"key": val`, `key: val`, or `key = val`)
  const eqIdx = trimmed.indexOf(' = ');
  const colonIdx = trimmed.indexOf(':');

  let rawKeyPart = '';
  let rawValPart = '';

  if (eqIdx > 0 && (colonIdx === -1 || eqIdx < colonIdx)) {
    rawKeyPart = trimmed.slice(0, eqIdx).trim();
    rawValPart = trimmed.slice(eqIdx + 3).trim();
  } else if (colonIdx > 0) {
    rawKeyPart = trimmed.slice(0, colonIdx).trim();
    rawValPart = trimmed.slice(colonIdx + 1).trim();
  } else {
    // Fallback if user deleted the separator: treat entire trimmed text as value for originalKey
    const isValueComplete =
      trimmed.length > 0 && trimmed !== '-' && trimmed !== '"' && trimmed !== "'";
    return {
      key: originalKey,
      value: isValueComplete ? parseInlineValue(trimmed) : undefined,
      isValueComplete,
      isKeyRenamed: false,
    };
  }

  const parsedKey = rawKeyPart.replace(/^['"]|['"]$/g, '');
  const isValueComplete =
    rawValPart.length > 0 && rawValPart !== '-' && rawValPart !== '"' && rawValPart !== "'";

  return {
    key: parsedKey || originalKey,
    value: isValueComplete ? parseInlineValue(rawValPart) : undefined,
    isValueComplete,
    isKeyRenamed: Boolean(parsedKey && originalKey && parsedKey !== originalKey),
  };
}

/**
 * Renames a key at `path` inside `obj` while preserving object key order, optionally updating its value.
 */
export function renameKeyAtPath(
  obj: any,
  path: string,
  oldKey: string,
  newKey: string,
  newValue?: any
): { data: any; newPath: string } {
  const cloned = JSON.parse(JSON.stringify(obj ?? {}));
  if (!oldKey || !newKey || oldKey === newKey) {
    const updated = newValue !== undefined ? setValueAtPath(cloned, path, newValue) : cloned;
    return { data: updated, newPath: path };
  }

  const tokens = parsePathTokens(path);
  if (tokens.length === 0) return { data: cloned, newPath: path };

  const parentTokens = tokens.slice(0, -1);
  let parentPath = '$';
  for (const t of parentTokens) {
    parentPath = typeof t === 'number' ? `${parentPath}[${t}]` : buildChildPath(parentPath, t);
  }

  const parentObj = getValueAtPath(cloned, parentPath);
  if (!parentObj || typeof parentObj !== 'object' || Array.isArray(parentObj)) {
    return { data: cloned, newPath: path };
  }

  const reorderedParent: Record<string, any> = {};
  const existingVal = parentObj[oldKey];
  const valToSet = newValue !== undefined ? newValue : existingVal;

  for (const k of Object.keys(parentObj)) {
    if (k === oldKey) {
      reorderedParent[newKey] = valToSet;
    } else {
      reorderedParent[k] = parentObj[k];
    }
  }

  const updatedRoot =
    parentPath === '$' ? reorderedParent : setValueAtPath(cloned, parentPath, reorderedParent);
  const newPath = buildChildPath(parentPath, newKey);
  return { data: updatedRoot, newPath };
}

export interface IntraLineDiff {
  prefix: string;
  leftMid: string;
  rightMid: string;
  suffix: string;
}

/**
 * Computes prefix/middle/suffix character-level diff between two lines for the
 * bottom split line comparison panel.
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

/**
 * Safely replaces a scalar value in rawText in-place while keeping all comments, blank lines,
 * and surrounding structural formatting completely intact.
 */
export function patchRawTextScalar(
  rawText: string,
  key: string,
  path: string,
  newValue: any,
  format: DocumentFormat
): string | null {
  if (!key || newValue === undefined || typeof newValue === 'object') return null;
  const lines = rawText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

    const eqIdx = line.indexOf('=');
    const colonIdx = line.indexOf(':');
    let k = '';
    let sepIdx = -1;

    if (format === 'toml' && eqIdx > 0) {
      k = line.slice(0, eqIdx).trim().replace(/^['"]|['"]$/g, '');
      sepIdx = eqIdx;
    } else if (colonIdx > 0) {
      k = line.slice(0, colonIdx).trim().replace(/^['"]|['"]$/g, '');
      sepIdx = colonIdx;
    }

    if (k === key) {
      const indentMatch = line.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1] : '';
      const afterSep = line.slice(sepIdx + 1);
      const hashIdx = afterSep.indexOf('#');
      const inlineComment = hashIdx >= 0 ? afterSep.slice(hashIdx) : '';
      const formattedVal =
        typeof newValue === 'string'
          ? format === 'yaml' &&
            !newValue.includes(':') &&
            !newValue.includes('\n') &&
            !newValue.includes('#')
            ? newValue
            : JSON.stringify(newValue)
          : String(newValue);

      lines[i] = `${indent}${k}${format === 'toml' ? ' = ' : ': '}${formattedVal}${
        inlineComment ? '  ' + inlineComment : ''
      }`;
      return lines.join('\n');
    }
  }

  return null;
}

/**
 * Updates a comment line at specified 1-based line number in rawText.
 */
export function patchRawTextCommentLine(
  rawText: string,
  lineNumber: number,
  newText: string
): string {
  const lines = rawText.split('\n');
  const idx = lineNumber - 1;
  if (idx >= 0 && idx < lines.length) {
    lines[idx] = newText;
    return lines.join('\n');
  }
  return rawText;
}

/**
 * Safely renames a key in rawText in-place while keeping all comments, blank lines,
 * indentation, and surrounding formatting intact.
 */
export function patchRawTextKeyRename(
  rawText: string,
  oldKey: string,
  newKey: string,
  path: string,
  newValue: any,
  format: DocumentFormat
): string | null {
  if (!oldKey || !newKey || oldKey === newKey) return null;
  const lines = rawText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

    // Check for TOML section header e.g. [oldKey] or [parent.oldKey]
    if (format === 'toml' && trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const headerContent = trimmed.slice(1, -1).trim();
      if (headerContent === oldKey || headerContent.endsWith(`.${oldKey}`)) {
        const newHeader =
          headerContent === oldKey
            ? newKey
            : headerContent.slice(0, -oldKey.length) + newKey;
        const indentMatch = line.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : '';
        lines[i] = `${indent}[${newHeader}]`;
        return lines.join('\n');
      }
    }

    const eqIdx = line.indexOf('=');
    const colonIdx = line.indexOf(':');
    let k = '';
    let sepIdx = -1;

    if (format === 'toml' && eqIdx > 0 && (colonIdx === -1 || eqIdx < colonIdx)) {
      k = line.slice(0, eqIdx).trim().replace(/^['"]|['"]$/g, '');
      sepIdx = eqIdx;
    } else if (colonIdx > 0) {
      k = line.slice(0, colonIdx).trim().replace(/^['"]|['"]$/g, '');
      sepIdx = colonIdx;
    }

    if (k === oldKey) {
      const indentMatch = line.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1] : '';
      const afterSep = line.slice(sepIdx + 1);
      const hashIdx = afterSep.indexOf('#');
      const inlineComment = hashIdx >= 0 ? afterSep.slice(hashIdx) : '';

      // Format new key: quote if JSON or contains special chars
      const formattedKey =
        format === 'json' || format === 'jsonc' || /[.\-\s/]/.test(newKey)
          ? JSON.stringify(newKey)
          : newKey;

      let formattedVal = '';
      if (newValue !== undefined) {
        formattedVal =
          typeof newValue === 'string'
            ? format === 'yaml' &&
              !newValue.includes(':') &&
              !newValue.includes('\n') &&
              !newValue.includes('#')
              ? newValue
              : JSON.stringify(newValue)
            : String(newValue);
      } else {
        // Retain whatever value or structural brace was on this line
        const valWithoutComment = hashIdx >= 0 ? afterSep.slice(0, hashIdx) : afterSep;
        formattedVal = valWithoutComment.trim();
      }

      if (format === 'toml') {
        lines[i] = `${indent}${formattedKey} = ${formattedVal}${inlineComment ? '  ' + inlineComment : ''}`;
      } else {
        lines[i] = `${indent}${formattedKey}: ${formattedVal}${inlineComment ? '  ' + inlineComment : ''}`;
      }
      return lines.join('\n');
    }
  }

  return null;
}


