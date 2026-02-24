import { useState } from 'react';

interface VoidModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading?: boolean;
}

export default function VoidModal({ isOpen, onClose, onConfirm, loading = false }: VoidModalProps) {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    if (reason.trim()) {
      onConfirm(reason);
      setReason('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-rose-900/50 w-full max-w-md p-8 rounded-2xl shadow-2xl">
        <h2 className="text-2xl font-bold text-rose-400 mb-2">Confirm Void</h2>
        <p className="text-slate-300 mb-6 text-sm">
          Warning: this action is permanent and will be logged in the owner audit trail.
        </p>
        
        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Reason for Voiding</label>
        <textarea 
          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-white focus:border-rose-500 outline-none h-32 mb-6"
          placeholder="e.g., Customer changed mind, Spilled drink, Entry error..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={loading}
        />

        <div className="flex gap-3">
          <button 
            onClick={onClose} 
            className="flex-1 py-3 text-slate-300 font-bold hover:text-white transition"
            disabled={loading}
          >
            Cancel
          </button>
          <button 
            onClick={handleConfirm}
            disabled={!reason.trim() || loading}
            className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-500 rounded-xl font-bold py-3 transition"
          >
            {loading ? 'Voiding...' : 'Confirm & Log'}
          </button>
        </div>
      </div>
    </div>
  );
}
