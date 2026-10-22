/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { DiffPane } from './components/DiffPane';
import { DiffGutter } from './components/DiffGutter';
import { BottomLineInspector } from './components/BottomLineInspector';
import { StatusBar } from './components/StatusBar';
import { IgnoredFieldsModal } from './components/IgnoredFieldsModal';
import { RawEditorModal } from './components/RawEditorModal';
import { MergeAllModal } from './components/MergeAllModal';
import { DocsModal } from './components/DocsModal';
import { PRESETS, PresetDemo } from './diff/presets';
import { parseDocument } from './diff/parser';
import { computeSemanticDiff } from './diff/semanticDiff';
import {
  setValueAtPath,
  getValueAtPath,
  mergeDataTrees,
  serializePreservingFormat,
} from './diff/inPlacePatcher';
import {
  adoptFormat,
  convertDocumentToFormat,
  exportPureJson,
  prettifyCondensed,
  prettifyOpened,
  normalizeTabsToSpaces,
} from './diff/formatter';
import { AlignedDiffRow, DocumentFormat, ThemeType } from './diff/types';

export default function App() {
  // Preset initialization
  const defaultPreset = PRESETS[0];
  const [currentPresetId, setCurrentPresetId] = useState<string>(defaultPreset.id);
  const [leftRaw, setLeftRaw] = useState<string>(defaultPreset.leftText);
  const [rightRaw, setRightRaw] = useState<string>(defaultPreset.rightText);
  const [ignoreListOrder, setIgnoreListOrder] = useState<boolean>(defaultPreset.ignoreListOrder);
  const [ignoreQuoteStyle, setIgnoreQuoteStyle] = useState<boolean>(true);
  const [inlineEditMode, setInlineEditMode] = useState<boolean>(true);
  const [showBottomInspector, setShowBottomInspector] = useState<boolean>(true);
  const [ignoredFields, setIgnoredFields] = useState<string[]>(defaultPreset.ignoredFields);
  const [theme, setTheme] = useState<ThemeType>('vscode-dark');

  // Modals & Active Path
  const [isIgnoredFieldsModalOpen, setIsIgnoredFieldsModalOpen] = useState(false);
  const [isRawEditorOpen, setIsRawEditorOpen] = useState(false);
  const [isDocsModalOpen, setIsDocsModalOpen] = useState(false);
  const [mergeAllModal, setMergeAllModal] = useState<{
    isOpen: boolean;
    direction: 'leftToRight' | 'rightToLeft';
  }>({ isOpen: false, direction: 'leftToRight' });

  const [activePath, setActivePath] = useState<string>('');
  const [activeLeftVal, setActiveLeftVal] = useState<any>(undefined);
  const [activeRightVal, setActiveRightVal] = useState<any>(undefined);

  // Code Folding
  const [foldedBlocks, setFoldedBlocks] = useState<Set<string>>(new Set());

  // Scroll Sync Refs (Left, Center Gutter, Right)
  const leftScrollRef = useRef<HTMLDivElement | null>(null);
  const gutterScrollRef = useRef<HTMLDivElement | null>(null);
  const rightScrollRef = useRef<HTMLDivElement | null>(null);
  const isSyncingScroll = useRef(false);

  // Parse Left and Right documents
  const leftDoc = useMemo(() => parseDocument(leftRaw), [leftRaw]);
  const rightDoc = useMemo(() => parseDocument(rightRaw), [rightRaw]);

  // Compute Semantic Diff
  const { rows, stats } = useMemo(() => {
    return computeSemanticDiff(leftDoc, rightDoc, {
      ignoreListOrder,
      ignoredFields,
      ignoreQuoteStyle,
    });
  }, [leftDoc, rightDoc, ignoreListOrder, ignoredFields, ignoreQuoteStyle]);

  // Determine active row for the Beyond Compare bottom line inspector
  const activeRow = useMemo(() => {
    if (activePath) {
      const matched = rows.find(
        (r) =>
          (r.path === activePath || r.left?.path === activePath || r.right?.path === activePath) &&
          !r.left?.isBlockFooter &&
          !r.right?.isBlockFooter
      );
      if (matched) return matched;
    }
    // Default to first modified/added/deleted row so the bottom bar is immediately informative
    return (
      rows.find(
        (r) =>
          r.status === 'modified' || r.status === 'added_right' || r.status === 'deleted_right'
      ) ||
      rows[0] ||
      null
    );
  }, [rows, activePath]);

  // Check YAML tab lint status
  const totalYamlTabs = useMemo(() => {
    const lTabs = leftDoc.yamlIssues?.reduce((acc, curr) => acc + curr.tabCount, 0) || 0;
    const rTabs = rightDoc.yamlIssues?.reduce((acc, curr) => acc + curr.tabCount, 0) || 0;
    return lTabs + rTabs;
  }, [leftDoc, rightDoc]);

  // 3-way synchronized scrolling handler (Left, Gutter, Right)
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>, source: 'left' | 'gutter' | 'right') => {
      if (isSyncingScroll.current) return;
      isSyncingScroll.current = true;

      const top = e.currentTarget.scrollTop;
      if (source !== 'left' && leftScrollRef.current) {
        leftScrollRef.current.scrollTop = top;
      }
      if (source !== 'gutter' && gutterScrollRef.current) {
        gutterScrollRef.current.scrollTop = top;
      }
      if (source !== 'right' && rightScrollRef.current) {
        rightScrollRef.current.scrollTop = top;
      }

      requestAnimationFrame(() => {
        isSyncingScroll.current = false;
      });
    },
    []
  );

  // Preset Selection
  const handleSelectPreset = (preset: PresetDemo) => {
    setCurrentPresetId(preset.id);
    setLeftRaw(preset.leftText);
    setRightRaw(preset.rightText);
    setIgnoreListOrder(preset.ignoreListOrder);
    setIgnoredFields(preset.ignoredFields);
    setActivePath('');
    setFoldedBlocks(new Set());
  };

  // Path selection on row click
  const handleSelectPath = (path: string, _val: any) => {
    setActivePath(path);
    setActiveLeftVal(getValueAtPath(leftDoc.data, path));
    setActiveRightVal(getValueAtPath(rightDoc.data, path));
  };

  // Inline Edit handler (updates Left or Right document in place without Raw Edit modal)
  const handleInlineEditValue = (side: 'left' | 'right', path: string, newValue: any) => {
    if (!path) return;
    if (side === 'left') {
      const updatedData = setValueAtPath(leftDoc.data, path, newValue);
      const updatedText = serializePreservingFormat(updatedData, leftDoc);
      setLeftRaw(updatedText);
      setActiveLeftVal(newValue);
    } else {
      const updatedData = setValueAtPath(rightDoc.data, path, newValue);
      const updatedText = serializePreservingFormat(updatedData, rightDoc);
      setRightRaw(updatedText);
      setActiveRightVal(newValue);
    }
    setActivePath(path);
    setCurrentPresetId('custom');
  };

  // Per-pane format switcher (convert between YAML, JSON, JSONC, TOML on the fly)
  const handleChangePaneFormat = (side: 'left' | 'right', targetFormat: DocumentFormat) => {
    if (side === 'left') {
      setLeftRaw(convertDocumentToFormat(leftDoc, targetFormat));
    } else {
      setRightRaw(convertDocumentToFormat(rightDoc, targetFormat));
    }
    setCurrentPresetId('custom');
  };

  // Block folding toggle
  const handleToggleBlockFold = (blockId: string) => {
    setFoldedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    setFoldedBlocks(new Set());
  };

  const handleCollapseAll = () => {
    const nestedBlockIds = new Set<string>();
    const allBlockIds = new Set<string>();
    rows.forEach((r) => {
      const bId = r.left?.blockId || r.right?.blockId || r.blockId;
      if (bId && (r.left?.isBlockHeader || r.right?.isBlockHeader)) {
        allBlockIds.add(bId);
        if (r.depth >= 1 || r.path !== '$') {
          nestedBlockIds.add(bId);
        }
      }
    });
    setFoldedBlocks(nestedBlockIds.size > 0 ? nestedBlockIds : allBlockIds);
  };

  // Row-level Beyond Compare Merging: Left ▸ Right
  const handleMergeRowLeftToRight = (row: AlignedDiffRow) => {
    if (!row.path) return;
    const sourceVal = getValueAtPath(leftDoc.data, row.path);
    const updatedRightData = setValueAtPath(rightDoc.data, row.path, sourceVal);
    const updatedRightText = serializePreservingFormat(updatedRightData, rightDoc);
    setRightRaw(updatedRightText);
    setCurrentPresetId('custom');
  };

  // Row-level Beyond Compare Merging: Right ◂ Left
  const handleMergeRowRightToLeft = (row: AlignedDiffRow) => {
    if (!row.path) return;
    const sourceVal = getValueAtPath(rightDoc.data, row.path);
    const updatedLeftData = setValueAtPath(leftDoc.data, row.path, sourceVal);
    const updatedLeftText = serializePreservingFormat(updatedLeftData, leftDoc);
    setLeftRaw(updatedLeftText);
    setCurrentPresetId('custom');
  };

  // Trigger Merge All Confirmation Modal
  const handleRequestMergeAll = (direction: 'leftToRight' | 'rightToLeft') => {
    setMergeAllModal({ isOpen: true, direction });
  };

  // Execute Confirmed Merge All (either skipping or including ignorable fields)
  const handleConfirmMergeAll = (includeIgnoredFields: boolean) => {
    if (mergeAllModal.direction === 'leftToRight') {
      const mergedData = mergeDataTrees(
        leftDoc.data,
        rightDoc.data,
        ignoredFields,
        includeIgnoredFields
      );
      const serialized = serializePreservingFormat(mergedData, rightDoc);
      setRightRaw(serialized);
    } else {
      const mergedData = mergeDataTrees(
        rightDoc.data,
        leftDoc.data,
        ignoredFields,
        includeIgnoredFields
      );
      const serialized = serializePreservingFormat(mergedData, leftDoc);
      setLeftRaw(serialized);
    }
    setCurrentPresetId('custom');
  };

  // Swap Panes
  const handleSwapPanes = () => {
    const tempLeft = leftRaw;
    setLeftRaw(rightRaw);
    setRightRaw(tempLeft);
  };

  // Format Alignment Actions
  const handleAdoptFormat = (direction: 'leftToRight' | 'rightToLeft') => {
    if (direction === 'leftToRight') {
      const adopted = adoptFormat(leftDoc, rightDoc);
      setRightRaw(adopted);
    } else {
      const adopted = adoptFormat(rightDoc, leftDoc);
      setLeftRaw(adopted);
    }
  };

  const handlePrettifyOpened = (side: 'left' | 'right') => {
    if (side === 'left') {
      setLeftRaw(prettifyOpened(leftDoc));
    } else {
      setRightRaw(prettifyOpened(rightDoc));
    }
  };

  const handlePrettifyCondensed = (side: 'left' | 'right') => {
    if (side === 'left') {
      setLeftRaw(prettifyCondensed(leftDoc));
    } else {
      setRightRaw(prettifyCondensed(rightDoc));
    }
  };

  const handleExportPureJson = (side: 'left' | 'right') => {
    if (side === 'left') {
      setLeftRaw(exportPureJson(leftDoc));
    } else {
      setRightRaw(exportPureJson(rightDoc));
    }
  };

  // YAML Tab Fixer Action
  const handleConvertYamlTabs = () => {
    if (leftDoc.yamlIssues && leftDoc.yamlIssues.length > 0) {
      setLeftRaw(normalizeTabsToSpaces(leftRaw));
    }
    if (rightDoc.yamlIssues && rightDoc.yamlIssues.length > 0) {
      setRightRaw(normalizeTabsToSpaces(rightRaw));
    }
  };

  // Visible rows (excluding rows hidden inside folded blocks)
  const visibleRows = useMemo(() => {
    return rows.filter((r) => !r.ancestorBlockIds?.some((id) => foldedBlocks.has(id)));
  }, [rows, foldedBlocks]);

  // Navigation: Jump to Next / Prev Difference
  const diffVisibleRowIndices = useMemo(() => {
    const indices: number[] = [];
    visibleRows.forEach((r, idx) => {
      if (r.status !== 'unchanged' && r.status !== 'spacer') {
        indices.push(idx);
      }
    });
    return indices;
  }, [visibleRows]);

  const [currentDiffIdxPointer, setCurrentDiffIdxPointer] = useState<number>(-1);

  const scrollToVisibleRowIndex = (visibleIdx: number) => {
    const rowHeight = 24; // 24px = h-6
    const targetScroll = Math.max(0, visibleIdx * rowHeight - 96);
    if (leftScrollRef.current) leftScrollRef.current.scrollTop = targetScroll;
    if (gutterScrollRef.current) gutterScrollRef.current.scrollTop = targetScroll;
    if (rightScrollRef.current) rightScrollRef.current.scrollTop = targetScroll;

    const row = visibleRows[visibleIdx];
    if (row?.path) {
      handleSelectPath(row.path, row.left?.value ?? row.right?.value);
    }
  };

  const handleJumpNextDiff = useCallback(() => {
    if (diffVisibleRowIndices.length === 0) return;
    const nextPointer = (currentDiffIdxPointer + 1) % diffVisibleRowIndices.length;
    setCurrentDiffIdxPointer(nextPointer);
    scrollToVisibleRowIndex(diffVisibleRowIndices[nextPointer]);
  }, [currentDiffIdxPointer, diffVisibleRowIndices, visibleRows]);

  const handleJumpPrevDiff = useCallback(() => {
    if (diffVisibleRowIndices.length === 0) return;
    const prevPointer =
      currentDiffIdxPointer <= 0 ? diffVisibleRowIndices.length - 1 : currentDiffIdxPointer - 1;
    setCurrentDiffIdxPointer(prevPointer);
    scrollToVisibleRowIndex(diffVisibleRowIndices[prevPointer]);
  }, [currentDiffIdxPointer, diffVisibleRowIndices, visibleRows]);

  // Keyboard shortcut listener (F7 for prev, F8 for next)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F8') {
        e.preventDefault();
        handleJumpNextDiff();
      } else if (e.key === 'F7') {
        e.preventDefault();
        handleJumpPrevDiff();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleJumpNextDiff, handleJumpPrevDiff]);

  const [mobilePaneView, setMobilePaneView] = useState<'split' | 'left' | 'right'>('split');

  return (
    <div
      className={`h-screen w-screen flex flex-col overflow-hidden theme-${theme} bg-[var(--bg-app,#09090b)] text-[var(--text-primary,#e4e4e7)]`}
    >
      {/* Top Application Bar */}
      <Header
        currentPreset={currentPresetId}
        onSelectPreset={handleSelectPreset}
        ignoreListOrder={ignoreListOrder}
        onToggleIgnoreListOrder={setIgnoreListOrder}
        ignoreQuoteStyle={ignoreQuoteStyle}
        onToggleIgnoreQuoteStyle={setIgnoreQuoteStyle}
        inlineEditMode={inlineEditMode}
        onToggleInlineEditMode={setInlineEditMode}
        showBottomInspector={showBottomInspector}
        onToggleBottomInspector={setShowBottomInspector}
        ignoredFields={ignoredFields}
        onOpenIgnoredFieldsModal={() => setIsIgnoredFieldsModalOpen(true)}
        onOpenDocsModal={() => setIsDocsModalOpen(true)}
        onAdoptFormat={handleAdoptFormat}
        onPrettifyOpened={handlePrettifyOpened}
        onPrettifyCondensed={handlePrettifyCondensed}
        onExportPureJson={handleExportPureJson}
        onConvertYamlTabs={handleConvertYamlTabs}
        hasYamlTabs={totalYamlTabs > 0}
        yamlTabCount={totalYamlTabs}
        theme={theme}
        onChangeTheme={setTheme}
        onSwapPanes={handleSwapPanes}
        onMergeAllLeftToRight={() => handleRequestMergeAll('leftToRight')}
        onMergeAllRightToLeft={() => handleRequestMergeAll('rightToLeft')}
        onToggleRawEditor={() => setIsRawEditorOpen(true)}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
      />

      {/* Mobile Portrait View Toggle Bar (hidden in landscape / wider screens >= 640px so Split & Gutter always work in landscape) */}
      <div className="sm:hidden flex items-center justify-between px-3 py-1 bg-zinc-900 border-b border-zinc-800 text-xs shrink-0 select-none">
        <span className="text-zinc-400 font-medium">View Mode:</span>
        <div className="flex items-center rounded bg-zinc-800 p-0.5 border border-zinc-700">
          <button
            type="button"
            onClick={() => setMobilePaneView('left')}
            className={`px-2 py-0.5 rounded text-[11px] transition cursor-pointer ${
              mobilePaneView === 'left' ? 'bg-cyan-600 text-white font-medium' : 'text-zinc-400'
            }`}
          >
            Left (Ref)
          </button>
          <button
            type="button"
            onClick={() => setMobilePaneView('split')}
            className={`px-2 py-0.5 rounded text-[11px] transition cursor-pointer ${
              mobilePaneView === 'split' ? 'bg-cyan-600 text-white font-medium' : 'text-zinc-400'
            }`}
          >
            Split
          </button>
          <button
            type="button"
            onClick={() => setMobilePaneView('right')}
            className={`px-2 py-0.5 rounded text-[11px] transition cursor-pointer ${
              mobilePaneView === 'right' ? 'bg-cyan-600 text-white font-medium' : 'text-zinc-400'
            }`}
          >
            Right (Comp)
          </button>
        </div>
      </div>

      {/* Main 2-Pane Diff Viewer with Central Action Gutter */}
      <main className="flex-1 flex overflow-hidden relative min-h-0">
        {/* Left Pane: Reference / Target */}
        <div className={`flex-1 h-full min-w-0 ${mobilePaneView === 'right' ? 'hidden sm:flex' : 'flex'}`}>
          <DiffPane
            side="left"
            title="Reference / Target"
            doc={leftDoc}
            rows={rows}
            activePath={activeRow?.path || activePath}
            onSelectPath={handleSelectPath}
            foldedBlocks={foldedBlocks}
            onToggleBlockFold={handleToggleBlockFold}
            onOpenRawEditor={() => setIsRawEditorOpen(true)}
            onClear={() => setLeftRaw('{}')}
            onChangeFormat={(fmt) => handleChangePaneFormat('left', fmt)}
            inlineEditMode={inlineEditMode}
            onInlineEditValue={(path, val) => handleInlineEditValue('left', path, val)}
            scrollRef={leftScrollRef}
            onScroll={(e) => handleScroll(e, 'left')}
          />
        </div>

        {/* Central Action Gutter */}
        <div className={`shrink-0 h-full ${mobilePaneView !== 'split' ? 'hidden sm:flex' : 'flex'}`}>
          <DiffGutter
            rows={rows}
            onMergeRowLeftToRight={handleMergeRowLeftToRight}
            onMergeRowRightToLeft={handleMergeRowRightToLeft}
            onJumpNextDiff={handleJumpNextDiff}
            onJumpPrevDiff={handleJumpPrevDiff}
            foldedBlocks={foldedBlocks}
            scrollRef={gutterScrollRef}
            onScroll={(e) => handleScroll(e, 'gutter')}
          />
        </div>

        {/* Right Pane: Compared / Rearranged */}
        <div className={`flex-1 h-full min-w-0 ${mobilePaneView === 'left' ? 'hidden sm:flex' : 'flex'}`}>
          <DiffPane
            side="right"
            title="Compared / Rearranged (Option A)"
            doc={rightDoc}
            rows={rows}
            activePath={activeRow?.path || activePath}
            onSelectPath={handleSelectPath}
            foldedBlocks={foldedBlocks}
            onToggleBlockFold={handleToggleBlockFold}
            onOpenRawEditor={() => setIsRawEditorOpen(true)}
            onClear={() => setRightRaw('{}')}
            onChangeFormat={(fmt) => handleChangePaneFormat('right', fmt)}
            inlineEditMode={inlineEditMode}
            onInlineEditValue={(path, val) => handleInlineEditValue('right', path, val)}
            scrollRef={rightScrollRef}
            onScroll={(e) => handleScroll(e, 'right')}
          />
        </div>
      </main>

      {/* Optional Beyond Compare Bottom Full-Line Comparison Inspector */}
      {showBottomInspector && (
        <BottomLineInspector
          row={activeRow}
          onMergeRowLeftToRight={handleMergeRowLeftToRight}
          onMergeRowRightToLeft={handleMergeRowRightToLeft}
          onInlineEditValue={handleInlineEditValue}
          onClose={() => setShowBottomInspector(false)}
        />
      )}

      {/* Status Bar & Live JSONPath Extractor */}
      <StatusBar
        activePath={activePath || activeRow?.path || ''}
        activeLeftVal={activeLeftVal}
        activeRightVal={activeRightVal}
        stats={stats}
        theme={theme}
        showBottomInspector={showBottomInspector}
        onToggleBottomInspector={() => setShowBottomInspector((prev) => !prev)}
      />

      {/* K8s CRD Ignored Fields Modal */}
      <IgnoredFieldsModal
        isOpen={isIgnoredFieldsModalOpen}
        onClose={() => setIsIgnoredFieldsModalOpen(false)}
        ignoredFields={ignoredFields}
        onSave={(newFields) => setIgnoredFields(newFields)}
      />

      {/* Merge All Options Modal (Skip or Include Ignorable Fields) */}
      <MergeAllModal
        isOpen={mergeAllModal.isOpen}
        direction={mergeAllModal.direction}
        ignoredDiffCount={stats.ignoredDiff}
        ignoredFields={ignoredFields}
        onClose={() => setMergeAllModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirmMerge={handleConfirmMergeAll}
      />

      {/* Raw Text Editor Modal */}
      <RawEditorModal
        isOpen={isRawEditorOpen}
        onClose={() => setIsRawEditorOpen(false)}
        leftRaw={leftRaw}
        rightRaw={rightRaw}
        onApply={(newLeft, newRight) => {
          setLeftRaw(newLeft);
          setRightRaw(newRight);
          setCurrentPresetId('custom');
        }}
      />

      {/* ADRs & Developer Rebuild Documentation Modal */}
      <DocsModal isOpen={isDocsModalOpen} onClose={() => setIsDocsModalOpen(false)} />
    </div>
  );
}
