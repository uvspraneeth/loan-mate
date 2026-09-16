import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { BadgeCheck, ShieldAlert, MessageCircle, Smartphone, X, ExternalLink } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { recordAndMarkPaid, rejectPayment, logNotification } from '@/lib/paymentService';
import { buildPaymentConfirmation, buildConfirmationSMS, whatsappUrl, smsUrl } from '@/lib/messages';
import { formatINR } from '@/lib/money';
import StatusBadge from '@/components/StatusBadge';

export default function PaymentVerificationDrawer({ open, onOpenChange, payment, borrower, loan, installment, allInstallments, settings, onDone }) {
  const { user } = useAuth();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null); // { message, sms } after mark paid

  if (!payment) return null;

  const expected = installment?.total_due || 0;
  const submitted = payment.amount || 0;
  const matches = submitted >= expected;

  const handleMarkPaid = async () => {
    setSaving(true);
    try {
      const res = await recordAndMarkPaid({
        installment,
        loan,
        borrower,
        amount: submitted,
        paymentDate: payment.payment_date,
        paymentMethod: payment.payment_method,
        transactionReference: payment.transaction_reference,
        proofUrl: payment.proof_url,
        notes: payment.notes,
        user,
      });
      const updatedInstallments = allInstallments.map((i) => (i.id === installment.id ? { ...i, status: 'paid', amount_paid: submitted } : i));
      const message = buildPaymentConfirmation({ borrower, installment: { ...installment, amount_paid: submitted }, loan, installments: updatedInstallments, settings });
      const sms = buildConfirmationSMS({ borrower, installment: { ...installment, amount_paid: submitted }, installments: updatedInstallments });
      setResult({ message, sms });
      onDone?.();
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    setSaving(true);
    try {
      await rejectPayment({ installment, loan, borrower, user, reason });
      onDone?.();
      onOpenChange(false);
      setRejecting(false);
      setReason('');
    } finally {
      setSaving(false);
    }
  };

  const sendWhatsAppConfirm = async () => {
    const url = whatsappUrl(borrower.whatsapp_number || borrower.phone, result.message);
    window.open(url, '_blank');
    await logNotification({ borrower, loan, installment, channel: 'whatsapp', messageType: 'payment_confirmed', message: result.message, status: 'opened' });
  };

  const sendSMSConfirm = async () => {
    const url = smsUrl(borrower.phone, result.sms);
    window.open(url, '_blank');
    await logNotification({ borrower, loan, installment, channel: 'sms', messageType: 'payment_confirmed', message: result.sms, status: 'opened' });
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setResult(null); }}>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-6 py-5 border-b border-slate-100">
          <SheetTitle className="flex items-center gap-2">
            Payment Verification
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5 space-y-5">
          {/* Borrower */}
          <div>
            <p className="text-xs text-slate-400">Borrower</p>
            <p className="text-lg font-semibold text-slate-900">{borrower?.name}</p>
            <p className="text-sm text-slate-500">{borrower?.phone}</p>
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-400">Expected</p>
              <p className="text-lg font-semibold tnum">{formatINR(expected)}</p>
            </div>
            <div className={`rounded-lg border p-3 ${matches ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <p className="text-xs text-slate-400">Submitted</p>
              <p className="text-lg font-semibold tnum">{formatINR(submitted)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-slate-400">Payment Date</p><p className="font-medium">{new Date(payment.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
            <div><p className="text-xs text-slate-400">Method</p><p className="font-medium">{payment.payment_method}</p></div>
            <div className="col-span-2"><p className="text-xs text-slate-400">Transaction Reference</p><p className="font-medium font-mono text-xs">{payment.transaction_reference || '—'}</p></div>
          </div>

          {/* Proof */}
          <div>
            <p className="text-xs text-slate-400 mb-2">Payment Proof</p>
            {payment.proof_url ? (
              payment.proof_url.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                <a href={payment.proof_url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-slate-200">
                  <img src={payment.proof_url} alt="payment proof" className="w-full object-contain max-h-64 bg-slate-50" />
                </a>
              ) : (
                <a href={payment.proof_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm text-sky-600 hover:bg-slate-50">
                  <ExternalLink className="h-4 w-4" /> View proof document
                </a>
              )
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">No proof attached</div>
            )}
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
              <ShieldAlert className="h-3.5 w-3.5" />
              Payment proof has NOT been verified
            </div>
          </div>

          {/* Result / confirmation message */}
          {result && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                <BadgeCheck className="h-4 w-4" /> Verified — payment recorded
              </div>
              <div className="rounded-lg bg-white border border-emerald-100 p-3 text-sm text-slate-600 whitespace-pre-line">
                {result.message}
              </div>
              <p className="text-xs text-slate-500">Send confirmation to borrower:</p>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={sendWhatsAppConfirm} className="bg-emerald-600 hover:bg-emerald-700">
                  <MessageCircle className="h-4 w-4 mr-1" /> Send WhatsApp
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={sendSMSConfirm}>
                  <Smartphone className="h-4 w-4 mr-1" /> Send SMS
                </Button>
              </div>
            </div>
          )}

          {rejecting && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Reason for rejection</p>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-200 p-2 text-sm" placeholder="e.g. Amount mismatch, unclear screenshot" />
            </div>
          )}
        </div>

        <SheetFooter className="px-6 py-4 border-t border-slate-100 flex-row gap-2">
          {!result && (
            <>
              {rejecting ? (
                <>
                  <Button variant="outline" onClick={() => setRejecting(false)} className="flex-1">Cancel</Button>
                  <Button variant="destructive" onClick={handleReject} disabled={saving} className="flex-1">{saving ? 'Rejecting…' : 'Confirm Reject'}</Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setRejecting(true)} className="flex-1">Reject</Button>
                  <Button onClick={handleMarkPaid} disabled={saving} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                    <BadgeCheck className="h-4 w-4 mr-1" /> {saving ? 'Verifying…' : 'Mark Paid'}
                  </Button>
                </>
              )}
            </>
          )}
          {result && (
            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">Close</Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}