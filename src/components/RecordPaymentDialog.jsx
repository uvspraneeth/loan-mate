import { db } from '@/api/supabaseClient';

import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, X } from 'lucide-react';

import { useAuth } from '@/lib/AuthContext';
import { recordAndMarkPaid } from '@/lib/paymentService';
import { formatINR } from '@/lib/money';
import { toISODate } from '@/lib/loanCalc';

export default function RecordPaymentDialog({ open, onOpenChange, installment, loan, borrower, onDone }) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    amount: '',
    payment_date: toISODate(new Date()),
    payment_method: 'UPI',
    transaction_reference: '',
    notes: '',
  });
  const [proofUrl, setProofUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const expected = installment?.total_due || 0;

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await db.integrations.Core.UploadPublicFile({ file });
      setProofUrl(file_url);
    } catch (e) {
      console.error('upload error', e);
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!installment || !loan || !borrower) return;
    setSaving(true);
    try {
      await recordAndMarkPaid({
        installment,
        loan,
        borrower,
        amount: form.amount || expected,
        paymentDate: form.payment_date,
        paymentMethod: form.payment_method,
        transactionReference: form.transaction_reference,
        proofUrl,
        notes: form.notes,
        user,
      });
      onDone?.();
      onOpenChange(false);
      setForm({ amount: '', payment_date: toISODate(new Date()), payment_method: 'UPI', transaction_reference: '', notes: '' });
      setProofUrl('');
    } finally {
      setSaving(false);
    }
  };

  if (!installment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Borrower</span><span className="font-medium">{borrower?.name}</span></div>
            <div className="flex justify-between mt-1"><span className="text-slate-500">Installment #{installment.installment_number}</span><span className="font-medium">Expected {formatINR(expected)}</span></div>
          </div>
          <div className="space-y-1.5">
            <Label>Amount Received (₹)</Label>
            <Input type="number" value={form.amount} onChange={set('amount')} placeholder={String(expected)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Payment Date</Label>
              <Input type="date" value={form.payment_date} onChange={set('payment_date')} required />
            </div>
            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <Select value={form.payment_method} onValueChange={(v) => setForm((f) => ({ ...f, payment_method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Transaction Reference</Label>
            <Input value={form.transaction_reference} onChange={set('transaction_reference')} placeholder="UPI123456 / TXN ref" />
          </div>
          <div className="space-y-1.5">
            <Label>Payment Proof (screenshot / PDF)</Label>
            {proofUrl ? (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
                <span className="text-xs text-emerald-600 font-medium flex-1 truncate">Proof attached</span>
                {proofUrl.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                  <img src={proofUrl} alt="proof" className="h-10 w-10 rounded object-cover" />
                ) : null}
                <button type="button" onClick={() => setProofUrl('')} className="text-slate-400 hover:text-red-500"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-4 text-sm text-slate-500 hover:border-emerald-400 hover:text-emerald-600"
              >
                <Upload className="h-4 w-4" />
                {uploading ? 'Uploading…' : 'Attach screenshot / PDF'}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0])} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Optional" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Saving…' : 'Confirm Payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}