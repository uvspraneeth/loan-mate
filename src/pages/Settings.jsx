import { db } from '@/api/supabaseClient';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useLending } from '@/lib/LendingContext';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CreditCard, BellRing, Save, Smartphone, Landmark, Link2, MessageCircle, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { PageHeader, CardSkeleton } from '@/components/PageState';
import { buildDueReminder } from '@/lib/messages';
import { addMonths, toISODate } from '@/lib/loanCalc';
import { cn } from '@/lib/utils';

const CARD = 'rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]';

const REMINDERS = [
  ['reminder_7_days', '7 days before due date'],
  ['reminder_3_days', '3 days before due date'],
  ['reminder_1_day', '1 day before due date'],
  ['reminder_on_due', 'On due date'],
  ['reminder_after_overdue', 'After overdue'],
];

// Form shape mirrors the payment_settings DB columns — keep keys in sync.
function toForm(settings) {
  return {
    upi_id: settings?.upi_id || '',
    bank_account_name: settings?.bank_account_name || '',
    bank_account_number: settings?.bank_account_number || '',
    bank_ifsc: settings?.bank_ifsc || '',
    payment_link: settings?.payment_link || '',
    qr_code_url: settings?.qr_code_url || '',
    reminder_7_days: settings?.reminder_7_days ?? true,
    reminder_3_days: settings?.reminder_3_days ?? true,
    reminder_1_day: settings?.reminder_1_day ?? true,
    reminder_on_due: settings?.reminder_on_due ?? true,
    reminder_after_overdue: settings?.reminder_after_overdue ?? true,
  };
}

function SectionLabel({ icon: Icon, children }) {
  return (
    <h3 className="sm:col-span-2 flex items-center gap-1.5 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
      <Icon className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" /> {children}
    </h3>
  );
}

