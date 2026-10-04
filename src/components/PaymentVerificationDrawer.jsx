import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { BadgeCheck, ShieldAlert, ExternalLink, Info, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { recordAndMarkPaid, rejectPayment, logNotification } from '@/lib/paymentService';
import { buildReceipt, isCashMethod } from '@/lib/receipt';
import PaymentReceipt from '@/components/PaymentReceipt';
import { formatINR } from '@/lib/money';
import { toast } from '@/components/ui/use-toast';

export default function PaymentVerificationDrawer({ open, onOpenChange, payment, borrower, loan, installment, allInstallments, settings, onDone }) {
  const { user } = useAuth();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null); // receipt data after mark paid

  if (!payment) return null;

  const expected = Math.max(0, (installment?.total_due || 0) - (installment?.amount_paid || 0));
  const submitted = payment.amount || 0;
  const difference = submitted - expected; // < 0 short, > 0 overpaid
  const comparison = !installment ? 'unlinked' : difference < 0 ? 'short' : difference > 0 ? 'over' : 'exact';
  const paymentDate = payment.payment_date ? new Date(payment.payment_date) : null;

  const handleMarkPaid = async () => {
    if (!installment || !loan || !borrower) return;
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
        paymentId: payment.id,
      });
      const updatedInstallments = allInstallments.map((i) => (i.id === installment.id ? { ...i, ...res.installment } : i));
      setResult(buildReceipt({ payment: res.payment, installment: res.installment, loan, borrower, installments: updatedInstallments, settings }));
      onDone?.();
    } catch (err) {
      console.error('verify payment error', err);
      toast({ variant: 'destructive', title: 'Could not verify payment', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    setSaving(true);
    try {
      await rejectPayment({ payment, installment, loan, borrower, reason });
      onDone?.();
      onOpenChange(false);
      setRejecting(false);
      setReason('');
    } catch (err) {
      console.error('reject payment error', err);
      toast({ variant: 'destructive', title: 'Could not reject payment', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const logReceiptShare = (channel, text) => {
    logNotification({ borrower, loan, installment, channel, messageType: 'payment_receipt', message: text, status: 'opened' })
      .catch((err) => console.error('log receipt error', err));
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setResult(null); }}>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-6 py-5 border-b border-slate-100 text-left">
          <SheetTitle className="font-display flex items-center gap-2">
            Payment Verification
          </SheetTitle>
          <SheetDescription>Check the amount and proof before marking this installment paid.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5 space-y-5">
          {result ? (
            <PaymentReceipt receipt={result} onShared={logReceiptShare} title="Verified — share the receipt" />
          ) : (
          <>
          {/* Borrower */}
          <div className="min-w-0">
            <p className="text-xs text-slate-500">Borrower</p>
            <p className="text-lg font-semibold text-slate-900 truncate">{borrower?.name}</p>
            {borrower?.phone && <p className="text-sm text-slate-500 tnum">{borrower.phone}</p>}
            {(loan?.loan_number || installment) && (
              <p className="mt-0.5 text-xs text-slate-500">
                {loan?.loan_number}{loan?.loan_number && installment ? ' · ' : ''}{installment ? `Installment #${installment.installment_number}` : ''}
              </p>
            )}
          </div>

          {/* No linked installment notice */}
          {!installment && (
            <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                This payment isn&apos;t linked to an installment, so it can&apos;t be marked paid from here. You can still reject it, or record it from the loan&apos;s schedule instead.
              </p>
            </div>
          )}

          {/* Amounts: expected vs submitted */}
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-slate-200">
              <div className="p-3">
                <p className="text-xs text-slate-500">{installment?.amount_paid > 0 ? 'Remaining due' : 'Expected'}</p>
                <p className="text-lg font-semibold text-slate-900 tnum">{installment ? formatINR(expected) : '—'}</p>
              </div>
              <div className="p-3">
                <p className="text-xs text-slate-500">Submitted</p>
                <p className="text-lg font-semibold text-slate-900 tnum">{formatINR(submitted)}</p>
              </div>
            </div>
            {comparison !== 'unlinked' && (
              <div
                className={cn(
                  'flex flex-wrap items-center gap-x-1.5 gap-y-0.5 border-t px-3 py-2 text-sm font-medium',
                  comparison === 'exact' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                  comparison === 'short' && 'border-amber-200 bg-amber-50 text-amber-800',
                  comparison === 'over' && 'border-sky-200 bg-sky-50 text-sky-700'
                )}
              >
                {comparison === 'exact' && <><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> Matches the amount due</>}
                {comparison === 'short' && (
                  <><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> Short by <span className="tnum">{formatINR(-difference)}</span><span className="font-normal">— will be recorded as a partial payment</span></>
                )}
                {comparison === 'over' && <><Info className="h-4 w-4 shrink-0" aria-hidden="true" /> <span className="tnum">{formatINR(difference)}</span> more than due</>}
              </div>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-slate-500">Payment date</dt><dd className="font-medium">{paymentDate && !isNaN(paymentDate) ? paymentDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</dd></div>
            <div><dt className="text-xs text-slate-500">Method</dt><dd className="font-medium">{payment.payment_method || '—'}</dd></div>
            {!isCashMethod(payment.payment_method) && (
              <div className="col-span-2"><dt className="text-xs text-slate-500">Transaction reference</dt><dd className="font-medium font-mono text-xs break-all">{payment.transaction_reference || '—'}</dd></div>
            )}
          </dl>

          {/* Proof */}
          <div>
            <p className="text-xs text-slate-500 mb-2">Payment proof</p>
            {payment.proof_url ? (
              payment.proof_url.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                <a href={payment.proof_url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-slate-200" aria-label="Open payment proof image in a new tab">
                  <img src={payment.proof_url} alt="Payment proof submitted by borrower" className="w-full object-contain max-h-64 bg-slate-50" />
                </a>
              ) : (
                <a href={payment.proof_url} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm text-sky-700 hover:bg-slate-50">
                  <ExternalLink className="h-4 w-4" aria-hidden="true" /> View proof document
                </a>
              )
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">No proof attached</div>
            )}
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Proof isn&apos;t auto-verified — check your bank/UPI app before marking paid.
            </div>
          </div>

          {/* Result / confirmation message */}
          {rejecting && (
            <div className="space-y-2">
              <label htmlFor="reject-reason" className="text-sm font-medium text-slate-700">Reason for rejection</label>
              <textarea
                id="reject-reason"
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-200 p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                placeholder="e.g. Amount mismatch, unclear screenshot"
              />
            </div>
          )}
          </>
          )}
        </div>

        <SheetFooter className="px-6 py-4 border-t border-slate-100 flex-row gap-2 sm:space-x-0">
          {!result && (
            <>
              {rejecting ? (
                <>
                  <Button variant="outline" onClick={() => setRejecting(false)} className="h-10 flex-1">Cancel</Button>
                  <Button variant="destructive" onClick={handleReject} disabled={saving} className="h-10 flex-1">
                    {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {saving ? 'Rejecting…' : 'Confirm Reject'}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setRejecting(true)} className="h-10 flex-1">Reject</Button>
                  <Button onClick={handleMarkPaid} disabled={saving || !installment} title={installment ? undefined : 'This payment is not linked to an installment'} className="h-10 flex-1 bg-emerald-600 hover:bg-emerald-700">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BadgeCheck className="h-4 w-4" aria-hidden="true" />}
                    {saving ? 'Verifying…' : 'Mark Paid'}
                  </Button>
                </>
              )}
            </>
          )}
          {result && (
            <Button variant="outline" onClick={() => { onOpenChange(false); setResult(null); }} className="h-10 w-full">Close</Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}