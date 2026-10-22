/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Copy,
  Download,
  AlertTriangle,
  Wrench,
  ChevronDown,
  ChevronRight,
  Check,
  Trash2,
  FileCode,
  Pencil,
  X,
} from 'lucide-react';
import { AlignedDiffRow, DocumentFormat, ParsedDocument } from '../diff/types';
import { parseInlineValue } from '../diff/inPlacePatcher';

interface DiffPaneProps {
  side: 'left' | 'right';
  title: string;
  doc: ParsedDocument;
  rows: AlignedDiffRow[];
  activePath: string;
  onSelectPath: (path: string, value: any) => void;
  foldedBlocks: Set<string>;
  onToggleBlockFold: (blockId: string) => void;
  onOpenRawEditor: () => void;
  onClear: () => void;
  onChangeFormat: (targetFormat: DocumentFormat) => void;
  inlineEditMode: boolean;
  onInlineEditValue: (path: string, newValue: any) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}

export const DiffPane: React.FC<DiffPaneProps> = ({
  side,
  title,
  doc,
  rows,
  activePath,
  onSelectPath,
  foldedBlocks,
  onToggleBlockFold,
  onOpenRawEditor,
  onClear,
  onChangeFormat,
  inlineEditMode,
  onInlineEditValue,
  scrollRef,
  onScroll,
}) => {
  const [copied, setCopied] = useState(false);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<string>('');

  const handleCopy = () => {
    navigator.clipboard.writeText(doc.rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const ext =
      doc.format === 'yaml'
        ? 'yaml'
        : doc.format === 'toml'
        ? 'toml'
        : doc.format === 'jsonc'
        ? 'jsonc'
        : 'json';
    const blob = new Blob([doc.rawText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${side === 'left' ? 'reference' : 'compared'}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const startInlineEdit = (path: string, currentValue: any) => {
    const initialDraft =
      typeof currentValue === 'string'
        ? JSON.stringify(currentValue)
        : currentValue !== undefined
        ? String(currentValue)
        : '';
    setEditingPath(path);
    setEditDraft(initialDraft);
  };

  const commitInlineEdit = (path: string) => {
    const parsed = parseInlineValue(editDraft);
    onInlineEditValue(path, parsed);
    setEditingPath(null);
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full bg-[var(--bg-panel,#09090b)] text-[var(--text-primary,#e4e4e7)] select-text overflow-hidden">
      {/* Pane Top Header Bar */}
      <div className="h-10 max-h-[500px]:h-8 shrink-0 px-3 border-b border-[var(--border-color,#27272a)] bg-[var(--bg-header,#18181b)] flex items-center justify-between text-xs select-none">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="font-semibold text-zinc-100 truncate">{title}</span>

          {/* Interactive Format Selector (JSON / JSONC / YAML / TOML) */}
          <select
            aria-label={`${side === 'left' ? 'Left' : 'Right'} pane format`}
            value={doc.format}
            onChange={(e) => onChangeFormat(e.target.value as DocumentFormat)}
            title="Convert pane format on the fly (compare YAML with JSON, TOML, or JSONC)"
            className="px-1.5 py-0.5 rounded font-mono text-[10px] uppercase font-bold tracking-wider bg-zinc-800 hover:bg-zinc-700 text-cyan-300 border border-zinc-700 shrink-0 cursor-pointer focus:outline-none focus:border-cyan-500"
          >
            <option value="yaml">YAML</option>
            <option value="json">JSON</option>
            <option value="jsonc">JSONC</option>
            <option value="toml">TOML</option>
          </select>

          {/* Indent style info */}
          <span className="text-zinc-500 text-[11px] font-mono hidden sm:inline shrink-0">
            {doc.indentStyle.type === 'tab' ? 'Tabs' : `${doc.indentStyle.size} spaces`}
          </span>

          {/* Auto-repair Badge */}
          {doc.repairInfo?.wasRepaired && (
            <span
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-600/80 text-amber-300 text-[10px] font-medium shrink-0"
              title={`Auto-repaired: ${doc.repairInfo.repairsMade.join('; ')} (Breakpoint at line ${doc.repairInfo.breakpointLine})`}
            >
              <Wrench className="h-3 w-3 text-amber-400" />
              <span>Auto-Repaired (Line {doc.repairInfo.breakpointLine})</span>
            </span>
          )}

          {/* Illegal YAML Tabs Warning Badge */}
          {doc.yamlIssues && doc.yamlIssues.length > 0 && (
            <span
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-950/90 border border-rose-600 text-rose-300 text-[10px] font-semibold shrink-0"
              title={`${doc.yamlIssues.length} illegal tab characters found in YAML indentation`}
            >
              <AlertTriangle className="h-3 w-3 text-rose-400" />
              <span>{doc.yamlIssues.length} Illegal Tabs</span>
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onOpenRawEditor}
            className="px-2 py-0.8 rounded hover:bg-zinc-800 text-zinc-300 border border-zinc-700/60 text-[11px] flex items-center gap-1 transition cursor-pointer"
            title="Edit raw text"
          >
            <FileCode className="h-3 w-3 text-cyan-400" />
            <span className="hidden md:inline">Raw</span>
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
            title="Copy document to clipboard"
            aria-label="Copy document"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
            title="Download file"
            aria-label="Download file"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClear}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-rose-400 transition cursor-pointer"
            title="Clear pane content"
            aria-label="Clear pane"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Code Viewer Body */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-auto font-mono text-[12px] leading-6 py-1 pb-6 select-text"
        style={{ fontFamily: "var(--font-mono, 'Fira Code', monospace)" }}
      >
        {rows.map((row, index) => {
          // Hide row if any of its ancestor blocks is folded
          if (row.ancestorBlockIds?.some((id) => foldedBlocks.has(id))) {
            return null;
          }

          const cell = side === 'left' ? row.left : row.right;
          const isRowActive = activePath && cell?.path === activePath;

          // Row style determination
          let bgClass = '';
          let borderClass = '';

          if (row.status === 'modified') {
            bgClass = side === 'left' ? 'bg-amber-950/20' : 'bg-emerald-950/20';
            borderClass = side === 'left' ? 'border-l-2 border-amber-500/60' : 'border-l-2 border-emerald-500/60';
          } else if (row.status === 'added_right') {
            bgClass = side === 'right' ? 'bg-emerald-950/30' : 'bg-zinc-900/30';
            borderClass = side === 'right' ? 'border-l-2 border-emerald-500' : '';
          } else if (row.status === 'deleted_right') {
            bgClass = side === 'left' ? 'bg-rose-950/30' : 'bg-zinc-900/30';
            borderClass = side === 'left' ? 'border-l-2 border-rose-500' : '';
          } else if (row.status === 'ignored_diff') {
            bgClass = 'bg-slate-900/40 text-slate-400';
            borderClass = 'border-l-2 border-slate-600/50';
          } else if (row.status === 'comment_diff') {
            bgClass = 'bg-sky-950/20 text-sky-300';
            borderClass = 'border-l-2 border-sky-600/40';
          }

          if (isRowActive) {
            bgClass += ' ring-1 ring-cyan-500/50 bg-cyan-950/30';
          }

          // Empty spacer row for alignment
          if (!cell) {
            return (
              <div
                key={row.id || index}
                className={`h-6 min-h-[24px] max-h-[24px] shrink-0 flex items-center text-zinc-700 bg-zinc-900/30 select-none ${bgClass}`}
              >
                <div className="w-10 shrink-0 text-right pr-2 text-zinc-700 select-none">·</div>
                <div className="flex-1 h-full flex items-center px-2">
                  <div className="w-full border-b border-dashed border-zinc-800/80" />
                </div>
              </div>
            );
          }

          const blockId = cell.blockId || row.blockId;
          const isFoldable = Boolean(cell.isBlockHeader && blockId);
          const isFolded = Boolean(isFoldable && blockId && foldedBlocks.has(blockId));
          const isPrimitiveEditable =
            !cell.isBlockHeader &&
            !cell.isBlockFooter &&
            cell.valueType !== 'object' &&
            cell.valueType !== 'array' &&
            cell.valueType !== 'comment' &&
            Boolean(cell.path && cell.path !== '$');

          const isEditingThisRow = editingPath === cell.path && isPrimitiveEditable;

          return (
            <div
              key={row.id || index}
              onClick={() => onSelectPath(cell.path, cell.value)}
              onDoubleClick={() => {
                if (isPrimitiveEditable) {
                  startInlineEdit(cell.path, cell.value);
                }
              }}
              className={`h-6 min-h-[24px] max-h-[24px] shrink-0 flex items-center hover:bg-zinc-900/70 transition-colors cursor-pointer group ${bgClass} ${borderClass}`}
            >
              {/* Line Number Column */}
              <div className="w-10 shrink-0 text-right pr-2 text-zinc-500 select-none text-[11px] font-mono">
                {cell.displayLine ?? ''}
              </div>

              {/* Fold Arrow Toggle */}
              <div className="w-5 shrink-0 flex items-center justify-center select-none">
                {isFoldable ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (blockId) onToggleBlockFold(blockId);
                    }}
                    className="p-0.5 rounded hover:bg-zinc-800 hover:text-white text-zinc-400 transition cursor-pointer touch-manipulation"
                    title={isFolded ? 'Expand block' : 'Collapse block'}
                    aria-label={isFolded ? 'Expand' : 'Collapse'}
                  >
                    {isFolded ? <ChevronRight className="h-3.5 w-3.5 text-cyan-400" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                ) : null}
              </div>

              {/* Code Content */}
              <div
                className="flex-1 flex items-center whitespace-pre pr-3"
                style={{ paddingLeft: `${cell.indent * 8}px` }}
              >
                {/* Repaired Breakpoint Highlight Banner / Indicator */}
                {cell.isRepairedToken && (
                  <span className="mr-1.5 px-1 py-0.2 rounded bg-amber-500 text-zinc-950 font-bold text-[9px] uppercase tracking-wider animate-pulse">
                    Repaired
                  </span>
                )}

                {/* YAML Tab Error Marker */}
                {cell.hasTabError && (
                  <span className="mr-1.5 px-1 py-0.2 rounded bg-rose-600 text-white font-bold text-[9px] uppercase tracking-wider animate-bounce">
                    Tab Error
                  </span>
                )}

                {/* Ignored CRD Tag */}
                {row.status === 'ignored_diff' && (
                  <span className="mr-1 px-1 py-0.1 rounded bg-slate-800 text-slate-400 text-[9px] font-mono border border-slate-700">
                    CRD Ignored
                  </span>
                )}

                {isEditingThisRow ? (
                  <div
                    className="flex items-center gap-1 h-5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {cell.key && (
                      <span className="text-cyan-300 font-medium">
                        {doc.format === 'json' || doc.format === 'jsonc'
                          ? `"${cell.key}": `
                          : doc.format === 'toml'
                          ? `${cell.key} = `
                          : `${cell.key}: `}
                      </span>
                    )}
                    <input
                      type="text"
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitInlineEdit(cell.path);
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingPath(null);
                        }
                      }}
                      autoFocus
                      aria-label={`Inline edit ${cell.path}`}
                      className="h-5 px-1.5 rounded bg-zinc-950 border border-cyan-400 text-zinc-100 text-[11px] font-mono focus:outline-none min-w-[120px]"
                    />
                    <button
                      type="button"
                      onClick={() => commitInlineEdit(cell.path)}
                      className="p-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white cursor-pointer"
                      title="Save inline change (Enter)"
                      aria-label="Save inline change"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingPath(null)}
                      className="p-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                      title="Cancel inline edit (Esc)"
                      aria-label="Cancel inline edit"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Render syntax highlighted text (clicking value when inlineEditMode is active triggers inline editor) */}
                    {renderSyntaxText(
                      cell.formattedText,
                      cell.valueType,
                      row.status,
                      inlineEditMode && isPrimitiveEditable
                        ? () => startInlineEdit(cell.path, cell.value)
                        : undefined
                    )}

                    {/* Inline Edit Pencil Button when inlineEditMode is on */}
                    {inlineEditMode && isPrimitiveEditable && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startInlineEdit(cell.path, cell.value);
                        }}
                        className="ml-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100 px-1 py-0.2 rounded bg-zinc-800/90 hover:bg-cyan-900/80 text-zinc-400 hover:text-cyan-200 border border-zinc-700/70 text-[9px] flex items-center gap-0.5 transition cursor-pointer"
                        title="Click to edit value inline"
                        aria-label={`Edit ${cell.key || cell.path} inline`}
                      >
                        <Pencil className="h-2.5 w-2.5" />
                        <span>edit</span>
                      </button>
                    )}
                  </>
                )}

                {/* Folded summary indicator */}
                {isFolded && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (blockId) onToggleBlockFold(blockId);
                    }}
                    className="ml-2 px-1.5 py-0.2 rounded bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 text-[10px] font-mono select-none cursor-pointer"
                    title="Click to expand folded block"
                  >
                    ... {cell.valueType === 'array' ? ']' : '}'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Syntax color tokens for JSON/YAML/TOML key-values.
 */
function renderSyntaxText(
  formattedText: string,
  valueType: string,
  diffStatus: string,
  onClickValue?: () => void
): React.ReactNode {
  // Check for TOML section header e.g. [package]
  if (valueType === 'object' && /^\[.+\]$/.test(formattedText.trim())) {
    return <span className="text-amber-300 font-semibold">{formattedText}</span>;
  }

  // Check if contains key-value separator ": " or " = "
  const eqIndex = formattedText.indexOf(' = ');
  const colonIndex = formattedText.indexOf(':');

  const interactiveValueClass = onClickValue
    ? 'hover:underline hover:decoration-cyan-400/80 hover:bg-cyan-950/40 rounded px-0.5 transition'
    : '';

  if (eqIndex > 0 && (colonIndex === -1 || eqIndex < colonIndex)) {
    const keyPart = formattedText.slice(0, eqIndex);
    const valuePart = formattedText.slice(eqIndex + 3);
    return (
      <span className="inline-block">
        <span className="text-cyan-300 font-medium">{keyPart}</span>
        <span className="text-zinc-500"> = </span>
        <span
          onClick={(e) => {
            if (onClickValue) {
              e.stopPropagation();
              onClickValue();
            }
          }}
          title={onClickValue ? 'Click to edit value inline' : undefined}
          className={`${getValueColorClass(valueType, diffStatus)} ${interactiveValueClass}`}
        >
          {valuePart}
        </span>
      </span>
    );
  }

  if (colonIndex > 0) {
    const keyPart = formattedText.slice(0, colonIndex);
    const valuePart = formattedText.slice(colonIndex + 1);

    return (
      <span className="inline-block">
        <span className="text-cyan-300 font-medium">{keyPart}</span>
        <span className="text-zinc-500">:</span>
        <span
          onClick={(e) => {
            if (onClickValue) {
              e.stopPropagation();
              onClickValue();
            }
          }}
          title={onClickValue ? 'Click to edit value inline' : undefined}
          className={`${getValueColorClass(valueType, diffStatus)} ${interactiveValueClass}`}
        >
          {valuePart}
        </span>
      </span>
    );
  }

  return (
    <span
      onClick={(e) => {
        if (onClickValue) {
          e.stopPropagation();
          onClickValue();
        }
      }}
      title={onClickValue ? 'Click to edit value inline' : undefined}
      className={`${getValueColorClass(valueType, diffStatus)} ${interactiveValueClass}`}
    >
      {formattedText}
    </span>
  );
}

function getValueColorClass(valueType: string, diffStatus: string): string {
  if (diffStatus === 'ignored_diff') return 'text-slate-400 italic';
  if (diffStatus === 'comment_diff') return 'text-sky-300/80 italic';

  switch (valueType) {
    case 'string':
      return 'text-emerald-300';
    case 'number':
      return 'text-rose-300';
    case 'boolean':
      return 'text-amber-300';
    case 'null':
      return 'text-purple-300';
    case 'comment':
      return 'text-zinc-500 italic';
    default:
      return 'text-zinc-300';
  }
}
