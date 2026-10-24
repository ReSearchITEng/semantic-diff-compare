/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Copy,
  ClipboardPaste,
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
import { parseEditedLine, parseInlineValue } from '../diff/inPlacePatcher';

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
  onLiveEditLine?: (
    path: string,
    originalKey: string | undefined,
    newKey: string | undefined,
    newValue: any,
    shouldPushHistory: boolean
  ) => void;
  isFocusedPane?: boolean;
  onFocusPane?: () => void;
  onPasteText?: (text: string) => boolean;
  pastedFeedback?: boolean;
  pasteError?: string | null;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}

interface FocusedRowEditState {
  rowKey: string;
  path: string;
  originalKey?: string;
  isBlockHeader: boolean;
  draftText: string;
  isDirty: boolean;
  hasPushedHistory: boolean;
}

/**
 * Extracts clean, properly indented text from the current browser selection inside a DiffPane container.
 * Returns null if no selection exists inside this pane.
 */
export function extractCleanPaneSelection(
  paneContainer: HTMLElement | null,
  rawDocText: string
): string | null {
  if (!paneContainer) return null;

  // Check if a live row <input> inside this pane has a substring selection
  const activeEl = document.activeElement as HTMLInputElement | null;
  if (
    activeEl &&
    activeEl.tagName === 'INPUT' &&
    activeEl.getAttribute('data-live-row-input') === 'true' &&
    paneContainer.contains(activeEl) &&
    activeEl.selectionStart !== null &&
    activeEl.selectionEnd !== null &&
    activeEl.selectionStart !== activeEl.selectionEnd
  ) {
    return activeEl.value.slice(activeEl.selectionStart, activeEl.selectionEnd);
  }

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;

  const range = sel.getRangeAt(0);
  if (
    !paneContainer.contains(range.commonAncestorContainer) &&
    range.commonAncestorContainer !== paneContainer
  ) {
    // Check if selection intersects paneContainer at all
    if (!range.intersectsNode(paneContainer)) return null;
  }

  const rowEls = Array.from(paneContainer.querySelectorAll<HTMLElement>('[data-line-text]'));
  if (rowEls.length === 0) return rawDocText;

  const selectedRows = rowEls.filter((el) => range.intersectsNode(el));
  if (selectedRows.length === 0) return null;

  // If all visible rows are selected (e.g. via Ctrl+A), return the clean rawText
  if (selectedRows.length === rowEls.length) {
    return rawDocText;
  }

  // If multiple rows are selected, return each row's properly indented `data-line-text`
  if (selectedRows.length > 1) {
    return selectedRows.map((el) => el.getAttribute('data-line-text') || '').join('\n');
  }

  // Single row selected: check if user selected the whole line or a substring within the line
  const singleRowText = selectedRows[0].getAttribute('data-line-text') || '';
  const rawSelectedStr = sel.toString();
  if (!rawSelectedStr) return singleRowText;

  // If single line selection has newline or spans the full trimmed content, return the indented line
  if (rawSelectedStr.includes('\n') || rawSelectedStr.trim() === singleRowText.trim()) {
    return singleRowText;
  }

  return rawSelectedStr;
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
  onLiveEditLine,
  isFocusedPane = false,
  onFocusPane,
  onPasteText,
  pastedFeedback = false,
  pasteError = null,
  scrollRef,
  onScroll,
}) => {
  const [copied, setCopied] = useState(false);
  const [localPasted, setLocalPasted] = useState(false);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<string>('');
  const [focusedRowState, setFocusedRowState] = useState<FocusedRowEditState | null>(null);

  const showPasted = pastedFeedback || localPasted;

  const triggerCopiedFeedback = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(doc.rawText);
    triggerCopiedFeedback();
  };

  const handlePasteButtonClick = async () => {
    onFocusPane?.();
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim().length > 0 && onPasteText) {
          const accepted = onPasteText(text);
          if (accepted) {
            setFocusedRowState(null);
            setLocalPasted(true);
            setTimeout(() => setLocalPasted(false), 2000);
          }
          return;
        }
      }
    } catch {
      // Fallback to Raw Editor if browser blocks direct clipboard read button
    }
    onOpenRawEditor();
  };

  const handlePaneCopyEvent = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLInputElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      // If user highlighted a substring inside a live row input, let native copy or clean slice handle it
      if (
        target.getAttribute('data-live-row-input') === 'true' &&
        target.selectionStart !== null &&
        target.selectionEnd !== null &&
        target.selectionStart !== target.selectionEnd
      ) {
        const sub = target.value.slice(target.selectionStart, target.selectionEnd);
        e.preventDefault();
        e.clipboardData.setData('text/plain', sub);
        navigator.clipboard?.writeText?.(sub).catch(() => {});
        triggerCopiedFeedback();
        return;
      }
      if (target.getAttribute('data-live-row-input') !== 'true') {
        return;
      }
    }
    const cleanText = extractCleanPaneSelection(scrollRef.current, doc.rawText) ?? doc.rawText;
    e.preventDefault();
    e.clipboardData.setData('text/plain', cleanText);
    navigator.clipboard?.writeText?.(cleanText).catch(() => {});
    triggerCopiedFeedback();
  };

  const handlePanePasteEvent = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLInputElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      if (target.getAttribute('data-live-row-input') !== 'true') {
        return;
      }
    }
    const pasted = e.clipboardData?.getData('text/plain');
    if (pasted && onPasteText) {
      e.preventDefault();
      e.stopPropagation();
      const accepted = onPasteText(pasted);
      if (accepted) {
        setFocusedRowState(null);
        setLocalPasted(true);
        setTimeout(() => setLocalPasted(false), 2000);
      }
    }
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

  const moveFocusToAdjacentRow = (currentInput: HTMLInputElement, delta: number) => {
    if (!scrollRef.current) return;
    const allInputs = Array.from(
      scrollRef.current.querySelectorAll<HTMLInputElement>('input[data-live-row-input="true"]')
    );
    const idx = allInputs.indexOf(currentInput);
    if (idx === -1) return;
    const targetInput = allInputs[idx + delta];
    if (targetInput) {
      const col = currentInput.selectionStart ?? targetInput.value.length;
      targetInput.focus();
      const clampedCol = Math.min(col, targetInput.value.length);
      requestAnimationFrame(() => {
        try {
          targetInput.setSelectionRange(clampedCol, clampedCol);
        } catch {
          // Ignore selection range errors on unmounted inputs
        }
      });
    }
  };

  return (
    <div
      onMouseDown={() => onFocusPane?.()}
      onFocus={() => onFocusPane?.()}
      onCopy={handlePaneCopyEvent}
      onPaste={handlePanePasteEvent}
      data-pane-side={side}
      className={`flex-1 min-w-0 flex flex-col h-full bg-[var(--bg-panel,#09090b)] text-[var(--text-primary,#e4e4e7)] select-text overflow-hidden focus:outline-none ${
        isFocusedPane ? 'border-t-2 border-t-cyan-500/80' : 'border-t-2 border-t-transparent'
      }`}
    >
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

          {/* Active Pane Shortcut Hint / Feedback */}
          {pasteError ? (
            <span
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-950/90 border border-rose-500/80 text-rose-200 text-[10px] font-medium shrink-0"
              title={pasteError}
            >
              <AlertTriangle className="h-3 w-3 text-rose-400" />
              <span>Invalid Paste</span>
            </span>
          ) : showPasted ? (
            <span className="px-1.5 py-0.5 rounded bg-emerald-950/90 border border-emerald-600/80 text-emerald-300 text-[10px] font-medium shrink-0">
              Pasted!
            </span>
          ) : copied ? (
            <span className="px-1.5 py-0.5 rounded bg-emerald-950/90 border border-emerald-600/80 text-emerald-300 text-[10px] font-medium shrink-0">
              Copied!
            </span>
          ) : inlineEditMode ? (
            <span
              className={`text-[10px] font-mono hidden lg:inline shrink-0 ${
                isFocusedPane ? 'text-cyan-400/90' : 'text-zinc-500'
              }`}
              title="Live Editor active: click any line to write immediately, or use Ctrl+A / Ctrl+C / Ctrl+V"
            >
              {isFocusedPane ? 'Live Editor · Ctrl+A / C / V' : 'Live Editable'}
            </span>
          ) : isFocusedPane ? (
            <span
              className="text-cyan-400/90 text-[10px] font-mono hidden lg:inline shrink-0"
              title="Active pane for keyboard shortcuts: Ctrl+A (Select pane), Ctrl+C (Copy), Ctrl+V (Paste)"
            >
              Active · Ctrl+A / C / V
            </span>
          ) : null}

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
            title="Edit raw text in full buffer modal"
          >
            <FileCode className="h-3 w-3 text-cyan-400" />
            <span className="hidden md:inline">Raw</span>
          </button>
          <button
            type="button"
            onClick={handlePasteButtonClick}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
            title="Paste clipboard into pane (or press Ctrl+V when pane is active)"
            aria-label={`Paste into ${side} document`}
          >
            <ClipboardPaste className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
            title="Copy document to clipboard (Ctrl+C)"
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

      {/* Code Viewer / Live Editor Body */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        tabIndex={0}
        onKeyDown={(e) => {
          // If pane container itself is focused and user starts typing or pressing arrows in Live Editor mode, focus the active or first row input
          if (inlineEditMode && e.target === scrollRef.current && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (e.key.length === 1 || e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              const firstInput = scrollRef.current?.querySelector<HTMLInputElement>(
                'input[data-live-row-input="true"]'
              );
              if (firstInput) {
                firstInput.focus();
              }
            }
          }
        }}
        aria-label={`${side === 'left' ? 'Left' : 'Right'} code diff pane`}
        className="flex-1 overflow-auto font-mono text-[12px] leading-6 py-1 pb-6 select-text focus:outline-none"
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
                key={`spacer_${side}_${row.path}_${index}`}
                className={`h-6 min-h-[24px] max-h-[24px] shrink-0 flex items-center text-zinc-700 bg-zinc-900/30 select-none ${bgClass}`}
              >
                <div
                  className="w-10 shrink-0 text-right pr-2 text-zinc-700 select-none after:content-[attr(data-spacer-dot)]"
                  data-spacer-dot="·"
                />
                <div className="flex-1 h-full flex items-center px-2 select-none">
                  <div className="w-full border-b border-dashed border-zinc-800/80" />
                </div>
              </div>
            );
          }

          const stableRowKey = `${side}_${cell.path}_${
            cell.isBlockHeader ? 'hdr' : cell.isBlockFooter ? 'ftr' : 'val'
          }`;
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

          // In Live Editor mode, every non-footer row with a valid path (including primitive rows and named block headers) is directly editable
          const isRowLiveEditable =
            inlineEditMode &&
            !cell.isBlockFooter &&
            cell.valueType !== 'comment' &&
            Boolean(cell.path && cell.path !== '$');

          const isFocusedLiveRow = focusedRowState?.rowKey === stableRowKey;
          const isEditingThisRowModal = !inlineEditMode && editingPath === cell.path && isPrimitiveEditable;
          const fullIndentedLine = `${' '.repeat(cell.indent)}${cell.formattedText}`;
          const activeLineText = isFocusedLiveRow ? focusedRowState.draftText : fullIndentedLine;
          const leadingSpaceMatch = activeLineText.match(/^( *)/);
          const activeLeadingSpaces = leadingSpaceMatch ? leadingSpaceMatch[1] : '';
          const activeTrimmedCode = activeLineText.slice(activeLeadingSpaces.length);

          return (
            <div
              key={stableRowKey}
              data-line-text={activeLineText}
              data-row-path={cell.path}
              onClick={() => {
                onFocusPane?.();
                onSelectPath(cell.path, cell.value);
              }}
              onDoubleClick={() => {
                if (!inlineEditMode && isPrimitiveEditable) {
                  startInlineEdit(cell.path, cell.value);
                }
              }}
              className={`h-6 min-h-[24px] max-h-[24px] shrink-0 flex items-center hover:bg-zinc-900/70 transition-colors ${
                isRowLiveEditable ? 'cursor-text' : 'cursor-pointer'
              } group ${bgClass} ${borderClass}`}
            >
              {/* Line Number Column (rendered via CSS attr so Ctrl+A / Selection never copies line numbers) */}
              <div
                className="w-10 shrink-0 text-right pr-2 text-zinc-500 select-none text-[11px] font-mono after:content-[attr(data-line-num)]"
                data-line-num={cell.displayLine ?? ''}
              />

              {/* Fold Arrow Toggle */}
              <div className="w-5 shrink-0 flex items-center justify-center select-none">
                {isFoldable ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (blockId) onToggleBlockFold(blockId);
                    }}
                    className="p-0.5 rounded hover:bg-zinc-800 hover:text-white text-zinc-400 transition cursor-pointer touch-manipulation select-none"
                    title={isFolded ? 'Expand block' : 'Collapse block'}
                    aria-label={isFolded ? 'Expand' : 'Collapse'}
                  >
                    {isFolded ? <ChevronRight className="h-3.5 w-3.5 text-cyan-400" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                ) : null}
              </div>

              {/* Code Content with real leading indentation spaces for accurate selection, copy & live editing */}
              <div className="flex-1 flex items-center whitespace-pre pr-3 h-full min-w-0">
                {/* Repaired Breakpoint Highlight Banner / Indicator (pseudo-element text so never copied) */}
                {cell.isRepairedToken && (
                  <span
                    data-badge-label="Repaired"
                    className="mr-1.5 px-1 py-0.2 rounded bg-amber-500 text-zinc-950 font-bold text-[9px] uppercase tracking-wider animate-pulse select-none shrink-0 after:content-[attr(data-badge-label)]"
                  />
                )}

                {/* YAML Tab Error Marker */}
                {cell.hasTabError && (
                  <span
                    data-badge-label="Tab Error"
                    className="mr-1.5 px-1 py-0.2 rounded bg-rose-600 text-white font-bold text-[9px] uppercase tracking-wider animate-bounce select-none shrink-0 after:content-[attr(data-badge-label)]"
                  />
                )}

                {/* Ignored CRD Tag */}
                {row.status === 'ignored_diff' && (
                  <span
                    data-badge-label="CRD Ignored"
                    className="mr-1 px-1 py-0.1 rounded bg-slate-800 text-slate-400 text-[9px] font-mono border border-slate-700 select-none shrink-0 after:content-[attr(data-badge-label)]"
                  />
                )}

                {isEditingThisRowModal ? (
                  <div
                    className="flex items-center gap-1 h-5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="whitespace-pre select-none">{' '.repeat(cell.indent)}</span>
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
                      className="p-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white cursor-pointer select-none"
                      title="Save inline change (Enter)"
                      aria-label="Save inline change"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingPath(null)}
                      className="p-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer select-none"
                      title="Cancel inline edit (Esc)"
                      aria-label="Cancel inline edit"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : isRowLiveEditable ? (
                  <div className="relative flex-1 flex items-center h-full min-w-0">
                    {/* Syntax-Highlighted Mirror Layer */}
                    <span
                      aria-hidden="true"
                      className="whitespace-pre pointer-events-none select-none"
                    >
                      {activeLeadingSpaces}
                      {renderSyntaxText(activeTrimmedCode, cell.valueType, row.status)}
                    </span>

                    {/* Folded summary indicator next to block header */}
                    {isFolded && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (blockId) onToggleBlockFold(blockId);
                        }}
                        data-badge-label={`... ${cell.valueType === 'array' ? ']' : '}'}`}
                        className="relative z-20 ml-2 px-1.5 py-0.2 rounded bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 text-[10px] font-mono select-none cursor-pointer after:content-[attr(data-badge-label)]"
                        title="Click to expand folded block"
                      />
                    )}

                    {/* Always-Editable Live Native Input Layer */}
                    <input
                      type="text"
                      data-live-row-input="true"
                      data-row-path={cell.path}
                      aria-label={`Line ${cell.displayLine ?? index + 1} ${cell.key || cell.path} (${side} pane)`}
                      value={activeLineText}
                      spellCheck={false}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      onFocus={() => {
                        onFocusPane?.();
                        onSelectPath(cell.path, cell.value);
                        setFocusedRowState((prev) =>
                          prev?.rowKey === stableRowKey
                            ? prev
                            : {
                                rowKey: stableRowKey,
                                path: cell.path,
                                originalKey: cell.key,
                                isBlockHeader: Boolean(cell.isBlockHeader),
                                draftText: fullIndentedLine,
                                isDirty: false,
                                hasPushedHistory: false,
                              }
                        );
                      }}
                      onChange={(e) => {
                        const newText = e.target.value;
                        const shouldPushHistory = !focusedRowState?.hasPushedHistory;
                        setFocusedRowState({
                          rowKey: stableRowKey,
                          path: cell.path,
                          originalKey: cell.key,
                          isBlockHeader: Boolean(cell.isBlockHeader),
                          draftText: newText,
                          isDirty: true,
                          hasPushedHistory: true,
                        });
                        const parsed = parseEditedLine(newText, cell.key, cell.isBlockHeader);
                        // Immediately write value edits to document state so diff & stats update live as you type
                        if (!cell.isBlockHeader && !parsed.isKeyRenamed && parsed.isValueComplete) {
                          if (onLiveEditLine) {
                            onLiveEditLine(
                              cell.path,
                              cell.key,
                              cell.key,
                              parsed.value,
                              shouldPushHistory
                            );
                          } else {
                            onInlineEditValue(cell.path, parsed.value);
                          }
                        }
                      }}
                      onBlur={() => {
                        if (
                          focusedRowState &&
                          focusedRowState.rowKey === stableRowKey &&
                          focusedRowState.isDirty
                        ) {
                          const parsed = parseEditedLine(
                            focusedRowState.draftText,
                            focusedRowState.originalKey,
                            focusedRowState.isBlockHeader
                          );
                          if (parsed.isKeyRenamed && parsed.key && onLiveEditLine) {
                            onLiveEditLine(
                              focusedRowState.path,
                              focusedRowState.originalKey,
                              parsed.key,
                              parsed.isValueComplete ? parsed.value : undefined,
                              !focusedRowState.hasPushedHistory
                            );
                          } else if (!focusedRowState.isBlockHeader && parsed.isValueComplete) {
                            if (onLiveEditLine) {
                              onLiveEditLine(
                                focusedRowState.path,
                                focusedRowState.originalKey,
                                focusedRowState.originalKey,
                                parsed.value,
                                !focusedRowState.hasPushedHistory
                              );
                            } else {
                              onInlineEditValue(focusedRowState.path, parsed.value);
                            }
                          }
                        }
                        setFocusedRowState((prev) => (prev?.rowKey === stableRowKey ? null : prev));
                      }}
                      onPaste={(e) => {
                        const pasted = e.clipboardData?.getData('text/plain');
                        if (!pasted) return;
                        const inputEl = e.currentTarget;
                        const hasSubstringSelection =
                          inputEl.selectionStart !== null &&
                          inputEl.selectionEnd !== null &&
                          inputEl.selectionStart !== inputEl.selectionEnd;
                        const isSingleLineScalar =
                          !pasted.includes('\n') &&
                          !pasted.trim().startsWith('{') &&
                          !pasted.trim().startsWith('[') &&
                          !pasted.trim().startsWith('---') &&
                          !pasted.includes(': ') &&
                          !pasted.includes(' = ');

                        // If user highlighted a token inside this line (or is mid-typing) and pasted a scalar value, paste inline
                        if ((hasSubstringSelection || focusedRowState?.isDirty) && isSingleLineScalar) {
                          return;
                        }

                        // Otherwise route to full-pane validated paste (handlePasteIntoPane)
                        e.preventDefault();
                        e.stopPropagation();
                        if (onPasteText) {
                          const accepted = onPasteText(pasted);
                          if (accepted) {
                            setFocusedRowState(null);
                            setLocalPasted(true);
                            setTimeout(() => setLocalPasted(false), 2000);
                          }
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const parsed = parseEditedLine(
                            activeLineText,
                            cell.key,
                            cell.isBlockHeader
                          );
                          if (parsed.isKeyRenamed && parsed.key && onLiveEditLine) {
                            onLiveEditLine(
                              cell.path,
                              cell.key,
                              parsed.key,
                              parsed.isValueComplete ? parsed.value : undefined,
                              !focusedRowState?.hasPushedHistory
                            );
                          } else if (!cell.isBlockHeader && parsed.isValueComplete) {
                            if (onLiveEditLine) {
                              onLiveEditLine(
                                cell.path,
                                cell.key,
                                cell.key,
                                parsed.value,
                                !focusedRowState?.hasPushedHistory
                              );
                            } else {
                              onInlineEditValue(cell.path, parsed.value);
                            }
                          }
                          moveFocusToAdjacentRow(e.currentTarget, 1);
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setFocusedRowState(null);
                          e.currentTarget.blur();
                        } else if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          moveFocusToAdjacentRow(e.currentTarget, 1);
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          moveFocusToAdjacentRow(e.currentTarget, -1);
                        }
                      }}
                      className="absolute inset-0 z-10 w-full h-full bg-transparent text-transparent caret-cyan-300 selection:bg-cyan-500/30 selection:text-transparent font-mono text-[12px] leading-6 whitespace-pre focus:outline-none cursor-text"
                      style={{ fontFamily: "var(--font-mono, 'Fira Code', monospace)" }}
                    />
                  </div>
                ) : (
                  <>
                    {/* Read-only mode span when Live Editor is toggled off */}
                    <span className="whitespace-pre">
                      {cell.indent > 0 ? ' '.repeat(cell.indent) : ''}
                      {renderSyntaxText(cell.formattedText, cell.valueType, row.status)}
                    </span>

                    {/* Folded summary indicator (uses CSS ::after so never copied) */}
                    {isFolded && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (blockId) onToggleBlockFold(blockId);
                        }}
                        data-badge-label={`... ${cell.valueType === 'array' ? ']' : '}'}`}
                        className="ml-2 px-1.5 py-0.2 rounded bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 text-[10px] font-mono select-none cursor-pointer after:content-[attr(data-badge-label)]"
                        title="Click to expand folded block"
                      />
                    )}
                  </>
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
      <span>
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
      <span>
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
