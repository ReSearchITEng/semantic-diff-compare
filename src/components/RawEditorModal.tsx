/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Check, FileCode, Wand2, AlertTriangle, ArrowRightLeft } from 'lucide-react';
import { detectFormat } from '../diff/parser';
import { lintYamlTabs, convertTabsToSpaces } from '../diff/yamlLinter';

interface RawEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  leftRaw: string;
  rightRaw: string;
  onApply: (newLeft: string, newRight: string) => void;
}

export const RawEditorModal: React.FC<RawEditorModalProps> = ({
  isOpen,
  onClose,
  leftRaw,
  rightRaw,
  onApply,
}) => {
  const [leftText, setLeftText] = useState(leftRaw);
  const [rightText, setRightText] = useState(rightRaw);
  const [activeTab, setActiveTab] = useState<'both' | 'left' | 'right'>('both');

  if (!isOpen) return null;

  const leftFormat = detectFormat(leftText);
  const rightFormat = detectFormat(rightText);

  const leftTabs = lintYamlTabs(leftText);
  const rightTabs = lintYamlTabs(rightText);

  const handleApply = () => {
    onApply(leftText, rightText);
    onClose();
  };

  const handleFixLeftTabs = () => {
    setLeftText(convertTabsToSpaces(leftText, 2));
  };

  const handleFixRightTabs = () => {
    setRightText(convertTabsToSpaces(rightText, 2));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden text-zinc-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/80">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-sm text-zinc-100 flex items-center gap-2">
              <FileCode className="h-4 w-4 text-cyan-400" />
              <span>Direct Raw Text Editor (JSON / JSONC / YAML / TOML)</span>
            </h3>

            {/* View Tab Selector */}
            <div className="flex items-center rounded bg-zinc-800 border border-zinc-700 p-0.5 text-xs">
              <button
                onClick={() => setActiveTab('both')}
                className={`px-2.5 py-0.5 rounded transition ${
                  activeTab === 'both' ? 'bg-cyan-600 text-white font-medium' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Split View
              </button>
              <button
                onClick={() => setActiveTab('left')}
                className={`px-2.5 py-0.5 rounded transition ${
                  activeTab === 'left' ? 'bg-cyan-600 text-white font-medium' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Left Only
              </button>
              <button
                onClick={() => setActiveTab('right')}
                className={`px-2.5 py-0.5 rounded transition ${
                  activeTab === 'right' ? 'bg-cyan-600 text-white font-medium' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Right Only
              </button>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
            aria-label="Close raw editor"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Editor Body */}
        <div className="flex-1 flex overflow-hidden p-3 gap-3 bg-zinc-950">
          {/* Left Pane Editor */}
          {(activeTab === 'both' || activeTab === 'left') && (
            <div className="flex-1 flex flex-col border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/40">
              <div className="h-8 px-3 border-b border-zinc-800 bg-zinc-900/90 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-200">Left Document</span>
                  <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-cyan-300 font-mono text-[10px] uppercase border border-zinc-700">
                    {leftFormat}
                  </span>
                </div>

                {leftTabs.length > 0 && (
                  <button
                    onClick={handleFixLeftTabs}
                    className="flex items-center gap-1 text-[10px] text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
                    title="Convert tabs to 2 spaces"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    <span>Fix {leftTabs.length} Tabs</span>
                  </button>
                )}
              </div>

              <textarea
                value={leftText}
                onChange={(e) => setLeftText(e.target.value)}
                spellCheck={false}
                placeholder="Paste or write Left JSON / JSONC / YAML..."
                className="flex-1 p-3 bg-transparent text-zinc-100 font-mono text-xs leading-5 resize-none focus:outline-hidden"
                style={{ fontFamily: "'Fira Code', monospace" }}
              />
            </div>
          )}

          {/* Right Pane Editor */}
          {(activeTab === 'both' || activeTab === 'right') && (
            <div className="flex-1 flex flex-col border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/40">
              <div className="h-8 px-3 border-b border-zinc-800 bg-zinc-900/90 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-200">Right Document</span>
                  <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-cyan-300 font-mono text-[10px] uppercase border border-zinc-700">
                    {rightFormat}
                  </span>
                </div>

                {rightTabs.length > 0 && (
                  <button
                    onClick={handleFixRightTabs}
                    className="flex items-center gap-1 text-[10px] text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
                    title="Convert tabs to 2 spaces"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    <span>Fix {rightTabs.length} Tabs</span>
                  </button>
                )}
              </div>

              <textarea
                value={rightText}
                onChange={(e) => setRightText(e.target.value)}
                spellCheck={false}
                placeholder="Paste or write Right JSON / JSONC / YAML..."
                className="flex-1 p-3 bg-transparent text-zinc-100 font-mono text-xs leading-5 resize-none focus:outline-hidden"
                style={{ fontFamily: "'Fira Code', monospace" }}
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            Comments and partial/truncated inputs will be auto-repaired and aligned semantically.
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Apply & Re-Diff</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
