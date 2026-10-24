/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AlignedCell,
  AlignedDiffRow,
  DiffOptions,
  DiffStatistics,
  DiffStatus,
  DocumentFormat,
  ParsedDocument,
  ValueType,
} from './types';

/**
 * Strips matching outer quotes ('...' or "...") from a string for quote-agnostic comparison.
 */
function stripOuterQuotes(s: string): string {
  if (s.length >= 2) {
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1);
    }
  }
  return s;
}

/**
 * Checks if two primitive or composite values are semantically equal.
 * Ignores key order in objects.
 * If ignoreListOrder is true, arrays are compared as multisets.
 * If ignoreQuoteStyle is true (default), strings with different outer quotes are treated as equal.
 */
export function areValuesEqual(
  a: any,
  b: any,
  ignoreListOrder = false,
  ignoreQuoteStyle = true
): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return a === b;

  const typeA = typeof a;
  const typeB = typeof b;
  if (typeA !== typeB) return false;

  if (typeA === 'string' && typeB === 'string') {
    if (a === b) return true;
    if (ignoreQuoteStyle && stripOuterQuotes(a) === stripOuterQuotes(b)) {
      return true;
    }
    return false;
  }

  if (typeA !== 'object') {
    return a === b;
  }

  const isArrA = Array.isArray(a);
  const isArrB = Array.isArray(b);
  if (isArrA !== isArrB) return false;

  if (isArrA) {
    if (a.length !== b.length) return false;
    if (!ignoreListOrder) {
      for (let i = 0; i < a.length; i++) {
        if (!areValuesEqual(a[i], b[i], ignoreListOrder, ignoreQuoteStyle)) return false;
      }
      return true;
    } else {
      // Unordered array comparison (multiset match)
      const matchedIndices = new Set<number>();
      for (const itemA of a) {
        let found = false;
        for (let j = 0; j < b.length; j++) {
          if (!matchedIndices.has(j) && areValuesEqual(itemA, b[j], true, ignoreQuoteStyle)) {
            matchedIndices.add(j);
            found = true;
            break;
          }
        }
        if (!found) return false;
      }
      return true;
    }
  }

  // Object comparison
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!areValuesEqual(a[key], b[key], ignoreListOrder, ignoreQuoteStyle)) return false;
  }

  return true;
}

/**
 * Checks if a given path or key matches any ignored field filter.
 */
