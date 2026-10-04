import { BadgeCheck, CalendarDays } from 'lucide-react';
import { formatINR } from '@/lib/money';
import StatusBadge from '@/components/StatusBadge';
import { EmptyState } from '@/components/PageState';
import { daysOverdue } from '@/lib/loanCalc';

const CARD = 'rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)]';

// Date-only strings ('YYYY-MM-DD') are parsed as local dates to avoid a UTC off-by-one.
function formatDue(v) {
  const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isUnpaid(inst) {
  return inst.status !== 'paid' && inst.status !== 'waived';
}

function PaidAmount({ inst, align = 'right' }) {
  const paid = inst.amount_paid || 0;
  const remaining = Math.max(0, (inst.total_due || 0) - paid);
  if (!paid) return <span className="text-slate-400">—</span>;
  const partial = remaining > 0 && inst.status !== 'waived';
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <div className="font-medium text-emerald-600 tnum">{formatINR(paid)}</div>
      {partial && <div className="text-[11px] font-medium text-amber-600 tnum">{formatINR(remaining)} left</div>}
    </div>
  );
}

function OverdueNote({ inst }) {
  const days = inst.status === 'overdue' ? daysOverdue(inst.due_date) : 0;
  if (days <= 0) return null;
  return <div className="text-[11px] font-medium text-red-600">{days} {days === 1 ? 'day' : 'days'} overdue</div>;
}

function MarkPaidButton({ inst, onMarkPaid, className = '' }) {
  const partial = (inst.amount_paid || 0) > 0;
  return (
    <button
      type="button"
      onClick={() => onMarkPaid?.(inst)}
      aria-label={`${partial ? 'Record balance payment' : 'Mark paid'} for installment ${inst.installment_number}`}
      className={`inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${className}`}
    >
      <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> {partial ? 'Pay Balance' : 'Mark Paid'}
    </button>
  );
}

function SettledLabel({ inst }) {
  if (inst.status === 'paid') {
    return <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Verified</span>;
  }
  return <span className="text-xs text-slate-400">—</span>;
}

export default function InstallmentScheduleTable({ installments, repaymentType, onMarkPaid }) {
  const isInterestOnly = repaymentType === 'interest_only';

  if (!installments || installments.length === 0) {
    return (
      <div className={CARD}>
        <EmptyState compact icon={CalendarDays} title="No installments scheduled" description="This loan has no installment schedule yet." />
      </div>
    );
  }

  // The earliest unpaid installment is the one the borrower should pay next.
  const nextId = installments
    .filter(isUnpaid)
    .reduce((best, i) => (!best || i.installment_number < best.installment_number ? i : best), null)?.id;

  return (
    <>
      {/* Mobile: card list */}
      <ol className="space-y-2.5 md:hidden" aria-label="Installment schedule">
        {installments.map((inst) => {
          const unpaid = isUnpaid(inst);
          const isNext = inst.id === nextId;
          return (
            <li
              key={inst.id}
              aria-current={isNext ? 'step' : undefined}
              className={`${CARD} p-4 ${isNext ? 'border-emerald-300 ring-1 ring-emerald-200' : ''} ${inst.status === 'paid' || inst.status === 'waived' ? 'opacity-80' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-400">
                    Installment #{inst.installment_number}
                    {isNext && <span className="ml-1.5 rounded bg-emerald-600 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white">Next</span>}
                  </p>
                  <p className="mt-0.5 font-medium text-slate-800 tnum">{formatDue(inst.due_date)}</p>
                  <OverdueNote inst={inst} />
                </div>
                <StatusBadge status={inst.status} className="shrink-0" />
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                {!isInterestOnly && (
                  <>
                    <dt className="text-slate-400">Principal</dt>
                    <dd className="text-right text-slate-600 tnum">{formatINR(inst.principal_due)}</dd>
                  </>
                )}
                <dt className="text-slate-400">Interest</dt>
                <dd className="text-right text-slate-600 tnum">{formatINR(inst.interest_due)}</dd>
                <dt className="text-slate-500">Total due</dt>
                <dd className="text-right font-semibold text-slate-900 tnum">{formatINR(inst.total_due)}</dd>
                <dt className="text-slate-400">Paid</dt>
                <dd><PaidAmount inst={inst} /></dd>
              </dl>

              {unpaid ? (
                <MarkPaidButton inst={inst} onMarkPaid={onMarkPaid} className="mt-3 h-10 w-full text-sm" />
              ) : inst.status === 'paid' ? (
                <div className="mt-3"><SettledLabel inst={inst} /></div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {/* md+: table */}
      <div className={`hidden overflow-hidden md:block ${CARD}`}>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <caption className="sr-only">Installment schedule</caption>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">#</th>
                <th scope="col" className="px-3 py-3 text-left font-medium">Due Date</th>
                {!isInterestOnly && <th scope="col" className="px-3 py-3 text-right font-medium">Principal</th>}
                <th scope="col" className="px-3 py-3 text-right font-medium">Interest</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Total</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Paid</th>
                <th scope="col" className="px-3 py-3 text-left font-medium">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {installments.map((inst) => {
                const unpaid = isUnpaid(inst);
                const isNext = inst.id === nextId;
                return (
                  <tr
                    key={inst.id}
                    aria-current={isNext ? 'step' : undefined}
                    className={isNext ? 'bg-emerald-50/60 shadow-[inset_3px_0_0_0_#059669]' : 'hover:bg-slate-50/60'}
                  >
                    <td className="px-4 py-3 font-medium text-slate-500 tnum">{inst.installment_number}</td>
                    <td className="px-3 py-3 text-slate-600">
                      <div className="flex items-center gap-1.5 tnum">
                        {formatDue(inst.due_date)}
                        {isNext && <span className="rounded bg-emerald-600 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white">Next</span>}
                      </div>
                      <OverdueNote inst={inst} />
                    </td>
                    {!isInterestOnly && <td className="px-3 py-3 text-right text-slate-600 tnum">{formatINR(inst.principal_due)}</td>}
                    <td className="px-3 py-3 text-right text-slate-600 tnum">{formatINR(inst.interest_due)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900 tnum">{formatINR(inst.total_due)}</td>
                    <td className="px-3 py-3"><PaidAmount inst={inst} /></td>
                    <td className="px-3 py-3"><StatusBadge status={inst.status} /></td>
                    <td className="px-4 py-3 text-right">
                      {unpaid ? <MarkPaidButton inst={inst} onMarkPaid={onMarkPaid} className="h-8 whitespace-nowrap" /> : <SettledLabel inst={inst} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
