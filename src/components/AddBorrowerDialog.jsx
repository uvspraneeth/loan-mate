import { db } from '@/api/supabaseClient';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';

const EMPTY_FORM = { name: '', phone: '', whatsapp_number: '', email: '', address: '', notes: '' };

// Phone: 10–13 digits, optional leading '+'. Spaces, dashes, dots and brackets are ignored.
function isValidPhone(value) {
  const compact = String(value || '').replace(/[\s\-().]/g, '');
  return /^\+?\d{10,13}$/.test(compact);
}

export default function AddBorrowerDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [sameAsPhone, setSameAsPhone] = useState(true);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  // The dialog stays mounted, so start fresh each time it opens.
  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM);
      setSameAsPhone(true);
      setTouched({});
      setSubmitted(false);
    }
  }, [open]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const touch = (k) => () => setTouched((t) => ({ ...t, [k]: true }));

  const phone = form.phone.trim();
  const whatsapp = sameAsPhone ? phone : form.whatsapp_number.trim();
  const errors = {
    name: !form.name.trim() ? 'Name is required' : null,
    phone: phone && !isValidPhone(phone) ? 'Enter 10–13 digits (a leading + is allowed)' : null,
    whatsapp_number: !sameAsPhone && whatsapp && !isValidPhone(whatsapp) ? 'Enter 10–13 digits (a leading + is allowed)' : null,
  };
  const show = (k) => (submitted || touched[k]) && errors[k];
  const hasErrors = Object.values(errors).some(Boolean);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (hasErrors) return;
    setSaving(true);
    try {
      const rec = await db.entities.Borrower.create({
        ...form,
        name: form.name.trim(),
        phone,
        whatsapp_number: whatsapp || phone,
        email: form.email.trim(),
        address: form.address.trim(),
      });
      try {
        await db.entities.Activity.create({
          borrower_id: rec.id,
          activity_type: 'borrower_created',
          description: `Borrower ${rec.name} added`,
        });
      } catch (activityErr) {
        // The borrower was saved; don't report the whole action as failed (that invites duplicates).
        console.error('borrower activity log error', activityErr);
      }
      onCreated?.(rec);
      onOpenChange(false);
      toast({ title: `${rec.name || form.name.trim()} added`, description: 'You can now create a loan for them.' });
    } catch (err) {
      console.error('create borrower error', err);
      toast({ variant: 'destructive', title: 'Could not add borrower', description: err?.message || 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const errorClass = 'border-red-300 focus-visible:ring-red-400';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Add Borrower</DialogTitle>
          <DialogDescription>Someone you lend to. Their phone is used for WhatsApp and SMS reminders.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ab-name">Name *</Label>
              <Input
                id="ab-name"
                value={form.name}
                onChange={set('name')}
                onBlur={touch('name')}
                placeholder="Rajesh Kumar"
                autoComplete="name"
                required
                aria-invalid={!!show('name')}
                aria-describedby={show('name') ? 'ab-name-error' : undefined}
                className={`h-10 ${show('name') ? errorClass : ''}`}
              />
              {show('name') && <p id="ab-name-error" className="text-xs text-red-600">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ab-phone">Phone</Label>
              <Input
                id="ab-phone"
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={set('phone')}
                onBlur={touch('phone')}
                placeholder="+91 98765 43210"
                autoComplete="tel"
                aria-invalid={!!show('phone')}
                aria-describedby="ab-phone-help"
                className={`h-10 tnum ${show('phone') ? errorClass : ''}`}
              />
              <p id="ab-phone-help" className={`text-xs ${show('phone') ? 'text-red-600' : 'text-slate-400'}`}>
                {show('phone') || 'Mobile number with country code, e.g. +91'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={sameAsPhone ? undefined : 'ab-whatsapp'}>WhatsApp Number</Label>
              {sameAsPhone ? (
                <div className="flex h-10 items-center rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 tnum">
                  <span className="truncate">{phone || 'Same as phone'}</span>
                </div>
              ) : (
                <Input
                  id="ab-whatsapp"
                  type="tel"
                  inputMode="tel"
                  value={form.whatsapp_number}
                  onChange={set('whatsapp_number')}
                  onBlur={touch('whatsapp_number')}
                  placeholder="Same as phone if empty"
                  aria-invalid={!!show('whatsapp_number')}
                  aria-describedby={show('whatsapp_number') ? 'ab-whatsapp-error' : undefined}
                  className={`h-10 tnum ${show('whatsapp_number') ? errorClass : ''}`}
                />
              )}
              {show('whatsapp_number') && <p id="ab-whatsapp-error" className="text-xs text-red-600">{errors.whatsapp_number}</p>}
              <label htmlFor="ab-same" className="-my-1 flex min-h-10 cursor-pointer items-center gap-2 text-xs text-slate-600">
                <input
                  id="ab-same"
                  type="checkbox"
                  checked={sameAsPhone}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSameAsPhone(checked);
                    // Prefill with the phone when switching to a separate number, so it can be tweaked.
                    if (!checked && !form.whatsapp_number) setForm((f) => ({ ...f, whatsapp_number: f.phone }));
                  }}
                  className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                />
                Same as phone
              </label>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ab-email">Email</Label>
              <Input id="ab-email" type="email" value={form.email} onChange={set('email')} placeholder="name@example.com" autoComplete="email" className="h-10" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ab-address">Address</Label>
            <Input id="ab-address" value={form.address} onChange={set('address')} placeholder="Optional" autoComplete="street-address" className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ab-notes">Notes</Label>
            <Textarea id="ab-notes" value={form.notes} onChange={set('notes')} rows={2} placeholder="Optional notes about this borrower" />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-10 sm:h-9">Cancel</Button>
            <Button type="submit" disabled={saving} className="h-10 bg-emerald-600 hover:bg-emerald-700 sm:h-9">
              {saving ? 'Saving…' : 'Add Borrower'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
