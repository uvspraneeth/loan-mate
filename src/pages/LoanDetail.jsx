import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Landmark, MessageCircle, Smartphone, BadgeCheck, History } from 'lucide-react';
import { useLending } from '@/lib/LendingContext';
import { formatINR } from '@/lib/money';
import { calculateLoanSummary, deriveLoanBalance, REPAYMENT_TYPE_LABELS, daysOverdue } from '@/lib/loanCalc';
import { buildDueReminder, buildPaymentRequest, whatsappUrl, smsUrl } from '@/lib/messages';
import { logNotification } from '@/lib/paymentService';
import StatusBadge from '@/components/StatusBadge';
import InstallmentScheduleTable from '@/components/InstallmentScheduleTable';
import RecordPaymentDialog from '@/components/RecordPaymentDialog';
import { Button } from '@/components/ui/button';

export default function LoanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { borrowers, loans, installments, payments, activities, settings, reload } = useLending();
  const [recordInst, setRecordInst] = useState(null);

  const loan = loans.find((l) => l.id === id);
  const borrower = borrowers.find((b) => b.id === loan?.borrower_id);
  const myInstallments = useMemo(() => installments.filter((i) => i.loan_id === id).sort((a, b) => a.installment_number - b.installment_number), [installments, id]);
  const myPayments = useMemo(() => payments.filter((p) => p.loan_id === id).sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date)), [payments, id]);
  const myActivities = useMemo(() => activities.filter((a) => a.loan_id === id).sort((a, b) => new Date(b.created_date) - new Date(a.created_date)), [activities, id]);

  if (!loan) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">Loan not found.</p>
        <Button variant="outline" onClick={() => navigate('/loans')} className="mt-4">Back to Loans</Button>
      </div>
    );
  }

  const summary = calculateLoanSummary(loan);
  const balance = deriveLoanBalance(myInstallments);
  const nextInst = myInstallments.find((i) => i.status !== 'paid' && i.status !== 'waived');

  const sendReminder = async (channel) => {
    if (!nextInst) return;
    const msg = buildDueReminder({ borrower, installment: nextInst, loan, settings });
    if (channel === 'whatsapp') window.open(whatsappUrl(borrower?.whatsapp_number || borrower?.phone, msg), '_blank');
    else window.open(smsUrl(borrower?.phone, buildPaymentRequest({ borrower, installment: nextInst, settings })), '_blank');
    await logNotification({ borrower, loan, installment: nextInst, channel, messageType: 'due_reminder', message: msg, status: 'opened' });
    reload();
  };

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/loans')} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Back to Loans
      </button>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><Landmark className="h-5 w-5" /></div>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">{loan.loan_number}</h1>
            <p className="text-sm text-slate-500">{borrower?.name} · Outstanding <span className="font-semibold text-slate-800 tnum">{formatINR(balance.outstanding)}</span></p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={loan.status} />
          {nextInst && (
            <>
              <Button size="sm" variant="outline" onClick={() => sendReminder('whatsapp')} className="text-emerald-600"><MessageCircle className="h-4 w-4 mr-1" /> WhatsApp</Button>
              <Button size="sm" variant="outline" onClick={() => sendReminder('sms')}><Smartphone className="h-4 w-4 mr-1" /> SMS</Button>
              <Button size="sm" onClick={() => setRecordInst(nextInst)} className="bg-emerald-600 hover:bg-emerald-700"><BadgeCheck className="h-4 w-4 mr-1" /> Mark Paid</Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Summary */}
        <div className="lg:col-span-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] sticky top-20">
            <h2 className="font-display font-semibold text-slate-900 mb-4">Loan Summary</h2>
            <div className="space-y-2.5 text-sm">
              <Row label="Original Principal" value={formatINR(summary.principal)} />
              <Row label="Interest Rate" value={`${summary.monthlyRatePct}%/mo (${summary.annualRatePct}%/yr)`} />
              <Row label="Repayment Type" value={REPAYMENT_TYPE_LABELS[summary.repaymentType]} />
              <Row label="Loan Start" value={new Date(loan.loan_start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} />
              <Row label="Maturity" value={loan.maturity_date ? new Date(loan.maturity_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'} />
              <Row label="Monthly Due" value={formatINR(summary.monthlyDue)} />
              <div className="border-t border-slate-100 my-2" />
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
            {loan.notes && <p className="mt-4 text-xs text-slate-400 italic">{loan.notes}</p>}
          </div>
        </div>

        {/* Schedule + history */}
        <div className="lg:col-span-8 space-y-6">
          <div>
            <h2 className="font-display font-semibold text-slate-900 mb-3">Installment Schedule</h2>
            <InstallmentScheduleTable installments={myInstallments} repaymentType={summary.repaymentType} onMarkPaid={setRecordInst} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h2 className="font-display font-semibold text-slate-900 mb-3 flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-emerald-600" /> Payment History</h2>
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5">
                {myPayments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="text-slate-700">{new Date(p.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      <p className="text-xs text-slate-400">{p.payment_method} {p.transaction_reference ? `· ${p.transaction_reference}` : ''}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tnum">{formatINR(p.amount)}</p>
                      {p.verified ? <span className="text-xs text-emerald-600">Verified</span> : <span className="text-xs text-amber-600">Pending</span>}
                    </div>
                  </div>
                ))}
                {myPayments.length === 0 && <p className="text-sm text-slate-400">No payments yet.</p>}
              </div>
            </div>

            <div>
              <h2 className="font-display font-semibold text-slate-900 mb-3 flex items-center gap-2"><History className="h-4 w-4 text-slate-400" /> Activity Timeline</h2>
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5">
                {myActivities.map((a) => (
                  <div key={a.id} className="flex items-start gap-2 text-sm">
                    <span className="text-slate-400 w-16 shrink-0">{new Date(a.created_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                    <span className="text-slate-600">{a.description}</span>
                  </div>
                ))}
                {myActivities.length === 0 && <p className="text-sm text-slate-400">No activity yet.</p>}
              </div>
            </div>
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
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`tnum ${bold ? 'font-bold text-slate-900' : 'font-medium'} ${tone === 'emerald' ? 'text-emerald-600' : 'text-slate-800'}`}>{value}</span>
    </div>
  );
}