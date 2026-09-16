import { formatINR } from './money';
import { toISODate, addMonths } from './loanCalc';

// Messaging abstraction. Prototype: generates text + opens WhatsApp chat link.
// Architecture allows a real WhatsApp Business API / SMS provider later by
// replacing sendWhatsAppMessage / sendSMS with API calls in a backend function.

function firstName(name) {
  return (name || '').split(' ')[0] || 'there';
}

function formatDueDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function shortDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function monthLabel(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function buildDueReminder({ borrower, installment, loan, settings }) {
  const name = firstName(borrower.name);
  const amount = formatINR(installment.total_due);
  const due = formatDueDate(installment.due_date);
  const payInfo = settings?.upi_id ? `\n\nPayment details:\nUPI: ${settings.upi_id}` : '';
  const payLink = settings?.payment_link ? `\nPay online: ${settings.payment_link}` : '';
  const msg = `Hello ${name},\n\nThis is a friendly reminder that your monthly loan payment of ${amount} is due on ${due}.${payInfo}${payLink}\n\nOnce paid, please send the payment screenshot/reference here on WhatsApp.\n\nThank you.`;
  return msg;
}

export function buildOverdueReminder({ borrower, installment, settings }) {
  const name = firstName(borrower.name);
  const amount = formatINR(installment.total_due);
  const due = formatDueDate(installment.due_date);
  const payInfo = settings?.upi_id ? `\n\nUPI: ${settings.upi_id}` : '';
  return `Hello ${name},\n\nYour loan payment of ${amount} was due on ${due} and is now overdue.${payInfo}\n\nPlease make the payment at the earliest and send the screenshot/reference here. Thank you.`;
}

export function buildPaymentConfirmation({ borrower, installment, loan, installments, settings }) {
  const name = firstName(borrower.name);
  const amount = formatINR(installment.amount_paid || installment.total_due);
  const month = monthLabel(installment.due_date);
  // find next unpaid installment after this one
  const next = installments
    .filter((i) => i.installment_number > installment.installment_number && i.status !== 'paid' && i.status !== 'waived')
    .sort((a, b) => a.installment_number - b.installment_number)[0];
  const nextLine = next
    ? `\n\nYour next payment of ${formatINR(next.total_due)} is due on ${formatDueDate(next.due_date)}.`
    : '\n\nThis was your final installment — your loan is now fully repaid. Thank you!';
  return `Hello ${name},\n\nYour payment of ${amount} for ${month} has been received and verified.\n\nThank you for making the payment on time.${nextLine}\n\nThank you.`;
}

export function buildPaymentRequest({ borrower, installment, settings }) {
  const name = firstName(borrower.name);
  const amount = formatINR(installment.total_due);
  const payInfo = settings?.upi_id ? ` UPI: ${settings.upi_id}.` : '';
  return `Payment reminder: ${amount} is due on ${shortDate(installment.due_date)}.${payInfo} Please make the payment and send the transaction screenshot/reference on WhatsApp.`;
}

export function buildConfirmationSMS({ borrower, installment, installments }) {
  const amount = formatINR(installment.amount_paid || installment.total_due);
  const month = new Date(installment.due_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  const next = installments
    .filter((i) => i.installment_number > installment.installment_number && i.status !== 'paid' && i.status !== 'waived')
    .sort((a, b) => a.installment_number - b.installment_number)[0];
  const nextLine = next
    ? ` Next payment ${formatINR(next.total_due)} due on ${new Date(next.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.`
    : ' Loan fully repaid.';
  return `Payment received: ${amount} for ${month} has been verified.${nextLine}`;
}

// Open WhatsApp chat with prefilled text (wa.me). Falls back to api.whatsapp.com.
export function whatsappUrl(phone, text) {
  const clean = String(phone || '').replace(/[^\d]/g, '');
  const t = encodeURIComponent(text || '');
  return clean ? `https://wa.me/${clean}?text=${t}` : `https://wa.me/?text=${t}`;
}

export function smsUrl(phone, text) {
  const clean = String(phone || '').replace(/[^\d]/g, '');
  return `sms:${clean}?&body=${encodeURIComponent(text || '')}`;
}