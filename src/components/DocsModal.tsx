/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { BookOpen, X, FileText, Copy, Check, FolderGit2 } from 'lucide-react';

import readmeMd from '../../docs/README.md?raw';
import rebuildPlaybookMd from '../../docs/REBUILD_PLAYBOOK.md?raw';
import iterationLogMd from '../../docs/ITERATION_LOG.md?raw';
import adr001Md from '../../docs/adr/ADR-001-ast-normalization-cross-format-diff.md?raw';
import adr002Md from '../../docs/adr/ADR-002-option-a-semantic-key-alignment.md?raw';
import adr003Md from '../../docs/adr/ADR-003-aggressive-jsonc-repair-breakpoint-tracking.md?raw';
import adr004Md from '../../docs/adr/ADR-004-k8s-crd-ignored-fields-selective-merge.md?raw';
import adr005Md from '../../docs/adr/ADR-005-inplace-patching-bracket-jsonpath.md?raw';
import adr006Md from '../../docs/adr/ADR-006-three-way-scroll-sync-mobile-landscape.md?raw';
import adr007Md from '../../docs/adr/ADR-007-undo-redo-diff-report-and-format-realignment.md?raw';
import adr008Md from '../../docs/adr/ADR-008-daily-clipboard-and-unordered-array-alignment.md?raw';
import adr009Md from '../../docs/adr/ADR-009-always-editable-live-editor-and-paste-validation.md?raw';
import adr010Md from '../../docs/adr/ADR-010-toml-comment-preservation-and-docker-deployment.md?raw';

interface DocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DocEntry {
  id: string;
  title: string;
  path: string;
  category: 'Overview & Playbook' | 'Architecture Decision Records (ADRs)';
  content: string;
}

const DOC_ENTRIES: DocEntry[] = [
  {
    id: 'readme',
    title: 'Documentation Index',
    path: '/docs/README.md',
    category: 'Overview & Playbook',
    content: readmeMd,
  },
  {
    id: 'playbook',
    title: 'Complete Rebuild Playbook',
    path: '/docs/REBUILD_PLAYBOOK.md',
    category: 'Overview & Playbook',
    content: rebuildPlaybookMd,
  },
  {
    id: 'iterations',
    title: 'Iteration Log & Lessons Learned',
    path: '/docs/ITERATION_LOG.md',
    category: 'Overview & Playbook',
    content: iterationLogMd,
  },
  {
    id: 'adr-001',
    title: 'ADR-001: Cross-Format AST Diffing',
    path: '/docs/adr/ADR-001-ast-normalization-cross-format-diff.md',
    category: 'Architecture Decision Records (ADRs)',
    content: adr001Md,
  },
  {
    id: 'adr-002',
    title: 'ADR-002: Option A Key Alignment & Folding',
    path: '/docs/adr/ADR-002-option-a-semantic-key-alignment.md',
    category: 'Architecture Decision Records (ADRs)',
    content: adr002Md,
  },
  {
    id: 'adr-003',
    title: 'ADR-003: Aggressive JSONC Auto-Repair',
    path: '/docs/adr/ADR-003-aggressive-jsonc-repair-breakpoint-tracking.md',
    category: 'Architecture Decision Records (ADRs)',
    content: adr003Md,
  },
  {
    id: 'adr-004',
    title: 'ADR-004: K8s CRD Ignored Fields & Merge',
    path: '/docs/adr/ADR-004-k8s-crd-ignored-fields-selective-merge.md',
    category: 'Architecture Decision Records (ADRs)',
    content: adr004Md,
  },
  {
    id: 'adr-005',
    title: 'ADR-005: In-Place Patching & Inline Edit',
    path: '/docs/adr/ADR-005-inplace-patching-bracket-jsonpath.md',
    category: 'Architecture Decision Records (ADRs)',
    content: adr005Md,
  },
  {
    id: 'adr-006',
    title: 'ADR-006: 3-Way Scroll Sync & Mobile',
    path: '/docs/adr/ADR-006-three-way-scroll-sync-mobile-landscape.md',
    category: 'Architecture Decision Records (ADRs)',
    content: adr006Md,
  },
  {
    id: 'adr-007',
    title: 'ADR-007: Undo/Redo, Reports & Realignment',
    path: '/docs/adr/ADR-007-undo-redo-diff-report-and-format-realignment.md',
    category: 'Architecture Decision Records (ADRs)',
    content: adr007Md,
  },
  {
    id: 'adr-008',
    title: 'ADR-008: Clipboard UX & Unordered Arrays',
    path: '/docs/adr/ADR-008-daily-clipboard-and-unordered-array-alignment.md',
    category: 'Architecture Decision Records (ADRs)',
    content: adr008Md,
  },
  {
    id: 'adr-009',
    title: 'ADR-009: Live Editor & Paste Validation',
    path: '/docs/adr/ADR-009-always-editable-live-editor-and-paste-validation.md',
    category: 'Architecture Decision Records (ADRs)',
    content: adr009Md,
  },
  {
    id: 'adr-010',
    title: 'ADR-010: TOML Comments & Docker Deploy',
    path: '/docs/adr/ADR-010-toml-comment-preservation-and-docker-deployment.md',
    category: 'Architecture Decision Records (ADRs)',
    content: adr010Md,
  },
];

