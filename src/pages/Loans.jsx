import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Landmark } from 'lucide-react';
import { useLending } from '@/lib/LendingContext';
import { formatINR } from '@/lib/money';
import { deriveLoanBalance, repaymentTypeLabel } from '@/lib/loanCalc';
import StatusBadge from '@/components/StatusBadge';
import NewLoanDialog from '@/components/NewLoanDialog';
import { Button } from '@/components/ui/button';

export default function Loans() {
  const { borrowers, loans, installments } = useLending();
  const navigate = useNavigate();
  const [newOpen, setNewOpen] = useState(false);
  const [filter, setFilter] = useState('all');

  const borrowerMap = useMemo(() => Object.fromEntries(borrowers.map((b) => [b.id, b])), [borrowers]);

  const rows = useMemo(() => {
    return loans
      .filter((l) => filter === 'all' || l.status === filter)
      .map((l) => {
        const bal = deriveLoanBalance(installments.filter((i) => i.loan_id === l.id));
        return { l, borrower: borrowerMap[l.borrower_id], bal };
      })
      .sort((a, b) => b.bal.outstanding - a.bal.outstanding);
  }, [loans, installments, borrowerMap, filter]);

  const filters = ['all', 'active', 'overdue', 'completed', 'paused', 'cancelled'];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Loans</h1>
          <p className="text-sm text-slate-500">{loans.length} total loans</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="h-4 w-4 mr-1" /> New Loan</Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {filters.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-xs font-medium border ${filter === f ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ l, borrower, bal }) => (
          <button key={l.id} onClick={() => navigate(`/loans/${l.id}`)} className="text-left rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:border-emerald-300 hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><Landmark className="h-4 w-4" /></div>
                <div>
                  <p className="font-medium text-slate-800">{l.loan_number}</p>
                  <p className="text-xs text-slate-400">{borrower?.name || '—'}</p>
                </div>
              </div>
              <StatusBadge status={l.status} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-y-1.5 text-sm">
              <span className="text-slate-400">Principal</span><span className="text-right tnum font-medium">{formatINR(l.principal_amount)}</span>
              <span className="text-slate-400">Outstanding</span><span className="text-right tnum font-semibold text-slate-900">{formatINR(bal.outstanding)}</span>
              <span className="text-slate-400">Monthly</span><span className="text-right tnum">{formatINR(l.monthly_due_amount)}</span>
              <span className="text-slate-400">Repayment</span><span className="text-right text-xs">{repaymentTypeLabel(l)}</span>
            </div>
          </button>
        ))}
        {rows.length === 0 && <p className="col-span-full text-center text-slate-400 py-10">No loans found.</p>}
      </div>

      <NewLoanDialog open={newOpen} onOpenChange={setNewOpen} borrowers={borrowers} onCreated={() => {}} />
    </div>
  );
}