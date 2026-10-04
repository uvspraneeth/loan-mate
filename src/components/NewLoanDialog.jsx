import { db } from '@/api/supabaseClient';

import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, CalendarRange } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { calculateLoanSummary, generateInstallments, REPAYMENT_TYPE_LABELS, toISODate, addMonths, nextLoanNumber } from '@/lib/loanCalc';
import { formatINR } from '@/lib/money';
import { toast } from '@/components/ui/use-toast';

const emptyForm = (borrowerId) => ({
  borrower_id: borrowerId || '',
  principal_amount: '',
  monthly_interest_rate: '2',
  repayment_type: 'principal_and_interest',
  loan_start_date: toISODate(new Date()),
  first_due_date: '',
  term_months: '10',
  notes: '',
});

// Date-only strings ('YYYY-MM-DD') are parsed as local dates to avoid a UTC off-by-one.
function formatDay(v) {
  if (!v) return '';
  const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function NewLoanDialog({ open, onOpenChange, borrowers, onCreated, preselectedBorrowerId }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(() => emptyForm(preselectedBorrowerId));
  const [saving, setSaving] = useState(false);

  // The dialog stays mounted, so reset the form (and preselected borrower) each time it opens.
  useEffect(() => {
    if (open) setForm(emptyForm(preselectedBorrowerId));
  }, [open, preselectedBorrowerId]);

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

  // Inline validation: principal > 0, term is a whole number ≥ 1.
  const principalNum = parseFloat(form.principal_amount);
  const termNum = Number(form.term_months);
  const principalValid = Number.isFinite(principalNum) && principalNum > 0;
  const termValid = Number.isInteger(termNum) && termNum >= 1;
  const principalError = form.principal_amount !== '' && !principalValid ? 'Enter an amount greater than ₹0' : null;
  const termError = form.term_months !== '' && !termValid ? 'Enter a whole number of months (1 or more)' : null;
  const hasBorrowers = borrowers.length > 0;
  const canSubmit = !saving && !!form.borrower_id && principalValid && termValid;
  const lastDue = termValid && firstDue ? toISODate(addMonths(firstDue, termNum - 1)) : '';

  const goAddBorrower = () => {
    onOpenChange(false);
    navigate('/borrowers?new=1');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.borrower_id || !form.principal_amount || !form.term_months) return;
    if (!principalValid || !termValid) return;
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
      const existing = await db.entities.Loan.list('-created_date');
      const loanNumber = nextLoanNumber(existing.map((l) => l.loan_number));
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
      toast({ title: `Loan ${loanNumber} created` });
    } catch (err) {
      console.error('create loan error', err);
      toast({ variant: 'destructive', title: 'Could not create loan', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Create New Loan</DialogTitle>
          <DialogDescription>Set the amount, interest and term. The monthly installment schedule is generated for you.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={hasBorrowers ? 'nl-borrower' : undefined}>Borrower *</Label>
            {hasBorrowers ? (
              <Select value={form.borrower_id} onValueChange={setSelect('borrower_id')}>
                <SelectTrigger id="nl-borrower" className="h-10"><SelectValue placeholder="Select borrower" /></SelectTrigger>
                <SelectContent>
                  {borrowers.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex flex-col gap-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-amber-800">No borrowers yet. Add the person you are lending to first, then come back to create their loan.</p>
                <Button type="button" onClick={goAddBorrower} className="h-10 shrink-0 bg-emerald-600 hover:bg-emerald-700 sm:h-9">
                  <UserPlus className="h-4 w-4" /> Add borrower
                </Button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="nl-principal">Principal Amount (₹) *</Label>
              <Input
                id="nl-principal"
                type="number"
                inputMode="numeric"
                min="1"
                value={form.principal_amount}
                onChange={set('principal_amount')}
                placeholder="100000"
                required
                aria-invalid={!!principalError}
                aria-describedby="nl-principal-help"
                className={`h-10 tnum ${principalError ? 'border-red-300 focus-visible:ring-red-400' : ''}`}
              />
              <p id="nl-principal-help" className={`text-xs ${principalError ? 'text-red-600' : 'text-slate-400'}`}>
                {principalError || (principalValid ? formatINR(principalNum) : 'Amount lent, in rupees')}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nl-term">Term (Months) *</Label>
              <Input
                id="nl-term"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={form.term_months}
                onChange={set('term_months')}
                placeholder="10"
                required
                aria-invalid={!!termError}
                aria-describedby="nl-term-help"
                className={`h-10 tnum ${termError ? 'border-red-300 focus-visible:ring-red-400' : ''}`}
              />
              <p id="nl-term-help" className={`text-xs ${termError ? 'text-red-600' : 'text-slate-400'}`}>
                {termError || 'Number of monthly installments'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nl-rate">Monthly Interest Rate (%)</Label>
              <Input
                id="nl-rate"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                value={form.monthly_interest_rate}
                onChange={set('monthly_interest_rate')}
                placeholder="2"
                aria-describedby="nl-rate-help"
                className="h-10 tnum"
              />
              <p id="nl-rate-help" className="text-xs text-slate-400 tnum">
                ≈ {Math.round((parseFloat(form.monthly_interest_rate) || 0) * 1200) / 100}% per year, flat
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nl-type">Repayment Type</Label>
              <Select value={form.repayment_type} onValueChange={setSelect('repayment_type')}>
                <SelectTrigger id="nl-type" className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(REPAYMENT_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400">
                {form.repayment_type === 'interest_only' ? 'Only interest is collected monthly; principal stays outstanding' : 'Equal principal plus interest every month'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nl-start">Loan Start Date *</Label>
              <Input id="nl-start" type="date" value={form.loan_start_date} onChange={set('loan_start_date')} required className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nl-first-due">First Due Date</Label>
              <Input id="nl-first-due" type="date" value={firstDue} onChange={set('first_due_date')} aria-describedby="nl-first-due-help" className="h-10" />
              <p id="nl-first-due-help" className="text-xs text-slate-400">Defaults to one month after the start date</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nl-notes">Notes</Label>
            <Textarea id="nl-notes" value={form.notes} onChange={set('notes')} rows={2} placeholder="Optional" />
          </div>

          {summary && principalValid && termValid && (
            <div className="overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/60" aria-live="polite">
              <div className="flex items-end justify-between gap-3 border-b border-emerald-100 px-4 py-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Monthly installment</p>
                  <p className="font-display text-2xl font-bold text-slate-900 tnum">{formatINR(summary.monthlyDue)}</p>
                </div>
                <p className="pb-1 text-right text-xs text-slate-500 tnum">× {summary.term} {summary.term === 1 ? 'month' : 'months'}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-4 py-3 text-sm">
                <dt className="text-slate-500">Principal</dt><dd className="text-right font-medium text-slate-800 tnum">{formatINR(summary.principal)}</dd>
                {summary.repaymentType === 'interest_only' ? (
                  <>
                    <dt className="text-slate-500">Total Interest (Scheduled)</dt><dd className="text-right font-medium text-slate-800 tnum">{formatINR(summary.totalInterest)}</dd>
                    <dt className="font-medium text-slate-700">Principal Outstanding</dt><dd className="text-right font-semibold text-slate-900 tnum">{formatINR(summary.principalOutstanding)}</dd>
                  </>
                ) : (
                  <>
                    <dt className="text-slate-500">Total Interest</dt><dd className="text-right font-medium text-slate-800 tnum">{formatINR(summary.totalInterest)}</dd>
                    <dt className="font-medium text-slate-700">Total Payable</dt><dd className="text-right font-semibold text-slate-900 tnum">{formatINR(summary.totalPayable)}</dd>
                  </>
                )}
              </dl>
              {firstDue && lastDue && (
                <div className="flex items-center gap-2 border-t border-emerald-100 px-4 py-2.5 text-xs text-slate-600">
                  <CalendarRange className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                  <span className="tnum">First due {formatDay(firstDue)} · Last due {formatDay(lastDue)}</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-10 sm:h-9">Cancel</Button>
            <Button type="submit" disabled={!canSubmit} className="h-10 bg-emerald-600 hover:bg-emerald-700 sm:h-9">
              {saving ? 'Creating…' : 'Create Loan & Schedule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}