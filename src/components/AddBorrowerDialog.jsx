import { db } from '@/api/supabaseClient';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function AddBorrowerDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState({ name: '', phone: '', whatsapp_number: '', email: '', address: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const rec = await db.entities.Borrower.create({
        ...form,
        whatsapp_number: form.whatsapp_number || form.phone,
      });
      await db.entities.Activity.create({
        borrower_id: rec.id,
        activity_type: 'borrower_created',
        description: `Borrower ${rec.name} added`,
      });
      onCreated?.(rec);
      setForm({ name: '', phone: '', whatsapp_number: '', email: '', address: '', notes: '' });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Borrower</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={set('name')} placeholder="Rajesh Kumar" required />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp Number</Label>
              <Input value={form.whatsapp_number} onChange={set('whatsapp_number')} placeholder="Same as phone if empty" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={set('email')} placeholder="name@example.com" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input value={form.address} onChange={set('address')} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Optional notes about this borrower" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.name.trim()} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Saving…' : 'Add Borrower'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}