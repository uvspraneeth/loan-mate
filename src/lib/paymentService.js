import { db } from '@/api/supabaseClient';


import { roundRupee } from './money';

// Central payment workflow logic — used by RecordPaymentDialog and PaymentVerificationDrawer.
// Marking paid: creates/verifies payment, allocates to installment, updates loan balance,
// records verification timestamp + admin, creates activity. Never auto-trusts proof.

export async function recordAndMarkPaid({
  installment,
  loan,
  borrower,
  amount,
  paymentDate,
  paymentMethod,
  transactionReference,
  proofUrl,
  notes,
  user,
  paymentId, // set when verifying an existing (unverified) payment record
}) {
  const amt = roundRupee(amount);
  if (!(amt > 0)) throw new Error('Payment amount must be greater than zero');
  const due = roundRupee(installment.total_due);

  // 1. Create a new payment record, or verify the pending one under review.
  //    Each payment is its own row so partial payments keep a full history.
  const paymentValues = {
    amount: amt,
    payment_date: paymentDate,
    payment_method: paymentMethod,
    transaction_reference: transactionReference,
    proof_url: proofUrl,
    verified: true,
    verified_at: new Date().toISOString(),
    verified_by: user?.id,
    rejected_at: null,
    notes,
  };
  const payment = paymentId
    ? await db.entities.Payment.update(paymentId, paymentValues)
    : await db.entities.Payment.create({
        loan_id: loan.id,
        installment_id: installment.id,
        borrower_id: borrower.id,
        ...paymentValues,
      });

  // 2. Allocate this payment on top of what is already paid (interest first, then principal)
  const prevPaid = roundRupee(installment.amount_paid || 0);
  const prevInterestPaid = roundRupee(installment.interest_paid || 0);
  const prevPrincipalPaid = roundRupee(installment.principal_paid || 0);
  const interestRemaining = Math.max(0, roundRupee(installment.interest_due || 0) - prevInterestPaid);
  const principalRemaining = Math.max(0, roundRupee(installment.principal_due || 0) - prevPrincipalPaid);
  const interestPaid = roundRupee(Math.min(amt, interestRemaining));
  const principalPaid = roundRupee(Math.min(amt - interestPaid, principalRemaining));

  // 3. Update installment
  const totalPaid = roundRupee(prevPaid + amt);
  const fullyPaid = totalPaid >= due;
  const updatedInstallment = await db.entities.Installment.update(installment.id, {
    amount_paid: totalPaid,
    principal_paid: roundRupee(prevPrincipalPaid + principalPaid),
    interest_paid: roundRupee(prevInterestPaid + interestPaid),
    status: fullyPaid ? 'paid' : 'partially_paid',
    paid_date: fullyPaid ? paymentDate : installment.paid_date,
    payment_id: payment.id,
  });

  // 4. Activity / audit record
  await db.entities.Activity.create({
    borrower_id: borrower.id,
    loan_id: loan.id,
    activity_type: 'payment_verified',
    description: `Payment of ₹${amt.toLocaleString('en-IN')} ${fullyPaid ? 'verified' : 'partially recorded'} for installment #${installment.installment_number}`,
    metadata: { amount: amt, installment_id: installment.id, payment_id: payment.id, method: paymentMethod, fullyPaid },
  });

  // 5. Check loan completion
  if (fullyPaid) {
    const allInstallments = await db.entities.Installment.filter({ loan_id: loan.id });
    const allPaid = allInstallments.every((i) => i.status === 'paid' || i.status === 'waived');
    if (allPaid) await db.entities.Loan.update(loan.id, { status: 'completed' });
  }

  return { payment, installment: updatedInstallment, fullyPaid };
}

// Rejects a pending (unverified) payment. Unverified payments were never applied
// to the installment, so its balance and status are left untouched.
export async function rejectPayment({ payment, installment, loan, borrower, reason }) {
  await db.entities.Payment.update(payment.id, {
    verified: false,
    rejected_at: new Date().toISOString(),
    notes: `Rejected: ${reason || 'proof not accepted'}`,
  });
  await db.entities.Activity.create({
    borrower_id: borrower?.id,
    loan_id: loan?.id,
    activity_type: 'payment_rejected',
    description: installment
      ? `Payment proof for installment #${installment.installment_number} rejected`
      : `Payment of ₹${roundRupee(payment.amount || 0).toLocaleString('en-IN')} rejected`,
    metadata: { reason, payment_id: payment.id, installment_id: installment?.id },
  });
}

export async function logNotification({ borrower, loan, installment, channel, messageType, message, status = 'generated' }) {
  return db.entities.NotificationLog.create({
    borrower_id: borrower?.id,
    loan_id: loan?.id,
    installment_id: installment?.id,
    channel,
    message_type: messageType,
    message,
    status,
    sent_at: status === 'sent' ? new Date().toISOString() : undefined,
  });
}
