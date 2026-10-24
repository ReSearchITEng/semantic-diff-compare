/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type DocumentFormat = 'json' | 'jsonc' | 'yaml' | 'toml';

export type DiffStatus =
  | 'unchanged'
  | 'modified'
  | 'added_right'
  | 'deleted_right'
  | 'ignored_diff' // For K8s CRD fields (managedFields, resourceVersion, etc.) or quote-only diffs
  | 'comment_diff' // Only comments differ
  | 'spacer';      // Empty spacer row for alignment

export type ValueType =
  | 'object'
  | 'array'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'comment'
  | 'unknown';

export interface ParseRepairInfo {
  wasRepaired: boolean;
  breakpointOffset?: number;
  breakpointLine?: number;
  breakpointCol?: number;
  repairsMade: string[];
}

export interface YamlLintIssue {
  line: number;
  col: number;
  message: string;
  tabCount: number;
}

export interface CommentNode {
  id: string;
  text: string; // The complete comment line, e.g. "# version: v3.0.0"
  cleanText: string; // Stripped comment text
  line: number; // 1-indexed source line number
  indent: number; // Leading spaces
  sectionPath: string; // e.g. "$" or "$.metadata" or "$.certificates"
  beforeKey?: string; // Key or section header this comment precedes
  isTrailing?: boolean; // True if comment is at the end of section or document
}

export interface ParsedDocument {
  format: DocumentFormat;
  rawText: string;
  data: any;
  parseError: string | null;
  repairInfo?: ParseRepairInfo;
  yamlIssues?: YamlLintIssue[];
  indentStyle: {
    type: 'space' | 'tab';
    size: number;
  };
  quoteStyle: 'single' | 'double';
  comments: Record<string, string>; // path -> comment string
  commentNodes?: CommentNode[];
  inlineComments?: Record<string, string>; // path -> inline comment string
}

export interface AlignedCell {
  lineNumber?: number;
  displayLine?: number;
  key?: string;
  path: string; // e.g. "$.spec.template.spec.containers[0].image"
  formattedText: string;
  value?: any;
  valueType: ValueType;
  indent: number;
  isBlockHeader?: boolean; // starts an object or array
  isBlockFooter?: boolean; // closing brace or bracket
  blockId?: string;        // ID for collapsible block
  isFolded?: boolean;
  comment?: string;
  hasTabError?: boolean;
  isRepairedToken?: boolean;
}

export interface AlignedDiffRow {
  id: string;
  path: string;
  depth: number;
  status: DiffStatus;
  left?: AlignedCell;
  right?: AlignedCell;
  canMergeLeftToRight: boolean;
  canMergeRightToLeft: boolean;
  diffSummary?: string;
  blockId?: string;
  ancestorBlockIds?: string[]; // All parent blockIds that contain this row
}

export interface DiffOptions {
  ignoreListOrder: boolean;
  ignoredFields: string[]; // List of field names or subpaths, e.g. ['managedFields', 'resourceVersion']
  ignoreQuoteStyle?: boolean; // Ignore single vs double quote differences (default: true)
}

export interface DiffStatistics {
  unchanged: number;
  modified: number;
  addedRight: number;
  deletedRight: number;
  ignoredDiff: number;
  commentDiff: number;
  totalRows: number;
}

export type ThemeType = 'vscode-dark' | 'solarized-dark' | 'solarized-light';
