import { roundMoney, roundRupee } from './money';

// Loan calculation engine.
// Repayment types:
//   - interest_only: monthly due = interest only; principal stays outstanding
//   - principal_and_interest: flat monthly principal + interest
// All amounts in whole rupees.

// Parse a date input as a local calendar date. `new Date('YYYY-MM-DD')` is UTC
// midnight, which lands on the previous day in timezones behind UTC.
function toLocalDate(dateInput) {
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [y, m, d] = dateInput.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(dateInput);
}

// Add months to a date (YYYY-MM-DD string or Date)
export function addMonths(dateInput, months) {
  const d = toLocalDate(dateInput);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // handle month overflow (e.g. Jan 31 + 1 month -> Mar 3); clamp to end of month
  if (d.getDate() < day) d.setDate(0);
  return d;
}

// Local calendar date as YYYY-MM-DD (toISOString() would use UTC and can be off by a day)
export function toISODate(d) {
  const date = toLocalDate(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Next sequential loan number (LN-1001, LN-1002, …) based on the highest existing one.
export function nextLoanNumber(existingLoanNumbers) {
  const max = existingLoanNumbers.reduce((acc, num) => {
    const n = parseInt(String(num || '').replace(/^LN-/, ''), 10);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 1000);
  return `LN-${max + 1}`;
}

export function daysBetween(a, b) {
  const ms = toLocalDate(b).setHours(0, 0, 0, 0) - toLocalDate(a).setHours(0, 0, 0, 0);
  return Math.round(ms / 86400000);
}

export function daysOverdue(dueDate, today = new Date()) {
  const diff = daysBetween(dueDate, today);
  return diff > 0 ? diff : 0;
}

// Resolve the repayment type for a loan, with backward-compat for older
// loans that only have interest_method set.
export function getRepaymentType(loan) {
  if (loan?.repayment_type) return loan.repayment_type;
  return 'principal_and_interest';
}

export const REPAYMENT_TYPE_LABELS = {
  interest_only: 'Interest Only',
  principal_and_interest: 'Principal + Interest',
};

export function repaymentTypeLabel(loan) {
  return REPAYMENT_TYPE_LABELS[getRepaymentType(loan)] || '—';
}

// Core calculation given loan params -> summary
export function calculateLoanSummary(loan) {
  const principal = roundRupee(loan.principal_amount || 0);
  const term = Math.max(1, Math.round(loan.term_months || 1));
  const monthlyRatePct = Number(loan.monthly_interest_rate || 0);
  const annualRatePct = Number(loan.annual_interest_rate || 0) || monthlyRatePct * 12;
  const repaymentType = getRepaymentType(loan);

  let monthlyPrincipal = 0;
  let monthlyInterest = 0;
  let monthlyDue = 0;
  let totalInterest = 0;
  let totalPayable = 0;
  let principalOutstanding = 0;

  monthlyInterest = roundRupee((principal * monthlyRatePct) / 100);

  if (repaymentType === 'interest_only') {
    // Only interest is collected each month; principal remains outstanding.
    monthlyPrincipal = 0;
    monthlyDue = monthlyInterest;
    totalInterest = roundRupee(monthlyInterest * term);
    totalPayable = totalInterest; // scheduled payments = interest only
    principalOutstanding = principal;
  } else {
    // principal + interest (flat)
    monthlyPrincipal = roundRupee(principal / term);
    monthlyDue = monthlyPrincipal + monthlyInterest;
    totalInterest = roundRupee(monthlyInterest * term);
    totalPayable = principal + totalInterest;
    principalOutstanding = 0;
  }

  return {
    principal,
    term,
    annualRatePct: roundMoney(annualRatePct),
    monthlyRatePct: roundMoney(monthlyRatePct),
    repaymentType,
    method: repaymentType, // legacy alias
    monthlyPrincipal,
    monthlyInterest,
    monthlyDue,
    totalInterest,
    totalPayable,
    principalOutstanding,
  };
}

// Generate installment schedule records (without ids).
export function generateInstallments(loan) {
  const summary = calculateLoanSummary(loan);
  const term = summary.term;
  const firstDue = loan.first_due_date || loan.loan_start_date;
  const installments = [];

  if (summary.repaymentType === 'interest_only') {
    for (let i = 1; i <= term; i++) {
      installments.push({
        installment_number: i,
        due_date: toISODate(addMonths(firstDue, i - 1)),
        principal_due: 0,
        interest_due: summary.monthlyInterest,
        total_due: summary.monthlyInterest,
        amount_paid: 0,
        principal_paid: 0,
        interest_paid: 0,
        status: 'upcoming',
      });
    }
  } else {
    // principal + interest: principal may not divide evenly; last installment
    // absorbs the remainder.
    const basePrincipal = Math.floor(summary.principal / term);
    let principalRemaining = summary.principal;
    for (let i = 1; i <= term; i++) {
      const isLast = i === term;
      const principalDue = isLast ? principalRemaining : basePrincipal;
      principalRemaining -= basePrincipal;
      const interestDue = summary.monthlyInterest;
      installments.push({
        installment_number: i,
        due_date: toISODate(addMonths(firstDue, i - 1)),
        principal_due: roundRupee(principalDue),
        interest_due: roundRupee(interestDue),
        total_due: roundRupee(principalDue + interestDue),
        amount_paid: 0,
        principal_paid: 0,
        interest_paid: 0,
        status: 'upcoming',
      });
    }
  }

  return installments;
}

// Derive live loan balance from installments (auditable, not a stored guess).
export function deriveLoanBalance(installments, payments = []) {
  let totalDue = 0;
  let totalPaid = 0;
  let principalPaid = 0;
  let interestPaid = 0;
  let totalInterest = 0;
  for (const inst of installments) {
    totalDue += inst.total_due || 0;
    totalPaid += inst.amount_paid || 0;
    principalPaid += inst.principal_paid || 0;
    interestPaid += inst.interest_paid || 0;
    totalInterest += inst.interest_due || 0;
  }
  const outstanding = roundRupee(totalDue - totalPaid);
  return {
    totalDue: roundRupee(totalDue),
    totalPaid: roundRupee(totalPaid),
    outstanding,
    principalPaid: roundRupee(principalPaid),
    interestPaid: roundRupee(interestPaid),
    totalInterest: roundRupee(totalInterest),
  };
}

// Recompute installment statuses from payments + dates.
export function recomputeInstallmentStatuses(installments, today = new Date()) {
  const todayISO = toISODate(today);
  return installments.map((inst) => {
    if (inst.status === 'waived') return inst;
    const paid = inst.amount_paid || 0;
    const due = inst.total_due || 0;
    let status = inst.status;
    if (paid >= due && due > 0) {
      status = 'paid';
    } else if (paid > 0) {
      status = 'partially_paid';
    } else if (inst.due_date < todayISO) {
      status = 'overdue';
    } else {
      // upcoming vs due: due within 7 days
      const diff = daysBetween(todayISO, inst.due_date);
      status = diff <= 7 ? 'due' : 'upcoming';
    }
    return { ...inst, status };
  });
}

// Kept for backward compatibility with older code paths.
export const INTEREST_METHOD_LABELS = {
  flat_interest: 'Monthly Flat Interest',
  simple_interest: 'Simple Interest',
  reducing_balance: 'Reducing Balance',
  emi: 'EMI',
};

export function nextUnpaidInstallment(installments) {
  return installments.find((i) => i.status !== 'paid' && i.status !== 'waived');
}