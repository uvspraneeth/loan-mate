import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { useLending } from '@/lib/LendingContext';
import { formatINR } from '@/lib/money';
import { deriveLoanBalance, toISODate } from '@/lib/loanCalc';
import MetricCard from '@/components/MetricCard';
import { TrendingUp, Wallet, AlertTriangle, Percent, CalendarClock, IndianRupee } from 'lucide-react';

export default function Reports() {
  const { loans, installments, payments } = useLending();

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
    const map = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleDateString('en-IN', { month: 'short' });
      map[key] = { month: key, collected: 0, expected: 0 };
    }
    for (const p of payments) {
      if (!p.verified) continue;
      const pd = new Date(p.payment_date);
      const key = pd.toLocaleDateString('en-IN', { month: 'short' });
      if (map[key]) map[key].collected += p.amount;
    }
    for (const inst of installments) {
      const dd = new Date(inst.due_date);
      const key = dd.toLocaleDateString('en-IN', { month: 'short' });
      if (map[key]) map[key].expected += inst.total_due;
    }
    return Object.values(map);
  }, [payments, installments]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">A simple view of your lending performance</p>
      </div>

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

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <h2 className="font-display font-semibold text-slate-900 mb-4">Monthly Collection (last 6 months)</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyChart} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => formatINR(v)} contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }} />
              <Bar dataKey="expected" fill="#E2E8F0" radius={[4, 4, 0, 0]} />
              <Bar dataKey="collected" fill="#059669" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 mt-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-200" /> Expected</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /> Collected</span>
        </div>
      </div>
    </div>
  );
}