export function isFieldIgnored(key: string, path: string, ignoredFields: string[]): boolean {
  if (!ignoredFields || ignoredFields.length === 0) return false;
  const cleanKey = key.replace(/^['"]|['"]$/g, '');
  const lowerPath = path.toLowerCase();
  for (const filter of ignoredFields) {
    const cleanFilter = filter.trim().toLowerCase();
    if (!cleanFilter) continue;
    if (cleanKey.toLowerCase() === cleanFilter) return true;
    if (
      lowerPath.includes(`.${cleanFilter}`) ||
      lowerPath.includes(`['${cleanFilter}']`) ||
      lowerPath.includes(`["${cleanFilter}"]`) ||
      lowerPath.endsWith(`[${cleanFilter}]`)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Builds a canonical JSONPath for a child key, using bracket notation when the key contains dots or slashes.
 */
export function buildChildPath(parentPath: string, childKey: string): string {
  const base = parentPath || '$';
  if (childKey.startsWith('[') && childKey.endsWith(']')) {
    return `${base}${childKey}`;
  }
  if (/^[a-zA-Z0-9_-]+$/.test(childKey)) {
    return `${base}.${childKey}`;
  }
  const escaped = childKey.replace(/'/g, "\\'");
  return `${base}['${escaped}']`;
}

function getValueType(val: any): ValueType {
  if (val === null) return 'null';
  if (Array.isArray(val)) return 'array';
  const t = typeof val;
  if (t === 'string') return 'string';
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  if (t === 'object') return 'object';
  return 'unknown';
}

function formatPrimitiveValue(
  val: any,
  quoteStyle: 'single' | 'double' = 'double',
  format: DocumentFormat = 'json',
  ignoreQuoteStyle = true
): string {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (typeof val === 'object') {
    return JSON.stringify(val);
  }
  if (typeof val === 'string') {
    const cleanVal = ignoreQuoteStyle ? stripOuterQuotes(val) : val;
    if (
      format === 'yaml' &&
      !cleanVal.includes(':') &&
      !cleanVal.includes('\n') &&
      !cleanVal.includes('#') &&
      cleanVal.trim() === cleanVal
    ) {
      if (cleanVal !== 'true' && cleanVal !== 'false' && isNaN(Number(cleanVal)) && cleanVal !== '') {
        return cleanVal;
      }
    }
    const effectiveQuote = ignoreQuoteStyle ? 'double' : quoteStyle;
    const q = effectiveQuote === 'single' ? "'" : '"';
    return `${q}${cleanVal.replace(new RegExp(q, 'g'), `\\${q}`)}${q}`;
  }
  return String(val);
}

function formatKeyValueLine(
  key: string,
  valFormatted: string,
  format: DocumentFormat,
  quoteStyle: 'single' | 'double',
  ignoreQuoteStyle = true
): string {
  if (!key) return valFormatted;
  const fk = formatKey(key, format, quoteStyle, ignoreQuoteStyle);
  if (format === 'toml' && !(key.startsWith('[') && key.endsWith(']'))) {
    return `${fk} = ${valFormatted}`;
  }
  return `${fk}: ${valFormatted}`;
}

function formatKey(
  key: string,
  format: DocumentFormat,
  quoteStyle: 'single' | 'double',
  ignoreQuoteStyle = true
): string {
  if (key.startsWith('[') && key.endsWith(']')) {
    return key;
  }
  if ((format === 'yaml' || format === 'toml') && /^[a-zA-Z0-9_-]+$/.test(key)) {
    return key;
  }
  const effectiveQuote = ignoreQuoteStyle ? 'double' : quoteStyle;
  const q = effectiveQuote === 'single' ? "'" : '"';
  return `${q}${key}${q}`;
}

let rowCounter = 0;

/**
 * Common identity keys used to match objects inside unordered arrays
 * (e.g. Kubernetes containers/env/ports/volumes, package manifests, service configs).
 */
const ARRAY_OBJECT_IDENTITY_KEYS = [
  'name',
  'id',
  'key',
  'containerPort',
  'mountPath',
  'path',
  'host',
  'service',
  'app',
  'uid',
  'manager',
];

function isPlainObject(v: any): v is Record<string, any> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Computes a structural & value similarity score in [0, 1] between two composite items
 * so modified objects in unordered lists remain aligned side-by-side instead of splitting
 * into disconnected delete + add blocks.
 */
function computeItemSimilarity(a: any, b: any, ignoreQuoteStyle: boolean): number {
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    const unionKeys = new Set([...keysA, ...keysB]);
    if (unionKeys.size === 0) return 1;

    const sharedKeys = keysA.filter((k) => Object.prototype.hasOwnProperty.call(b, k));
    if (sharedKeys.length === 0) return 0;

    const keySchemaScore = sharedKeys.length / unionKeys.size;
    let matchingValues = 0;
    for (const k of sharedKeys) {
      if (areValuesEqual(a[k], b[k], true, ignoreQuoteStyle)) {
        matchingValues += 1;
      } else if (isPlainObject(a[k]) && isPlainObject(b[k])) {
        matchingValues += 0.5 * computeItemSimilarity(a[k], b[k], ignoreQuoteStyle);
      }
    }
    const valueScore = matchingValues / unionKeys.size;
    return keySchemaScore * 0.6 + valueScore * 0.4;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length === 0 && b.length === 0) return 1;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    let matches = 0;
    const usedB = new Set<number>();
    for (const itemA of a) {
      for (let j = 0; j < b.length; j++) {
        if (!usedB.has(j) && areValuesEqual(itemA, b[j], true, ignoreQuoteStyle)) {
          usedB.add(j);
          matches++;
          break;
        }
      }
    }
    return matches / maxLen;
  }

  return 0;
}

/**
 * Multi-pass alignment for arrays when ignoreListOrder is enabled:
 * Pass 1: Exact deep semantic equality match.
 * Pass 2: Object identity key match (e.g. matching env vars or containers by `name` or `id` even when values changed).
 * Pass 3: Structural similarity match for modified objects/arrays (e.g. matching objects sharing >= 35% schema/values).
 * Pass 4: Remaining unmatched Left items (deleted_right) and Right items (added_right).
 */
function alignUnorderedArrayItems(
  leftArr: any[],
  rightArr: any[],
  ignoreQuoteStyle: boolean
): { leftItem?: any; rightItem?: any; leftIdx?: number; rightIdx?: number }[] {
  const matchedLeftToRight = new Map<number, number>();
  const matchedRight = new Set<number>();

  // Pass 1: Exact semantic match
  for (let i = 0; i < leftArr.length; i++) {
    const itemL = leftArr[i];
    for (let j = 0; j < rightArr.length; j++) {
      if (!matchedRight.has(j) && areValuesEqual(itemL, rightArr[j], true, ignoreQuoteStyle)) {
        matchedLeftToRight.set(i, j);
        matchedRight.add(j);
        break;
      }
    }
  }

  // Pass 2: Object identity key match (e.g. `name`, `id`, `key`, `containerPort`)
  for (let i = 0; i < leftArr.length; i++) {
    if (matchedLeftToRight.has(i)) continue;
    const itemL = leftArr[i];
    if (!isPlainObject(itemL)) continue;

    let foundIdx = -1;
    for (const idKey of ARRAY_OBJECT_IDENTITY_KEYS) {
      if (itemL[idKey] !== undefined && itemL[idKey] !== null && typeof itemL[idKey] !== 'object') {
        for (let j = 0; j < rightArr.length; j++) {
          if (matchedRight.has(j)) continue;
          const itemR = rightArr[j];
          if (
            isPlainObject(itemR) &&
            itemR[idKey] !== undefined &&
            areValuesEqual(itemL[idKey], itemR[idKey], true, ignoreQuoteStyle)
          ) {
            foundIdx = j;
            break;
          }
        }
        if (foundIdx >= 0) break;
      }
    }

    if (foundIdx >= 0) {
      matchedLeftToRight.set(i, foundIdx);
      matchedRight.add(foundIdx);
    }
  }

  // Pass 3: Structural similarity match for remaining modified objects/arrays
  const candidates: { leftIdx: number; rightIdx: number; score: number }[] = [];
  for (let i = 0; i < leftArr.length; i++) {
    if (matchedLeftToRight.has(i)) continue;
    const itemL = leftArr[i];
    if (!isPlainObject(itemL) && !Array.isArray(itemL)) continue;

    for (let j = 0; j < rightArr.length; j++) {
      if (matchedRight.has(j)) continue;
      const itemR = rightArr[j];
      if (isPlainObject(itemL) !== isPlainObject(itemR) || Array.isArray(itemL) !== Array.isArray(itemR)) {
        continue;
      }
      const sim = computeItemSimilarity(itemL, itemR, ignoreQuoteStyle);
      if (sim >= 0.35) {
        // Add tiny positional tie-breaker so items at same index prefer each other on equal similarity
        const tieBreaker = 0.001 / (1 + Math.abs(i - j));
        candidates.push({ leftIdx: i, rightIdx: j, score: sim + tieBreaker });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  for (const cand of candidates) {
    if (!matchedLeftToRight.has(cand.leftIdx) && !matchedRight.has(cand.rightIdx)) {
      matchedLeftToRight.set(cand.leftIdx, cand.rightIdx);
      matchedRight.add(cand.rightIdx);
    }
  }

  // Build final aligned pairs in Left's order, followed by unmatched Right items
  const pairs: { leftItem?: any; rightItem?: any; leftIdx?: number; rightIdx?: number }[] = [];
  for (let i = 0; i < leftArr.length; i++) {
    if (matchedLeftToRight.has(i)) {
      const rIdx = matchedLeftToRight.get(i)!;
      pairs.push({
        leftItem: leftArr[i],
        rightItem: rightArr[rIdx],
        leftIdx: i,
        rightIdx: rIdx,
      });
    } else {
      pairs.push({ leftItem: leftArr[i], leftIdx: i });
    }
  }

  for (let j = 0; j < rightArr.length; j++) {
    if (!matchedRight.has(j)) {
      pairs.push({ rightItem: rightArr[j], rightIdx: j });
    }
  }

  return pairs;
}

/**
 * Recursively aligns Left and Right data trees using Option A:
 * Rearranges Right pane keys to match Left pane order, pushing unique Right keys to the bottom.
 */
function alignNodes(
  leftVal: any,
  rightVal: any,
  key: string,
  path: string,
  depth: number,
  options: DiffOptions,
  leftFormat: DocumentFormat,
  rightFormat: DocumentFormat,
  leftQuote: 'single' | 'double',
  rightQuote: 'single' | 'double',
  ancestorBlockIds: string[] = [],
  rightPath: string = path
): AlignedDiffRow[] {
  const rows: AlignedDiffRow[] = [];
  const currentBlockId = `block_${path || '$'}`;
  const isIgnored = isFieldIgnored(key, path, options.ignoredFields);
  const ignoreQuoteStyle = options.ignoreQuoteStyle !== false;

  const leftExists = leftVal !== undefined;
  const rightExists = rightVal !== undefined;

  // Case 1: Key exists only in Left (deleted in Right)
  if (leftExists && !rightExists) {
    return generateSingleSideRows(
      leftVal,
      key,
      path,
      depth,
      'left',
      'deleted_right',
      isIgnored,
      leftFormat,
      leftQuote,
      ignoreQuoteStyle,
      ancestorBlockIds
    );
  }

  // Case 2: Key exists only in Right (added in Right)
  if (!leftExists && rightExists) {
    return generateSingleSideRows(
      rightVal,
      key,
      rightPath,
      depth,
      'right',
      'added_right',
      isIgnored,
      rightFormat,
      rightQuote,
      ignoreQuoteStyle,
      ancestorBlockIds
    );
  }

  // Both exist!
  const leftType = getValueType(leftVal);
  const rightType = getValueType(rightVal);

  // Subcase: Left is composite (object/array) but Right is primitive/null
  if ((leftType === 'object' || leftType === 'array') && rightType !== 'object' && rightType !== 'array') {
    const leftRows = generateSingleSideRows(
      leftVal,
      key,
      path,
      depth,
      'left',
      'modified',
      isIgnored,
      leftFormat,
      leftQuote,
      ignoreQuoteStyle,
      ancestorBlockIds
    );
    if (leftRows.length > 0) {
      const rightValStr = formatPrimitiveValue(rightVal, rightQuote, rightFormat, ignoreQuoteStyle);
      leftRows[0].right = {
        key,
        path: rightPath,
        formattedText: formatKeyValueLine(key, rightValStr, rightFormat, rightQuote, ignoreQuoteStyle),
        value: rightVal,
        valueType: rightType,
        indent: depth * 2,
      };
      leftRows[0].canMergeLeftToRight = true;
      leftRows[0].canMergeRightToLeft = true;
      leftRows[0].status = isIgnored ? 'ignored_diff' : 'modified';
    }
    return leftRows;
  }

  // Subcase: Right is composite (object/array) but Left is primitive/null
  if ((rightType === 'object' || rightType === 'array') && leftType !== 'object' && leftType !== 'array') {
    const rightRows = generateSingleSideRows(
      rightVal,
      key,
      rightPath,
      depth,
      'right',
      'modified',
      isIgnored,
      rightFormat,
      rightQuote,
      ignoreQuoteStyle,
      ancestorBlockIds
    );
    if (rightRows.length > 0) {
      const leftValStr = formatPrimitiveValue(leftVal, leftQuote, leftFormat, ignoreQuoteStyle);
      rightRows[0].left = {
        key,
        path,
        formattedText: formatKeyValueLine(key, leftValStr, leftFormat, leftQuote, ignoreQuoteStyle),
        value: leftVal,
        valueType: leftType,
        indent: depth * 2,
      };
      rightRows[0].canMergeLeftToRight = true;
      rightRows[0].canMergeRightToLeft = true;
      rightRows[0].status = isIgnored ? 'ignored_diff' : 'modified';
    }
    return rightRows;
  }

  // Both are primitives or types mismatch between primitives
  if (leftType !== 'object' && leftType !== 'array' && rightType !== 'object' && rightType !== 'array') {
    const areEqual = areValuesEqual(leftVal, rightVal, options.ignoreListOrder, ignoreQuoteStyle);
    let status: DiffStatus = 'unchanged';
    if (!areEqual) {
      status = isIgnored ? 'ignored_diff' : 'modified';
    } else if (!ignoreQuoteStyle && leftType === 'string' && leftQuote !== rightQuote) {
      status = 'modified';
    }

    const leftValStr = formatPrimitiveValue(leftVal, leftQuote, leftFormat, ignoreQuoteStyle);
    const rightValStr = formatPrimitiveValue(rightVal, rightQuote, rightFormat, ignoreQuoteStyle);

    const leftCell: AlignedCell = {
      key,
      path,
      formattedText: formatKeyValueLine(key, leftValStr, leftFormat, leftQuote, ignoreQuoteStyle),
      value: leftVal,
      valueType: leftType,
      indent: depth * 2,
    };

    const rightCell: AlignedCell = {
      key,
      path: rightPath,
      formattedText: formatKeyValueLine(key, rightValStr, rightFormat, rightQuote, ignoreQuoteStyle),
      value: rightVal,
      valueType: rightType,
      indent: depth * 2,
    };

    rows.push({
      id: `row_${++rowCounter}`,
      path,
      depth,
      status,
      left: leftCell,
      right: rightCell,
      canMergeLeftToRight: status !== 'unchanged',
      canMergeRightToLeft: status !== 'unchanged',
      diffSummary: status !== 'unchanged' ? `Left: ${JSON.stringify(leftVal)} vs Right: ${JSON.stringify(rightVal)}` : undefined,
      ancestorBlockIds,
    });
    return rows;
  }

  // Case 3: Both are Objects (Maps)
  if (leftType === 'object') {
    const leftKeys = Object.keys(leftVal);
    const rightKeys = Object.keys(rightVal);

    const alignedKeys: string[] = [];
    const seenRight = new Set<string>();

    for (const lk of leftKeys) {
      alignedKeys.push(lk);
      if (lk in rightVal) {
        seenRight.add(lk);
      }
    }

    for (const rk of rightKeys) {
      if (!seenRight.has(rk)) {
        alignedKeys.push(rk);
      }
    }

    const leftIsBraceless = leftFormat === 'yaml' || leftFormat === 'toml';
    const rightIsBraceless = rightFormat === 'yaml' || rightFormat === 'toml';
    const bothHaveBraces = !leftIsBraceless && !rightIsBraceless;

    const formatObjHeader = (fmt: DocumentFormat, q: 'single' | 'double') => {
      if (!key) return fmt === 'yaml' || fmt === 'toml' ? '' : '{';
      if (fmt === 'toml') return `[${key}]`;
      if (fmt === 'yaml') return `${formatKey(key, fmt, q, ignoreQuoteStyle)}:`;
      return `${formatKey(key, fmt, q, ignoreQuoteStyle)}: {`;
    };

    const headerLeftText = formatObjHeader(leftFormat, leftQuote);
    const headerRightText = formatObjHeader(rightFormat, rightQuote);

    // Emit header if this is a named property OR if both documents use braces for root
    const emitHeader = Boolean(key || bothHaveBraces);
    const childAncestors = emitHeader ? [...ancestorBlockIds, currentBlockId] : ancestorBlockIds;

    if (emitHeader) {
      const hasDiffInSubtree = !areValuesEqual(leftVal, rightVal, options.ignoreListOrder, ignoreQuoteStyle);
      rows.push({
        id: `row_${++rowCounter}`,
        path,
        depth,
        status: 'unchanged',
        left: {
          key,
          path,
          formattedText: headerLeftText || '{',
          value: leftVal,
          valueType: 'object',
          indent: depth * 2,
          isBlockHeader: true,
          blockId: currentBlockId,
        },
        right: {
          key,
          path: rightPath,
          formattedText: headerRightText || '{',
          value: rightVal,
          valueType: 'object',
          indent: depth * 2,
          isBlockHeader: true,
          blockId: currentBlockId,
        },
        canMergeLeftToRight: hasDiffInSubtree,
        canMergeRightToLeft: hasDiffInSubtree,
        blockId: currentBlockId,
        ancestorBlockIds,
      });
    }

    // Recurse child keys
    for (const childKey of alignedKeys) {
      const childLeftPath = buildChildPath(path, childKey);
      const childRightPath = buildChildPath(rightPath, childKey);
      const childRows = alignNodes(
        leftVal[childKey],
        rightVal[childKey],
        childKey,
        childLeftPath,
        emitHeader ? depth + 1 : depth,
        options,
        leftFormat,
        rightFormat,
        leftQuote,
        rightQuote,
        childAncestors,
        childRightPath
      );
      rows.push(...childRows);
    }

    // Footer row for JSON closing brace '}' only when both documents use braces
    if (bothHaveBraces) {
      rows.push({
        id: `row_${++rowCounter}`,
        path,
        depth,
        status: 'unchanged',
        left: {
          path,
          formattedText: '}',
          valueType: 'object',
          indent: depth * 2,
          isBlockFooter: true,
          blockId: currentBlockId,
        },
        right: {
          path: rightPath,
          formattedText: '}',
          valueType: 'object',
          indent: depth * 2,
          isBlockFooter: true,
          blockId: currentBlockId,
        },
        canMergeLeftToRight: false,
        canMergeRightToLeft: false,
        blockId: currentBlockId,
        ancestorBlockIds: childAncestors,
      });
    }

    return rows;
  }

  // Case 4: Both are Arrays
  if (leftType === 'array') {
    const leftArr = leftVal as any[];
    const rightArr = rightVal as any[];

    const leftIsBraceless = leftFormat === 'yaml';
    const rightIsBraceless = rightFormat === 'yaml';
    const bothHaveBrackets = !leftIsBraceless && !rightIsBraceless;

    const formatArrHeader = (fmt: DocumentFormat, q: 'single' | 'double') => {
      if (!key) return fmt === 'yaml' ? '' : '[';
      if (fmt === 'yaml') return `${formatKey(key, fmt, q, ignoreQuoteStyle)}:`;
      if (fmt === 'toml') return `${formatKey(key, fmt, q, ignoreQuoteStyle)} = [`;
      return `${formatKey(key, fmt, q, ignoreQuoteStyle)}: [`;
    };

    const headerLeftText = formatArrHeader(leftFormat, leftQuote);
    const headerRightText = formatArrHeader(rightFormat, rightQuote);

    const emitHeader = Boolean(key || bothHaveBrackets);
    const childAncestors = emitHeader ? [...ancestorBlockIds, currentBlockId] : ancestorBlockIds;

    if (emitHeader) {
      const hasDiffInSubtree = !areValuesEqual(leftVal, rightVal, options.ignoreListOrder, ignoreQuoteStyle);
      rows.push({
        id: `row_${++rowCounter}`,
        path,
        depth,
        status: 'unchanged',
        left: {
          key,
          path,
          formattedText: headerLeftText || '[',
          value: leftVal,
          valueType: 'array',
          indent: depth * 2,
          isBlockHeader: true,
          blockId: currentBlockId,
        },
        right: {
          key,
          path: rightPath,
          formattedText: headerRightText || '[',
          value: rightVal,
          valueType: 'array',
          indent: depth * 2,
          isBlockHeader: true,
          blockId: currentBlockId,
        },
        canMergeLeftToRight: hasDiffInSubtree,
        canMergeRightToLeft: hasDiffInSubtree,
        blockId: currentBlockId,
        ancestorBlockIds,
      });
    }

    // Determine array alignment:
    let pairs: { leftItem?: any; rightItem?: any; leftIdx?: number; rightIdx?: number }[] = [];

    if (options.ignoreListOrder) {
      pairs = alignUnorderedArrayItems(leftArr, rightArr, ignoreQuoteStyle);
    } else {
      const maxLen = Math.max(leftArr.length, rightArr.length);
      for (let i = 0; i < maxLen; i++) {
        pairs.push({
          leftItem: i < leftArr.length ? leftArr[i] : undefined,
          rightItem: i < rightArr.length ? rightArr[i] : undefined,
          leftIdx: i < leftArr.length ? i : undefined,
          rightIdx: i < rightArr.length ? i : undefined,
        });
      }
    }

    pairs.forEach((pair) => {
      const leftIdx = pair.leftIdx !== undefined ? pair.leftIdx : pair.rightIdx!;
      const rightIdx = pair.rightIdx !== undefined ? pair.rightIdx : pair.leftIdx!;
      const leftItemPath = `${path}[${leftIdx}]`;
      const rightItemPath = `${rightPath}[${rightIdx}]`;
      const itemKey = `[${leftIdx}]`;

      const childRows = alignNodes(
        pair.leftItem,
        pair.rightItem,
        itemKey,
        leftItemPath,
        emitHeader ? depth + 1 : depth,
        options,
        leftFormat,
        rightFormat,
        leftQuote,
        rightQuote,
        childAncestors,
        rightItemPath
      );
      rows.push(...childRows);
    });

    if (bothHaveBrackets) {
      rows.push({
        id: `row_${++rowCounter}`,
        path,
        depth,
        status: 'unchanged',
        left: {
          path,
          formattedText: ']',
          valueType: 'array',
          indent: depth * 2,
          isBlockFooter: true,
          blockId: currentBlockId,
        },
        right: {
          path: rightPath,
          formattedText: ']',
          valueType: 'array',
          indent: depth * 2,
          isBlockFooter: true,
          blockId: currentBlockId,
        },
        canMergeLeftToRight: false,
        canMergeRightToLeft: false,
        blockId: currentBlockId,
        ancestorBlockIds: childAncestors,
      });
    }

    return rows;
  }

  return rows;
}

/**
 * Generates rows for a subtree that exists only on one side (Left or Right).
 * Both canMergeLeftToRight and canMergeRightToLeft are enabled so the user can either
 * copy the subtree across OR delete the extra subtree.
 */
function generateSingleSideRows(
  val: any,
  key: string,
  path: string,
  depth: number,
  side: 'left' | 'right',
  status: DiffStatus,
  isIgnored: boolean,
  format: DocumentFormat,
  quoteStyle: 'single' | 'double',
  ignoreQuoteStyle = true,
  ancestorBlockIds: string[] = []
): AlignedDiffRow[] {
  const rows: AlignedDiffRow[] = [];
  const type = getValueType(val);
  const effectiveStatus = isIgnored ? 'ignored_diff' : status;
  const blockId = `block_${side}_${path || '$'}`;

  if (type !== 'object' && type !== 'array') {
    const valStr = formatPrimitiveValue(val, quoteStyle, format, ignoreQuoteStyle);
    const formatted = formatKeyValueLine(key, valStr, format, quoteStyle, ignoreQuoteStyle);
    const cell: AlignedCell = {
      key,
      path,
      formattedText: formatted,
      value: val,
      valueType: type,
      indent: depth * 2,
    };

    rows.push({
      id: `row_${++rowCounter}`,
      path,
      depth,
      status: effectiveStatus,
      left: side === 'left' ? cell : undefined,
      right: side === 'right' ? cell : undefined,
      canMergeLeftToRight: true,
      canMergeRightToLeft: true,
      diffSummary:
        side === 'left'
          ? `Present only in Left: ${JSON.stringify(val)}`
          : `Present only in Right: ${JSON.stringify(val)}`,
      ancestorBlockIds,
    });
    return rows;
  }

  // Object or Array subtree
  const isObj = type === 'object';
  const isBraceless = format === 'yaml' || (format === 'toml' && isObj);
  const openBracket = isObj ? '{' : '[';
  const closeBracket = isObj ? '}' : ']';

  let headerText = '';
  if (!key) {
    headerText = isBraceless ? '' : openBracket;
  } else if (format === 'toml' && isObj) {
    headerText = `[${key}]`;
  } else if (format === 'toml' && !isObj) {
    headerText = `${formatKey(key, format, quoteStyle, ignoreQuoteStyle)} = [`;
  } else if (format === 'yaml') {
    headerText = `${formatKey(key, format, quoteStyle, ignoreQuoteStyle)}:`;
  } else {
    headerText = `${formatKey(key, format, quoteStyle, ignoreQuoteStyle)}: ${openBracket}`;
  }

  const emitHeader = Boolean(key || !isBraceless);
  const childAncestors = emitHeader ? [...ancestorBlockIds, blockId] : ancestorBlockIds;

  if (emitHeader) {
    const cell: AlignedCell = {
      key,
      path,
      formattedText: headerText,
      value: val,
      valueType: type,
      indent: depth * 2,
      isBlockHeader: true,
      blockId,
    };

    rows.push({
      id: `row_${++rowCounter}`,
      path,
      depth,
      status: effectiveStatus,
      left: side === 'left' ? cell : undefined,
      right: side === 'right' ? cell : undefined,
      canMergeLeftToRight: true,
      canMergeRightToLeft: true,
      blockId,
      ancestorBlockIds,
    });
  }

  if (isObj) {
    const keys = Object.keys(val);
    for (const childKey of keys) {
      const childPath = buildChildPath(path, childKey);
      const childRows = generateSingleSideRows(
        val[childKey],
        childKey,
        childPath,
        emitHeader ? depth + 1 : depth,
        side,
        effectiveStatus,
        isIgnored,
        format,
        quoteStyle,
        ignoreQuoteStyle,
        childAncestors
      );
      rows.push(...childRows);
    }
  } else {
    const arr = val as any[];
    arr.forEach((item, idx) => {
      const childPath = `${path}[${idx}]`;
      const childRows = generateSingleSideRows(
        item,
        `[${idx}]`,
        childPath,
        emitHeader ? depth + 1 : depth,
        side,
        effectiveStatus,
        isIgnored,
        format,
        quoteStyle,
        ignoreQuoteStyle,
        childAncestors
      );
      rows.push(...childRows);
    });
  }

  if (!isBraceless) {
    const footerCell: AlignedCell = {
      path,
      formattedText: closeBracket,
      valueType: type,
      indent: depth * 2,
      isBlockFooter: true,
      blockId,
    };

    rows.push({
      id: `row_${++rowCounter}`,
      path,
      depth,
      status: effectiveStatus,
      left: side === 'left' ? footerCell : undefined,
      right: side === 'right' ? footerCell : undefined,
      canMergeLeftToRight: false,
      canMergeRightToLeft: false,
      blockId,
      ancestorBlockIds: childAncestors,
    });
  }

  return rows;
}

/**
 * Main Semantic Diff entry point.
 * Computes aligned rows, line numbers, comments integration, and statistics.
 */
export function computeSemanticDiff(
  leftDoc: ParsedDocument,
  rightDoc: ParsedDocument,
  options: DiffOptions
): {
  rows: AlignedDiffRow[];
  stats: DiffStatistics;
} {
  rowCounter = 0;

  const rawRows = alignNodes(
    leftDoc.data,
    rightDoc.data,
    '',
    '$',
    0,
    options,
    leftDoc.format,
    rightDoc.format,
    leftDoc.quoteStyle,
    rightDoc.quoteStyle,
    []
  );

  let leftLine = 1;
  let rightLine = 1;

  const stats: DiffStatistics = {
    unchanged: 0,
    modified: 0,
    addedRight: 0,
    deletedRight: 0,
    ignoredDiff: 0,
    commentDiff: 0,
    totalRows: rawRows.length,
  };

  const finalRows: AlignedDiffRow[] = rawRows.map((row) => {
    if (row.left) {
      row.left.displayLine = leftLine++;
    }
    if (row.right) {
      row.right.displayLine = rightLine++;
    }

    if (row.left && leftDoc.yamlIssues && leftDoc.yamlIssues.length > 0) {
      const lineIssue = leftDoc.yamlIssues.find((issue) => issue.line === row.left?.displayLine);
      if (lineIssue) {
        row.left.hasTabError = true;
      }
    }
    if (row.right && rightDoc.yamlIssues && rightDoc.yamlIssues.length > 0) {
      const lineIssue = rightDoc.yamlIssues.find((issue) => issue.line === row.right?.displayLine);
      if (lineIssue) {
        row.right.hasTabError = true;
      }
    }

    if (row.left && leftDoc.repairInfo?.wasRepaired && leftDoc.repairInfo.breakpointLine) {
      if (row.left.displayLine === leftDoc.repairInfo.breakpointLine) {
        row.left.isRepairedToken = true;
      }
    }
    if (row.right && rightDoc.repairInfo?.wasRepaired && rightDoc.repairInfo.breakpointLine) {
      if (row.right.displayLine === rightDoc.repairInfo.breakpointLine) {
        row.right.isRepairedToken = true;
      }
    }

    // Only count leaf/header differences once (don't count closing footers)
    if (!row.left?.isBlockFooter && !row.right?.isBlockFooter) {
      switch (row.status) {
        case 'unchanged':
          stats.unchanged++;
          break;
        case 'modified':
          stats.modified++;
          break;
        case 'added_right':
          stats.addedRight++;
          break;
        case 'deleted_right':
          stats.deletedRight++;
          break;
        case 'ignored_diff':
          stats.ignoredDiff++;
          break;
        case 'comment_diff':
          stats.commentDiff++;
          break;
      }
    }

    return row;
  });

  return { rows: finalRows, stats };
}
