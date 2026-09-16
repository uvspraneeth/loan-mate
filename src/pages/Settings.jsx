import { db } from '@/api/supabaseClient';

import { useState, useEffect } from 'react';
import { useLending } from '@/lib/LendingContext';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { QrCode, CreditCard, BellRing, Save } from 'lucide-react';

export default function Settings() {
  const { settings, setSettings, reload } = useLending();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        upi_id: settings.upi_id || '',
        bank_account_name: settings.bank_account_name || '',
        bank_account_number: settings.bank_account_number || '',
        bank_ifsc: settings.bank_ifsc || '',
        payment_link: settings.payment_link || '',
        qr_code_url: settings.qr_code_url || '',
        reminder_7_days: settings.reminder_7_days ?? true,
        reminder_3_days: settings.reminder_3_days ?? true,
        reminder_1_day: settings.reminder_1_day ?? true,
        reminder_on_due: settings.reminder_on_due ?? true,
        reminder_after_overdue: settings.reminder_after_overdue ?? true,
      });
    } else {
      setForm({
        upi_id: '', bank_account_name: '', bank_account_number: '', bank_ifsc: '', payment_link: '', qr_code_url: '',
        reminder_7_days: true, reminder_3_days: true, reminder_1_day: true, reminder_on_due: true, reminder_after_overdue: true,
      });
    }
  }, [settings]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setSwitch = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      if (settings?.id) {
        await db.entities.PaymentSetting.update(settings.id, form);
      } else {
        const rec = await db.entities.PaymentSetting.create(form);
        setSettings(rec);
      }
      reload();
    } finally {
      setSaving(false);
    }
  };

  if (!form) return null;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Payment details and reminder preferences</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-4">
        <h2 className="font-display font-semibold text-slate-900 flex items-center gap-2"><CreditCard className="h-4 w-4 text-emerald-600" /> Payment Information</h2>
        <p className="text-xs text-slate-400 -mt-2">Included in due reminders so borrowers know how to pay. Never store card numbers, CVV, or UPI PINs here.</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5 col-span-2"><Label>UPI ID</Label><Input value={form.upi_id} onChange={set('upi_id')} placeholder="yourname@upi" /></div>
          <div className="space-y-1.5"><Label>Bank Account Name</Label><Input value={form.bank_account_name} onChange={set('bank_account_name')} placeholder="Account holder name" /></div>
          <div className="space-y-1.5"><Label>Bank Account Number</Label><Input value={form.bank_account_number} onChange={set('bank_account_number')} placeholder="XXXXXXXX" /></div>
          <div className="space-y-1.5"><Label>Bank IFSC</Label><Input value={form.bank_ifsc} onChange={set('bank_ifsc')} placeholder="HDFC0001234" /></div>
          <div className="space-y-1.5"><Label>Payment Link</Label><Input value={form.payment_link} onChange={set('payment_link')} placeholder="https://pay.example.com/xxx" /></div>
          <div className="space-y-1.5 col-span-2"><Label>QR Code URL</Label><Input value={form.qr_code_url} onChange={set('qr_code_url')} placeholder="https://…/qr.png" /></div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-4">
        <h2 className="font-display font-semibold text-slate-900 flex items-center gap-2"><BellRing className="h-4 w-4 text-amber-500" /> Reminder Schedule</h2>
        <p className="text-xs text-slate-400 -mt-2">Automated reminders are displayed in the app. Real WhatsApp/SMS sending activates once a provider is connected.</p>
        <div className="space-y-3">
          {[
            ['reminder_7_days', '7 days before due date'],
            ['reminder_3_days', '3 days before due date'],
            ['reminder_1_day', '1 day before due date'],
            ['reminder_on_due', 'On due date'],
            ['reminder_after_overdue', 'After overdue'],
          ].map(([key, label]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm text-slate-700">{label}</span>
              <Switch checked={form[key]} onCheckedChange={setSwitch(key)} />
            </div>
          ))}
        </div>
      </div>

      <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
        <Save className="h-4 w-4 mr-1" /> {saving ? 'Saving…' : 'Save Settings'}
      </Button>
    </div>
  );
}