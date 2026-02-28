interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  type?: 'default' | 'danger' | 'success';
}

export default function StatCard({ label, value, subValue, type = 'default' }: StatCardProps) {
  const toneClass = {
    default: 'text-slate-900 border-slate-200',
    danger: 'text-rose-700 border-rose-200 bg-rose-50/40',
    success: 'text-emerald-700 border-emerald-200 bg-emerald-50/40',
  };
  const hasLetters = typeof value === 'string' && /[A-Za-z]/.test(value);
  const valueClassName = hasLetters
    ? 'text-lg lg:text-xl font-bold leading-snug break-words'
    : 'text-3xl font-black';

  return (
    <div className={`bg-white p-5 rounded-2xl border shadow-sm ${toneClass[type]}`}>
      <p className="text-slate-500 text-xs uppercase tracking-widest font-bold mb-2">{label}</p>
      <p className={valueClassName}>{value}</p>
      {subValue && <p className="text-sm mt-2 text-slate-500">{subValue}</p>}
    </div>
  );
}
