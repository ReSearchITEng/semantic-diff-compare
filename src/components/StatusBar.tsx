/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Copy, Check, Terminal, Columns } from 'lucide-react';
import { DiffStatistics } from '../diff/types';

interface StatusBarProps {
  activePath: string;
  activeLeftVal?: any;
  activeRightVal?: any;
  stats: DiffStatistics;
  theme: string;
  showBottomInspector: boolean;
  onToggleBottomInspector: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  activePath,
  activeLeftVal,
  activeRightVal,
  stats,
  showBottomInspector,
  onToggleBottomInspector,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyPath = () => {
    if (!activePath) return;
    navigator.clipboard.writeText(activePath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasDiffs = stats.modified > 0 || stats.addedRight > 0 || stats.deletedRight > 0;

  return (
    <footer className="h-9 shrink-0 border-t border-[var(--border-color,#27272a)] bg-[var(--bg-header,#18181b)] px-3 flex items-center justify-between text-xs text-[var(--text-muted,#a1a1aa)] select-none font-mono">
      {/* Live JSONPath / YAMLPath Extractor */}
      <div className="flex items-center gap-2 overflow-hidden max-w-[55%]">
        <span className="text-zinc-500 font-semibold flex items-center gap-1 shrink-0">
          <Terminal className="h-3.5 w-3.5 text-cyan-400" />
          <span>Path:</span>
        </span>

        {activePath ? (
          <div className="flex items-center gap-1.5 overflow-hidden">
            <code
              onClick={handleCopyPath}
              className="px-1.5 py-0.5 rounded bg-zinc-800 text-cyan-300 border border-zinc-700/80 hover:border-cyan-500 transition cursor-pointer truncate max-w-md text-[11px]"
              title="Click to copy JSONPath"
            >
              {activePath}
            </code>

            <button
              type="button"
              onClick={handleCopyPath}
              className="p-1 hover:text-white rounded hover:bg-zinc-800 transition cursor-pointer shrink-0"
              title="Copy JSONPath to clipboard"
              aria-label="Copy JSONPath"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-zinc-400" />}
            </button>

            {/* Value Preview if primitive */}
            {(activeLeftVal !== undefined || activeRightVal !== undefined) && (
              <span className="text-[11px] text-zinc-400 truncate hidden lg:inline">
                {activeLeftVal !== undefined ? `Left: ${JSON.stringify(activeLeftVal)}` : 'Left: <empty>'}
                <span className="mx-1 text-zinc-600">→</span>
                {activeRightVal !== undefined ? `Right: ${JSON.stringify(activeRightVal)}` : 'Right: <empty>'}
              </span>
            )}
          </div>
        ) : (
          <span className="text-zinc-600 italic text-[11px]">Click any row to inspect JSONPath / YAMLPath</span>
        )}
      </div>

      {/* Diff Statistics & Bottom Inspector Toggle */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2 text-[11px]">
          {stats.modified > 0 && (
            <span className="flex items-center gap-1 text-amber-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              {stats.modified} modified
            </span>
          )}
          {stats.addedRight > 0 && (
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              +{stats.addedRight} added
            </span>
          )}
          {stats.deletedRight > 0 && (
            <span className="flex items-center gap-1 text-rose-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              -{stats.deletedRight} deleted
            </span>
          )}
          {stats.ignoredDiff > 0 && (
            <span className="flex items-center gap-1 text-slate-400" title="CRD fields configured as ignorable">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
              {stats.ignoredDiff} ignored (CRD)
            </span>
          )}
          {!hasDiffs && (
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <Check className="h-3.5 w-3.5" />
              Identical semantic payload
            </span>
          )}
        </div>

        <div className="w-px h-3 bg-zinc-800 hidden sm:block" />

        <button
          type="button"
          onClick={onToggleBottomInspector}
          className={`px-2 py-0.5 rounded border text-[10px] flex items-center gap-1 cursor-pointer transition ${
            showBottomInspector
              ? 'bg-emerald-950/70 border-emerald-700 text-emerald-300'
              : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
          }`}
          title="Toggle split full-line comparison inspector"
        >
          <Columns className="h-3 w-3" />
          <span>{showBottomInspector ? 'Bottom Line Bar: ON' : 'Bottom Line Bar: OFF'}</span>
        </button>

        <div className="text-[10px] text-zinc-500 hidden md:flex items-center gap-2">
          <span>Shortcuts: F7 (Prev), F8 (Next)</span>
        </div>
      </div>
    </footer>
  );
};
