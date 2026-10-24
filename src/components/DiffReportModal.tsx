/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { FileSpreadsheet, X, Copy, Check, Download } from 'lucide-react';
import { AlignedDiffRow, DiffStatistics, ParsedDocument } from '../diff/types';
import { DiffReportFormat, generateDiffReport } from '../diff/diffReport';

interface DiffReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  leftDoc: ParsedDocument;
  rightDoc: ParsedDocument;
  rows: AlignedDiffRow[];
  stats: DiffStatistics;
  ignoredFields: string[];
  ignoreListOrder: boolean;
  ignoreQuoteStyle: boolean;
}

export const DiffReportModal: React.FC<DiffReportModalProps> = ({
  isOpen,
  onClose,
  leftDoc,
  rightDoc,
  rows,
  stats,
  ignoredFields,
  ignoreListOrder,
  ignoreQuoteStyle,
}) => {
  const [reportFormat, setReportFormat] = useState<DiffReportFormat>('markdown');
  const [includeIgnored, setIncludeIgnored] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  const reportContent = useMemo(() => {
    if (!isOpen) return '';
    return generateDiffReport({
      leftDoc,
      rightDoc,
      rows,
      stats,
      format: reportFormat,
      includeIgnored,
      ignoredFields,
      ignoreListOrder,
      ignoreQuoteStyle,
    });
  }, [
    isOpen,
    leftDoc,
    rightDoc,
    rows,
    stats,
    reportFormat,
    includeIgnored,
    ignoredFields,
    ignoreListOrder,
    ignoreQuoteStyle,
  ]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(reportContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const ext = reportFormat === 'markdown' ? 'md' : reportFormat === 'json' ? 'json' : 'txt';
    const mime =
      reportFormat === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8';
    const blob = new Blob([reportContent], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `semantic-diff-report.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="diff-report-modal-title"
    >
      <div className="w-full max-w-4xl h-[82vh] rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl flex flex-col overflow-hidden text-zinc-100">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-zinc-800 bg-zinc-950/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-950 border border-emerald-800 text-emerald-300">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div>
              <h2 id="diff-report-modal-title" className="text-sm font-semibold text-white">
                Export Semantic Diff Report
              </h2>
              <p className="text-[11px] text-zinc-400">
                Export structured comparison summary &amp; path-level changes ({stats.modified} modified, +{stats.addedRight} added, -{stats.deletedRight} deleted)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
            aria-label="Close diff report modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Controls Bar */}
        <div className="px-5 py-2.5 border-b border-zinc-800 bg-zinc-900/90 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 font-medium">Report Format:</span>
            <div className="flex items-center rounded-lg bg-zinc-950 p-0.5 border border-zinc-800">
              {(
                [
                  { id: 'markdown', label: 'Markdown (.md)' },
                  { id: 'json', label: 'JSON (.json)' },
                  { id: 'text', label: 'Plain Text (.txt)' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setReportFormat(tab.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                    reportFormat === tab.id
                      ? 'bg-cyan-600 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <label className="ml-2 flex items-center gap-1.5 text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeIgnored}
                onChange={(e) => setIncludeIgnored(e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-900 text-cyan-500 focus:ring-0 cursor-pointer h-3.5 w-3.5"
              />
              <span>Include Ignored CRD Fields ({stats.ignoredDiff})</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center gap-1.5 text-xs font-medium cursor-pointer transition"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-cyan-400" />
              )}
              <span>{copied ? 'Copied Report!' : 'Copy Report'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition shadow-sm"
            >
              <Download className="h-3.5 w-3.5" />
              <span>
                Download .{reportFormat === 'markdown' ? 'md' : reportFormat === 'json' ? 'json' : 'txt'}
              </span>
            </button>
          </div>
        </div>

        {/* Report Content Preview */}
        <div className="flex-1 overflow-y-auto p-5 bg-zinc-950/80">
          <pre
            aria-label="Generated diff report preview"
            className="font-mono text-xs leading-relaxed text-zinc-200 whitespace-pre-wrap break-words select-text"
          >
            {reportContent}
          </pre>
        </div>
      </div>
    </div>
  );
};
