'use client';

import { useEffect, useState } from 'react';

interface TextPromptModalProps {
  isOpen: boolean;
  title: string;
  label: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export default function TextPromptModal({
  isOpen,
  title,
  label,
  placeholder,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  loading = false,
  onConfirm,
  onCancel,
}: TextPromptModalProps) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (isOpen) setValue('');
  }, [isOpen]);

  if (!isOpen) return null;

  const trimmed = value.trim();

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md p-6 rounded-2xl shadow-2xl">
        <h3 className="text-xl font-bold text-white mb-4">{title}</h3>
        <label className="block text-xs uppercase tracking-wide font-semibold text-slate-400 mb-2">{label}</label>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          disabled={loading}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
        />
        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 font-semibold transition"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => onConfirm(trimmed)}
            disabled={!trimmed || loading}
            className="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 font-semibold transition"
          >
            {loading ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
