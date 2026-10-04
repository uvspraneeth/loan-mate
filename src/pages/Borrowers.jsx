import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Plus, Search, SearchX, Users } from 'lucide-react';
import { useLending } from '@/lib/LendingContext';
import { formatINR } from '@/lib/money';
import { deriveLoanBalance } from '@/lib/loanCalc';
import StatusBadge from '@/components/StatusBadge';
import BorrowerDrawer from '@/components/BorrowerDrawer';
import AddBorrowerDialog from '@/components/AddBorrowerDialog';
import NewLoanDialog from '@/components/NewLoanDialog';
import { PageHeader, EmptyState } from '@/components/PageState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

const CARD = 'rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)]';

// Date-only strings ('YYYY-MM-DD') are parsed as local dates to avoid a UTC off-by-one.
function toDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
}

function shortDate(v) {
  return toDate(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function Avatar({ name }) {
  return (
    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
      {initials(name)}
    </span>
  );
}

function BorrowerStatus({ status }) {
  if (status === 'overdue' || status === 'active' || status === 'completed') return <StatusBadge status={status} />;
  return <span className="text-xs text-slate-400">—</span>;
}

export default function Borrowers() {
  const { borrowers, loans, installments, payments, activities, notifications, settings, loading, reload } = useLending();
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

  const allRows = useMemo(() => {
    return borrowers
      .map((b) => {
        const myLoans = loans.filter((l) => l.borrower_id === b.id && l.status !== 'cancelled');
        const activeCount = myLoans.filter((l) => l.status === 'active' || l.status === 'overdue').length;
        let outstanding = 0;
        for (const l of myLoans) outstanding += deriveLoanBalance(installments.filter((i) => i.loan_id === l.id)).outstanding;
        const myInst = installments.filter((i) => myLoans.some((l) => l.id === i.loan_id) && i.status !== 'paid' && i.status !== 'waived').sort((a, b) => toDate(a.due_date) - toDate(b.due_date));
        const nextInst = myInst[0];
        const status = outstanding > 0 ? (myInst.some((i) => i.status === 'overdue') ? 'overdue' : 'active') : (activeCount ? 'completed' : '—');
        return { b, activeCount, outstanding, nextInst, status };
      })
      .sort((a, b) => b.outstanding - a.outstanding);
  }, [borrowers, loans, installments]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allRows;
    const qDigits = q.replace(/\D/g, '');
    return allRows.filter(({ b }) =>
      b.name?.toLowerCase().includes(q) ||
      b.phone?.includes(q) ||
      (qDigits.length > 0 && String(b.phone || '').replace(/\D/g, '').includes(qDigits))
    );
  }, [allRows, query]);

  const totalOutstanding = useMemo(() => allRows.reduce((s, r) => s + r.outstanding, 0), [allRows]);
  const overdueCount = useMemo(() => allRows.filter((r) => r.status === 'overdue').length, [allRows]);

  const openBorrower = openId ? borrowers.find((b) => b.id === openId) : null;
  const showSkeleton = loading && borrowers.length === 0;
  const isEmpty = !loading && borrowers.length === 0;

  const description = showSkeleton
    ? 'Loading borrowers…'
    : isEmpty
      ? 'People you lend to — family and friends'
      : `${borrowers.length} ${borrowers.length === 1 ? 'borrower' : 'borrowers'} · ${formatINR(totalOutstanding)} outstanding${overdueCount ? ` · ${overdueCount} overdue` : ''}`;

  const onRowKeyDown = (id) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpenId(id);
    }
  };

  const addButton = (
    <Button onClick={() => setAddOpen(true)} className="h-10 bg-emerald-600 hover:bg-emerald-700 sm:h-9">
      <Plus className="h-4 w-4" /> Add Borrower
    </Button>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Borrowers" description={<span className="tnum">{description}</span>} actions={addButton} />

      {showSkeleton ? (
        <div className={`${CARD} divide-y divide-slate-100`} aria-busy="true" aria-label="Loading borrowers">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-4 sm:px-5">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      ) : isEmpty ? (
        <div className={CARD}>
          <EmptyState
            icon={Users}
            title="No borrowers yet"
            description="Add the family and friends you lend to. You can then create loans, track installments and send WhatsApp reminders."
            action={
              <Button onClick={() => setAddOpen(true)} className="h-10 bg-emerald-600 hover:bg-emerald-700">
                <Plus className="h-4 w-4" /> Add your first borrower
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or phone"
              aria-label="Search borrowers by name or phone"
              className="h-10 pl-9"
            />
          </div>

          {rows.length === 0 ? (
            <div className={CARD}>
              <EmptyState
                compact
                icon={SearchX}
                title="No matching borrowers"
                description={`Nobody matches “${query.trim()}”. Try a different name or phone number.`}
                action={<Button variant="outline" onClick={() => setQuery('')} className="h-10">Clear search</Button>}
              />
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className={`hidden overflow-hidden md:block ${CARD}`}>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-5 py-3 text-left font-medium">Borrower</th>
                      <th scope="col" className="px-3 py-3 text-left font-medium">Phone</th>
                      <th scope="col" className="px-3 py-3 text-center font-medium">Active Loans</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">Outstanding</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">Next Due</th>
                      <th scope="col" className="px-3 py-3 text-left font-medium">Next Due Date</th>
                      <th scope="col" className="px-3 py-3 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map(({ b, activeCount, outstanding, nextInst, status }) => (
                      <tr
                        key={b.id}
                        tabIndex={0}
                        title={`Open ${b.name}`}
                        onClick={() => setOpenId(b.id)}
                        onKeyDown={onRowKeyDown(b.id)}
                        className="cursor-pointer transition-colors hover:bg-slate-50 focus-visible:bg-emerald-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={b.name} />
                            <span className="font-medium text-slate-800">{b.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-500 tnum">{b.phone || '—'}</td>
                        <td className="px-3 py-3 text-center text-slate-600 tnum">{activeCount}</td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-900 tnum">{formatINR(outstanding)}</td>
                        <td className="px-3 py-3 text-right text-slate-600 tnum">{nextInst ? formatINR(nextInst.total_due - (nextInst.amount_paid || 0)) : '—'}</td>
                        <td className={`px-3 py-3 tnum ${nextInst?.status === 'overdue' ? 'font-medium text-red-600' : 'text-slate-600'}`}>{nextInst ? shortDate(nextInst.due_date) : '—'}</td>
                        <td className="px-3 py-3"><BorrowerStatus status={status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <ul className="space-y-3 md:hidden">
                {rows.map(({ b, outstanding, nextInst, status }) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(b.id)}
                      className={`w-full p-4 text-left transition-colors hover:border-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${CARD}`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar name={b.name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-800">{b.name}</p>
                          {b.phone && <p className="truncate text-xs text-slate-400 tnum">{b.phone}</p>}
                        </div>
                        {status !== '—' && <BorrowerStatus status={status} />}
                      </div>
                      <div className="mt-3 flex justify-between gap-3 text-sm">
                        <span className="text-slate-400">Outstanding</span>
                        <span className="font-semibold text-slate-900 tnum">{formatINR(outstanding)}</span>
                      </div>
                      {nextInst && (
                        <div className="mt-1 flex justify-between gap-3 text-sm">
                          <span className="text-slate-400">Next due</span>
                          <span className={`text-right tnum ${nextInst.status === 'overdue' ? 'text-red-600' : 'text-slate-700'}`}>
                            {formatINR(nextInst.total_due - (nextInst.amount_paid || 0))} · {shortDate(nextInst.due_date)}
                          </span>
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

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
