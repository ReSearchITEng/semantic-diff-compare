/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ChevronDown, ChevronUp, ArrowRight, ArrowLeft, FolderSync } from 'lucide-react';
import { AlignedDiffRow } from '../diff/types';

interface DiffGutterProps {
  rows: AlignedDiffRow[];
  onMergeRowLeftToRight: (row: AlignedDiffRow) => void;
  onMergeRowRightToLeft: (row: AlignedDiffRow) => void;
  onJumpNextDiff: () => void;
  onJumpPrevDiff: () => void;
  foldedBlocks: Set<string>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}

export const DiffGutter: React.FC<DiffGutterProps> = ({
  rows,
  onMergeRowLeftToRight,
  onMergeRowRightToLeft,
  onJumpNextDiff,
  onJumpPrevDiff,
  foldedBlocks,
  scrollRef,
  onScroll,
}) => {
  return (
    <div className="w-14 shrink-0 flex flex-col h-full border-x border-[var(--border-color,#27272a)] bg-[var(--bg-gutter,#141416)] select-none z-10">
      {/* Gutter Header: Navigation Controls */}
      <div className="h-10 max-h-[500px]:h-8 shrink-0 border-b border-[var(--border-color,#27272a)] flex items-center justify-center gap-1 bg-[var(--bg-header,#18181b)] text-zinc-400">
        <button
          type="button"
          onClick={onJumpPrevDiff}
          className="p-1 hover:bg-zinc-800 hover:text-white rounded transition cursor-pointer touch-manipulation"
          title="Jump to Previous Difference (F7)"
          aria-label="Previous difference"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onJumpNextDiff}
          className="p-1 hover:bg-zinc-800 hover:text-white rounded transition cursor-pointer touch-manipulation"
          title="Jump to Next Difference (F8)"
          aria-label="Next difference"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Synchronized Row Merge Controls */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden py-1 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {rows.map((row, index) => {
          // Hide row if any of its ancestor blocks is folded
          if (row.ancestorBlockIds?.some((id) => foldedBlocks.has(id))) {
            return null;
          }

          const isDiff =
            (row.status !== 'unchanged' && row.status !== 'spacer') ||
            row.canMergeLeftToRight ||
            row.canMergeRightToLeft;

          // Check if row represents an entire block/group (object or array)
          const isGroup = Boolean(
            row.left?.isBlockHeader ||
            row.right?.isBlockHeader ||
            (row.left && (row.left.valueType === 'object' || row.left.valueType === 'array')) ||
            (row.right && (row.right.valueType === 'object' || row.right.valueType === 'array'))
          );

          return (
            <div
              key={row.id || index}
              className={`h-6 min-h-[24px] max-h-[24px] shrink-0 flex items-center justify-center text-[10px] group transition-colors ${
                row.status !== 'unchanged' && row.status !== 'spacer' ? 'bg-zinc-900/60' : ''
              }`}
            >
              {isDiff && (row.canMergeLeftToRight || row.canMergeRightToLeft) ? (
                <div className="flex items-center justify-center gap-0.5 px-0.5">
                  {/* Left-to-Right Merge Button (FolderSync for group, ArrowRight for line) */}
                  {row.canMergeLeftToRight && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMergeRowLeftToRight(row);
                      }}
                      className={`w-5 h-5 rounded flex items-center justify-center transition shadow-xs cursor-pointer touch-manipulation shrink-0 ${
                        isGroup
                          ? 'bg-cyan-900/90 hover:bg-cyan-600 active:bg-cyan-500 text-cyan-200 hover:text-white border border-cyan-500/80 ring-1 ring-cyan-400/40'
                          : 'bg-cyan-950/90 hover:bg-cyan-600 active:bg-cyan-500 text-cyan-300 hover:text-white border border-cyan-700/80'
                      }`}
                      title={
                        isGroup
                          ? row.status === 'added_right'
                            ? 'Sync group Left ▸ Right (Remove group from Right)'
                            : 'Sync entire group Left ▸ Right (Merge group into Right)'
                          : row.status === 'added_right'
                          ? 'Sync Left ▸ Right (Remove added field from Right)'
                          : 'Copy Left ▸ Right (Merge into Right)'
                      }
                      aria-label={isGroup ? 'Sync group Left to Right' : 'Merge Left to Right'}
                    >
                      {isGroup ? <FolderSync className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
                    </button>
                  )}

                  {/* Status Glyph */}
                  <span
                    className={`font-mono font-bold text-[10px] w-2.5 text-center select-none ${
                      row.status === 'modified'
                        ? 'text-amber-400'
                        : row.status === 'added_right'
                        ? 'text-emerald-400'
                        : row.status === 'deleted_right'
                        ? 'text-rose-400'
                        : row.status === 'ignored_diff'
                        ? 'text-slate-400'
                        : 'text-sky-400'
                    }`}
                    title={`Diff status: ${row.status}`}
                  >
                    {row.status === 'modified'
                      ? '≠'
                      : row.status === 'added_right'
                      ? '+'
                      : row.status === 'deleted_right'
                      ? '-'
                      : row.status === 'ignored_diff'
                      ? '~'
                      : '•'}
                  </span>

                  {/* Right-to-Left Merge Button (FolderSync for group, ArrowLeft for line) */}
                  {row.canMergeRightToLeft && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMergeRowRightToLeft(row);
                      }}
                      className={`w-5 h-5 rounded flex items-center justify-center transition shadow-xs cursor-pointer touch-manipulation shrink-0 ${
                        isGroup
                          ? 'bg-emerald-900/90 hover:bg-emerald-600 active:bg-emerald-500 text-emerald-200 hover:text-white border border-emerald-500/80 ring-1 ring-emerald-400/40'
                          : 'bg-emerald-950/90 hover:bg-emerald-600 active:bg-emerald-500 text-emerald-300 hover:text-white border border-emerald-700/80'
                      }`}
                      title={
                        isGroup
                          ? row.status === 'deleted_right'
                            ? 'Sync group Right ◂ Left (Remove group from Left)'
                            : 'Sync entire group Right ◂ Left (Merge group into Left)'
                          : row.status === 'deleted_right'
                          ? 'Sync Right ◂ Left (Remove deleted field from Left)'
                          : 'Copy Right ◂ Left (Merge into Left)'
                      }
                      aria-label={isGroup ? 'Sync group Right to Left' : 'Merge Right to Left'}
                    >
                      {isGroup ? <FolderSync className="h-3 w-3" /> : <ArrowLeft className="h-3 w-3" />}
                    </button>
                  )}
                </div>
              ) : (
                <span className="text-zinc-700 text-[10px] opacity-0 group-hover:opacity-40">·</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
