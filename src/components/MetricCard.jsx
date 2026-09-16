import { cn } from '@/lib/utils';

export default function MetricCard({ label, value, sub, tone = 'neutral', icon: Icon, className }) {
  const tones = {
    neutral: 'text-slate-900',
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
    sky: 'text-sky-600',
  };
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]', className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {Icon && <Icon className={cn('h-4 w-4', tones[tone])} />}
      </div>
      <p className={cn('mt-2 font-display text-2xl font-bold tracking-tight tnum', tones[tone])} style={{ fontSize: 'clamp(1.5rem, 2vw, 2rem)' }}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}