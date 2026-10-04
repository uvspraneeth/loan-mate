import { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Wallet, TrendingUp, AlertTriangle, CalendarClock, MessageCircle, Smartphone, BadgeCheck, ArrowRight, ShieldAlert, Plus, UserPlus, CheckCircle2, PartyPopper, Settings as SettingsIcon } from 'lucide-react';
import { useLending } from '@/lib/LendingContext';
import { formatINR } from '@/lib/money';
import { deriveLoanBalance, daysOverdue, daysBetween } from '@/lib/loanCalc';
import { buildDueReminder, buildPaymentRequest, whatsappUrl, smsUrl } from '@/lib/messages';
import { logNotification as logNotif } from '@/lib/paymentService';
import MetricCard from '@/components/MetricCard';
import StatusBadge from '@/components/StatusBadge';
import RecordPaymentDialog from '@/components/RecordPaymentDialog';
import PaymentVerificationDrawer from '@/components/PaymentVerificationDrawer';
import NewLoanDialog from '@/components/NewLoanDialog';
import { EmptyState, PageSkeleton } from '@/components/PageState';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const shortDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const dueLabel = (inst) => {
  if (inst.status === 'overdue') {
    const d = daysOverdue(inst.due_date);
    return { text: `${d} day${d === 1 ? '' : 's'} overdue`, tone: 'text-red-600' };
  }
  const n = daysBetween(new Date(), inst.due_date);
  if (n === 0) return { text: 'Due today', tone: 'text-amber-600 font-medium' };
  if (n === 1) return { text: 'Due tomorrow', tone: 'text-amber-600' };
  return { text: n > 0 ? `Due in ${n} days` : '', tone: 'text-slate-400' };
};

