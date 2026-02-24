'use client';

type ToastType = 'success' | 'error' | 'info';

type AppToastProps = {
  message: string;
  type?: ToastType;
  onClose: () => void;
};

const STYLE_BY_TYPE: Record<ToastType, string> = {
  success: 'border-emerald-700 bg-emerald-950 text-emerald-100',
  error: 'border-rose-700 bg-rose-950 text-rose-100',
  info: 'border-amber-700 bg-amber-950 text-amber-100',
};

export default function AppToast({ message, type = 'info', onClose }: AppToastProps) {
  return (
    <div className={`fixed top-4 right-4 z-50 border rounded-lg px-4 py-3 shadow-xl max-w-sm ${STYLE_BY_TYPE[type]}`}>
      <div className="flex items-start gap-3">
        <p className="text-sm font-medium">{message}</p>
        <button onClick={onClose} className="text-xs font-bold opacity-80 hover:opacity-100 transition">
          Close
        </button>
      </div>
    </div>
  );
}
