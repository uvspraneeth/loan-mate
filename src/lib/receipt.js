import { formatINR, roundRupee } from './money';
import { deriveLoanBalance } from './loanCalc';

// Digital payment receipt: structured data for the receipt card plus a plain-text
// version for WhatsApp/SMS/clipboard. Built from records after the payment is saved.

const parseDay = (v) => {
  if (!v) return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const formatReceiptDate = (v) =>
  parseDay(v)?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) || '—';

const monthOf = (v) => parseDay(v)?.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) || '';

export const isCashMethod = (method) => String(method || '').toLowerCase() === 'cash';

export function receiptNumber({ payment, loan, installment }) {
  const loanPart = String(loan?.loan_number || 'LN').replace(/^LN-/, '');
  const instPart = String(installment?.installment_number || 0).padStart(2, '0');
  const idPart = String(payment?.id || '').replace(/-/g, '').slice(0, 4).toUpperCase() || '0000';
  return `RC-${loanPart}-${instPart}-${idPart}`;
}

// installments: every installment of this loan, reflecting the saved payment.
export function buildReceipt({ payment, installment, loan, borrower, installments = [], settings }) {
  const loanInstallments = installments
    .filter((i) => i.loan_id === loan?.id)
    .sort((a, b) => a.installment_number - b.installment_number);
  const remainingOnInstallment = Math.max(0, roundRupee((installment?.total_due || 0) - (installment?.amount_paid || 0)));
  const next = loanInstallments.find((i) => i.status !== 'paid' && i.status !== 'waived' && i.id !== installment?.id);
  const outstanding = loanInstallments.length ? deriveLoanBalance(loanInstallments).outstanding : null;

  return {
    number: receiptNumber({ payment, loan, installment }),
    paymentDate: payment?.payment_date,
    issuedAt: new Date().toISOString(),
    borrowerName: borrower?.name || 'Borrower',
    borrowerPhone: borrower?.whatsapp_number || borrower?.phone || '',
    loanNumber: loan?.loan_number || '',
    installmentNumber: installment?.installment_number,
    termMonths: loan?.term_months || loanInstallments.length || null,
    forMonth: monthOf(installment?.due_date),
    amount: roundRupee(payment?.amount || 0),
    method: payment?.payment_method || 'Cash',
    reference: isCashMethod(payment?.payment_method) ? '' : payment?.transaction_reference || '',
    fullyPaid: remainingOnInstallment <= 0,
    remainingOnInstallment,
    loanOutstanding: outstanding,
    loanSettled: outstanding === 0,
    next: next ? { amount: roundRupee((next.total_due || 0) - (next.amount_paid || 0)), date: next.due_date } : null,
    receivedBy: settings?.bank_account_name || settings?.account_name || '',
  };
}

export function buildReceiptText(r) {
  const lines = [
    '🧾 *Payment Receipt*',
    `Receipt: ${r.number}`,
    `Date: ${formatReceiptDate(r.paymentDate)}`,
    '',
    `Received from: ${r.borrowerName}`,
    `Amount: *${formatINR(r.amount)}* (${r.method})`,
    `For: Loan ${r.loanNumber} · Installment ${r.installmentNumber}${r.termMonths ? ` of ${r.termMonths}` : ''}${r.forMonth ? ` (${r.forMonth})` : ''}`,
  ];
  if (r.reference) lines.push(`Ref: ${r.reference}`);
  lines.push(r.fullyPaid ? 'Status: Installment paid in full ✅' : `Status: Part payment — ${formatINR(r.remainingOnInstallment)} still due on this installment`);
  lines.push('');
  if (r.loanSettled) {
    lines.push('🎉 Loan fully repaid. Thank you!');
  } else {
    if (r.loanOutstanding != null) lines.push(`Loan balance remaining: ${formatINR(r.loanOutstanding)}`);
    if (r.next) lines.push(`Next due: ${formatINR(r.next.amount)} on ${formatReceiptDate(r.next.date)}`);
    lines.push('', 'Thank you!');
  }
  if (r.receivedBy) lines.push(`— ${r.receivedBy}`);
  return lines.join('\n');
}