export default function Settings() {
  const { settings, setSettings, reload, loading } = useLending();
  const initial = useMemo(() => toForm(settings), [settings]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  // Realtime reloads produce a new `settings` object; only reset the form when the
  // user has no unsaved edits relative to the previous baseline.
  const baselineRef = useRef(null);
  useEffect(() => {
    const prev = baselineRef.current;
    baselineRef.current = initial;
    setForm((f) => (f && prev && Object.keys(prev).some((k) => f[k] !== prev[k]) ? f : initial));
  }, [initial]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setSwitch = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const dirty = !!form && Object.keys(initial).some((k) => form[k] !== initial[k]);

  // Live sample of the WhatsApp due reminder using the current (unsaved) form values.
  const previewMessage = useMemo(() => {
    if (!form) return '';
    return buildDueReminder({
      borrower: { name: 'Rajesh Kumar' },
      installment: { total_due: 12000, due_date: toISODate(addMonths(new Date(), 1)) },
      loan: { loan_number: 'LN-1001' },
      settings: form,
    });
  }, [form]);

  const save = async () => {
    setSaving(true);
    try {
      if (settings?.id) {
        await db.entities.PaymentSetting.update(settings.id, form);
        setSettings({ ...settings, ...form });
      } else {
        const rec = await db.entities.PaymentSetting.create(form);
        setSettings(rec);
      }
      reload();
      toast({ title: 'Settings saved' });
    } catch (err) {
      console.error('save settings error', err);
      toast({ variant: 'destructive', title: 'Could not save settings', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const header = <PageHeader title="Settings" description="Payment details and reminder preferences" />;

  if (!form || (loading && !settings)) {
    return (
      <div className="space-y-6 max-w-5xl" aria-busy="true">
        {header}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <CardSkeleton rows={6} />
            <CardSkeleton rows={5} />
          </div>
          <CardSkeleton rows={6} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {header}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-6 min-w-0">
          <section className={cn(CARD, 'space-y-4')} aria-labelledby="payment-info-heading">
            <div>
              <h2 id="payment-info-heading" className="font-display font-semibold text-slate-900 flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Payment Information
              </h2>
              <p className="mt-1 text-xs text-slate-500">Included in due reminders so borrowers know how to pay. Never store card numbers, CVV, or UPI PINs here.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SectionLabel icon={Smartphone}>UPI</SectionLabel>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="upi_id">UPI ID</Label>
                <Input id="upi_id" value={form.upi_id} onChange={set('upi_id')} placeholder="yourname@upi" autoComplete="off" autoCapitalize="none" spellCheck={false} className="h-11" />
              </div>

              <div className="sm:col-span-2 border-t border-slate-100" aria-hidden="true" />
              <SectionLabel icon={Landmark}>Bank transfer</SectionLabel>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="bank_account_name">Account holder name</Label>
                <Input id="bank_account_name" value={form.bank_account_name} onChange={set('bank_account_name')} placeholder="Account holder name" autoComplete="off" className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bank_account_number">Account number</Label>
                <Input id="bank_account_number" value={form.bank_account_number} onChange={set('bank_account_number')} placeholder="XXXXXXXX" inputMode="numeric" autoComplete="off" className="h-11 tnum" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bank_ifsc">IFSC</Label>
                <Input
                  id="bank_ifsc"
                  value={form.bank_ifsc}
                  onChange={(e) => setForm((f) => ({ ...f, bank_ifsc: e.target.value.toUpperCase() }))}
                  placeholder="HDFC0001234"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="h-11"
                />
              </div>

              <div className="sm:col-span-2 border-t border-slate-100" aria-hidden="true" />
              <SectionLabel icon={Link2}>Payment link &amp; QR</SectionLabel>
              <div className="space-y-1.5">
                <Label htmlFor="payment_link">Payment link</Label>
                <Input id="payment_link" type="url" value={form.payment_link} onChange={set('payment_link')} placeholder="https://pay.example.com/xxx" autoComplete="off" className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qr_code_url">QR code image URL</Label>
                <Input id="qr_code_url" type="url" value={form.qr_code_url} onChange={set('qr_code_url')} placeholder="https://…/qr.png" autoComplete="off" className="h-11" />
              </div>
            </div>
          </section>

          <section className={cn(CARD, 'space-y-3')} aria-labelledby="reminders-heading">
            <div>
              <h2 id="reminders-heading" className="font-display font-semibold text-slate-900 flex items-center gap-2">
                <BellRing className="h-4 w-4 text-amber-500" aria-hidden="true" /> Reminder Schedule
              </h2>
              <p className="mt-1 text-xs text-slate-500">Automated reminders are displayed in the app. Real WhatsApp/SMS sending activates once a provider is connected.</p>
            </div>
            <div className="divide-y divide-slate-100">
              {REMINDERS.map(([key, label]) => (
                <div key={key} className="flex min-h-12 items-center justify-between gap-4">
                  <Label htmlFor={key} className="flex-1 cursor-pointer py-3 text-sm font-normal text-slate-700">{label}</Label>
                  <Switch id={key} checked={form[key]} onCheckedChange={setSwitch(key)} />
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className={cn(CARD, 'space-y-3 lg:sticky lg:top-24')} aria-labelledby="preview-heading">
          <div>
            <h2 id="preview-heading" className="font-display font-semibold text-slate-900 flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Reminder preview
            </h2>
            <p className="mt-1 text-xs text-slate-500">A sample WhatsApp due reminder. It includes your UPI ID and payment link as you type.</p>
          </div>
          <div className="rounded-xl bg-[#ECE5DD] p-3">
            <div className="relative ml-auto max-w-[95%] rounded-lg rounded-tr-none bg-[#DCF8C6] px-3 py-2 text-sm leading-relaxed text-slate-800 shadow-sm">
              <p className="whitespace-pre-line break-words">{previewMessage}</p>
              <p className="mt-1 text-right text-[10px] text-slate-500">Sample · not sent</p>
            </div>
          </div>
          {!form.upi_id && !form.payment_link && (
            <p className="text-xs text-amber-700">Add a UPI ID or payment link so borrowers know how to pay.</p>
          )}
        </aside>
      </div>

      {/* Save bar: sticky above the mobile bottom nav, inline on md+ */}
      <div className="sticky bottom-16 z-20 -mx-4 flex items-center justify-end gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:justify-start md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <p className="mr-auto text-sm md:order-last md:mr-0" aria-live="polite">
          {dirty ? (
            <span className="flex items-center gap-1.5 font-medium text-amber-700">
              <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" /> Unsaved changes
            </span>
          ) : (
            <span className="text-slate-400">No unsaved changes</span>
          )}
        </p>
        {dirty && (
          <Button type="button" variant="outline" onClick={() => setForm(initial)} disabled={saving} className="h-10">
            Discard
          </Button>
        )}
        <Button onClick={save} disabled={saving || !dirty} className="h-10 bg-emerald-600 hover:bg-emerald-700">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          {saving ? 'Saving…' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
