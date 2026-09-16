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
}) {
  const amt = roundRupee(amount);
  const due = roundRupee(installment.total_due);

  // 1. Create / update payment record (verified)
  let payment;
  if (installment.payment_id) {
    payment = await db.entities.Payment.update(installment.payment_id, {
      amount: amt,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      transaction_reference: transactionReference,
      proof_url: proofUrl,
      verified: true,
      verified_at: new Date().toISOString(),
      verified_by: user?.id,
      notes,
    });
  } else {
    payment = await db.entities.Payment.create({
      loan_id: loan.id,
      installment_id: installment.id,
      borrower_id: borrower.id,
      amount: amt,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      transaction_reference: transactionReference,
      proof_url: proofUrl,
      verified: true,
      verified_at: new Date().toISOString(),
      verified_by: user?.id,
      notes,
    });
  }

  // 2. Allocate payment to principal/interest (interest first, then principal)
  const interestDue = roundRupee(installment.interest_due || 0);
  const principalDue = roundRupee(installment.principal_due || 0);
  let interestPaid = Math.min(amt, interestDue);
  let principalPaid = Math.min(amt - interestPaid, principalDue);
  interestPaid = roundRupee(interestPaid);
  principalPaid = roundRupee(principalPaid);

  // 3. Mark installment paid
  const fullyPaid = amt >= due;
  const updatedInstallment = await db.entities.Installment.update(installment.id, {
    amount_paid: amt,
    principal_paid: principalPaid,
    interest_paid: interestPaid,
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
  const allInstallments = await db.entities.Installment.filter({ loan_id: loan.id });
  const allPaid = allInstallments.every((i) => i.status === 'paid' || i.status === 'waived' || (i.id === installment.id && fullyPaid));
  if (allPaid && fullyPaid) {
    await db.entities.Loan.update(loan.id, { status: 'completed' });
  }

  return { payment, installment: updatedInstallment, fullyPaid };
}

export async function rejectPayment({ installment, loan, borrower, user, reason }) {
  if (installment.payment_id) {
    await db.entities.Payment.update(installment.payment_id, {
      verified: false,
      notes: `Rejected: ${reason || 'proof not accepted'}`,
    });
  }
  await db.entities.Installment.update(installment.id, {
    status: installment.due_date < new Date().toISOString().slice(0, 10) ? 'overdue' : 'due',
  });
  await db.entities.Activity.create({
    borrower_id: borrower.id,
    loan_id: loan.id,
    activity_type: 'payment_rejected',
    description: `Payment proof for installment #${installment.installment_number} rejected`,
    metadata: { reason, installment_id: installment.id },
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