/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Header } from './components/Header';
import { DiffPane, extractCleanPaneSelection } from './components/DiffPane';
import { DiffGutter } from './components/DiffGutter';
import { BottomLineInspector } from './components/BottomLineInspector';
import { StatusBar } from './components/StatusBar';
import { IgnoredFieldsModal } from './components/IgnoredFieldsModal';
import { RawEditorModal } from './components/RawEditorModal';
import { MergeAllModal } from './components/MergeAllModal';
import { DiffReportModal } from './components/DiffReportModal';
import { DocsModal } from './components/DocsModal';
import { PRESETS, PresetDemo } from './diff/presets';
import { parseDocument, validatePastedDocument } from './diff/parser';
import { computeSemanticDiff } from './diff/semanticDiff';
import {
  setValueAtPath,
  getValueAtPath,
  mergeDataTrees,
  serializePreservingFormat,
  renameKeyAtPath,
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

interface HistorySnapshot {
  leftRaw: string;
  rightRaw: string;
  leftFormatOverride?: DocumentFormat;
  rightFormatOverride?: DocumentFormat;
  currentPresetId: string;
  label: string;
}

export default function App() {
  // Preset initialization
  const defaultPreset = PRESETS[0];
  const [currentPresetId, setCurrentPresetId] = useState<string>(defaultPreset.id);
  const [leftRaw, setLeftRaw] = useState<string>(defaultPreset.leftText);
  const [rightRaw, setRightRaw] = useState<string>(defaultPreset.rightText);
  const [leftFormatOverride, setLeftFormatOverride] = useState<DocumentFormat | undefined>(undefined);
  const [rightFormatOverride, setRightFormatOverride] = useState<DocumentFormat | undefined>(undefined);
  const [ignoreListOrder, setIgnoreListOrder] = useState<boolean>(defaultPreset.ignoreListOrder);
  const [ignoreQuoteStyle, setIgnoreQuoteStyle] = useState<boolean>(true);
  const [inlineEditMode, setInlineEditMode] = useState<boolean>(true);
  const [showBottomInspector, setShowBottomInspector] = useState<boolean>(true);
  const [ignoredFields, setIgnoredFields] = useState<string[]>(defaultPreset.ignoredFields);
  const [theme, setTheme] = useState<ThemeType>('vscode-dark');

  // Undo / Redo History Stacks
  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);

  const pushHistory = useCallback(
    (label: string) => {
      setUndoStack((prev) => [
        ...prev.slice(-49),
        {
          leftRaw,
          rightRaw,
          leftFormatOverride,
          rightFormatOverride,
          currentPresetId,
          label,
        },
      ]);
      setRedoStack([]);
    },
    [leftRaw, rightRaw, leftFormatOverride, rightFormatOverride, currentPresetId]
  );

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [
      ...prev,
      {
        leftRaw,
        rightRaw,
        leftFormatOverride,
        rightFormatOverride,
        currentPresetId,
        label: previous.label,
      },
    ]);
    setUndoStack((prev) => prev.slice(0, -1));
    setLeftRaw(previous.leftRaw);
    setRightRaw(previous.rightRaw);
    setLeftFormatOverride(previous.leftFormatOverride);
    setRightFormatOverride(previous.rightFormatOverride);
    setCurrentPresetId(previous.currentPresetId);
  }, [undoStack, leftRaw, rightRaw, leftFormatOverride, rightFormatOverride, currentPresetId]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [
      ...prev,
      {
        leftRaw,
        rightRaw,
        leftFormatOverride,
        rightFormatOverride,
        currentPresetId,
        label: next.label,
      },
    ]);
    setRedoStack((prev) => prev.slice(0, -1));
    setLeftRaw(next.leftRaw);
    setRightRaw(next.rightRaw);
    setLeftFormatOverride(next.leftFormatOverride);
    setRightFormatOverride(next.rightFormatOverride);
    setCurrentPresetId(next.currentPresetId);
  }, [redoStack, leftRaw, rightRaw, leftFormatOverride, rightFormatOverride, currentPresetId]);

  // Modals & Active Path
  const [isIgnoredFieldsModalOpen, setIsIgnoredFieldsModalOpen] = useState(false);
  const [isRawEditorOpen, setIsRawEditorOpen] = useState(false);
  const [isDiffReportModalOpen, setIsDiffReportModalOpen] = useState(false);
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
  const leftDoc = useMemo(
    () => parseDocument(leftRaw, leftFormatOverride),
    [leftRaw, leftFormatOverride]
  );
  const rightDoc = useMemo(
    () => parseDocument(rightRaw, rightFormatOverride),
    [rightRaw, rightFormatOverride]
  );

  // Compute Semantic Diff
  const { rows, stats } = useMemo(() => {
    return computeSemanticDiff(leftDoc, rightDoc, {
      ignoreListOrder,
      ignoredFields,
      ignoreQuoteStyle,
    });
  }, [leftDoc, rightDoc, ignoreListOrder, ignoredFields, ignoreQuoteStyle]);

  // Determine active row for the bottom split line inspector
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
    pushHistory(`Switch preset to ${preset.name}`);
    setCurrentPresetId(preset.id);
    setLeftRaw(preset.leftText);
    setRightRaw(preset.rightText);
    setLeftFormatOverride(undefined);
    setRightFormatOverride(undefined);
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
    pushHistory(`Inline edit ${path} on ${side}`);
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

  // Live Line Edit handler for always-editable Live Editor mode (updates immediately as user types)
  const handleLiveEditLine = (
    side: 'left' | 'right',
    path: string,
    originalKey: string | undefined,
    newKey: string | undefined,
    newValue: any,
    shouldPushHistory: boolean
  ) => {
    if (!path) return;
    if (shouldPushHistory) {
      pushHistory(`Live edit ${path} on ${side}`);
    }

    const targetDoc = side === 'left' ? leftDoc : rightDoc;
    let updatedData = targetDoc.data;
    let nextActivePath = path;

    if (originalKey && newKey && originalKey !== newKey) {
      const renamed = renameKeyAtPath(targetDoc.data, path, originalKey, newKey, newValue);
      updatedData = renamed.data;
      nextActivePath = renamed.newPath;
    } else if (newValue !== undefined) {
      updatedData = setValueAtPath(targetDoc.data, path, newValue);
    } else {
      return;
    }

    const updatedText = serializePreservingFormat(updatedData, targetDoc);
    if (side === 'left') {
      setLeftRaw(updatedText);
      if (newValue !== undefined) setActiveLeftVal(newValue);
    } else {
      setRightRaw(updatedText);
      if (newValue !== undefined) setActiveRightVal(newValue);
    }
    setActivePath(nextActivePath);
    setCurrentPresetId('custom');
  };

  // Per-pane format switcher (convert between YAML, JSON, JSONC, TOML on the fly)
  const handleChangePaneFormat = (side: 'left' | 'right', targetFormat: DocumentFormat) => {
    pushHistory(`Convert ${side} pane to ${targetFormat.toUpperCase()}`);
    if (side === 'left') {
      setLeftFormatOverride(targetFormat);
      setLeftRaw(convertDocumentToFormat(leftDoc, targetFormat));
    } else {
      setRightFormatOverride(targetFormat);
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

  // Active / Focused Pane for daily keyboard shortcuts (Ctrl+A, Ctrl+C, Ctrl+V)
  const [focusedSide, setFocusedSide] = useState<'left' | 'right'>('left');
  const focusedSideRef = useRef<'left' | 'right'>('left');
  const [pastedFeedbackSide, setPastedFeedbackSide] = useState<'left' | 'right' | null>(null);
  const [pasteError, setPasteError] = useState<{
    side: 'left' | 'right';
    message: string;
  } | null>(null);
  const pasteErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNativePasteTimeRef = useRef<number>(0);

  const activatePane = useCallback((side: 'left' | 'right') => {
    focusedSideRef.current = side;
    setFocusedSide(side);
  }, []);

  const handlePasteIntoPane = useCallback(
    (side: 'left' | 'right', text: string): boolean => {
      if (!text || text.length === 0) return false;

      // Validate that the pasted content is valid JSON, JSONC, YAML, or TOML before updating state
      const validation = validatePastedDocument(text);
      if (!validation.valid) {
        if (pasteErrorTimerRef.current) {
          clearTimeout(pasteErrorTimerRef.current);
        }
        setPasteError({
          side,
          message: validation.error || 'Pasted content is not valid JSON or YAML.',
        });
        pasteErrorTimerRef.current = setTimeout(() => {
          setPasteError(null);
        }, 5000);
        return false;
      }

      if (pasteErrorTimerRef.current) {
        clearTimeout(pasteErrorTimerRef.current);
      }
      setPasteError(null);

      pushHistory(`Paste into ${side === 'left' ? 'Left' : 'Right'} pane`);
      if (side === 'left') {
        setLeftFormatOverride(undefined);
        setLeftRaw(text);
      } else {
        setRightFormatOverride(undefined);
        setRightRaw(text);
      }
      setCurrentPresetId('custom');
      setPastedFeedbackSide(side);
      setTimeout(() => {
        setPastedFeedbackSide((prev) => (prev === side ? null : prev));
      }, 2000);
      return true;
    },
    [pushHistory]
  );

  // Row-level Merging: Left ▸ Right
  const handleMergeRowLeftToRight = (row: AlignedDiffRow) => {
    const sourcePath = row.left?.path || row.path;
    let targetPath = row.right?.path || row.path;
    if (!sourcePath && !targetPath) return;

    pushHistory(`Merge ${sourcePath || targetPath} Left ▸ Right`);
    const sourceVal = row.left ? getValueAtPath(leftDoc.data, sourcePath) : undefined;

    // When copying an unmatched array element from Left to Right (deleted_right), append to Right's array
    if (row.left && !row.right && /\[\d+\]$/.test(sourcePath)) {
      const parentPath = sourcePath.replace(/\[\d+\]$/, '');
      const parentArr = getValueAtPath(rightDoc.data, parentPath);
      if (Array.isArray(parentArr)) {
        targetPath = `${parentPath}[${parentArr.length}]`;
      }
    }

    const updatedRightData = setValueAtPath(rightDoc.data, targetPath, sourceVal);
    const updatedRightText = serializePreservingFormat(updatedRightData, rightDoc);
    setRightRaw(updatedRightText);
    setCurrentPresetId('custom');
  };

  // Row-level Merging: Right ◂ Left
  const handleMergeRowRightToLeft = (row: AlignedDiffRow) => {
    const sourcePath = row.right?.path || row.path;
    let targetPath = row.left?.path || row.path;
    if (!sourcePath && !targetPath) return;

    pushHistory(`Merge ${targetPath || sourcePath} Right ◂ Left`);
    const sourceVal = row.right ? getValueAtPath(rightDoc.data, sourcePath) : undefined;

    // When copying an unmatched array element from Right to Left (added_right), append to Left's array
    if (row.right && !row.left && /\[\d+\]$/.test(sourcePath)) {
      const parentPath = sourcePath.replace(/\[\d+\]$/, '');
      const parentArr = getValueAtPath(leftDoc.data, parentPath);
      if (Array.isArray(parentArr)) {
        targetPath = `${parentPath}[${parentArr.length}]`;
      }
    }

    const updatedLeftData = setValueAtPath(leftDoc.data, targetPath, sourceVal);
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
    pushHistory(
      `Merge All ${mergeAllModal.direction === 'leftToRight' ? 'Left ▸ Right' : 'Right ◂ Left'}`
    );
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
    pushHistory('Swap Left and Right panes');
    const tempLeft = leftRaw;
    const tempLeftFmt = leftFormatOverride;
    setLeftRaw(rightRaw);
    setRightRaw(tempLeft);
    setLeftFormatOverride(rightFormatOverride);
    setRightFormatOverride(tempLeftFmt);
  };

  // Format Alignment Actions
  const handleAdoptFormat = (direction: 'leftToRight' | 'rightToLeft') => {
    pushHistory(
      direction === 'leftToRight' ? 'Adopt Left format on Right' : 'Adopt Right format on Left'
    );
    if (direction === 'leftToRight') {
      const adopted = adoptFormat(leftDoc, rightDoc);
      setRightFormatOverride(leftDoc.format);
      setRightRaw(adopted);
    } else {
      const adopted = adoptFormat(rightDoc, leftDoc);
      setLeftFormatOverride(rightDoc.format);
      setLeftRaw(adopted);
    }
  };

  const handlePrettifyOpened = (side: 'left' | 'right') => {
    pushHistory(`Prettify ${side} pane`);
    if (side === 'left') {
      setLeftRaw(prettifyOpened(leftDoc));
    } else {
      setRightRaw(prettifyOpened(rightDoc));
    }
  };

  const handlePrettifyCondensed = (side: 'left' | 'right') => {
    pushHistory(`Minify ${side} pane`);
    if (side === 'left') {
      setLeftFormatOverride('json');
      setLeftRaw(prettifyCondensed(leftDoc));
    } else {
      setRightFormatOverride('json');
      setRightRaw(prettifyCondensed(rightDoc));
    }
  };

  const handleExportPureJson = (side: 'left' | 'right') => {
    pushHistory(`Strip ${side} pane to Pure JSON`);
    if (side === 'left') {
      setLeftFormatOverride('json');
      setLeftRaw(exportPureJson(leftDoc));
    } else {
      setRightFormatOverride('json');
      setRightRaw(exportPureJson(rightDoc));
    }
  };

  // YAML Tab Fixer Action
  const handleConvertYamlTabs = () => {
    pushHistory('Convert YAML tabs to 2 spaces');
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

  const isAnyModalOpen =
    isIgnoredFieldsModalOpen ||
    isRawEditorOpen ||
    isDiffReportModalOpen ||
    isDocsModalOpen ||
    mergeAllModal.isOpen;

  // Keyboard & Clipboard shortcuts (F7/F8, Ctrl+Z/Y, scoped Ctrl+A, clean Ctrl+C, direct Ctrl+V)
  useEffect(() => {
    const isModalOrExternalInput = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      // Allow live row inputs inside DiffPane to participate in pane-level Ctrl+A / Ctrl+C / Ctrl+V / Ctrl+Z
      if (el.getAttribute('data-live-row-input') === 'true') {
        return false;
      }
      return Boolean(
        el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const isExternalInput = isModalOrExternalInput(e.target);

      if (e.key === 'F8') {
        e.preventDefault();
        handleJumpNextDiff();
        return;
      }
      if (e.key === 'F7') {
        e.preventDefault();
        handleJumpPrevDiff();
        return;
      }

      if (isExternalInput || isAnyModalOpen) return;

      const keyLower = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && keyLower === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && keyLower === 'y') {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && keyLower === 'a') {
        // Scoped Select-All: select only the active diff pane's code lines
        const currentSide = focusedSideRef.current;
        const paneEl = currentSide === 'left' ? leftScrollRef.current : rightScrollRef.current;
        if (paneEl) {
          e.preventDefault();
          const activeEl = document.activeElement as HTMLElement | null;
          if (activeEl && activeEl.getAttribute('data-live-row-input') === 'true') {
            activeEl.blur();
            paneEl.focus({ preventScroll: true });
          }
          const sel = window.getSelection();
          if (sel) {
            const range = document.createRange();
            range.selectNodeContents(paneEl);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && keyLower === 'c') {
        // Ensure programmatic Ctrl+C also writes clean formatted selection to clipboard
        const currentSide = focusedSideRef.current;
        const leftSelected = extractCleanPaneSelection(leftScrollRef.current, leftDoc.rawText);
        const rightSelected = extractCleanPaneSelection(rightScrollRef.current, rightDoc.rawText);
        const cleanToCopy =
          (currentSide === 'left' ? leftSelected ?? rightSelected : rightSelected ?? leftSelected) ??
          (currentSide === 'left' ? leftDoc.rawText : rightDoc.rawText);
        navigator.clipboard?.writeText?.(cleanToCopy).catch(() => {});
      } else if ((e.ctrlKey || e.metaKey) && keyLower === 'v') {
        // Allow native `paste` event to fire first; if synthetic keydown in headless browser doesn't trigger `paste`, fallback to navigator.clipboard.readText()
        const triggerTime = Date.now();
        const targetSide = focusedSideRef.current;
        setTimeout(async () => {
          if (lastNativePasteTimeRef.current >= triggerTime) return;
          try {
            if (navigator.clipboard && navigator.clipboard.readText) {
              const clipText = await navigator.clipboard.readText();
              if (clipText && clipText.length > 0 && lastNativePasteTimeRef.current < triggerTime) {
                lastNativePasteTimeRef.current = Date.now();
                handlePasteIntoPane(targetSide, clipText);
              }
            }
          } catch {
            // Ignored if permission not granted; native paste event handles standard browser Ctrl+V
          }
        }, 60);
      }
    };

    const handleGlobalCopy = (e: ClipboardEvent) => {
      if (isModalOrExternalInput(e.target) || isAnyModalOpen) return;
      const currentSide = focusedSideRef.current;
      const leftSelected = extractCleanPaneSelection(leftScrollRef.current, leftDoc.rawText);
      const rightSelected = extractCleanPaneSelection(rightScrollRef.current, rightDoc.rawText);
      const cleanToCopy =
        currentSide === 'left' ? leftSelected ?? rightSelected : rightSelected ?? leftSelected;
      if (cleanToCopy !== null) {
        e.preventDefault();
        e.clipboardData?.setData('text/plain', cleanToCopy);
        navigator.clipboard?.writeText?.(cleanToCopy).catch(() => {});
      }
    };

    const handleGlobalPaste = (e: ClipboardEvent) => {
      if (isModalOrExternalInput(e.target) || isAnyModalOpen) return;
      const pastedText = e.clipboardData?.getData('text/plain');
      if (pastedText && pastedText.length > 0) {
        e.preventDefault();
        lastNativePasteTimeRef.current = Date.now();
        const targetEl = e.target as HTMLElement | null;
        const closestPane = targetEl?.closest?.('[data-pane-side]')?.getAttribute('data-pane-side');
        const targetSide =
          closestPane === 'left' || closestPane === 'right' ? closestPane : focusedSideRef.current;
        handlePasteIntoPane(targetSide, pastedText);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('copy', handleGlobalCopy);
    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('copy', handleGlobalCopy);
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, [
    handleJumpNextDiff,
    handleJumpPrevDiff,
    handleUndo,
    handleRedo,
    handlePasteIntoPane,
    focusedSide,
    isAnyModalOpen,
    leftDoc.rawText,
    rightDoc.rawText,
  ]);

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
        onOpenDiffReportModal={() => setIsDiffReportModalOpen(true)}
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
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        undoLabel={undoStack[undoStack.length - 1]?.label}
        redoLabel={redoStack[redoStack.length - 1]?.label}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      {/* Mobile Portrait View Toggle Bar (hidden in landscape / wider screens >= 640px) */}
      <div className="sm:hidden flex items-center justify-between px-3 py-1 bg-zinc-900 border-b border-zinc-800 text-xs shrink-0 select-none">
        <span className="text-zinc-400 font-medium">View Mode:</span>
        <div className="flex items-center rounded bg-zinc-800 p-0.5 border border-zinc-700">
          <button
            type="button"
            onClick={() => {
              setMobilePaneView('left');
              activatePane('left');
            }}
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
            onClick={() => {
              setMobilePaneView('right');
              activatePane('right');
            }}
            className={`px-2 py-0.5 rounded text-[11px] transition cursor-pointer ${
              mobilePaneView === 'right' ? 'bg-cyan-600 text-white font-medium' : 'text-zinc-400'
            }`}
          >
            Right (Comp)
          </button>
        </div>
      </div>

      {/* Temporary Paste Validation Error Notification Banner */}
      {pasteError && (
        <div
          role="alert"
          aria-live="assertive"
          data-testid="paste-error-notification"
          className="px-3 py-2 bg-rose-950/95 border-b border-rose-500/80 text-rose-100 text-xs flex items-center justify-between gap-3 shrink-0 z-40 shadow-lg"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
            <span className="font-semibold text-rose-200 shrink-0">
              Paste Rejected ({pasteError.side === 'left' ? 'Left' : 'Right'} Pane):
            </span>
            <span className="font-mono text-rose-100 truncate">{pasteError.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setPasteError(null)}
            className="p-1 rounded hover:bg-rose-900/80 text-rose-300 hover:text-white transition cursor-pointer shrink-0"
            aria-label="Dismiss paste error notification"
            title="Dismiss notification"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main 2-Pane Diff Viewer with Central Action Gutter */}
      <main className="flex-1 flex overflow-hidden relative min-h-0">
        {/* Left Pane: Reference / Target */}
        <div className={`flex-1 h-full min-w-0 ${mobilePaneView === 'right' ? 'hidden sm:flex' : 'flex'}`}>
          <DiffPane
            side="left"
            title="Reference / Target"
            doc={leftDoc}
            rows={rows}
            activePath={activeRow?.left?.path || activeRow?.path || activePath}
            onSelectPath={handleSelectPath}
            foldedBlocks={foldedBlocks}
            onToggleBlockFold={handleToggleBlockFold}
            onOpenRawEditor={() => setIsRawEditorOpen(true)}
            onClear={() => {
              pushHistory('Clear Left pane');
              setLeftRaw('{}');
            }}
            onChangeFormat={(fmt) => handleChangePaneFormat('left', fmt)}
            inlineEditMode={inlineEditMode}
            onInlineEditValue={(path, val) => handleInlineEditValue('left', path, val)}
            onLiveEditLine={(path, origKey, newKey, val, pushHist) =>
              handleLiveEditLine('left', path, origKey, newKey, val, pushHist)
            }
            isFocusedPane={focusedSide === 'left'}
            onFocusPane={() => activatePane('left')}
            onPasteText={(text) => handlePasteIntoPane('left', text)}
            pastedFeedback={pastedFeedbackSide === 'left'}
            pasteError={pasteError?.side === 'left' ? pasteError.message : null}
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
            activePath={activeRow?.right?.path || activeRow?.path || activePath}
            onSelectPath={handleSelectPath}
            foldedBlocks={foldedBlocks}
            onToggleBlockFold={handleToggleBlockFold}
            onOpenRawEditor={() => setIsRawEditorOpen(true)}
            onClear={() => {
              pushHistory('Clear Right pane');
              setRightRaw('{}');
            }}
            onChangeFormat={(fmt) => handleChangePaneFormat('right', fmt)}
            inlineEditMode={inlineEditMode}
            onInlineEditValue={(path, val) => handleInlineEditValue('right', path, val)}
            onLiveEditLine={(path, origKey, newKey, val, pushHist) =>
              handleLiveEditLine('right', path, origKey, newKey, val, pushHist)
            }
            isFocusedPane={focusedSide === 'right'}
            onFocusPane={() => activatePane('right')}
            onPasteText={(text) => handlePasteIntoPane('right', text)}
            pastedFeedback={pastedFeedbackSide === 'right'}
            pasteError={pasteError?.side === 'right' ? pasteError.message : null}
            scrollRef={rightScrollRef}
            onScroll={(e) => handleScroll(e, 'right')}
          />
        </div>
      </main>

      {/* Optional Split Bottom Full-Line Comparison Inspector */}
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

      {/* Export Diff Report Modal */}
      <DiffReportModal
        isOpen={isDiffReportModalOpen}
        onClose={() => setIsDiffReportModalOpen(false)}
        leftDoc={leftDoc}
        rightDoc={rightDoc}
        rows={rows}
        stats={stats}
        ignoredFields={ignoredFields}
        ignoreListOrder={ignoreListOrder}
        ignoreQuoteStyle={ignoreQuoteStyle}
      />

      {/* Raw Text Editor Modal */}
      <RawEditorModal
        isOpen={isRawEditorOpen}
        onClose={() => setIsRawEditorOpen(false)}
        leftRaw={leftRaw}
        rightRaw={rightRaw}
        onApply={(newLeft, newRight) => {
          pushHistory('Edit raw document text');
          setLeftFormatOverride(undefined);
          setRightFormatOverride(undefined);
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
