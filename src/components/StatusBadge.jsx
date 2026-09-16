import { cn } from '@/lib/utils';

const STYLES = {
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  due: 'bg-amber-50 text-amber-700 border-amber-200',
  upcoming: 'bg-sky-50 text-sky-700 border-sky-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  payment_submitted: 'bg-violet-50 text-violet-700 border-violet-200',
  partially_paid: 'bg-amber-50 text-amber-700 border-amber-200',
  waived: 'bg-slate-100 text-slate-500 border-slate-200',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed: 'bg-slate-100 text-slate-600 border-slate-200',
  paused: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
};

const LABELS = {
  paid: 'Paid',
  verified: 'Verified',
  due: 'Due',
  upcoming: 'Upcoming',
  overdue: 'Overdue',
  payment_submitted: 'Submitted',
  partially_paid: 'Partial',
  waived: 'Waived',
  active: 'Active',
  completed: 'Completed',
  paused: 'Paused',
  cancelled: 'Cancelled',
};

export default function StatusBadge({ status, className, withDot = true }) {
  const style = STYLES[status] || 'bg-slate-100 text-slate-600 border-slate-200';
  const label = LABELS[status] || status;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize', style, className)}>
      {withDot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {label}
    </span>
  );
}