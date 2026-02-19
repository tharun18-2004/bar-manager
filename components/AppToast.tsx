'use client';

type ToastType = 'success' | 'error' | 'info';

type AppToastProps = {
  message: string;
  type?: ToastType;
  onClose: () => void;
};

const STYLE_BY_TYPE: Record<ToastType, string> = {
  success: 'border-green-700 bg-green-950 text-green-200',
  error: 'border-red-700 bg-red-950 text-red-200',
  info: 'border-blue-700 bg-blue-950 text-blue-200',
};

export default function AppToast({ message, type = 'info', onClose }: AppToastProps) {
  return (
    <div className={`fixed top-4 right-4 z-50 border rounded-lg px-4 py-3 shadow-xl ${STYLE_BY_TYPE[type]}`}>
      <div className="flex items-start gap-3">
        <p className="text-sm font-medium">{message}</p>
        <button onClick={onClose} className="text-xs font-bold opacity-80 hover:opacity-100 transition">
          Close
        </button>
      </div>
    </div>
  );
}
