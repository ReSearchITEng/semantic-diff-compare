/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, ChevronsRight, ChevronsLeft, ShieldCheck, Layers, Filter } from 'lucide-react';

interface MergeAllModalProps {
  isOpen: boolean;
  direction: 'leftToRight' | 'rightToLeft';
  ignoredDiffCount: number;
  ignoredFields: string[];
  onClose: () => void;
  onConfirmMerge: (includeIgnoredFields: boolean) => void;
}

export const MergeAllModal: React.FC<MergeAllModalProps> = ({
  isOpen,
  direction,
  ignoredDiffCount,
  ignoredFields,
  onClose,
  onConfirmMerge,
}) => {
  if (!isOpen) return null;

  const isLeftToRight = direction === 'leftToRight';
  const sourceLabel = isLeftToRight ? 'Left (Reference)' : 'Right (Compared)';
  const targetLabel = isLeftToRight ? 'Right (Compared)' : 'Left (Reference)';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="merge-all-modal-title"
    >
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-w-md w-full flex flex-col overflow-hidden text-zinc-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400">
              {isLeftToRight ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </div>
            <div>
              <h3 id="merge-all-modal-title" className="font-semibold text-sm text-zinc-100">
                Merge All: {sourceLabel} → {targetLabel}
              </h3>
              <p className="text-[11px] text-zinc-400">
                Choose how to handle ignorable / filtered fields during full sync
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
            aria-label="Close merge dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-3">
          {ignoredFields.length > 0 && (
            <div className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs flex items-start gap-2">
              <Filter className="h-3.5 w-3.5 text-cyan-400 shrink-0 mt-0.5" />
              <div className="text-zinc-300">
                <span className="font-medium text-cyan-300">{ignoredDiffCount} ignorable diff(s)</span> detected across filtered fields:{' '}
                <span className="font-mono text-[11px] text-zinc-400">
                  {ignoredFields.slice(0, 5).join(', ')}
                  {ignoredFields.length > 5 ? ` +${ignoredFields.length - 5} more` : ''}
                </span>
              </div>
            </div>
          )}

          {/* Option 1: Ignore Ignorable Fields */}
          <button
            type="button"
            onClick={() => {
              onConfirmMerge(false);
              onClose();
            }}
            className="w-full text-left p-3.5 rounded-lg bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-700/80 transition flex items-start gap-3 group cursor-pointer"
          >
            <ShieldCheck className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-xs text-cyan-200 flex items-center justify-between">
                <span>Skip Ignorable Fields (Recommended)</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-900/80 text-cyan-300 font-mono">
                  Safe Sync
                </span>
              </div>
              <p className="text-[11px] text-zinc-300 mt-1 leading-relaxed">
                Copies only real semantic differences (Modified, Added, Deleted) while preserving {targetLabel}&apos;s ignorable fields ({ignoredFields.slice(0, 3).join(', ') || 'filtered fields'}).
              </p>
            </div>
          </button>

          {/* Option 2: Merge Everything Including Ignorable Fields */}
          <button
            type="button"
            onClick={() => {
              onConfirmMerge(true);
              onClose();
            }}
            className="w-full text-left p-3.5 rounded-lg bg-zinc-800/70 hover:bg-zinc-800 border border-zinc-700 transition flex items-start gap-3 group cursor-pointer"
          >
            <Layers className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-xs text-zinc-100 flex items-center justify-between">
                <span>Merge Everything (Include Ignorable Fields)</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 font-mono">
                  Full Overwrite
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                Overwrites all fields in {targetLabel} with {sourceLabel}, including ignored CRD and metadata fields.
              </p>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-950/70 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
