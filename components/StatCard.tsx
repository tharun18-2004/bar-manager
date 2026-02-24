interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  type?: 'default' | 'danger' | 'success';
}

export default function StatCard({ label, value, subValue, type = 'default' }: StatCardProps) {
  const borderColors = {
    default: 'border-slate-700 text-slate-100',
    danger: 'border-rose-800/60 text-rose-300',
    success: 'border-emerald-800/60 text-emerald-300'
  };

  return (
    <div className={`bg-slate-900 p-5 rounded-xl border ${borderColors[type]} transition-all hover:-translate-y-0.5`}>
      <p className="text-slate-400 text-xs uppercase tracking-widest font-bold mb-1">{label}</p>
      <p className="text-4xl font-mono font-black">{value}</p>
      {subValue && <p className="text-sm mt-2 opacity-70">{subValue}</p>}
    </div>
  );
}
