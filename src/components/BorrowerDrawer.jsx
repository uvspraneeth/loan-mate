import { useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { MessageCircle, Smartphone, Plus, Phone, MapPin, Mail } from 'lucide-react';
import { formatINR } from '@/lib/money';
import { deriveLoanBalance, toISODate } from '@/lib/loanCalc';
import { buildDueReminder, buildPaymentRequest, whatsappUrl, smsUrl } from '@/lib/messages';
import { logNotification } from '@/lib/paymentService';
import StatusBadge from '@/components/StatusBadge';

export default function BorrowerDrawer({ open, onOpenChange, borrower, loans, installments, payments, activities, notifications, settings, onNewLoan, onOpenLoan, onReload }) {
  const myLoans = useMemo(() => loans.filter((l) => l.borrower_id === borrower?.id), [loans, borrower]);
  const myInstallments = useMemo(() => installments.filter((i) => myLoans.some((l) => l.id === i.loan_id)), [installments, myLoans]);
  const myPayments = useMemo(() => payments.filter((p) => p.borrower_id === borrower?.id).sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date)), [payments, borrower]);
  const myActivities = useMemo(() => activities.filter((a) => a.borrower_id === borrower?.id).sort((a, b) => new Date(b.created_date) - new Date(a.created_date)), [activities, borrower]);
  const myNotifs = useMemo(() => notifications.filter((n) => n.borrower_id === borrower?.id).sort((a, b) => new Date(b.created_date) - new Date(a.created_date)), [notifications, borrower]);

  if (!borrower) return null;

  const totalBorrowed = myLoans.reduce((s, l) => s + (l.principal_amount || 0), 0);
  let totalPaid = 0, outstanding = 0;
  for (const l of myLoans) {
    const bal = deriveLoanBalance(myInstallments.filter((i) => i.loan_id === l.id));
    totalPaid += bal.totalPaid;
    outstanding += bal.outstanding;
  }
  const nextInst = myInstallments
    .filter((i) => i.status !== 'paid' && i.status !== 'waived')
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0];

  const sendReminder = async (channel) => {
    if (!nextInst) return;
    const loan = myLoans.find((l) => l.id === nextInst.loan_id);
    const msg = buildDueReminder({ borrower, installment: nextInst, loan, settings });
    if (channel === 'whatsapp') window.open(whatsappUrl(borrower.whatsapp_number || borrower.phone, msg), '_blank');
    else window.open(smsUrl(borrower.phone, buildPaymentRequest({ borrower, installment: nextInst, settings })), '_blank');
    await logNotification({ borrower, loan, installment: nextInst, channel, messageType: 'due_reminder', message: msg, status: 'opened' });
    onReload?.();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-6 py-5 border-b border-slate-100">
          <SheetTitle>{borrower.name}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5 space-y-6">
          {/* Contact */}
          <div className="space-y-1.5 text-sm">
            {borrower.phone && <p className="flex items-center gap-2 text-slate-600"><Phone className="h-3.5 w-3.5 text-slate-400" /> {borrower.phone}</p>}
            {borrower.whatsapp_number && <p className="flex items-center gap-2 text-slate-600"><MessageCircle className="h-3.5 w-3.5 text-emerald-500" /> {borrower.whatsapp_number}</p>}
            {borrower.email && <p className="flex items-center gap-2 text-slate-600"><Mail className="h-3.5 w-3.5 text-slate-400" /> {borrower.email}</p>}
            {borrower.address && <p className="flex items-center gap-2 text-slate-600"><MapPin className="h-3.5 w-3.5 text-slate-400" /> {borrower.address}</p>}
            {borrower.notes && <p className="text-slate-500 italic mt-2">{borrower.notes}</p>}
          </div>

          {/* Financial summary */}
          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Financial Summary</h3>
            <div className="grid grid-cols-2 gap-y-2.5 text-sm">
              <span className="text-slate-500">Total Borrowed</span><span className="font-semibold text-right tnum">{formatINR(totalBorrowed)}</span>
              <span className="text-slate-500">Total Paid</span><span className="font-semibold text-right tnum text-emerald-600">{formatINR(totalPaid)}</span>
              <span className="text-slate-500">Outstanding</span><span className="font-semibold text-right tnum text-slate-900">{formatINR(outstanding)}</span>
              <span className="text-slate-500">Next Due</span><span className="font-semibold text-right tnum">{nextInst ? formatINR(nextInst.total_due - (nextInst.amount_paid || 0)) : '—'}</span>
              <span className="text-slate-500">Due Date</span><span className="font-semibold text-right">{nextInst ? new Date(nextInst.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
            </div>
            {nextInst && (
              <div className="flex gap-2 mt-4">
                <Button size="sm" onClick={() => sendReminder('whatsapp')} className="bg-emerald-600 hover:bg-emerald-700 flex-1"><MessageCircle className="h-4 w-4 mr-1" /> WhatsApp</Button>
                <Button size="sm" variant="outline" onClick={() => sendReminder('sms')} className="flex-1"><Smartphone className="h-4 w-4 mr-1" /> SMS</Button>
              </div>
            )}
          </div>

          {/* Active loans */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Loans</h3>
            <div className="space-y-2">
              {myLoans.map((l) => {
                const bal = deriveLoanBalance(myInstallments.filter((i) => i.loan_id === l.id));
                return (
                  <button key={l.id} onClick={() => onOpenLoan?.(l.id)} className="w-full text-left rounded-lg border border-slate-200 p-3 hover:border-emerald-300 hover:bg-emerald-50/30">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">{l.loan_number}</span>
                      <StatusBadge status={l.status} />
                    </div>
                    <div className="flex justify-between mt-1 text-sm">
                      <span className="text-slate-400">Outstanding</span>
                      <span className="font-semibold tnum">{formatINR(bal.outstanding)}</span>
                    </div>
                  </button>
                );
              })}
              {myLoans.length === 0 && <p className="text-sm text-slate-400">No loans yet.</p>}
            </div>
            <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => onNewLoan?.(borrower.id)}><Plus className="h-4 w-4 mr-1" /> New Loan</Button>
          </div>

          {/* Payment history */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Payment History</h3>
            <div className="space-y-2">
              {myPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="text-slate-700">{new Date(p.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                    <p className="text-xs text-slate-400">{p.payment_method}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tnum">{formatINR(p.amount)}</p>
                    {p.verified ? <span className="text-xs text-emerald-600">Verified</span> : <span className="text-xs text-amber-600">Pending</span>}
                  </div>
                </div>
              ))}
              {myPayments.length === 0 && <p className="text-sm text-slate-400">No payments recorded.</p>}
            </div>
          </div>

          {/* Communication history */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Communication History</h3>
            <div className="space-y-2">
              {myNotifs.map((n) => (
                <div key={n.id} className="flex items-center gap-2 text-sm">
                  <span className={`h-1.5 w-1.5 rounded-full ${n.channel === 'whatsapp' ? 'bg-emerald-500' : 'bg-sky-500'}`} />
                  <span className="text-slate-400 w-16">{new Date(n.created_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                  <span className="text-slate-600 capitalize">{n.channel} {n.message_type.replace(/_/g, ' ')}</span>
                </div>
              ))}
              {myNotifs.length === 0 && <p className="text-sm text-slate-400">No messages sent yet.</p>}
            </div>
          </div>

          {/* Activity timeline */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Activity Timeline</h3>
            <div className="space-y-2">
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
      </SheetContent>
    </Sheet>
  );
}