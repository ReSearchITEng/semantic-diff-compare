/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Columns,
  EyeOff,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { AlignedDiffRow } from '../diff/types';
import { computeIntraLineDiff, parseInlineValue } from '../diff/inPlacePatcher';

interface BottomLineInspectorProps {
  row: AlignedDiffRow | null;
  onMergeRowLeftToRight: (row: AlignedDiffRow) => void;
  onMergeRowRightToLeft: (row: AlignedDiffRow) => void;
  onInlineEditValue: (side: 'left' | 'right', path: string, newValue: any) => void;
  onClose: () => void;
}

export const BottomLineInspector: React.FC<BottomLineInspectorProps> = ({
  row,
  onMergeRowLeftToRight,
  onMergeRowRightToLeft,
  onInlineEditValue,
  onClose,
}) => {
  const [editingSide, setEditingSide] = useState<'left' | 'right' | null>(null);
  const [editDraft, setEditDraft] = useState<string>('');

  useEffect(() => {
    setEditingSide(null);
  }, [row?.id, row?.path]);

  const leftCell = row?.left;
  const rightCell = row?.right;
  const leftLine = leftCell ? `${'  '.repeat(leftCell.indent)}${leftCell.formattedText}` : '';
  const rightLine = rightCell ? `${'  '.repeat(rightCell.indent)}${rightCell.formattedText}` : '';

  const intra = computeIntraLineDiff(leftLine, rightLine);
  const isDiff =
    row &&
    (row.status === 'modified' ||
      row.status === 'added_right' ||
      row.status === 'deleted_right' ||
      row.status === 'ignored_diff');

  const canEditLeft =
    leftCell &&
    !leftCell.isBlockHeader &&
    !leftCell.isBlockFooter &&
    leftCell.valueType !== 'object' &&
    leftCell.valueType !== 'array' &&
    leftCell.valueType !== 'comment';

  const canEditRight =
    rightCell &&
    !rightCell.isBlockHeader &&
    !rightCell.isBlockFooter &&
    rightCell.valueType !== 'object' &&
    rightCell.valueType !== 'array' &&
    rightCell.valueType !== 'comment';

  const startEdit = (side: 'left' | 'right') => {
    const cell = side === 'left' ? leftCell : rightCell;
    if (!cell) return;
    const rawVal =
      typeof cell.value === 'string'
        ? JSON.stringify(cell.value)
        : cell.value !== undefined
        ? String(cell.value)
        : '';
    setEditDraft(rawVal);
    setEditingSide(side);
  };

  const commitEdit = (side: 'left' | 'right') => {
    const cell = side === 'left' ? leftCell : rightCell;
    if (!cell || !cell.path) {
      setEditingSide(null);
      return;
    }
    const parsedVal = parseInlineValue(editDraft);
    onInlineEditValue(side, cell.path, parsedVal);
    setEditingSide(null);
  };

  return (
    <section
      aria-label="Beyond Compare Line Comparison Inspector"
      className="shrink-0 border-t border-[var(--border-color,#27272a)] bg-[var(--bg-header,#18181b)] text-xs select-text font-mono"
    >
      {/* Inspector Header Bar */}
      <div className="h-6 px-3 border-b border-zinc-800/80 bg-zinc-900/80 flex items-center justify-between text-[11px] text-zinc-400 select-none">
        <div className="flex items-center gap-2 overflow-hidden">
          <Columns className="h-3 w-3 text-cyan-400 shrink-0" />
          <span className="font-semibold text-zinc-200">Line Details (Beyond Compare View)</span>
          {row?.path && (
            <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-cyan-300 border border-zinc-700/70 truncate max-w-xs sm:max-w-md">
              {row.path}
            </span>
          )}
          {row?.status && row.status !== 'unchanged' && (
            <span className="px-1.5 py-0.2 rounded bg-amber-950/70 text-amber-300 border border-amber-700/50 uppercase text-[9px] font-bold">
              {row.status.replace('_', ' ')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {row && isDiff && (
            <div className="flex items-center gap-1 mr-2">
              {row.status !== 'added_right' && (
                <button
                  type="button"
                  onClick={() => onMergeRowLeftToRight(row)}
                  className="px-1.5 py-0.5 rounded bg-cyan-950 hover:bg-cyan-800 text-cyan-200 border border-cyan-700/60 flex items-center gap-0.5 text-[10px] cursor-pointer transition"
                  title="Copy Left line to Right"
                >
                  <span>Copy L▸R</span>
                  <ChevronRight className="h-3 w-3" />
                </button>
              )}
              {row.status !== 'deleted_right' && (
                <button
                  type="button"
                  onClick={() => onMergeRowRightToLeft(row)}
                  className="px-1.5 py-0.5 rounded bg-emerald-950 hover:bg-emerald-800 text-emerald-200 border border-emerald-700/60 flex items-center gap-0.5 text-[10px] cursor-pointer transition"
                  title="Copy Right line to Left"
                >
                  <ChevronLeft className="h-3 w-3" />
                  <span>Copy R◂L</span>
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-1.5 py-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 flex items-center gap-1 text-[10px] cursor-pointer transition"
            title="Hide bottom line comparison bar"
          >
            <EyeOff className="h-3 w-3" />
            <span className="hidden sm:inline">Hide Bottom Bar</span>
          </button>
        </div>
      </div>

      {/* Stacked Full-Width Line Comparison Rows */}
      <div className="divide-y divide-zinc-800/60">
        {/* Left Full Line */}
        <div className="h-6 px-3 flex items-center gap-2 bg-zinc-950/60 overflow-x-auto whitespace-pre">
          <span className="w-14 shrink-0 text-[10px] uppercase tracking-wider font-semibold text-amber-400/90 select-none flex items-center justify-between">
            <span>Left</span>
            <span className="text-zinc-500">{leftCell?.displayLine ?? '·'}</span>
          </span>

          <div className="flex-1 min-w-0 flex items-center">
            {editingSide === 'left' ? (
              <div className="flex items-center gap-1 w-full max-w-xl">
                <span className="text-cyan-300">{leftCell?.key ? `${leftCell.key}: ` : ''}</span>
                <input
                  type="text"
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit('left');
                    if (e.key === 'Escape') setEditingSide(null);
                  }}
                  autoFocus
                  aria-label="Inline edit left value"
                  className="flex-1 px-1.5 py-0.5 rounded bg-zinc-900 border border-cyan-500 text-zinc-100 text-xs font-mono focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => commitEdit('left')}
                  className="p-0.5 rounded bg-emerald-700 text-white hover:bg-emerald-600 cursor-pointer"
                  title="Save inline edit"
                >
                  <Check className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingSide(null)}
                  className="p-0.5 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 cursor-pointer"
                  title="Cancel"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : leftCell ? (
              <div className="flex items-center gap-2">
                <span>
                  <span className="text-zinc-300">{intra.prefix}</span>
                  {intra.leftMid && (
                    <span className="bg-amber-500/30 text-amber-200 px-0.5 rounded border border-amber-500/50 font-semibold">
                      {intra.leftMid}
                    </span>
                  )}
                  <span className="text-zinc-300">{intra.suffix}</span>
                </span>
                {canEditLeft && (
                  <button
                    type="button"
                    onClick={() => startEdit('left')}
                    className="px-1 py-0.2 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-cyan-300 text-[10px] flex items-center gap-0.5 cursor-pointer"
                    title="Edit Left value inline"
                  >
                    <Pencil className="h-2.5 w-2.5" />
                    <span>Edit</span>
                  </button>
                )}
              </div>
            ) : (
              <span className="text-zinc-600 italic">&lt;no corresponding line on Left&gt;</span>
            )}
          </div>
        </div>

        {/* Right Full Line */}
        <div className="h-6 px-3 flex items-center gap-2 bg-zinc-950/60 overflow-x-auto whitespace-pre">
          <span className="w-14 shrink-0 text-[10px] uppercase tracking-wider font-semibold text-emerald-400/90 select-none flex items-center justify-between">
            <span>Right</span>
            <span className="text-zinc-500">{rightCell?.displayLine ?? '·'}</span>
          </span>

          <div className="flex-1 min-w-0 flex items-center">
            {editingSide === 'right' ? (
              <div className="flex items-center gap-1 w-full max-w-xl">
                <span className="text-cyan-300">{rightCell?.key ? `${rightCell.key}: ` : ''}</span>
                <input
                  type="text"
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit('right');
                    if (e.key === 'Escape') setEditingSide(null);
                  }}
                  autoFocus
                  aria-label="Inline edit right value"
                  className="flex-1 px-1.5 py-0.5 rounded bg-zinc-900 border border-cyan-500 text-zinc-100 text-xs font-mono focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => commitEdit('right')}
                  className="p-0.5 rounded bg-emerald-700 text-white hover:bg-emerald-600 cursor-pointer"
                  title="Save inline edit"
                >
                  <Check className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingSide(null)}
                  className="p-0.5 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 cursor-pointer"
                  title="Cancel"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : rightCell ? (
              <div className="flex items-center gap-2">
                <span>
                  <span className="text-zinc-300">{intra.prefix}</span>
                  {intra.rightMid && (
                    <span className="bg-emerald-500/30 text-emerald-200 px-0.5 rounded border border-emerald-500/50 font-semibold">
                      {intra.rightMid}
                    </span>
                  )}
                  <span className="text-zinc-300">{intra.suffix}</span>
                </span>
                {canEditRight && (
                  <button
                    type="button"
                    onClick={() => startEdit('right')}
                    className="px-1 py-0.2 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-cyan-300 text-[10px] flex items-center gap-0.5 cursor-pointer"
                    title="Edit Right value inline"
                  >
                    <Pencil className="h-2.5 w-2.5" />
                    <span>Edit</span>
                  </button>
                )}
              </div>
            ) : (
              <span className="text-zinc-600 italic">&lt;no corresponding line on Right&gt;</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
