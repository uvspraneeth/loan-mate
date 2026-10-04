import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Landmark, MessageCircle, Smartphone, BadgeCheck, History, CalendarClock, CircleCheck, Receipt } from 'lucide-react';
import { useLending } from '@/lib/LendingContext';
import { formatINR } from '@/lib/money';
import { calculateLoanSummary, deriveLoanBalance, daysBetween, REPAYMENT_TYPE_LABELS } from '@/lib/loanCalc';
import { buildDueReminder, buildPaymentRequest, whatsappUrl, smsUrl } from '@/lib/messages';
import { logNotification } from '@/lib/paymentService';
import StatusBadge from '@/components/StatusBadge';
import InstallmentScheduleTable from '@/components/InstallmentScheduleTable';
import RecordPaymentDialog from '@/components/RecordPaymentDialog';
import { EmptyState, CardSkeleton } from '@/components/PageState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';

const CARD = 'rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)]';

// Date-only strings ('YYYY-MM-DD') are parsed as local dates to avoid a UTC off-by-one.
function toDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
}

function fmtDate(v, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return v ? toDate(v).toLocaleDateString('en-IN', opts) : '—';
}

function dueInfo(dueDate) {
  const diff = daysBetween(new Date(), dueDate); // positive = in the future
  if (diff < 0) return { label: `${-diff} ${diff === -1 ? 'day' : 'days'} overdue`, tone: 'red' };
  if (diff === 0) return { label: 'Due today', tone: 'amber' };
  if (diff === 1) return { label: 'Due tomorrow', tone: 'amber' };
  return { label: `Due in ${diff} days`, tone: diff <= 7 ? 'amber' : 'slate' };
}

const TONES = {
  red: { box: 'border-red-200 bg-red-50/60', icon: 'bg-red-100 text-red-600', chip: 'bg-red-100 text-red-700' },
  amber: { box: 'border-amber-200 bg-amber-50/60', icon: 'bg-amber-100 text-amber-600', chip: 'bg-amber-100 text-amber-800' },
  slate: { box: 'border-slate-200 bg-white', icon: 'bg-emerald-50 text-emerald-600', chip: 'bg-slate-100 text-slate-600' },
};

function PaymentStatusChip({ p }) {
  const [label, cls] = p.verified
    ? ['Verified', 'bg-emerald-50 text-emerald-700 border-emerald-200']
    : p.rejected_at
      ? ['Rejected', 'bg-red-50 text-red-700 border-red-200']
      : ['Pending', 'bg-amber-50 text-amber-700 border-amber-200'];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-px text-[11px] font-medium ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      {label}
    </span>
  );
}

function LoanDetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading loan">
      <Skeleton className="h-5 w-28" />
      <div className={`${CARD} p-5`}>
        <div className="flex items-center gap-3">
          <Skeleton className="h-11 w-11 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <Skeleton className="mt-5 h-2 w-full rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <CardSkeleton rows={8} className="lg:col-span-4" />
        <CardSkeleton rows={6} className="lg:col-span-8" />
      </div>
    </div>
  );
}

