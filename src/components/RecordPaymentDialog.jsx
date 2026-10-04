import { db } from '@/api/supabaseClient';

import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, X, Loader2, FileText, CheckCircle2 } from 'lucide-react';

import { useAuth } from '@/lib/AuthContext';
import { useLending } from '@/lib/LendingContext';
import { recordAndMarkPaid, logNotification } from '@/lib/paymentService';
import { formatINR } from '@/lib/money';
import { toISODate } from '@/lib/loanCalc';
import { buildReceipt, isCashMethod } from '@/lib/receipt';
import PaymentReceipt from '@/components/PaymentReceipt';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

// Matches the storage bucket limits for payment proofs.
const MAX_PROOF_BYTES = 10 * 1024 * 1024;

// Most repayments are handed over in cash, so it's the default and listed first.
const METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Other'];

const emptyForm = () => ({
  amount: '',
  payment_date: toISODate(new Date()),
  payment_method: 'Cash',
  transaction_reference: '',
  notes: '',
});

function isAllowedProof(file) {
  return file.type.startsWith('image/') || file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export default function RecordPaymentDialog({ open, onOpenChange, installment, loan, borrower, onDone }) {
  const { user } = useAuth();
  const { settings } = useLending();
  const [form, setForm] = useState(emptyForm);
  const [proofUrl, setProofUrl] = useState('');
  const [proofName, setProofName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState(null); // shown after the payment is saved
  const fileRef = useRef(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const isCash = isCashMethod(form.payment_method);

  const handleOpenChange = (v) => {
    if (!v) {
      setReceipt(null);
      setForm(emptyForm());
      setProofUrl('');
      setProofName('');
    }
    onOpenChange(v);
  };

  const logReceiptShare = (channel, text) => {
    logNotification({ borrower, loan, installment, channel, messageType: 'payment_receipt', message: text, status: 'opened' })
      .catch((err) => console.error('log receipt error', err));
  };

  // Remaining balance on this installment (accounts for earlier partial payments)
  const expected = Math.max(0, (installment?.total_due || 0) - (installment?.amount_paid || 0));
  // Interest still owed on this installment — offered as a quick-fill when it's less than the full amount.
  const interestRemaining = Math.max(0, (installment?.interest_due || 0) - (installment?.interest_paid || 0));
  const showInterestChip = interestRemaining > 0 && interestRemaining < expected;

  const enteredAmount = Number(form.amount) || 0;
  const shortBy = form.amount !== '' && enteredAmount > 0 && enteredAmount < expected ? expected - enteredAmount : 0;

  const handleUpload = async (file) => {
    if (!file) return;
    if (!isAllowedProof(file)) {
      toast({ variant: 'destructive', title: 'Unsupported file', description: 'Attach a screenshot/photo (image) or a PDF.' });
      return;
    }
    if (file.size > MAX_PROOF_BYTES) {
      toast({ variant: 'destructive', title: 'File too large', description: `Proof must be 10 MB or smaller (this one is ${(file.size / (1024 * 1024)).toFixed(1)} MB).` });
      return;
    }
    setUploading(true);
    try {
      const { file_url } = await db.integrations.Core.UploadPublicFile({ file });
      setProofUrl(file_url);
      setProofName(file.name);
    } catch (e) {
      console.error('upload error', e);
      toast({ variant: 'destructive', title: 'Upload failed', description: e.message });
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!installment || !loan || !borrower) return;
    setSaving(true);
    try {
      const res = await recordAndMarkPaid({
        installment,
        loan,
        borrower,
        amount: form.amount || expected,
        paymentDate: form.payment_date,
        paymentMethod: form.payment_method,
        // Cash has no transaction reference or screenshot
        transactionReference: isCash ? '' : form.transaction_reference,
        proofUrl: isCash ? '' : proofUrl,
        notes: form.notes,
        user,
      });
      let loanInstallments = [];
      try {
        loanInstallments = await db.entities.Installment.filter({ loan_id: loan.id });
      } catch (err) {
        console.error('receipt balance lookup failed', err);
      }
      setReceipt(buildReceipt({ payment: res.payment, installment: res.installment, loan, borrower, installments: loanInstallments, settings }));
      onDone?.();
    } catch (err) {
      console.error('record payment error', err);
      toast({ variant: 'destructive', title: 'Could not record payment', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (!installment) return null;

  const isImageProof = /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(proofUrl);
  const chips = [
    { key: 'full', label: 'Full', value: expected },
    ...(showInterestChip ? [{ key: 'interest', label: 'Interest only', value: interestRemaining }] : []),
  ];

  if (receipt) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md w-[calc(100%-2rem)] max-h-[92vh] overflow-y-auto rounded-xl bg-slate-50">
          <DialogHeader className="sr-only">
            <DialogTitle>Payment receipt</DialogTitle>
            <DialogDescription>Share this receipt with {borrower?.name} as proof of payment.</DialogDescription>
          </DialogHeader>
          <PaymentReceipt receipt={receipt} onShared={logReceiptShare} />
          <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} className="h-10 w-full text-slate-600">Done</Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto rounded-xl">
        <DialogHeader>
          <DialogTitle className="font-display">Record Payment</DialogTitle>
          <DialogDescription>Log money you received. You&apos;ll get a receipt to share with the borrower.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm space-y-1">
            <div className="flex justify-between gap-3"><span className="text-slate-500">Borrower</span><span className="font-medium text-right truncate">{borrower?.name}</span></div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Installment #{installment.installment_number}</span>
              <span className="font-medium tnum">{installment.amount_paid > 0 ? 'Remaining' : 'Expected'} {formatINR(expected)}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rp-amount">Amount received (₹)</Label>
            <Input
              id="rp-amount"
              type="number"
              inputMode="numeric"
              min="1"
              value={form.amount}
              onChange={set('amount')}
              placeholder={String(expected)}
              className="h-11 tnum"
              aria-describedby="rp-amount-hint"
            />
            <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Quick fill amount">
              {chips.map((c) => {
                const selected = form.amount !== '' && enteredAmount === c.value;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, amount: String(c.value) }))}
                    aria-pressed={selected}
                    className={cn(
                      'inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
                      selected ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700'
                    )}
                  >
                    {c.label} <span className="tnum">{formatINR(c.value)}</span>
                  </button>
                );
              })}
            </div>
            <p id="rp-amount-hint" className={cn('min-h-4 text-xs', shortBy > 0 ? 'text-amber-700' : 'text-slate-500')} aria-live="polite">
              {shortBy > 0
                ? `Partial payment — ${formatINR(shortBy)} will remain on this installment.`
                : form.amount === '' ? `Leave blank to record the full ${formatINR(expected)}.` : ''}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rp-date">Payment date</Label>
              <Input id="rp-date" type="date" value={form.payment_date} onChange={set('payment_date')} className="h-11" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rp-method">Payment method</Label>
              <Select value={form.payment_method} onValueChange={(v) => setForm((f) => ({ ...f, payment_method: v }))}>
                <SelectTrigger id="rp-method" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!isCash && (
          <>
          <div className="space-y-1.5">
            <Label htmlFor="rp-ref">Transaction reference <span className="font-normal text-slate-400">(optional)</span></Label>
            <Input id="rp-ref" value={form.transaction_reference} onChange={set('transaction_reference')} placeholder="UPI123456 / TXN ref" autoComplete="off" className="h-11" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rp-proof-button">Payment proof <span className="font-normal text-slate-400">(optional)</span></Label>
            {proofUrl ? (
              <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2">
                {isImageProof ? (
                  <img src={proofUrl} alt="Attached payment proof" className="h-10 w-10 shrink-0 rounded object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-white text-emerald-600 ring-1 ring-emerald-100">
                    <FileText className="h-5 w-5" aria-hidden="true" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Proof attached
                  </p>
                  {proofName && <p className="truncate text-xs text-slate-500">{proofName}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => { setProofUrl(''); setProofName(''); }}
                  aria-label="Remove attached proof"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-red-500"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button
                id="rp-proof-button"
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                aria-busy={uploading}
                className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-600 hover:border-emerald-400 hover:text-emerald-700 disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <span className="flex items-center gap-2 font-medium">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
                  {uploading ? 'Uploading…' : 'Attach screenshot / PDF'}
                </span>
                <span className="text-xs text-slate-400">Image or PDF, up to 10 MB</span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                handleUpload(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
          </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="rp-notes">Notes</Label>
            <Textarea id="rp-notes" value={form.notes} onChange={set('notes')} rows={2} placeholder="Optional" />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} className="h-10">Cancel</Button>
            <Button type="submit" disabled={saving || uploading} className="h-10 bg-emerald-600 hover:bg-emerald-700">
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {saving ? 'Saving…' : `Confirm ${formatINR(form.amount || expected)}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
