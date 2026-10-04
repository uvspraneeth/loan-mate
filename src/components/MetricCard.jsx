import { cn } from '@/lib/utils';

const TONES = {
  neutral: { text: 'text-slate-900', chip: 'bg-slate-100 text-slate-600' },
  emerald: { text: 'text-emerald-600', chip: 'bg-emerald-50 text-emerald-600' },
  amber: { text: 'text-amber-600', chip: 'bg-amber-50 text-amber-600' },
  red: { text: 'text-red-600', chip: 'bg-red-50 text-red-600' },
  sky: { text: 'text-sky-600', chip: 'bg-sky-50 text-sky-600' },
};

export default function MetricCard({ label, value, sub, tone = 'neutral', icon: Icon, className }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-md', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs sm:text-sm font-medium text-slate-500">{label}</p>
        {Icon && (
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', t.chip)}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>
      <p className={cn('mt-2 font-display font-bold tracking-tight tnum truncate', t.text)} style={{ fontSize: 'clamp(1.25rem, 2vw, 2rem)' }}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
