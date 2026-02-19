'use client';

import { useState } from 'react';
import { authFetch } from '@/lib/auth-fetch';
import AppToast from '@/components/AppToast';
import { formatError } from '@/lib/errors';

interface PaymentModalProps {
  isOpen: boolean;
  amount: number;
  orderId: string;
  staffName: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function PaymentModal({
  isOpen,
  amount,
  orderId,
  staffName,
  items,
  onSuccess,
  onCancel,
}: PaymentModalProps) {
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  if (!isOpen) return null;

  const handleFreePayment = async () => {
    setLoading(true);
    try {
      await authFetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, orderId, staffName, items }),
      });

      setToast({ type: 'success', message: 'Transaction completed.' });
      onSuccess();
    } catch (err) {
      console.error('Error logging transaction:', err);
      setToast({ type: 'error', message: `Could not log payment: ${formatError(err)}` });
      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      {toast && <AppToast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md p-8 rounded-3xl shadow-2xl">
        <h2 className="text-2xl font-bold text-blue-500 mb-2">Complete Transaction</h2>
        <p className="text-zinc-400 mb-4">
          Total: <span className="text-green-400 text-xl font-bold">${amount.toFixed(2)}</span>
        </p>
        <p className="text-green-500 text-sm mb-6 font-semibold">FREE TRANSACTION</p>

        <div className="space-y-3">
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-3 bg-zinc-700 hover:bg-zinc-600 text-white font-bold rounded-lg transition"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleFreePayment}
            disabled={loading}
            className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-zinc-700 text-white font-bold rounded-lg transition"
          >
            {loading ? 'Processing...' : 'Complete Free Transaction'}
          </button>
        </div>
      </div>
    </div>
  );
}