export default function LoanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { borrowers, loans, installments, payments, activities, settings, loading, reload } = useLending();
  const [recordInst, setRecordInst] = useState(null);

  const loan = loans.find((l) => l.id === id);
  const borrower = borrowers.find((b) => b.id === loan?.borrower_id);
  const myInstallments = useMemo(() => installments.filter((i) => i.loan_id === id).sort((a, b) => a.installment_number - b.installment_number), [installments, id]);
  const myPayments = useMemo(() => payments.filter((p) => p.loan_id === id).sort((a, b) => toDate(b.payment_date) - toDate(a.payment_date)), [payments, id]);
  const myActivities = useMemo(() => activities.filter((a) => a.loan_id === id).sort((a, b) => new Date(b.created_date) - new Date(a.created_date)), [activities, id]);

  if (!loan) {
    if (loading) return <LoanDetailSkeleton />;
    return (
      <div className={`${CARD} mx-auto max-w-lg`}>
        <EmptyState
          icon={Landmark}
          title="Loan not found"
          description="This loan may have been deleted, or the link is incorrect."
          action={<Button variant="outline" onClick={() => navigate('/loans')} className="h-10">Back to Loans</Button>}
        />
      </div>
    );
  }

  const summary = calculateLoanSummary(loan);
  const balance = deriveLoanBalance(myInstallments);
  const nextInst = myInstallments.find((i) => i.status !== 'paid' && i.status !== 'waived');
  const effectiveStatus = loan.status === 'active' && myInstallments.some((i) => i.status === 'overdue') ? 'overdue' : loan.status;
  const pct = balance.totalDue > 0 ? Math.min(100, Math.round((balance.totalPaid / balance.totalDue) * 100)) : 0;
  const paidCount = myInstallments.filter((i) => i.status === 'paid' || i.status === 'waived').length;
  const nextRemaining = nextInst ? Math.max(0, (nextInst.total_due || 0) - (nextInst.amount_paid || 0)) : 0;
  const due = nextInst ? dueInfo(nextInst.due_date) : null;
  const tone = due ? TONES[due.tone] : TONES.slate;

  const sendReminder = async (channel) => {
    if (!nextInst || !borrower) return;
    const msg = buildDueReminder({ borrower, installment: nextInst, loan, settings });
    if (channel === 'whatsapp') window.open(whatsappUrl(borrower?.whatsapp_number || borrower?.phone, msg), '_blank');
    else window.open(smsUrl(borrower?.phone, buildPaymentRequest({ borrower, installment: nextInst, settings })), '_blank');
    try {
      await logNotification({ borrower, loan, installment: nextInst, channel, messageType: 'due_reminder', message: msg, status: 'opened' });
      reload();
    } catch (err) {
      console.error('log reminder error', err);
      toast({ variant: 'destructive', title: 'Reminder not logged', description: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate('/loans')}
        className="-ml-2 inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm text-slate-500 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Loans
      </button>

      {/* Header + repayment progress */}
      <div className={`${CARD} p-5`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600" aria-hidden="true">
              <Landmark className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">{loan.loan_number}</h1>
                <StatusBadge status={effectiveStatus} />
              </div>
              {borrower ? (
                <button
                  type="button"
                  onClick={() => navigate(`/borrowers?open=${borrower.id}`)}
                  className="truncate rounded text-sm text-slate-500 underline-offset-2 hover:text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  {borrower.name}
                </button>
              ) : (
                <p className="text-sm text-slate-400">Unknown borrower</p>
              )}
            </div>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Outstanding</p>
            <p className="font-display text-2xl font-bold text-slate-900 tnum">{formatINR(balance.outstanding)}</p>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="tnum">
              <span className="font-semibold text-emerald-700">{formatINR(balance.totalPaid)}</span> paid of {formatINR(balance.totalDue)}
              {myInstallments.length > 0 && <> · {paidCount}/{myInstallments.length} installments</>}
            </span>
            <span className="font-semibold text-slate-700 tnum">{pct}% repaid</span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-label="Repayment progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div className={`h-full rounded-full transition-all ${effectiveStatus === 'overdue' ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Next due callout + actions */}
      {nextInst ? (
        <div className={`rounded-xl border p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:p-5 ${tone.box}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone.icon}`} aria-hidden="true">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Next installment · #{nextInst.installment_number}</p>
                <p className="font-display text-xl font-bold text-slate-900 tnum">{formatINR(nextRemaining)}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <span className="tnum">{fmtDate(nextInst.due_date)}</span>
                  <span className={`rounded-full px-2 py-px text-xs font-semibold ${tone.chip}`}>{due.label}</span>
                  {(nextInst.amount_paid || 0) > 0 && (
                    <span className="text-xs text-slate-500 tnum">({formatINR(nextInst.amount_paid)} of {formatINR(nextInst.total_due)} already paid)</span>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
              <Button onClick={() => setRecordInst(nextInst)} className="col-span-2 h-10 bg-emerald-600 hover:bg-emerald-700">
                <BadgeCheck className="h-4 w-4" /> Record Payment
              </Button>
              <Button variant="outline" onClick={() => sendReminder('whatsapp')} className="h-10 bg-white text-emerald-700">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </Button>
              <Button variant="outline" onClick={() => sendReminder('sms')} className="h-10 bg-white">
                <Smartphone className="h-4 w-4" /> SMS
              </Button>
            </div>
          </div>
        </div>
      ) : myInstallments.length > 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 sm:p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600" aria-hidden="true">
            <CircleCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display font-semibold text-slate-900">All installments settled</p>
            <p className="text-sm text-slate-500">Nothing more is due on this loan.</p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Summary */}
        <div className="lg:col-span-4">
          <div className={`${CARD} p-5 lg:sticky lg:top-20`}>
            <h2 className="mb-4 font-display font-semibold text-slate-900">Loan Summary</h2>
            <div className="space-y-2.5 text-sm">
              <Row label="Original Principal" value={formatINR(summary.principal)} />
              <Row label="Interest Rate" value={`${summary.monthlyRatePct}%/mo (${summary.annualRatePct}%/yr)`} />
              <Row label="Repayment Type" value={REPAYMENT_TYPE_LABELS[summary.repaymentType]} />
              <Row label="Loan Start" value={fmtDate(loan.loan_start_date)} />
              <Row label="Maturity" value={fmtDate(loan.maturity_date)} />
              <Row label="Monthly Due" value={formatINR(summary.monthlyDue)} />
              <div className="my-2 border-t border-slate-100" />
              {summary.repaymentType === 'interest_only' ? (
                <>
                  <Row label="Principal Outstanding" value={formatINR(summary.principalOutstanding)} bold />
                  <Row label="Total Interest (Scheduled)" value={formatINR(summary.totalInterest)} />
                </>
              ) : (
                <>
                  <Row label="Total Interest" value={formatINR(summary.totalInterest)} />
                  <Row label="Total Payable" value={formatINR(summary.totalPayable)} />
                </>
              )}
              <Row label="Total Paid" value={formatINR(balance.totalPaid)} tone="emerald" />
              <Row label="Remaining" value={formatINR(balance.outstanding)} bold />
            </div>
            {loan.notes && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs italic text-slate-500">{loan.notes}</p>}
          </div>
        </div>

        {/* Schedule + history */}
        <div className="min-w-0 space-y-6 lg:col-span-8">
          <section>
            <h2 className="mb-3 font-display font-semibold text-slate-900">Installment Schedule</h2>
            <InstallmentScheduleTable installments={myInstallments} repaymentType={summary.repaymentType} onMarkPaid={setRecordInst} />
          </section>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <section className="min-w-0">
              <h2 className="mb-3 flex items-center gap-2 font-display font-semibold text-slate-900">
                <BadgeCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Payment History
              </h2>
              <div className={CARD}>
                {myPayments.length === 0 ? (
                  <EmptyState compact icon={Receipt} title="No payments yet" description="Recorded payments will appear here." />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {myPayments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                        <div className="min-w-0">
                          <p className="text-slate-700 tnum">{fmtDate(p.payment_date)}</p>
                          <p className="truncate text-xs capitalize text-slate-400">
                            {String(p.payment_method || 'payment').replace(/_/g, ' ')}
                            {p.transaction_reference ? <span className="normal-case"> · {p.transaction_reference}</span> : null}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <p className="font-semibold text-slate-900 tnum">{formatINR(p.amount)}</p>
                          <PaymentStatusChip p={p} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="min-w-0">
              <h2 className="mb-3 flex items-center gap-2 font-display font-semibold text-slate-900">
                <History className="h-4 w-4 text-slate-400" aria-hidden="true" /> Activity Timeline
              </h2>
              <div className={CARD}>
                {myActivities.length === 0 ? (
                  <EmptyState compact icon={History} title="No activity yet" description="Changes to this loan will be logged here." />
                ) : (
                  <ol className="space-y-3 p-4">
                    {myActivities.map((a) => (
                      <li key={a.id} className="flex items-start gap-3 text-sm">
                        <span className="w-14 shrink-0 text-xs leading-5 text-slate-400 tnum">{fmtDate(a.created_date, { day: 'numeric', month: 'short' })}</span>
                        <span className="min-w-0 text-slate-600">{a.description}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      {recordInst && (
        <RecordPaymentDialog
          open={!!recordInst}
          onOpenChange={(v) => !v && setRecordInst(null)}
          installment={recordInst}
          loan={loan}
          borrower={borrower}
          onDone={reload}
        />
      )}
    </div>
  );
}

function Row({ label, value, tone, bold }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={`text-right tnum ${bold ? 'font-bold text-slate-900' : 'font-medium'} ${tone === 'emerald' ? 'text-emerald-600' : 'text-slate-800'}`}>{value}</span>
    </div>
  );
}
