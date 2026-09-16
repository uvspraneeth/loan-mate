import { db } from '@/api/supabaseClient';

import { useEffect, useState, useCallback } from 'react';

import { recomputeInstallmentStatuses, toISODate } from './loanCalc';

// Central data hook: loads borrowers, loans, installments, payments, activities,
// notification logs, and settings. Derives live balances from installments.
export function useLendingData() {
  const [borrowers, setBorrowers] = useState([]);
  const [loans, setLoans] = useState([]);
  const [installments, setInstallments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [activities, setActivities] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [b, l, ins, p, act, notif] = await Promise.all([
        db.entities.Borrower.list('-created_date', 500),
        db.entities.Loan.list('-created_date', 500),
        db.entities.Installment.list('-created_date', 2000),
        db.entities.Payment.list('-created_date', 2000),
        db.entities.Activity.list('-created_date', 500),
        db.entities.NotificationLog.list('-created_date', 500),
      ]);
      setBorrowers(b);
      setLoans(l);
      setInstallments(ins.map((i) => ({ ...i, status: recomputeStatus(i) })));
      setPayments(p);
      setActivities(act);
      setNotifications(notif);
      let s = await db.entities.PaymentSetting.list('-created_date', 10);
      setSettings(s[0] || null);
    } catch (e) {
      console.error('loadAll error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    // realtime
    const unsubs = [];
    try {
      unsubs.push(db.entities.Borrower.subscribe(() => loadAll()));
      unsubs.push(db.entities.Loan.subscribe(() => loadAll()));
      unsubs.push(db.entities.Installment.subscribe(() => loadAll()));
      unsubs.push(db.entities.Payment.subscribe(() => loadAll()));
      unsubs.push(db.entities.Activity.subscribe(() => loadAll()));
      unsubs.push(db.entities.NotificationLog.subscribe(() => loadAll()));
    } catch (e) {}
    return () => unsubs.forEach((u) => u && u());
  }, [loadAll]);

  return {
    borrowers, loans, installments, payments, activities, notifications, settings,
    loading, reload: loadAll, setSettings,
  };
}

function recomputeStatus(inst) {
  if (inst.status === 'waived' || inst.status === 'paid') return inst.status;
  const paid = inst.amount_paid || 0;
  const due = inst.total_due || 0;
  const today = toISODate(new Date());
  if (paid >= due && due > 0) return 'paid';
  if (paid > 0) return 'partially_paid';
  if (inst.due_date < today) return 'overdue';
  const diff = Math.round((new Date(inst.due_date) - new Date(today)) / 86400000);
  return diff <= 7 ? 'due' : 'upcoming';
}