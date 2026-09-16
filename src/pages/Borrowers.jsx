import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Plus, Search, Landmark } from 'lucide-react';
import { useLending } from '@/lib/LendingContext';
import { formatINR } from '@/lib/money';
import { deriveLoanBalance, toISODate } from '@/lib/loanCalc';
import StatusBadge from '@/components/StatusBadge';
import BorrowerDrawer from '@/components/BorrowerDrawer';
import AddBorrowerDialog from '@/components/AddBorrowerDialog';
import NewLoanDialog from '@/components/NewLoanDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function Borrowers() {
  const { borrowers, loans, installments, payments, activities, notifications, settings, reload } = useLending();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(params.get('open'));
  const [addOpen, setAddOpen] = useState(params.get('new') === '1');
  const [newLoanFor, setNewLoanFor] = useState(null);

  useEffect(() => {
    if (params.get('new') === '1') { setAddOpen(true); params.delete('new'); setParams(params, { replace: true }); }
    if (params.get('open')) setOpenId(params.get('open'));
  }, [params]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return borrowers
      .filter((b) => !q || b.name?.toLowerCase().includes(q) || b.phone?.includes(q))
      .map((b) => {
        const myLoans = loans.filter((l) => l.borrower_id === b.id && l.status !== 'cancelled');
        const activeCount = myLoans.filter((l) => l.status === 'active' || l.status === 'overdue').length;
        let outstanding = 0;
        for (const l of myLoans) outstanding += deriveLoanBalance(installments.filter((i) => i.loan_id === l.id)).outstanding;
        const myInst = installments.filter((i) => myLoans.some((l) => l.id === i.loan_id) && i.status !== 'paid' && i.status !== 'waived').sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
        const nextInst = myInst[0];
        const status = outstanding > 0 ? (myInst.some((i) => i.status === 'overdue') ? 'overdue' : 'active') : (activeCount ? 'completed' : '—');
        return { b, activeCount, outstanding, nextInst, status };
      })
      .sort((a, b) => b.outstanding - a.outstanding);
  }, [borrowers, loans, installments, query]);

  const openBorrower = openId ? borrowers.find((b) => b.id === openId) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Borrowers</h1>
          <p className="text-sm text-slate-500">{borrowers.length} people you lend to</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="h-4 w-4 mr-1" /> Add Borrower</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or phone" className="pl-9" />
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-medium px-5 py-3">Borrower</th>
              <th className="text-left font-medium px-3 py-3">Phone</th>
              <th className="text-center font-medium px-3 py-3">Active Loans</th>
              <th className="text-right font-medium px-3 py-3">Outstanding</th>
              <th className="text-right font-medium px-3 py-3">Next Due</th>
              <th className="text-left font-medium px-3 py-3">Next Due Date</th>
              <th className="text-left font-medium px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ b, activeCount, outstanding, nextInst, status }) => (
              <tr key={b.id} onClick={() => setOpenId(b.id)} className="cursor-pointer hover:bg-slate-50/50">
                <td className="px-5 py-3 font-medium text-slate-800">{b.name}</td>
                <td className="px-3 py-3 text-slate-500">{b.phone || '—'}</td>
                <td className="px-3 py-3 text-center text-slate-600">{activeCount}</td>
                <td className="px-3 py-3 text-right font-semibold tnum">{formatINR(outstanding)}</td>
                <td className="px-3 py-3 text-right tnum text-slate-600">{nextInst ? formatINR(nextInst.total_due - (nextInst.amount_paid || 0)) : '—'}</td>
                <td className="px-3 py-3 text-slate-600">{nextInst ? new Date(nextInst.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</td>
                <td className="px-3 py-3">{status === 'overdue' ? <StatusBadge status="overdue" /> : status === 'active' ? <StatusBadge status="active" /> : <span className="text-xs text-slate-400">{status}</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400">No borrowers found.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {rows.map(({ b, outstanding, nextInst, status }) => (
          <button key={b.id} onClick={() => setOpenId(b.id)} className="w-full text-left rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between">
              <p className="font-medium text-slate-800">{b.name}</p>
              {status === 'overdue' ? <StatusBadge status="overdue" /> : status === 'active' ? <StatusBadge status="active" /> : null}
            </div>
            <div className="flex justify-between mt-2 text-sm">
              <span className="text-slate-400">Outstanding</span>
              <span className="font-semibold tnum">{formatINR(outstanding)}</span>
            </div>
            {nextInst && (
              <div className="flex justify-between mt-1 text-sm">
                <span className="text-slate-400">Next due</span>
                <span className="tnum">{formatINR(nextInst.total_due - (nextInst.amount_paid || 0))} · {new Date(nextInst.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
              </div>
            )}
          </button>
        ))}
        {rows.length === 0 && <p className="text-center text-slate-400 py-10">No borrowers found.</p>}
      </div>

      <BorrowerDrawer
        open={!!openBorrower}
        onOpenChange={(v) => { if (!v) { setOpenId(null); params.delete('open'); setParams(params, { replace: true }); } }}
        borrower={openBorrower}
        loans={loans}
        installments={installments}
        payments={payments}
        activities={activities}
        notifications={notifications}
        settings={settings}
        onNewLoan={(bid) => setNewLoanFor(bid)}
        onOpenLoan={(lid) => navigate(`/loans/${lid}`)}
        onReload={reload}
      />
      <AddBorrowerDialog open={addOpen} onOpenChange={setAddOpen} onCreated={reload} />
      <NewLoanDialog open={!!newLoanFor} onOpenChange={(v) => !v && setNewLoanFor(null)} borrowers={borrowers} preselectedBorrowerId={newLoanFor} onCreated={reload} />
    </div>
  );
}