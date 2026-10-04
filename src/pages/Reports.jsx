import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useLending } from '@/lib/LendingContext';
import { formatINR } from '@/lib/money';
import { deriveLoanBalance } from '@/lib/loanCalc';
import MetricCard from '@/components/MetricCard';
import { PageHeader, EmptyState, CardSkeleton } from '@/components/PageState';
import { Button } from '@/components/ui/button';
import { TrendingUp, Wallet, AlertTriangle, Percent, CalendarClock, IndianRupee, BarChart3 } from 'lucide-react';

const COLORS = {
  expected: '#FCD34D', // amber-300 — recessive "target"
  collected: '#059669', // emerald-600 — actual money in
};

// Compact Indian-style axis labels: ₹45K, ₹1.2L, ₹2.5Cr
function compactINR(v) {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  const trim = (x) => String(Math.round(x * 10) / 10);
  if (abs >= 1e7) return `₹${trim(n / 1e7)}Cr`;
  if (abs >= 1e5) return `₹${trim(n / 1e5)}L`;
  if (abs >= 1e3) return `₹${trim(n / 1e3)}K`;
  return `₹${Math.round(n)}`;
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const expected = payload.find((p) => p.dataKey === 'expected')?.value || 0;
  const collected = payload.find((p) => p.dataKey === 'collected')?.value || 0;
  const rate = expected > 0 ? Math.round((collected / expected) * 100) : null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-slate-800">{label}</p>
      {[['expected', 'Expected', expected], ['collected', 'Collected', collected]].map(([key, name, value]) => (
        <p key={key} className="flex items-center justify-between gap-4 text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COLORS[key] }} aria-hidden="true" />
            {name}
          </span>
          <span className="font-medium text-slate-900 tnum">{formatINR(value)}</span>
        </p>
      ))}
      {rate !== null && <p className="mt-1 border-t border-slate-100 pt-1 text-slate-500">Collected {rate}% of expected</p>}
    </div>
  );
}

export default function Reports() {
  const { loans, installments, payments, loading } = useLending();

  const stats = useMemo(() => {
    let totalLent = 0, totalCollected = 0, outstanding = 0, totalInterestEarned = 0, overdue = 0;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    let collectionThisMonth = 0, expectedThisMonth = 0;

    for (const l of loans) {
      if (l.status === 'cancelled') continue;
      totalLent += l.principal_amount || 0;
      const bal = deriveLoanBalance(installments.filter((i) => i.loan_id === l.id));
      totalCollected += bal.totalPaid;
      totalInterestEarned += bal.interestPaid;
      outstanding += bal.outstanding;
    }
    for (const inst of installments) {
      if (inst.status === 'paid' || inst.status === 'waived') continue;
      if (inst.status === 'overdue') overdue += inst.total_due - (inst.amount_paid || 0);
      const due = new Date(inst.due_date);
      if (due >= monthStart && due <= monthEnd) expectedThisMonth += inst.total_due;
    }
    for (const p of payments) {
      if (!p.verified) continue;
      const pd = new Date(p.payment_date);
      if (pd >= monthStart && pd <= monthEnd) collectionThisMonth += p.amount;
    }
    const collectionRate = expectedThisMonth > 0 ? Math.round((collectionThisMonth / expectedThisMonth) * 100) : 0;
    return { totalLent, totalCollected, outstanding, totalInterestEarned, overdue, collectionThisMonth, expectedThisMonth, collectionRate };
  }, [loans, installments, payments]);

  const monthlyChart = useMemo(() => {
    const map = new Map();
    const now = new Date();
    const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const first = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const spansYears = first.getFullYear() !== now.getFullYear();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString('en-IN', spansYears ? { month: 'short', year: '2-digit' } : { month: 'short' });
      map.set(monthKey(d), { month: label, collected: 0, expected: 0 });
    }
    for (const p of payments) {
      if (!p.verified) continue;
      const bucket = map.get(monthKey(new Date(p.payment_date)));
      if (bucket) bucket.collected += p.amount;
    }
    for (const inst of installments) {
      const bucket = map.get(monthKey(new Date(inst.due_date)));
      if (bucket) bucket.expected += inst.total_due;
    }
    return Array.from(map.values());
  }, [payments, installments]);

  const header = <PageHeader title="Reports" description="A simple view of your lending performance" />;

  if (loading && loans.length === 0) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading reports">
        {header}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }, (_, i) => <CardSkeleton key={i} rows={1} />)}
        </div>
        <CardSkeleton rows={6} />
      </div>
    );
  }

  if (loans.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <EmptyState
            icon={BarChart3}
            title="No loans to report on yet"
            description="Once you add a loan, you'll see how much you've lent, collected and earned in interest — plus a month-by-month collection chart."
            action={
              <Button asChild className="h-10 bg-emerald-600 hover:bg-emerald-700">
                <Link to="/loans">Go to Loans</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const hasChartData = monthlyChart.some((m) => m.expected > 0 || m.collected > 0);

  return (
    <div className="space-y-6">
      {header}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Lent" value={formatINR(stats.totalLent)} icon={Wallet} />
        <MetricCard label="Total Collected" value={formatINR(stats.totalCollected)} tone="emerald" icon={TrendingUp} />
        <MetricCard label="Total Outstanding" value={formatINR(stats.outstanding)} icon={IndianRupee} />
        <MetricCard label="Interest Earned" value={formatINR(stats.totalInterestEarned)} tone="emerald" icon={Percent} />
        <MetricCard label="Total Overdue" value={formatINR(stats.overdue)} tone="red" icon={AlertTriangle} />
        <MetricCard label="Collected This Month" value={formatINR(stats.collectionThisMonth)} tone="emerald" icon={CalendarClock} />
        <MetricCard label="Expected This Month" value={formatINR(stats.expectedThisMonth)} tone="amber" icon={CalendarClock} />
        <MetricCard label="Collection Rate" value={`${stats.collectionRate}%`} tone={stats.collectionRate >= 80 ? 'emerald' : stats.collectionRate >= 50 ? 'amber' : 'red'} icon={Percent} />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]" aria-labelledby="monthly-chart-heading">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="monthly-chart-heading" className="font-display font-semibold text-slate-900">Monthly collection</h2>
            <p className="text-xs text-slate-500">Expected installments vs verified payments, last 6 months</p>
          </div>
          <div className="flex gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COLORS.expected }} aria-hidden="true" /> Expected</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COLORS.collected }} aria-hidden="true" /> Collected</span>
          </div>
        </div>

        {hasChartData ? (
          <>
            <div className="h-56 sm:h-72" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChart} barGap={2} barCategoryGap="24%" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={compactINR} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={52} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: '#F1F5F9' }} />
                  <Bar dataKey="expected" name="Expected" fill={COLORS.expected} radius={[4, 4, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="collected" name="Collected" fill={COLORS.collected} radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Screen-reader equivalent of the chart */}
            <table className="sr-only">
              <caption>Monthly expected vs collected amounts</caption>
              <thead>
                <tr><th scope="col">Month</th><th scope="col">Expected</th><th scope="col">Collected</th></tr>
              </thead>
              <tbody>
                {monthlyChart.map((m) => (
                  <tr key={m.month}><th scope="row">{m.month}</th><td>{formatINR(m.expected)}</td><td>{formatINR(m.collected)}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <EmptyState
            compact
            icon={BarChart3}
            title="No installments or payments in the last 6 months"
            description="The chart fills in as installments come due and payments are verified."
          />
        )}
      </section>
    </div>
  );
}