function OnboardingSteps({ hasBorrowers, hasLoans, hasSettings, onAddBorrower, onNewLoan, onSettings }) {
  const steps = [
    { done: hasBorrowers, title: 'Add a borrower', description: 'Name and WhatsApp number of someone you lend to.', action: onAddBorrower, cta: 'Add borrower', icon: UserPlus },
    { done: hasLoans, title: 'Create a loan', description: 'LoanMate builds the monthly installment schedule for you.', action: onNewLoan, cta: 'New loan', icon: Plus, disabled: !hasBorrowers },
    { done: hasSettings, title: 'Add your payment details', description: 'Your UPI ID goes into every reminder so borrowers know how to pay.', action: onSettings, cta: 'Open settings', icon: SettingsIcon },
  ];
  return (
    <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 sm:p-6">
      <h2 className="font-display text-lg font-semibold text-slate-900">Let&apos;s get you set up</h2>
      <p className="mt-0.5 text-sm text-slate-500">Three quick steps and LoanMate will track every installment for you.</p>
      <ol className="mt-5 grid gap-3 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className={cn('flex flex-col rounded-lg border bg-white p-4', s.done ? 'border-emerald-200' : 'border-slate-200')}>
            <div className="flex items-center gap-2">
              {s.done ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-label="Done" />
              ) : (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">{i + 1}</span>
              )}
              <p className={cn('font-medium', s.done ? 'text-slate-400 line-through' : 'text-slate-800')}>{s.title}</p>
            </div>
            <p className="mt-1.5 flex-1 text-xs text-slate-500">{s.description}</p>
            {!s.done && (
              <Button size="sm" variant="outline" onClick={s.action} disabled={s.disabled} className="mt-3 self-start">
                <s.icon className="mr-1 h-4 w-4" /> {s.cta}
              </Button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function Home() {
  const { greeting, first } = useOutletContext();
  const { borrowers, loans, installments, payments, settings, reload, loading } = useLending();
  const navigate = useNavigate();
  const [verifyPayment, setVerifyPayment] = useState(null);
  const [recordInst, setRecordInst] = useState(null);
  const [newLoanOpen, setNewLoanOpen] = useState(false);

  const borrowerMap = useMemo(() => Object.fromEntries(borrowers.map((b) => [b.id, b])), [borrowers]);
  const loanMap = useMemo(() => Object.fromEntries(loans.map((l) => [l.id, l])), [loans]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

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

  const pendingPayments = useMemo(() => payments.filter((p) => !p.verified && !p.rejected_at), [payments]);

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
    const phone = channel === 'whatsapp' ? item.borrower.whatsapp_number || item.borrower.phone : item.borrower.phone;
    if (!phone) {
      toast({ variant: 'destructive', title: 'No phone number', description: `Add a phone number for ${item.borrower.name} to send reminders.` });
      return;
    }
    const msg = channel === 'whatsapp'
      ? buildDueReminder({ borrower: item.borrower, installment: item.inst, loan: item.loan, settings })
      : buildPaymentRequest({ borrower: item.borrower, installment: item.inst, settings });
    window.open(channel === 'whatsapp' ? whatsappUrl(phone, msg) : smsUrl(phone, msg), '_blank');
    try {
      await logNotif({ borrower: item.borrower, loan: item.loan, installment: item.inst, channel, messageType: 'due_reminder', message: msg, status: 'opened' });
      reload();
    } catch (err) {
      console.error('log reminder error', err);
    }
  };

  if (loading && loans.length === 0 && borrowers.length === 0) return <PageSkeleton />;

  const isNewUser = loans.length === 0 || !settings?.upi_id;

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display font-bold text-slate-900 tracking-tight" style={{ fontSize: 'clamp(1.75rem, 3vw, 2.5rem)' }}>
            {greeting}, {first}
          </h1>
          <p className="text-slate-500 mt-1">
            {metrics.overdue > 0
              ? <>You have <span className="font-semibold text-red-600 tnum">{formatINR(metrics.overdue)}</span> overdue. Send a gentle reminder below.</>
              : "Here's your lending summary."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/borrowers?new=1')}>
            <UserPlus className="h-4 w-4 mr-1" /> Add Borrower
          </Button>
          <Button onClick={() => setNewLoanOpen(true)} disabled={borrowers.length === 0} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4 mr-1" /> New Loan
          </Button>
        </div>
      </div>

      {isNewUser && (
        <OnboardingSteps
          hasBorrowers={borrowers.length > 0}
          hasLoans={loans.length > 0}
          hasSettings={!!settings?.upi_id}
          onAddBorrower={() => navigate('/borrowers?new=1')}
          onNewLoan={() => setNewLoanOpen(true)}
          onSettings={() => navigate('/settings')}
        />
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
                <p className="text-lg sm:text-xl font-semibold tnum text-slate-900 mt-1">{formatINR(monthSummary.expected)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Received</p>
                <p className="text-lg sm:text-xl font-semibold tnum text-emerald-600 mt-1">{formatINR(monthSummary.received)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Pending</p>
                <p className="text-lg sm:text-xl font-semibold tnum text-amber-600 mt-1">{formatINR(monthSummary.pending)}</p>
              </div>
            </div>
            {(() => {
              const pct = monthSummary.expected ? Math.min(100, Math.round((monthSummary.received / monthSummary.expected) * 100)) : 0;
              return (
                <div className="mt-4">
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Collected this month">
                    <div className="h-full bg-emerald-500 rounded-full transition-[width] duration-700" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400 tnum">{pct}% collected</p>
                </div>
              );
            })()}
          </div>

          {/* Upcoming & overdue dues */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-display font-semibold text-slate-900">Upcoming & Overdue Dues</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate('/loans')} className="text-emerald-600">View all <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>
            </div>
            {upcomingDues.length === 0 ? (
              <EmptyState
                compact
                icon={PartyPopper}
                title={loans.length ? 'All caught up' : 'No dues yet'}
                description={loans.length ? 'Nothing is due in the next 7 days and nothing is overdue.' : 'Installments will show up here once you create a loan.'}
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {upcomingDues.map(({ inst, loan, borrower }) => {
                  const label = dueLabel(inst);
                  return (
                    <li key={inst.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-5 py-3 hover:bg-slate-50/50">
                      <button onClick={() => loan && navigate(`/loans/${loan.id}`)} className="flex-1 min-w-[8rem] text-left">
                        <p className="font-medium text-slate-800 truncate">{borrower.name}</p>
                        <p className="text-xs text-slate-400">{loan?.loan_number} · #{inst.installment_number}</p>
                      </button>
                      <div className="text-right">
                        <p className="font-semibold tnum text-slate-900">{formatINR(inst.total_due - (inst.amount_paid || 0))}</p>
                        <p className="text-xs text-slate-400">{shortDate(inst.due_date)}</p>
                      </div>
                      <div className="w-28">
                        <StatusBadge status={inst.status} />
                        <p className={cn('text-[11px] mt-0.5', label.tone)}>{label.text}</p>
                      </div>
                      <div className="flex items-center gap-1 ml-auto sm:ml-0">
                        <Button size="sm" variant="ghost" onClick={() => sendReminder({ inst, loan, borrower }, 'whatsapp')} title="Send WhatsApp reminder" aria-label={`Send WhatsApp reminder to ${borrower.name}`} className="h-9 w-9 p-0 text-emerald-600 hover:bg-emerald-50">
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => sendReminder({ inst, loan, borrower }, 'sms')} title="Send SMS reminder" aria-label={`Send SMS reminder to ${borrower.name}`} className="h-9 w-9 p-0 text-sky-600 hover:bg-sky-50">
                          <Smartphone className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRecordInst(inst)} title="Record payment" aria-label={`Record payment from ${borrower.name}`} className="h-9 w-9 p-0 text-emerald-600 hover:bg-emerald-50">
                          <BadgeCheck className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
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
              <EmptyState compact icon={BadgeCheck} title="Nothing to verify" description="Payments awaiting your review will appear here." />
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

      <NewLoanDialog open={newLoanOpen} onOpenChange={setNewLoanOpen} borrowers={borrowers} onCreated={() => reload()} />

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