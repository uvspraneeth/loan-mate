import { BadgeCheck, Clock } from 'lucide-react';
import { formatINR } from '@/lib/money';
import StatusBadge from '@/components/StatusBadge';
import { daysOverdue } from '@/lib/loanCalc';

export default function InstallmentScheduleTable({ installments, repaymentType, onMarkPaid }) {
  const isInterestOnly = repaymentType === 'interest_only';
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-medium px-4 py-3">#</th>
              <th className="text-left font-medium px-3 py-3">Due Date</th>
              {!isInterestOnly && <th className="text-right font-medium px-3 py-3">Principal</th>}
              <th className="text-right font-medium px-3 py-3">Interest</th>
              <th className="text-right font-medium px-3 py-3">Total</th>
              <th className="text-right font-medium px-3 py-3">Paid</th>
              <th className="text-left font-medium px-3 py-3">Status</th>
              <th className="text-right font-medium px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {installments.map((inst) => {
              const overdueDays = inst.status === 'overdue' ? daysOverdue(inst.due_date) : 0;
              const unpaid = inst.status !== 'paid' && inst.status !== 'waived';
              return (
                <tr key={inst.id} className="hover:bg-slate-50/40">
                  <td className="px-4 py-3 font-medium text-slate-500">{inst.installment_number}</td>
                  <td className="px-3 py-3 text-slate-600">
                    <div>{new Date(inst.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                    {overdueDays > 0 && <div className="text-[10px] text-red-500">{overdueDays} days overdue</div>}
                  </td>
                  {!isInterestOnly && <td className="px-3 py-3 text-right tnum text-slate-600">{formatINR(inst.principal_due)}</td>}
                  <td className="px-3 py-3 text-right tnum text-slate-600">{formatINR(inst.interest_due)}</td>
                  <td className="px-3 py-3 text-right tnum font-semibold text-slate-900">{formatINR(inst.total_due)}</td>
                  <td className="px-3 py-3 text-right tnum text-emerald-600">{inst.amount_paid ? formatINR(inst.amount_paid) : '—'}</td>
                  <td className="px-3 py-3"><StatusBadge status={inst.status} /></td>
                  <td className="px-4 py-3 text-right">
                    {unpaid ? (
                      <button onClick={() => onMarkPaid?.(inst)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
                        <BadgeCheck className="h-3.5 w-3.5" /> Mark Paid
                      </button>
                    ) : inst.status === 'paid' ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><BadgeCheck className="h-3.5 w-3.5" /> Verified</span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}