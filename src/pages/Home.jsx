import { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Wallet, TrendingUp, AlertTriangle, CalendarClock, MessageCircle, Smartphone, BadgeCheck, ArrowRight, ShieldAlert } from 'lucide-react';
import { useLending } from '@/lib/LendingContext';
import { formatINR } from '@/lib/money';
import { deriveLoanBalance, daysOverdue, toISODate } from '@/lib/loanCalc';
import { buildDueReminder, buildPaymentRequest, whatsappUrl, smsUrl } from '@/lib/messages';
import { logNotification as logNotif } from '@/lib/paymentService';
import MetricCard from '@/components/MetricCard';
import StatusBadge from '@/components/StatusBadge';
import RecordPaymentDialog from '@/components/RecordPaymentDialog';
import PaymentVerificationDrawer from '@/components/PaymentVerificationDrawer';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const { greeting, first } = useOutletContext();
  const { borrowers, loans, installments, payments, settings, reload } = useLending();
  const navigate = useNavigate();
  const [verifyPayment, setVerifyPayment] = useState(null);
  const [recordInst, setRecordInst] = useState(null);

  const borrowerMap = useMemo(() => Object.fromEntries(borrowers.map((b) => [b.id, b])), [borrowers]);
  const loanMap = useMemo(() => Object.fromEntries(loans.map((l) => [l.id, l])), [loans]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const todayISO = toISODate(now);

  const metrics = useMemo(() => {
    let totalLent = 0, outstanding = 0, dueThisMonth = 0, overdue = 0;
    for (const l of loans) {
      if (l.status === 'cancelled') continue;
      totalLent += l.principal_amount || 0;
      const bal = deriveLoanBalance(installments.filter((i) => i.loan_id === l.id));
      outstanding += bal.outstanding;
    }
    for (const inst of installments) {
      if (inst.status === 'paid' || inst.status === 'waived') continue;
      const due = new Date(inst.due_date);
      if (due >= monthStart && due <= monthEnd) dueThisMonth += inst.total_due - (inst.amount_paid || 0);
      if (inst.status === 'overdue') overdue += inst.total_due - (inst.amount_paid || 0);
    }
    return { totalLent, outstanding, dueThisMonth, overdue };
  }, [loans, installments]);

  const monthSummary = useMemo(() => {
    let expected = 0, received = 0;
    for (const inst of installments) {
      const due = new Date(inst.due_date);
      if (due >= monthStart && due <= monthEnd) {
        expected += inst.total_due || 0;
        received += inst.amount_paid || 0;
      }
    }
    return { expected, received, pending: Math.max(0, expected - received) };
  }, [installments]);

  const pendingPayments = useMemo(() => payments.filter((p) => !p.verified), [payments]);

  const upcomingDues = useMemo(() => {
    return installments
      .filter((i) => i.status === 'due' || i.status === 'overdue' || i.status === 'partially_paid')
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .slice(0, 8)
      .map((inst) => {
        const loan = loanMap[inst.loan_id];
        const borrower = borrowerMap[loan?.borrower_id];
        return { inst, loan, borrower };
      })
      .filter((x) => x.borrower);
  }, [installments, loanMap, borrowerMap]);

  const sendReminder = async (item, channel) => {
    const msg = buildDueReminder({ borrower: item.borrower, installment: item.inst, loan: item.loan, settings });
    if (channel === 'whatsapp') {
      window.open(whatsappUrl(item.borrower.whatsapp_number || item.borrower.phone, msg), '_blank');
    } else {
      window.open(smsUrl(item.borrower.phone, buildPaymentRequest({ borrower: item.borrower, installment: item.inst, settings })), '_blank');
    }
    await logNotif({ borrower: item.borrower, loan: item.loan, installment: item.inst, channel, messageType: 'due_reminder', message: channel === 'whatsapp' ? msg : buildPaymentRequest({ borrower: item.borrower, installment: item.inst, settings }), status: 'opened' });
    reload();
  };

  const verifyItem = verifyPayment ? {
    payment: verifyPayment,
    borrower: borrowerMap[loans.find((l) => l.id === verifyPayment.loan_id)?.borrower_id],
    loan: loans.find((l) => l.id === verifyPayment.loan_id),
    installment: installments.find((i) => i.id === verifyPayment.installment_id),
  } : null;

  const recordItem = recordInst ? (() => {
    const loan = loanMap[recordInst.loan_id];
    const borrower = borrowerMap[loan?.borrower_id];
    return { installment: recordInst, loan, borrower };
  })() : null;

  return (
    <div className="space-y-6">
      {/* Hero greeting */}
      <div>
        <h1 className="font-display font-bold text-slate-900 tracking-tight" style={{ fontSize: 'clamp(1.75rem, 3vw, 2.5rem)' }}>
          {greeting}, {first}
        </h1>
        <p className="text-slate-500 mt-1">Here's your lending summary.</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Lent" value={formatINR(metrics.totalLent)} tone="neutral" icon={Wallet} />
        <MetricCard label="Outstanding" value={formatINR(metrics.outstanding)} tone="emerald" icon={TrendingUp} />
        <MetricCard label="Due This Month" value={formatINR(metrics.dueThisMonth)} tone="amber" icon={CalendarClock} />
        <MetricCard label="Overdue" value={formatINR(metrics.overdue)} tone="red" icon={AlertTriangle} />
      </div>

      {/* 8:4 split stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left stage */}
        <div className="lg:col-span-8 space-y-6">
          {/* This month summary */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <h2 className="font-display font-semibold text-slate-900 mb-4">This Month</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-slate-400">Expected</p>
                <p className="text-xl font-semibold tnum text-slate-900 mt-1">{formatINR(monthSummary.expected)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Received</p>
                <p className="text-xl font-semibold tnum text-emerald-600 mt-1">{formatINR(monthSummary.received)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Pending</p>
                <p className="text-xl font-semibold tnum text-amber-600 mt-1">{formatINR(monthSummary.pending)}</p>
              </div>
            </div>
            <div className="mt-4 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${monthSummary.expected ? (monthSummary.received / monthSummary.expected) * 100 : 0}%` }} />
            </div>
          </div>

          {/* Upcoming & overdue dues */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-display font-semibold text-slate-900">Upcoming & Overdue Dues</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate('/loans')} className="text-emerald-600">View all <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>
            </div>
            {upcomingDues.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-400">No dues pending. All caught up! 🎉</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {upcomingDues.map(({ inst, loan, borrower }) => {
                  const overdueDays = inst.status === 'overdue' ? daysOverdue(inst.due_date) : 0;
                  const dueIn = Math.round((new Date(inst.due_date) - now) / 86400000);
                  return (
                    <div key={inst.id} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-slate-50/50">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">{borrower.name}</p>
                        <p className="text-xs text-slate-400">{loan?.loan_number}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tnum text-slate-900">{formatINR(inst.total_due - (inst.amount_paid || 0))}</p>
                        <p className="text-xs text-slate-400">{new Date(inst.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                      </div>
                      <div className="w-24">
                        <StatusBadge status={inst.status} />
                        {overdueDays > 0 && <p className="text-[10px] text-red-500 mt-0.5">{overdueDays}d overdue</p>}
                        {inst.status !== 'overdue' && <p className="text-[10px] text-slate-400 mt-0.5">{dueIn >= 0 ? `Due in ${dueIn}d` : ''}</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => sendReminder({ inst, loan, borrower }, 'whatsapp')} title="Send WhatsApp" className="h-8 w-8 p-0 text-emerald-600">
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => sendReminder({ inst, loan, borrower }, 'sms')} title="Send SMS" className="h-8 w-8 p-0 text-sky-600">
                          <Smartphone className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRecordInst(inst)} title="Mark Paid" className="h-8 w-8 p-0 text-emerald-600">
                          <BadgeCheck className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right stage — verification rail */}
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-20 rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              <h2 className="font-display font-semibold text-slate-900">Payments Needing Verification</h2>
              {pendingPayments.length > 0 && <span className="ml-auto rounded-full bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5">{pendingPayments.length}</span>}
            </div>
            {pendingPayments.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-400">No payments awaiting verification.</p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto scrollbar-thin">
                {pendingPayments.map((p) => {
                  const loan = loans.find((l) => l.id === p.loan_id);
                  const borrower = borrowerMap[loan?.borrower_id];
                  if (!borrower) return null;
                  return (
                    <button key={p.id} onClick={() => setVerifyPayment(p)} className="w-full text-left px-5 py-3 hover:bg-slate-50/50">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-slate-800">{borrower.name}</p>
                        <p className="font-semibold tnum text-slate-900">{formatINR(p.amount)}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-400">{p.payment_method}</span>
                        {p.proof_url && <span className="text-xs text-emerald-600 flex items-center gap-1"><BadgeCheck className="h-3 w-3" /> Proof attached</span>}
                      </div>
                      <p className="text-xs text-emerald-600 mt-1.5 font-medium">Review →</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {verifyItem && (
        <PaymentVerificationDrawer
          open={!!verifyPayment}
          onOpenChange={(v) => !v && setVerifyPayment(null)}
          payment={verifyItem.payment}
          borrower={verifyItem.borrower}
          loan={verifyItem.loan}
          installment={verifyItem.installment}
          allInstallments={installments}
          settings={settings}
          onDone={reload}
        />
      )}

      {recordItem && (
        <RecordPaymentDialog
          open={!!recordInst}
          onOpenChange={(v) => !v && setRecordInst(null)}
          installment={recordItem.installment}
          loan={recordItem.loan}
          borrower={recordItem.borrower}
          onDone={reload}
        />
      )}
    </div>
  );
}