export const DocsModal: React.FC<DocsModalProps> = ({ isOpen, onClose }) => {
  const [selectedId, setSelectedId] = useState<string>('iterations');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const currentDoc = DOC_ENTRIES.find((d) => d.id === selectedId) || DOC_ENTRIES[0];

  const handleCopyDoc = () => {
    navigator.clipboard.writeText(currentDoc.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-5xl h-[85vh] rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl flex flex-col overflow-hidden text-zinc-100">
        {/* Modal Header */}
        <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-cyan-950 border border-cyan-800 text-cyan-300">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>Architecture Decision Records (ADRs) & Rebuild Docs</span>
                <span className="px-2 py-0.5 rounded bg-zinc-800 text-cyan-300 font-mono text-[10px] border border-zinc-700">
                  /docs/*
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                Complete specifications, algorithms, and iteration lessons stored in project /docs and /docs/adr folders
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
            aria-label="Close documentation modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body: Sidebar + Markdown Content */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Sidebar Navigation */}
          <aside className="w-64 shrink-0 border-r border-zinc-800 bg-zinc-950/40 overflow-y-auto p-3 space-y-4">
            {(['Overview & Playbook', 'Architecture Decision Records (ADRs)'] as const).map((cat) => (
              <div key={cat}>
                <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                  <FolderGit2 className="h-3 w-3 text-cyan-500" />
                  <span>{cat}</span>
                </div>
                <div className="space-y-1">
                  {DOC_ENTRIES.filter((d) => d.category === cat).map((doc) => {
                    const active = doc.id === currentDoc.id;
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => setSelectedId(doc.id)}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex flex-col gap-0.5 transition cursor-pointer ${
                          active
                            ? 'bg-cyan-950/80 text-cyan-200 border border-cyan-800/80 font-medium'
                            : 'text-zinc-300 hover:bg-zinc-800/60 border border-transparent'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                          <span className="truncate">{doc.title}</span>
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500 truncate pl-5">{doc.path}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </aside>

          {/* Main Document Viewer */}
          <div className="flex-1 flex flex-col min-w-0 bg-zinc-950/80">
            <div className="px-4 py-2 border-b border-zinc-800/80 bg-zinc-900/50 flex items-center justify-between text-xs shrink-0">
              <code className="text-cyan-300 font-mono text-[11px]">{currentDoc.path}</code>
              <button
                type="button"
                onClick={handleCopyDoc}
                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center gap-1.5 text-xs cursor-pointer transition"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Copied Markdown' : 'Copy Markdown'}</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <pre className="font-mono text-xs leading-relaxed text-zinc-200 whitespace-pre-wrap break-words select-text">
                {currentDoc.content}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
