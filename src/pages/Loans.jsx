import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Landmark, Search, SearchX, UserPlus } from 'lucide-react';
import { useLending } from '@/lib/LendingContext';
import { formatINR } from '@/lib/money';
import { deriveLoanBalance, repaymentTypeLabel } from '@/lib/loanCalc';
import StatusBadge from '@/components/StatusBadge';
import NewLoanDialog from '@/components/NewLoanDialog';
import { PageHeader, EmptyState, CardSkeleton } from '@/components/PageState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const CARD = 'rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)]';
const FILTERS = ['all', 'active', 'overdue', 'completed', 'paused', 'cancelled'];

function filterLabel(f) {
  return f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1);
}

export default function Loans() {
  const { borrowers, loans, installments, loading, reload } = useLending();
  const navigate = useNavigate();
  const [newOpen, setNewOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  const borrowerMap = useMemo(() => Object.fromEntries(borrowers.map((b) => [b.id, b])), [borrowers]);

  const installmentsByLoan = useMemo(() => {
    const map = {};
    for (const i of installments) (map[i.loan_id] ||= []).push(i);
    return map;
  }, [installments]);

  // loan.status is never 'overdue' in the DB, so derive an effective status:
  // an active loan with any overdue installment is treated as overdue.
  const allRows = useMemo(() => {
    return loans
      .map((l) => {
        const insts = installmentsByLoan[l.id] || [];
        const bal = deriveLoanBalance(insts);
        const effectiveStatus = l.status === 'active' && insts.some((i) => i.status === 'overdue') ? 'overdue' : l.status;
        const pct = bal.totalDue > 0 ? Math.min(100, Math.round((bal.totalPaid / bal.totalDue) * 100)) : 0;
        return { l, borrower: borrowerMap[l.borrower_id], bal, effectiveStatus, pct };
      })
      .sort((a, b) => b.bal.outstanding - a.bal.outstanding);
  }, [loans, installmentsByLoan, borrowerMap]);

  const counts = useMemo(() => {
    const c = { all: allRows.length };
    for (const r of allRows) c[r.effectiveStatus] = (c[r.effectiveStatus] || 0) + 1;
    return c;
  }, [allRows]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter(({ l, borrower, effectiveStatus }) =>
      (filter === 'all' || effectiveStatus === filter) &&
      (!q || String(l.loan_number || '').toLowerCase().includes(q) || String(borrower?.name || '').toLowerCase().includes(q))
    );
  }, [allRows, filter, query]);

  const totalOutstanding = useMemo(
    () => allRows.reduce((s, r) => (r.l.status === 'cancelled' ? s : s + r.bal.outstanding), 0),
    [allRows]
  );

  const showSkeleton = loading && loans.length === 0;
  const isEmpty = !loading && loans.length === 0;

  const description = showSkeleton
    ? 'Loading loans…'
    : isEmpty
      ? 'Track every loan, its schedule and repayments'
      : `${loans.length} ${loans.length === 1 ? 'loan' : 'loans'} · ${formatINR(totalOutstanding)} outstanding${counts.overdue ? ` · ${counts.overdue} overdue` : ''}`;

  const clearFilters = () => { setQuery(''); setFilter('all'); };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Loans"
        description={<span className="tnum">{description}</span>}
        actions={
          <Button onClick={() => setNewOpen(true)} className="h-10 bg-emerald-600 hover:bg-emerald-700 sm:h-9">
            <Plus className="h-4 w-4" /> New Loan
          </Button>
        }
      />

      {showSkeleton ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading loans">
          {Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} rows={4} />)}
        </div>
      ) : isEmpty ? (
        <div className={CARD}>
          {borrowers.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title="Add a borrower first"
              description="Every loan belongs to someone. Add the person you're lending to, then create their loan and repayment schedule."
              action={
                <Button onClick={() => navigate('/borrowers?new=1')} className="h-10 bg-emerald-600 hover:bg-emerald-700">
                  <UserPlus className="h-4 w-4" /> Add a borrower
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Landmark}
              title="No loans yet"
              description="Create a loan to generate its monthly installment schedule and start tracking repayments."
              action={
                <Button onClick={() => setNewOpen(true)} className="h-10 bg-emerald-600 hover:bg-emerald-700">
                  <Plus className="h-4 w-4" /> Create your first loan
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search loan number or borrower"
                aria-label="Search loans by loan number or borrower name"
                className="h-10 pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter loans by status">
              {FILTERS.map((f) => {
                const selected = filter === f;
                const n = counts[f] || 0;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    aria-pressed={selected}
                    className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 sm:h-8 ${
                      selected
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : f === 'overdue' && n > 0
                          ? 'border-red-200 bg-white text-red-600 hover:bg-red-50'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {filterLabel(f)}
                    <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold tnum ${selected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{n}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {rows.length === 0 ? (
            <div className={CARD}>
              <EmptyState
                compact
                icon={SearchX}
                title="No matching loans"
                description={query.trim()
                  ? `No ${filter === 'all' ? '' : `${filterLabel(filter).toLowerCase()} `}loans match “${query.trim()}”.`
                  : `There are no ${filterLabel(filter).toLowerCase()} loans right now.`}
                action={<Button variant="outline" onClick={clearFilters} className="h-10">Show all loans</Button>}
              />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map(({ l, borrower, bal, effectiveStatus, pct }) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => navigate(`/loans/${l.id}`)}
                  className={`min-w-0 p-4 text-left transition-all hover:border-emerald-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${CARD}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600" aria-hidden="true">
                        <Landmark className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-display font-semibold text-slate-800">{l.loan_number}</p>
                        <p className="truncate text-xs text-slate-500">{borrower?.name || '—'}</p>
                      </div>
                    </div>
                    <StatusBadge status={effectiveStatus} className="shrink-0" />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-y-1.5 text-sm">
                    <span className="text-slate-400">Principal</span><span className="text-right font-medium tnum">{formatINR(l.principal_amount)}</span>
                    <span className="text-slate-400">Outstanding</span><span className="text-right font-semibold text-slate-900 tnum">{formatINR(bal.outstanding)}</span>
                    <span className="text-slate-400">Monthly</span><span className="text-right tnum">{formatINR(l.monthly_due_amount)}</span>
                    <span className="text-slate-400">Repayment</span><span className="text-right text-xs leading-5">{repaymentTypeLabel(l)}</span>
                  </div>

                  <div className="mt-4">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                      <span className="tnum">{formatINR(bal.totalPaid)} of {formatINR(bal.totalDue)} repaid</span>
                      <span className="font-semibold text-slate-700 tnum">{pct}%</span>
                    </div>
                    <div
                      className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
                      role="progressbar"
                      aria-label={`${l.loan_number} repayment progress`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pct}
                    >
                      <div
                        className={`h-full rounded-full ${effectiveStatus === 'overdue' ? 'bg-red-500' : 'bg-emerald-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <NewLoanDialog open={newOpen} onOpenChange={setNewOpen} borrowers={borrowers} onCreated={() => reload()} />
    </div>
  );
}
