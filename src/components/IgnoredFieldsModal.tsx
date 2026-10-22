/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Plus, Trash2, Check, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react';

interface IgnoredFieldsModalProps {
  isOpen: boolean;
  onClose: () => void;
  ignoredFields: string[];
  onSave: (fields: string[]) => void;
}

const COMMON_K8S_FIELDS = [
  'managedFields',
  'resourceVersion',
  'creationTimestamp',
  'uid',
  'generation',
  'status',
  'selfLink',
  'description',
  'annotations',
];

export const IgnoredFieldsModal: React.FC<IgnoredFieldsModalProps> = ({
  isOpen,
  onClose,
  ignoredFields,
  onSave,
}) => {
  const [fields, setFields] = useState<string[]>(ignoredFields);
  const [newField, setNewField] = useState('');

  if (!isOpen) return null;

  const handleAddField = (fieldToAdd: string) => {
    const trimmed = fieldToAdd.trim();
    if (!trimmed || fields.includes(trimmed)) return;
    setFields([...fields, trimmed]);
    setNewField('');
  };

  const handleRemoveField = (fieldToRemove: string) => {
    setFields(fields.filter((f) => f !== fieldToRemove));
  };

  const handleSave = () => {
    onSave(fields);
    onClose();
  };

  const handleResetK8sDefaults = () => {
    setFields(['managedFields', 'resourceVersion', 'creationTimestamp', 'uid', 'generation']);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-w-lg w-full flex flex-col overflow-hidden text-zinc-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-base text-zinc-100 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              <span>K8s CRD & Ignored Fields Filter</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Differences in these fields are rendered in muted subtle colors instead of breaking red.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          {/* Quick presets */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-2">
              Quick K8s Presets
            </span>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_K8S_FIELDS.map((preset) => {
                const isActive = fields.includes(preset);
                return (
                  <button
                    key={preset}
                    onClick={() => (isActive ? handleRemoveField(preset) : handleAddField(preset))}
                    className={`px-2.5 py-1 rounded-full text-xs font-mono transition flex items-center gap-1 cursor-pointer ${
                      isActive
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60'
                    }`}
                  >
                    <span>{preset}</span>
                    {isActive ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Add custom field */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newField}
              onChange={(e) => setNewField(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddField(newField);
                }
              }}
              placeholder="e.g. metadata.annotations or customField"
              className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 focus:outline-hidden focus:border-cyan-500 font-mono"
            />
            <button
              onClick={() => handleAddField(newField)}
              disabled={!newField.trim()}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-medium flex items-center gap-1 transition cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add</span>
            </button>
          </div>

          {/* Active fields list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Active Filtered Fields ({fields.length})
              </span>
              <button
                onClick={handleResetK8sDefaults}
                className="text-xs text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Reset to Standard K8s</span>
              </button>
            </div>

            {fields.length === 0 ? (
              <div className="p-4 rounded-lg bg-zinc-950/50 border border-zinc-800 text-center text-xs text-zinc-500">
                No fields filtered. All differences will be treated as standard changes.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                {fields.map((f) => (
                  <div
                    key={f}
                    className="flex items-center justify-between px-3 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-xs font-mono"
                  >
                    <span className="text-cyan-300">{f}</span>
                    <button
                      onClick={() => handleRemoveField(f)}
                      className="text-zinc-500 hover:text-rose-400 transition cursor-pointer"
                      title="Remove field"
                      aria-label="Remove field"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-950/70 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs shadow-sm transition cursor-pointer"
          >
            Save & Apply Filter
          </button>
        </div>
      </div>
    </div>
  );
};
