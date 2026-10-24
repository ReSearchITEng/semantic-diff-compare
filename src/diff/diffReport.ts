/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AlignedDiffRow, DiffStatistics, DiffStatus, ParsedDocument } from './types';

export type DiffReportFormat = 'markdown' | 'json' | 'text';

export interface DiffReportEntry {
  path: string;
  status: DiffStatus;
  leftValue: any;
  rightValue: any;
  leftLine?: number;
  rightLine?: number;
}

export interface GenerateDiffReportParams {
  leftDoc: ParsedDocument;
  rightDoc: ParsedDocument;
  rows: AlignedDiffRow[];
  stats: DiffStatistics;
  format: DiffReportFormat;
  includeIgnored?: boolean;
  ignoredFields?: string[];
  ignoreListOrder?: boolean;
  ignoreQuoteStyle?: boolean;
}

/**
 * Extracts leaf/actionable difference entries from aligned diff rows.
 */
export function extractDiffReportEntries(
  rows: AlignedDiffRow[],
  includeIgnored = true
): DiffReportEntry[] {
  const entries: DiffReportEntry[] = [];
  const seenPaths = new Set<string>();

  for (const row of rows) {
    if (row.status === 'unchanged' || row.status === 'spacer') continue;
    if (!includeIgnored && row.status === 'ignored_diff') continue;
    if (row.left?.isBlockFooter || row.right?.isBlockFooter) continue;
    // Skip pure container headers when both sides are objects/arrays (their children will be reported)
    if (row.left?.isBlockHeader && row.right?.isBlockHeader) continue;

    const key = `${row.status}:${row.path}`;
    if (seenPaths.has(key)) continue;
    seenPaths.add(key);

    entries.push({
      path: row.path,
      status: row.status,
      leftValue: row.left?.value,
      rightValue: row.right?.value,
      leftLine: row.left?.displayLine,
      rightLine: row.right?.displayLine,
    });
  }

  return entries;
}

function formatCellForTable(val: any): string {
  if (val === undefined) return '*(missing)*';
  const raw = typeof val === 'string' ? `"${val}"` : JSON.stringify(val);
  return (raw || String(val)).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/**
 * Generates a complete, exportable semantic diff report in Markdown, JSON, or Plain Text format.
 */
export function generateDiffReport(params: GenerateDiffReportParams): string {
  const {
    leftDoc,
    rightDoc,
    rows,
    stats,
    format,
    includeIgnored = true,
    ignoredFields = [],
    ignoreListOrder = false,
    ignoreQuoteStyle = true,
  } = params;

  const entries = extractDiffReportEntries(rows, includeIgnored);

  if (format === 'json') {
    return JSON.stringify(
      {
        reportType: 'SemantiCompare Diff Report',
        formats: {
          left: leftDoc.format.toUpperCase(),
          right: rightDoc.format.toUpperCase(),
        },
        options: {
          ignoreListOrder,
          ignoreQuoteStyle,
          includeIgnored,
          ignoredFields,
        },
        summary: {
          modified: stats.modified,
          addedRight: stats.addedRight,
          deletedRight: stats.deletedRight,
          ignoredDiff: stats.ignoredDiff,
          unchanged: stats.unchanged,
          totalDifferencesReported: entries.length,
        },
        differences: entries,
      },
      null,
      2
    );
  }

  if (format === 'text') {
    const lines: string[] = [
      '====================================================================',
      '                   SEMANTICOMPARE DIFF REPORT                       ',
      '====================================================================',
      `Left Format       : ${leftDoc.format.toUpperCase()} (${leftDoc.indentStyle.type === 'tab' ? 'Tabs' : `${leftDoc.indentStyle.size} spaces`})`,
      `Right Format      : ${rightDoc.format.toUpperCase()} (${rightDoc.indentStyle.type === 'tab' ? 'Tabs' : `${rightDoc.indentStyle.size} spaces`})`,
      `Ignore List Order : ${ignoreListOrder ? 'Yes' : 'No'}`,
      `Ignore Quotes     : ${ignoreQuoteStyle ? 'Yes' : 'No'}`,
      `Summary           : ${stats.modified} Modified | +${stats.addedRight} Added | -${stats.deletedRight} Deleted | ${stats.ignoredDiff} Ignored (CRD)`,
      '--------------------------------------------------------------------',
    ];

    if (entries.length === 0) {
      lines.push('No semantic differences found.');
    } else {
      entries.forEach((entry, idx) => {
        const tag =
          entry.status === 'modified'
            ? '[MODIFIED]'
            : entry.status === 'added_right'
            ? '[ADDED]   '
            : entry.status === 'deleted_right'
            ? '[DELETED] '
            : '[IGNORED] ';
        const lStr = entry.leftValue !== undefined ? JSON.stringify(entry.leftValue) : '<missing>';
        const rStr = entry.rightValue !== undefined ? JSON.stringify(entry.rightValue) : '<missing>';
        lines.push(`${idx + 1}. ${tag} ${entry.path}`);
        lines.push(`     Left : ${lStr}`);
        lines.push(`     Right: ${rStr}`);
      });
    }

    lines.push('====================================================================');
    return lines.join('\n');
  }

  // Default: Markdown (.md)
  const mdLines: string[] = [
    '# SemantiCompare — Semantic Diff Report',
    '',
    '## 1. Comparison Overview',
    `- **Left (Reference) Format:** \`${leftDoc.format.toUpperCase()}\``,
    `- **Right (Compared) Format:** \`${rightDoc.format.toUpperCase()}\``,
    `- **Comparison Rules:** Ignore List Order = \`${ignoreListOrder}\`, Ignore Quote Types = \`${ignoreQuoteStyle}\``,
    `- **Filtered / Ignored CRD Fields:** ${ignoredFields.length > 0 ? ignoredFields.map((f) => `\`${f}\``).join(', ') : '*None*'}`,
    '',
    '## 2. Diff Statistics',
    '| Metric | Count |',
    '| :--- | :---: |',
    `| **Modified Values** | **${stats.modified}** |`,
    `| **Added in Right** | **+${stats.addedRight}** |`,
    `| **Deleted in Right** | **-${stats.deletedRight}** |`,
    `| **Ignored (CRD)** | ${stats.ignoredDiff} |`,
    `| **Unchanged** | ${stats.unchanged} |`,
    '',
    `## 3. Detailed Differences (${entries.length})`,
  ];

  if (entries.length === 0) {
    mdLines.push('', '_No semantic differences detected between Left and Right documents._');
  } else {
    mdLines.push(
      '',
      '| # | Status | JSONPath | Left (Reference) | Right (Compared) |',
      '| :---: | :--- | :--- | :--- | :--- |'
    );
    entries.forEach((entry, idx) => {
      const statusLabel =
        entry.status === 'modified'
          ? 'Modified'
          : entry.status === 'added_right'
          ? 'Added (Right)'
          : entry.status === 'deleted_right'
          ? 'Deleted (Right)'
          : 'Ignored (CRD)';
      mdLines.push(
        `| ${idx + 1} | **${statusLabel}** | \`${entry.path}\` | \`${formatCellForTable(entry.leftValue)}\` | \`${formatCellForTable(entry.rightValue)}\` |`
      );
    });
  }

  return mdLines.join('\n');
}
