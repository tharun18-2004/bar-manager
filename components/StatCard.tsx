interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  type?: 'default' | 'danger' | 'success';
}

export default function StatCard({ label, value, subValue, type = 'default' }: StatCardProps) {
  const borderColors = {
    default: 'border-zinc-800',
    danger: 'border-red-900/50 text-red-500',
    success: 'border-green-900/50 text-green-500'
  };

  return (
    <div className={`bg-zinc-900 p-6 rounded-2xl border ${borderColors[type]} transition-all hover:scale-[1.02]`}>
      <p className="text-zinc-500 text-xs uppercase tracking-widest font-bold mb-1">{label}</p>
      <p className="text-4xl font-mono font-black">{value}</p>
      {subValue && <p className="text-sm mt-2 opacity-70">{subValue}</p>}
    </div>
  );
}