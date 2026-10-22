/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  GitCompare,
  ArrowRightLeft,
  ListFilter,
  Check,
  AlertTriangle,
  Wand2,
  Sun,
  Moon,
  ChevronsRight,
  ChevronsLeft,
  FileCode2,
  Sparkles,
  ChevronDown,
  Pencil,
  Columns,
  BookOpen,
} from 'lucide-react';
import { ThemeType } from '../diff/types';
import { PRESETS, PresetDemo } from '../diff/presets';

interface HeaderProps {
  currentPreset: string;
  onSelectPreset: (preset: PresetDemo) => void;
  ignoreListOrder: boolean;
  onToggleIgnoreListOrder: (val: boolean) => void;
  ignoreQuoteStyle: boolean;
  onToggleIgnoreQuoteStyle: (val: boolean) => void;
  inlineEditMode: boolean;
  onToggleInlineEditMode: (val: boolean) => void;
  showBottomInspector: boolean;
  onToggleBottomInspector: (val: boolean) => void;
  ignoredFields: string[];
  onOpenIgnoredFieldsModal: () => void;
  onOpenDocsModal: () => void;
  onAdoptFormat: (direction: 'leftToRight' | 'rightToLeft') => void;
  onPrettifyOpened: (side: 'left' | 'right') => void;
  onPrettifyCondensed: (side: 'left' | 'right') => void;
  onExportPureJson: (side: 'left' | 'right') => void;
  onConvertYamlTabs: () => void;
  hasYamlTabs: boolean;
  yamlTabCount: number;
  theme: ThemeType;
  onChangeTheme: (theme: ThemeType) => void;
  onSwapPanes: () => void;
  onMergeAllLeftToRight: () => void;
  onMergeAllRightToLeft: () => void;
  onToggleRawEditor: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentPreset,
  onSelectPreset,
  ignoreListOrder,
  onToggleIgnoreListOrder,
  ignoreQuoteStyle,
  onToggleIgnoreQuoteStyle,
  inlineEditMode,
  onToggleInlineEditMode,
  showBottomInspector,
  onToggleBottomInspector,
  ignoredFields,
  onOpenIgnoredFieldsModal,
  onOpenDocsModal,
  onAdoptFormat,
  onPrettifyOpened,
  onPrettifyCondensed,
  onExportPureJson,
  onConvertYamlTabs,
  hasYamlTabs,
  yamlTabCount,
  theme,
  onChangeTheme,
  onSwapPanes,
  onMergeAllLeftToRight,
  onMergeAllRightToLeft,
  onToggleRawEditor,
  onExpandAll,
  onCollapseAll,
}) => {
  const [showPresetsMenu, setShowPresetsMenu] = useState(false);
  const [showFormatMenu, setShowFormatMenu] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  return (
    <header className="border-b border-[var(--border-color,#27272a)] bg-[var(--bg-header,#18181b)] backdrop-blur px-3 py-2 max-h-[500px]:py-1 flex flex-wrap items-center justify-between gap-2 text-sm select-none relative z-50 shrink-0">
      {/* Brand & Preset Selector */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-2 font-bold tracking-tight text-white">
          <div className="h-6 w-6 rounded-md bg-gradient-to-tr from-cyan-600 to-emerald-500 flex items-center justify-center text-white shadow-sm shadow-cyan-500/20">
            <GitCompare className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm sm:text-base font-semibold tracking-wide bg-gradient-to-r from-cyan-200 via-emerald-200 to-white bg-clip-text text-transparent">
            SemantiCompare
          </span>
          <span className="hidden xl:inline-block text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-normal border border-zinc-700/60">
            JSONC • YAML • TOML
          </span>
        </div>

        {/* Preset Selector Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowPresetsMenu(!showPresetsMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-700 text-xs font-medium transition cursor-pointer"
            title="Load sample scenarios"
            aria-label="Preset samples"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="truncate max-w-[150px] sm:max-w-none">
              Preset: {PRESETS.find((p) => p.id === currentPreset)?.name || 'Custom'}
            </span>
            <ChevronDown className="h-3 w-3 text-zinc-400 shrink-0" />
          </button>

          {showPresetsMenu && (
            <div className="absolute left-0 mt-1 w-72 rounded-lg bg-zinc-900 border border-zinc-700 shadow-xl py-1.5 z-50">
              <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800 mb-1">
                Preset Scenarios
              </div>
              {PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => {
                    onSelectPreset(p);
                    setShowPresetsMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs flex flex-col gap-0.5 hover:bg-zinc-800 transition cursor-pointer ${
                    currentPreset === p.id ? 'bg-zinc-800/80 text-cyan-300' : 'text-zinc-200'
                  }`}
                >
                  <div className="font-medium flex items-center justify-between">
                    <span>{p.name}</span>
                    {currentPreset === p.id && <Check className="h-3.5 w-3.5 text-cyan-400" />}
                  </div>
                  <span className="text-zinc-400 text-[11px] leading-tight line-clamp-1">{p.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Center Tool Buttons */}
      <div className="flex items-center flex-wrap gap-1.5">
        {/* Inline Edit Mode Toggle */}
        <label
          className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs cursor-pointer select-none transition ${
            inlineEditMode
              ? 'bg-cyan-950/70 border-cyan-600/80 text-cyan-200'
              : 'bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border-zinc-700'
          }`}
          title="Click or double-click any primitive value in the diff rows to edit inline without entering raw edit mode"
        >
          <input
            type="checkbox"
            checked={inlineEditMode}
            onChange={(e) => onToggleInlineEditMode(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-900 text-cyan-500 focus:ring-0 cursor-pointer h-3.5 w-3.5"
          />
          <Pencil className="h-3 w-3 text-cyan-400" />
          <span>Inline Edit</span>
        </label>

        {/* Beyond Compare Bottom Line Bar Toggle */}
        <label
          className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs cursor-pointer select-none transition ${
            showBottomInspector
              ? 'bg-emerald-950/60 border-emerald-600/70 text-emerald-200'
              : 'bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border-zinc-700'
          }`}
          title="Show or hide the Beyond Compare-style bottom full-line comparison inspector"
        >
          <input
            type="checkbox"
            checked={showBottomInspector}
            onChange={(e) => onToggleBottomInspector(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-0 cursor-pointer h-3.5 w-3.5"
          />
          <Columns className="h-3 w-3 text-emerald-400" />
          <span>Bottom Line Bar</span>
        </label>

        {/* Ignore List Order Toggle */}
        <label
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs cursor-pointer select-none transition"
          title="When enabled, array items are compared as sets/multisets regardless of index position"
        >
          <input
            type="checkbox"
            checked={ignoreListOrder}
            onChange={(e) => onToggleIgnoreListOrder(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-900 text-cyan-500 focus:ring-0 cursor-pointer h-3.5 w-3.5"
          />
          <span>Ignore List Order</span>
        </label>

        {/* Ignore Quote Types Toggle */}
        <label
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs cursor-pointer select-none transition"
          title="When enabled, single quotes (') vs double quotes (&quot;) or unquoted strings do not trigger a diff"
        >
          <input
            type="checkbox"
            checked={ignoreQuoteStyle}
            onChange={(e) => onToggleIgnoreQuoteStyle(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-900 text-cyan-500 focus:ring-0 cursor-pointer h-3.5 w-3.5"
          />
          <span>Ignore Quote Types</span>
        </label>

        {/* K8s CRD Ignored Fields Modal Trigger */}
        <button
          type="button"
          onClick={onOpenIgnoredFieldsModal}
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-750 text-zinc-300 border border-zinc-700 text-xs font-medium transition cursor-pointer"
          title="Configure fields (like managedFields, resourceVersion) to show as subtle ignorable differences"
        >
          <ListFilter className="h-3.5 w-3.5 text-cyan-400" />
          <span>Ignored CRD Fields</span>
          <span className="px-1.5 py-0.2 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-mono">
            {ignoredFields.length}
          </span>
        </button>

        {/* YAML Tab Fixer (Appears or Highlights when tabs are present) */}
        {hasYamlTabs && (
          <button
            type="button"
            onClick={onConvertYamlTabs}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-600 text-xs font-semibold animate-pulse transition cursor-pointer"
            title="Illegal tab characters detected in YAML indentation! Click to convert to 2 spaces."
          >
            <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
            <span>Fix {yamlTabCount} YAML Tabs (Convert to 2 Spaces)</span>
          </button>
        )}

        {/* Format Alignment Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowFormatMenu(!showFormatMenu)}
            className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-750 text-zinc-300 border border-zinc-700 text-xs font-medium transition cursor-pointer"
            title="Formatting & Prettification Options"
          >
            <Wand2 className="h-3.5 w-3.5 text-emerald-400" />
            <span>Format Controls</span>
            <ChevronDown className="h-3 w-3 text-zinc-400" />
          </button>

          {showFormatMenu && (
            <div className="absolute right-0 mt-1 w-60 rounded-lg bg-zinc-900 border border-zinc-700 shadow-xl py-1.5 z-50">
              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800 mb-1">
                Cross-Pane Style Alignment
              </div>
              <button
                type="button"
                onClick={() => {
                  onAdoptFormat('leftToRight');
                  setShowFormatMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 flex items-center justify-between cursor-pointer"
              >
                <span>Adopt Left Format ▸ Right</span>
                <ChevronsRight className="h-3.5 w-3.5 text-cyan-400" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onAdoptFormat('rightToLeft');
                  setShowFormatMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 flex items-center justify-between cursor-pointer"
              >
                <span>Adopt Right Format ◂ Left</span>
                <ChevronsLeft className="h-3.5 w-3.5 text-cyan-400" />
              </button>

              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-t border-zinc-800 my-1">
                Prettify & Export
              </div>
              <button
                type="button"
                onClick={() => {
                  onPrettifyOpened('left');
                  onPrettifyOpened('right');
                  setShowFormatMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 cursor-pointer"
              >
                Prettify Both (Expanded Multiline)
              </button>
              <button
                type="button"
                onClick={() => {
                  onPrettifyCondensed('right');
                  setShowFormatMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 cursor-pointer"
              >
                Prettify Right as Condensed JSON
              </button>
              <button
                type="button"
                onClick={() => {
                  onExportPureJson('right');
                  setShowFormatMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 flex items-center justify-between cursor-pointer"
              >
                <span>Strip to Pure RFC-8259 JSON</span>
                <span className="text-[10px] text-zinc-400">no comments</span>
              </button>
            </div>
          )}
        </div>

        {/* Global Expand/Collapse Blocks */}
        <div className="flex items-center rounded border border-zinc-700 bg-zinc-800/80 overflow-hidden text-xs">
          <button
            type="button"
            onClick={onExpandAll}
            className="px-2 py-1 hover:bg-zinc-700 text-zinc-300 transition cursor-pointer"
            title="Expand all collapsible object/array blocks"
          >
            Expand All
          </button>
          <div className="w-px h-3.5 bg-zinc-700" />
          <button
            type="button"
            onClick={onCollapseAll}
            className="px-2 py-1 hover:bg-zinc-700 text-zinc-300 transition cursor-pointer"
            title="Collapse all collapsible object/array blocks"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Right Action Tools: Full Sync, Raw Editor, Docs, Swap, Theme */}
      <div className="flex items-center gap-1.5">
        {/* Full Document Merge Buttons */}
        <div className="flex items-center rounded border border-zinc-700 bg-zinc-800 overflow-hidden text-xs">
          <button
            type="button"
            onClick={onMergeAllLeftToRight}
            className="px-2 py-1 hover:bg-zinc-700 text-cyan-300 flex items-center gap-1 transition cursor-pointer"
            title="Beyond Compare Action: Merge Left to Right (asks whether to skip or include ignorable fields)"
          >
            <span>Merge All</span>
            <ChevronsRight className="h-3.5 w-3.5" />
          </button>
          <div className="w-px h-3.5 bg-zinc-700" />
          <button
            type="button"
            onClick={onMergeAllRightToLeft}
            className="px-2 py-1 hover:bg-zinc-700 text-emerald-300 flex items-center gap-1 transition cursor-pointer"
            title="Beyond Compare Action: Merge Right to Left (asks whether to skip or include ignorable fields)"
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
            <span>Merge All</span>
          </button>
        </div>

        {/* Swap Panes */}
        <button
          type="button"
          onClick={onSwapPanes}
          className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-750 text-zinc-300 border border-zinc-700 text-xs transition cursor-pointer"
          title="Swap Left and Right Panes"
          aria-label="Swap Panes"
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
        </button>

        {/* Direct Raw Text Editor Toggle */}
        <button
          type="button"
          onClick={onToggleRawEditor}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-cyan-950/70 hover:bg-cyan-900 text-cyan-200 border border-cyan-700 text-xs font-medium transition cursor-pointer"
          title="Directly paste or edit raw text in either pane"
        >
          <FileCode2 className="h-3.5 w-3.5" />
          <span>Edit Raw</span>
        </button>

        {/* ADRs & Developer Rebuild Documentation Button */}
        <button
          type="button"
          onClick={onOpenDocsModal}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-750 text-amber-300 border border-zinc-700 text-xs font-medium transition cursor-pointer"
          title="View Architecture Decision Records (ADRs), Rebuild Playbook, and Iteration Log (/docs)"
        >
          <BookOpen className="h-3.5 w-3.5 text-amber-400" />
          <span>ADRs & Docs</span>
        </button>

        {/* Theme Switcher */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowThemeMenu(!showThemeMenu)}
            className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-750 text-zinc-300 border border-zinc-700 text-xs transition cursor-pointer"
            title="Change Theme (VS Code Dark, Solarized Dark, Solarized Light)"
            aria-label="Theme selector"
          >
            {theme === 'solarized-light' ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5 text-cyan-400" />}
          </button>

          {showThemeMenu && (
            <div className="absolute right-0 mt-1 w-44 rounded-lg bg-zinc-900 border border-zinc-700 shadow-xl py-1.5 z-50">
              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800 mb-1">
                Themes
              </div>
              <button
                type="button"
                onClick={() => {
                  onChangeTheme('vscode-dark');
                  setShowThemeMenu(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-zinc-800 cursor-pointer ${
                  theme === 'vscode-dark' ? 'text-cyan-300 font-medium' : 'text-zinc-300'
                }`}
              >
                <span>VS Code Dark</span>
                {theme === 'vscode-dark' && <Check className="h-3.5 w-3.5 text-cyan-400" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  onChangeTheme('solarized-dark');
                  setShowThemeMenu(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-zinc-800 cursor-pointer ${
                  theme === 'solarized-dark' ? 'text-cyan-300 font-medium' : 'text-zinc-300'
                }`}
              >
                <span>Solarized Dark</span>
                {theme === 'solarized-dark' && <Check className="h-3.5 w-3.5 text-cyan-400" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  onChangeTheme('solarized-light');
                  setShowThemeMenu(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-zinc-800 cursor-pointer ${
                  theme === 'solarized-light' ? 'text-cyan-300 font-medium' : 'text-zinc-300'
                }`}
              >
                <span>Solarized Light</span>
                {theme === 'solarized-light' && <Check className="h-3.5 w-3.5 text-cyan-400" />}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
