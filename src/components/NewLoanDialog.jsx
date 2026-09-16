import { db } from '@/api/supabaseClient';

import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { calculateLoanSummary, generateInstallments, REPAYMENT_TYPE_LABELS, toISODate, addMonths } from '@/lib/loanCalc';
import { formatINR } from '@/lib/money';

export default function NewLoanDialog({ open, onOpenChange, borrowers, onCreated, preselectedBorrowerId }) {
  const [form, setForm] = useState({
    borrower_id: preselectedBorrowerId || '',
    principal_amount: '',
    monthly_interest_rate: '2',
    repayment_type: 'principal_and_interest',
    loan_start_date: toISODate(new Date()),
    first_due_date: '',
    term_months: '10',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setSelect = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const summary = useMemo(() => {
    if (!form.principal_amount || !form.term_months) return null;
    return calculateLoanSummary({
      principal_amount: parseFloat(form.principal_amount) || 0,
      monthly_interest_rate: parseFloat(form.monthly_interest_rate) || 0,
      repayment_type: form.repayment_type,
      term_months: parseInt(form.term_months) || 1,
    });
  }, [form.principal_amount, form.term_months, form.monthly_interest_rate, form.repayment_type]);

  const firstDueDefault = form.loan_start_date ? toISODate(addMonths(form.loan_start_date, 1)) : '';
  const firstDue = form.first_due_date || firstDueDefault;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.borrower_id || !form.principal_amount || !form.term_months) return;
    setSaving(true);
    try {
      const principal = Math.round(parseFloat(form.principal_amount));
      const monthlyRate = parseFloat(form.monthly_interest_rate) || 0;
      const term = parseInt(form.term_months);
      const calc = calculateLoanSummary({
        principal_amount: principal,
        monthly_interest_rate: monthlyRate,
        repayment_type: form.repayment_type,
        term_months: term,
      });
      const count = await db.entities.Loan.list('-created_date', 1);
      const loanNumber = `LN-${1000 + (count.length + 1)}`;
      const maturity = toISODate(addMonths(firstDue, term - 1));
      const loan = await db.entities.Loan.create({
        borrower_id: form.borrower_id,
        loan_number: loanNumber,
        principal_amount: principal,
        annual_interest_rate: Math.round(monthlyRate * 12 * 100) / 100,
        monthly_interest_rate: monthlyRate,
        interest_method: 'flat_interest',
        repayment_type: form.repayment_type,
        loan_start_date: form.loan_start_date,
        first_due_date: firstDue,
        maturity_date: maturity,
        monthly_due_amount: calc.monthlyDue,
        term_months: term,
        payment_frequency: 'monthly',
        status: 'active',
        notes: form.notes,
      });
      const installments = generateInstallments({
        ...loan,
        first_due_date: firstDue,
      });
      await db.entities.Installment.bulkCreate(installments.map((i) => ({ ...i, loan_id: loan.id })));
      await db.entities.Activity.create({
        borrower_id: form.borrower_id,
        loan_id: loan.id,
        activity_type: 'loan_created',
        description: `Loan ${loanNumber} created for ${formatINR(principal)} at ${monthlyRate}%/mo for ${term} months`,
        metadata: { principal, term, monthly_rate: monthlyRate },
      });
      onCreated?.(loan);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Loan</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Borrower *</Label>
            <Select value={form.borrower_id} onValueChange={setSelect('borrower_id')}>
              <SelectTrigger><SelectValue placeholder="Select borrower" /></SelectTrigger>
              <SelectContent>
                {borrowers.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Principal Amount (₹) *</Label>
              <Input type="number" value={form.principal_amount} onChange={set('principal_amount')} placeholder="100000" required />
            </div>
            <div className="space-y-1.5">
              <Label>Term (Months) *</Label>
              <Input type="number" value={form.term_months} onChange={set('term_months')} placeholder="10" required />
            </div>
            <div className="space-y-1.5">
              <Label>Monthly Interest Rate (%)</Label>
              <Input type="number" step="0.1" value={form.monthly_interest_rate} onChange={set('monthly_interest_rate')} placeholder="2" />
            </div>
            <div className="space-y-1.5">
              <Label>Repayment Type</Label>
              <Select value={form.repayment_type} onValueChange={setSelect('repayment_type')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(REPAYMENT_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Loan Start Date *</Label>
              <Input type="date" value={form.loan_start_date} onChange={set('loan_start_date')} required />
            </div>
            <div className="space-y-1.5">
              <Label>First Due Date</Label>
              <Input type="date" value={firstDue} onChange={set('first_due_date')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Optional" />
          </div>

          {summary && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-4">
              <p className="text-xs font-semibold text-emerald-700 mb-2">Calculated Schedule</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <div className="text-slate-500">Monthly Due</div><div className="font-semibold text-right tnum">{formatINR(summary.monthlyDue)}</div>
                {summary.repaymentType === 'interest_only' ? (
                  <>
                    <div className="text-slate-500">Principal Outstanding</div><div className="font-semibold text-right tnum">{formatINR(summary.principalOutstanding)}</div>
                    <div className="text-slate-500">Total Interest (Scheduled)</div><div className="font-semibold text-right tnum">{formatINR(summary.totalInterest)}</div>
                  </>
                ) : (
                  <>
                    <div className="text-slate-500">Total Interest</div><div className="font-semibold text-right tnum">{formatINR(summary.totalInterest)}</div>
                    <div className="text-slate-500">Total Payable</div><div className="font-semibold text-right tnum">{formatINR(summary.totalPayable)}</div>
                  </>
                )}
                <div className="text-slate-500">Installments</div><div className="font-semibold text-right tnum">{summary.term}</div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.borrower_id || !form.principal_amount} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Creating…' : 'Create Loan & Schedule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}