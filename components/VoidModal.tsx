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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-red-900/50 w-full max-w-md p-8 rounded-3xl shadow-2xl">
        <h2 className="text-2xl font-bold text-red-500 mb-2">Confirm Void</h2>
        <p className="text-zinc-400 mb-6 text-sm">
          Warning: This action is permanent and will be logged in the Owner&apos;s Corruption Audit trail.
        </p>
        
        <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Reason for Voiding</label>
        <textarea 
          className="w-full bg-black border border-zinc-800 rounded-xl p-4 text-white focus:border-red-600 outline-none h-32 mb-6"
          placeholder="e.g., Customer changed mind, Spilled drink, Entry error..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={loading}
        />

        <div className="flex gap-3">
          <button 
            onClick={onClose} 
            className="flex-1 py-3 text-zinc-400 font-bold hover:text-white transition"
            disabled={loading}
          >
            Cancel
          </button>
          <button 
            onClick={handleConfirm}
            disabled={!reason.trim() || loading}
            className="flex-1 bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-xl font-bold py-3 transition"
          >
            {loading ? 'Voiding...' : 'Confirm & Log'}
          </button>
        </div>
      </div>
    </div>
  );
}
