import { db } from '@/api/supabaseClient';

import { useState, useRef } from 'react';
import { useLending } from '@/lib/LendingContext';

import { Button } from '@/components/ui/button';
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react';
import { toCSV, downloadCSV, parseCSV, rowsToObjects } from '@/lib/csv';
import { calculateLoanSummary, generateInstallments, repaymentTypeLabel, toISODate, addMonths } from '@/lib/loanCalc';
import { formatINR } from '@/lib/money';

export default function ImportExport() {
  const { borrowers, loans, installments, payments, reload } = useLending();
  const [preview, setPreview] = useState([]);
  const [errors, setErrors] = useState([]);
  const fileRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(null);

  const exportBorrowers = () => {
    const csv = toCSV(borrowers, [
      { label: 'Name', get: (b) => b.name },
      { label: 'Phone', get: (b) => b.phone || '' },
      { label: 'WhatsApp', get: (b) => b.whatsapp_number || '' },
      { label: 'Email', get: (b) => b.email || '' },
      { label: 'Address', get: (b) => b.address || '' },
      { label: 'Notes', get: (b) => b.notes || '' },
    ]);
    downloadCSV('borrowers.csv', csv);
  };

  const exportLoans = () => {
    const bmap = Object.fromEntries(borrowers.map((b) => [b.id, b]));
    const csv = toCSV(loans, [
      { label: 'Loan Number', get: (l) => l.loan_number },
      { label: 'Borrower', get: (l) => bmap[l.borrower_id]?.name || '' },
      { label: 'Principal', get: (l) => l.principal_amount },
      { label: 'Monthly Rate %', get: (l) => l.monthly_interest_rate },
      { label: 'Repayment Type', get: (l) => repaymentTypeLabel(l) },
      { label: 'Term Months', get: (l) => l.term_months },
      { label: 'Start Date', get: (l) => l.loan_start_date },
      { label: 'First Due', get: (l) => l.first_due_date },
      { label: 'Monthly Due', get: (l) => l.monthly_due_amount },
      { label: 'Status', get: (l) => l.status },
    ]);
    downloadCSV('loans.csv', csv);
  };

  const exportInstallments = () => {
    const lmap = Object.fromEntries(loans.map((l) => [l.id, l]));
    const csv = toCSV(installments, [
      { label: 'Loan Number', get: (i) => lmap[i.loan_id]?.loan_number || '' },
      { label: '#', get: (i) => i.installment_number },
      { label: 'Due Date', get: (i) => i.due_date },
      { label: 'Principal Due', get: (i) => i.principal_due },
      { label: 'Interest Due', get: (i) => i.interest_due },
      { label: 'Total Due', get: (i) => i.total_due },
      { label: 'Amount Paid', get: (i) => i.amount_paid },
      { label: 'Status', get: (i) => i.status },
    ]);
    downloadCSV('installments.csv', csv);
  };

  const exportPayments = () => {
    const bmap = Object.fromEntries(borrowers.map((b) => [b.id, b]));
    const lmap = Object.fromEntries(loans.map((l) => [l.id, l]));
    const csv = toCSV(payments, [
      { label: 'Borrower', get: (p) => bmap[p.borrower_id]?.name || '' },
      { label: 'Loan Number', get: (p) => lmap[p.loan_id]?.loan_number || '' },
      { label: 'Amount', get: (p) => p.amount },
      { label: 'Payment Date', get: (p) => p.payment_date },
      { label: 'Method', get: (p) => p.payment_method },
      { label: 'Reference', get: (p) => p.transaction_reference || '' },
      { label: 'Verified', get: (p) => (p.verified ? 'Yes' : 'No') },
    ]);
    downloadCSV('payments.csv', csv);
  };

  const handleFile = async (file) => {
    setDone(null);
    const text = await file.text();
    const rows = rowsToObjects(parseCSV(text));
    const errs = [];
    const valid = [];
    const existingNames = new Set(borrowers.map((b) => b.name.toLowerCase()));

    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      const name = (r.Name || r.name || '').trim();
      const principal = parseFloat(r.Principal || r.principal || r['Principal Amount'] || 0);
      const rate = parseFloat(r['Monthly Rate %'] || r.rate || r['Interest Rate'] || 2);
      const term = parseInt(r['Term Months'] || r.term || r['Loan Duration'] || 10);
      const start = (r['Start Date'] || r['Loan Start Date'] || toISODate(new Date())).trim();
      const firstDue = (r['First Due'] || r['First Due Date'] || '').trim();

      if (!name) { errs.push(`Row ${idx + 2}: Missing name`); continue; }
      if (!principal || principal <= 0) { errs.push(`Row ${idx + 2}: Invalid principal for ${name}`); continue; }
      if (!term || term <= 0) { errs.push(`Row ${idx + 2}: Invalid term for ${name}`); continue; }
      if (existingNames.has(name.toLowerCase())) { errs.push(`Row ${idx + 2}: Duplicate borrower "${name}"`); continue; }
      existingNames.add(name.toLowerCase());
      valid.push({ name, phone: r.Phone || r.phone || '', principal, rate, term, start, firstDue });
    }
    setErrors(errs);
    setPreview(valid);
  };

  const runImport = async () => {
    setImporting(true);
    let created = 0;
    try {
      for (const r of preview) {
        const borrower = await db.entities.Borrower.create({ name: r.name, phone: r.phone, whatsapp_number: r.phone });
        const calc = calculateLoanSummary({ principal_amount: r.principal, monthly_interest_rate: r.rate, interest_method: 'flat_interest', term_months: r.term });
        const firstDue = r.firstDue || toISODate(addMonths(r.start, 1));
        const count = await db.entities.Loan.list('-created_date', 1);
        const loanNumber = `LN-${1000 + count.length + 1}`;
        const loan = await db.entities.Loan.create({
          borrower_id: borrower.id,
          loan_number: loanNumber,
          principal_amount: r.principal,
          annual_interest_rate: Math.round(r.rate * 12 * 100) / 100,
          monthly_interest_rate: r.rate,
          interest_method: 'flat_interest',
          loan_start_date: r.start,
          first_due_date: firstDue,
          maturity_date: toISODate(addMonths(firstDue, r.term - 1)),
          monthly_due_amount: calc.monthlyDue,
          term_months: r.term,
          status: 'active',
        });
        const inst = generateInstallments({ ...loan, first_due_date: firstDue });
        await db.entities.Installment.bulkCreate(inst.map((i) => ({ ...i, loan_id: loan.id })));
        await db.entities.Activity.create({ borrower_id: borrower.id, loan_id: loan.id, activity_type: 'loan_imported', description: `Loan ${loanNumber} imported via CSV for ${formatINR(r.principal)}` });
        created++;
      }
      setDone(`${created} loan${created !== 1 ? 's' : ''} imported successfully.`);
      setPreview([]);
      setErrors([]);
      reload();
    } finally {
      setImporting(false);
    }
  };

  const template = `Name,Phone,Principal,Monthly Rate %,Term Months,Start Date,First Due Date
Rajesh Kumar,919876543210,100000,2,10,2026-01-01,2026-02-15
Priya Sharma,919812345670,80000,2.5,8,2026-01-15,2026-02-15`;

  const downloadTemplate = () => downloadCSV('loanmate-import-template.csv', template);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Import / Export</h1>
        <p className="text-sm text-slate-500">Move data between LoanMate and Excel</p>
      </div>

      {/* Export */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <h2 className="font-display font-semibold text-slate-900 mb-3 flex items-center gap-2"><Download className="h-4 w-4 text-emerald-600" /> Export to CSV</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportBorrowers}><FileSpreadsheet className="h-4 w-4 mr-1" /> Borrowers ({borrowers.length})</Button>
          <Button variant="outline" size="sm" onClick={exportLoans}><FileSpreadsheet className="h-4 w-4 mr-1" /> Loans ({loans.length})</Button>
          <Button variant="outline" size="sm" onClick={exportInstallments}><FileSpreadsheet className="h-4 w-4 mr-1" /> Installments ({installments.length})</Button>
          <Button variant="outline" size="sm" onClick={exportPayments}><FileSpreadsheet className="h-4 w-4 mr-1" /> Payments ({payments.length})</Button>
        </div>
      </div>

      {/* Import */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <h2 className="font-display font-semibold text-slate-900 mb-1 flex items-center gap-2"><Upload className="h-4 w-4 text-emerald-600" /> Import from CSV</h2>
        <p className="text-xs text-slate-400 mb-4">Creates borrowers + loans with auto-generated installment schedules. Columns: Name, Phone, Principal, Monthly Rate %, Term Months, Start Date, First Due Date.</p>
        <div className="flex flex-wrap gap-2 mb-4">
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-1" /> Choose CSV file</Button>
          <Button variant="ghost" size="sm" onClick={downloadTemplate}>Download template</Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </div>

        {errors.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-3 text-sm">
            <p className="font-medium text-amber-700 flex items-center gap-1.5 mb-1"><AlertCircle className="h-4 w-4" /> {errors.length} validation issue(s)</p>
            <ul className="list-disc list-inside text-amber-600 text-xs space-y-0.5">
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        {preview.length > 0 && (
          <div className="rounded-lg border border-slate-200 overflow-hidden mb-3">
            <div className="px-3 py-2 bg-slate-50 text-xs font-medium text-slate-500 flex justify-between">
              <span>Preview — {preview.length} loan(s) ready to import</span>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-400">
                <tr><th className="text-left px-3 py-2">Name</th><th className="text-left px-3 py-2">Phone</th><th className="text-right px-3 py-2">Principal</th><th className="text-right px-3 py-2">Rate</th><th className="text-right px-3 py-2">Term</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.map((r, i) => (
                  <tr key={i}><td className="px-3 py-2">{r.name}</td><td className="px-3 py-2 text-slate-500">{r.phone || '—'}</td><td className="px-3 py-2 text-right tnum">{formatINR(r.principal)}</td><td className="px-3 py-2 text-right">{r.rate}%</td><td className="px-3 py-2 text-right">{r.term}m</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {preview.length > 0 && (
          <Button onClick={runImport} disabled={importing} className="bg-emerald-600 hover:bg-emerald-700">
            {importing ? 'Importing…' : `Import ${preview.length} loan(s)`}
          </Button>
        )}

        {done && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> {done}
          </div>
        )}
      </div>
    </div>
  );
}