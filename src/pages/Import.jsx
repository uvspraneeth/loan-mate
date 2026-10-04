import { db } from '@/api/supabaseClient';

import { useState, useRef } from 'react';
import { useLending } from '@/lib/LendingContext';

import { Button } from '@/components/ui/button';
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, FileText, X, Loader2 } from 'lucide-react';
import { toCSV, downloadCSV, parseCSV, rowsToObjects } from '@/lib/csv';
import { calculateLoanSummary, generateInstallments, repaymentTypeLabel, toISODate, addMonths, nextLoanNumber } from '@/lib/loanCalc';
import { formatINR } from '@/lib/money';
import { PageHeader, CardSkeleton } from '@/components/PageState';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const CARD = 'rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]';

function isCSVFile(file) {
  return /\.csv$/i.test(file?.name || '') || file?.type === 'text/csv';
}

export default function ImportExport() {
  const { borrowers, loans, installments, payments, reload, loading } = useLending();
  const [preview, setPreview] = useState([]);
  const [errors, setErrors] = useState([]);
  const fileRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(null);
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);

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
    setFileName(file.name);
    const text = await file.text();
    const rows = rowsToObjects(parseCSV(text));
    const errs = [];
    const valid = [];
    const existingNames = new Set(borrowers.map((b) => (b.name || '').toLowerCase()));

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
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || (firstDue && !/^\d{4}-\d{2}-\d{2}$/.test(firstDue))) { errs.push(`Row ${idx + 2}: Dates for ${name} must be YYYY-MM-DD`); continue; }
      if (existingNames.has(name.toLowerCase())) { errs.push(`Row ${idx + 2}: Duplicate borrower "${name}"`); continue; }
      existingNames.add(name.toLowerCase());
      valid.push({ name, phone: r.Phone || r.phone || '', principal, rate, term, start, firstDue });
    }
    setErrors(errs);
    setPreview(valid);
  };

  // Shared entry point for the file picker and drag-and-drop.
  const acceptFile = (file) => {
    if (!file) return;
    if (!isCSVFile(file)) {
      toast({ variant: 'destructive', title: 'Not a CSV file', description: 'Please choose a .csv file (export from Excel or Google Sheets as CSV).' });
      return;
    }
    handleFile(file).catch((err) => {
      console.error('csv parse error', err);
      toast({ variant: 'destructive', title: 'Could not read file', description: err.message });
    });
  };

  const clearFile = () => {
    setFileName('');
    setPreview([]);
    setErrors([]);
    setDone(null);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!dragging) setDragging(true);
  };

  const onDragLeave = (e) => {
    // Ignore leave events fired when moving between child elements.
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragging(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (importing) return;
    acceptFile(e.dataTransfer.files?.[0]);
  };

  const runImport = async () => {
    setImporting(true);
    let created = 0;
    try {
      const existing = await db.entities.Loan.list('-created_date');
      const loanNumbers = existing.map((l) => l.loan_number);
      for (const r of preview) {
        const borrower = await db.entities.Borrower.create({ name: r.name, phone: r.phone, whatsapp_number: r.phone });
        const calc = calculateLoanSummary({ principal_amount: r.principal, monthly_interest_rate: r.rate, repayment_type: 'principal_and_interest', term_months: r.term });
        const firstDue = r.firstDue || toISODate(addMonths(r.start, 1));
        const loanNumber = nextLoanNumber(loanNumbers);
        loanNumbers.push(loanNumber);
        const loan = await db.entities.Loan.create({
          borrower_id: borrower.id,
          loan_number: loanNumber,
          principal_amount: r.principal,
          annual_interest_rate: Math.round(r.rate * 12 * 100) / 100,
          monthly_interest_rate: r.rate,
          interest_method: 'flat_interest',
          repayment_type: 'principal_and_interest',
          loan_start_date: r.start,
          first_due_date: firstDue,
          maturity_date: toISODate(addMonths(firstDue, r.term - 1)),
          monthly_due_amount: calc.monthlyDue,
          term_months: r.term,
          payment_frequency: 'monthly',
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
      setFileName('');
      reload();
    } catch (err) {
      console.error('import error', err);
      setPreview((rows) => rows.slice(created));
      setErrors([`Import stopped after ${created} loan(s): ${err.message}`]);
      reload();
    } finally {
      setImporting(false);
    }
  };

  const template = `Name,Phone,Principal,Monthly Rate %,Term Months,Start Date,First Due Date
Rajesh Kumar,919876543210,100000,2,10,2026-01-01,2026-02-15
Priya Sharma,919812345670,80000,2.5,8,2026-01-15,2026-02-15`;

  const downloadTemplate = () => downloadCSV('loanmate-import-template.csv', template);

  const header = <PageHeader title="Import / Export" description="Move data between LoanMate and Excel or Google Sheets" />;

  if (loading && borrowers.length === 0 && loans.length === 0) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading">
        {header}
        <CardSkeleton rows={2} />
        <CardSkeleton rows={4} />
      </div>
    );
  }

  const exports = [
    ['Borrowers', borrowers.length, exportBorrowers],
    ['Loans', loans.length, exportLoans],
    ['Installments', installments.length, exportInstallments],
    ['Payments', payments.length, exportPayments],
  ];

  return (
    <div className="space-y-6">
      {header}

      {/* Export */}
      <section className={CARD} aria-labelledby="export-heading">
        <h2 id="export-heading" className="font-display font-semibold text-slate-900 flex items-center gap-2">
          <Download className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Export to CSV
        </h2>
        <p className="mt-1 mb-4 text-xs text-slate-500">Download a spreadsheet-friendly copy of your data.</p>
        <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 sm:flex sm:flex-wrap">
          {exports.map(([label, count, onClick]) => (
            <Button key={label} variant="outline" onClick={onClick} disabled={count === 0} className="h-10 justify-start sm:justify-center">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              {label}
              <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 tnum sm:ml-1">{count}</span>
            </Button>
          ))}
        </div>
      </section>

      {/* Import */}
      <section className={CARD} aria-labelledby="import-heading">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="import-heading" className="font-display font-semibold text-slate-900 flex items-center gap-2">
              <Upload className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Import from CSV
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Creates borrowers + loans with auto-generated installment schedules. Columns: Name, Phone, Principal, Monthly Rate %, Term Months, Start Date, First Due Date.
            </p>
          </div>
          <Button variant="ghost" onClick={downloadTemplate} className="h-10 self-start text-emerald-700 hover:text-emerald-800">
            <Download className="h-4 w-4" aria-hidden="true" /> Download template
          </Button>
        </div>

        <button
          type="button"
          onClick={() => { if (!importing) fileRef.current?.click(); }}
          onDragEnter={onDragOver}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          aria-disabled={importing}
          aria-describedby="dropzone-hint"
          className={cn(
            'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2',
            'aria-disabled:cursor-not-allowed aria-disabled:opacity-60',
            dragging ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-slate-50/50 hover:border-emerald-400 hover:bg-emerald-50/40'
          )}
        >
          <span className={cn('flex h-11 w-11 items-center justify-center rounded-full', dragging ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-500 ring-1 ring-slate-200')}>
            <Upload className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-sm font-medium text-slate-800">
            {dragging ? 'Drop your CSV here' : <>Drag &amp; drop a CSV file, or <span className="text-emerald-700 underline underline-offset-2">browse</span></>}
          </span>
          <span id="dropzone-hint" className="text-xs text-slate-500">.csv files only · one row per loan</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            acceptFile(e.target.files?.[0]);
            e.target.value = ''; // allow re-selecting the same file
          }}
        />

        {fileName && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <FileText className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{fileName}</p>
              <p className="text-xs text-slate-500">
                {preview.length} ready{errors.length > 0 ? ` · ${errors.length} issue${errors.length !== 1 ? 's' : ''}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={clearFile}
              disabled={importing}
              aria-label="Remove selected file"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {errors.length > 0 && (
          <div role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            <p className="font-medium text-amber-800 flex items-center gap-1.5 mb-1">
              <AlertCircle className="h-4 w-4" aria-hidden="true" /> {errors.length} validation issue{errors.length !== 1 ? 's' : ''}
            </p>
            <ul className="list-disc list-inside text-amber-700 text-xs space-y-0.5">
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        {preview.length > 0 && (
          <div className="mt-3 rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 text-xs font-medium text-slate-600 border-b border-slate-200">
              Preview — {preview.length} loan{preview.length !== 1 ? 's' : ''} ready to import
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th scope="col" className="text-left font-medium px-3 py-2">Name</th>
                    <th scope="col" className="text-left font-medium px-3 py-2">Phone</th>
                    <th scope="col" className="text-right font-medium px-3 py-2">Principal</th>
                    <th scope="col" className="text-right font-medium px-3 py-2">Rate</th>
                    <th scope="col" className="text-right font-medium px-3 py-2">Term</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-800">{r.name}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500 tnum">{r.phone || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right tnum">{formatINR(r.principal)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right tnum">{r.rate}%</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right tnum">{r.term}m</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {preview.length > 0 && (
          <Button onClick={runImport} disabled={importing} className="mt-3 h-10 w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700">
            {importing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {importing ? 'Importing…' : `Import ${preview.length} loan${preview.length !== 1 ? 's' : ''}`}
          </Button>
        )}

        {done && (
          <div role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> {done}
          </div>
        )}
      </section>
    </div>
  );
}
