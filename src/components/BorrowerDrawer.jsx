import { useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { MessageCircle, Smartphone, Plus, Phone, MapPin, Mail, Landmark, Receipt, BellRing, History, ChevronRight } from 'lucide-react';
import { formatINR } from '@/lib/money';
import { deriveLoanBalance } from '@/lib/loanCalc';
import { buildDueReminder, buildPaymentRequest, whatsappUrl, smsUrl } from '@/lib/messages';
import { logNotification } from '@/lib/paymentService';
import StatusBadge from '@/components/StatusBadge';
import { EmptyState } from '@/components/PageState';
import { toast } from '@/components/ui/use-toast';

// Date-only strings ('YYYY-MM-DD') are parsed as local dates to avoid a UTC off-by-one.
function toDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
}

function fmtDate(v, opts = { day: 'numeric', month: 'short' }) {
  return v ? toDate(v).toLocaleDateString('en-IN', opts) : '—';
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function telHref(phone) {
  return `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;
}

function Section({ title, icon: Icon, children, action }) {
  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />} {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function ContactLink({ href, icon: Icon, iconClass, label, sub, external }) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconClass}`} aria-hidden="true"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate tnum">{label}</span>
        <span className="block text-xs text-slate-400">{sub}</span>
      </span>
    </a>
  );
}

function PaymentStatusChip({ p }) {
  const [label, cls] = p.verified
    ? ['Verified', 'text-emerald-600']
    : p.rejected_at
      ? ['Rejected', 'text-red-600']
      : ['Pending', 'text-amber-600'];
  return <span className={`text-xs font-medium ${cls}`}>{label}</span>;
}

export default function BorrowerDrawer({ open, onOpenChange, borrower, loans, installments, payments, activities, notifications, settings, onNewLoan, onOpenLoan, onReload }) {
  const myLoans = useMemo(() => loans.filter((l) => l.borrower_id === borrower?.id), [loans, borrower]);
  const myInstallments = useMemo(() => installments.filter((i) => myLoans.some((l) => l.id === i.loan_id)), [installments, myLoans]);
  const myPayments = useMemo(() => payments.filter((p) => p.borrower_id === borrower?.id).sort((a, b) => toDate(b.payment_date) - toDate(a.payment_date)), [payments, borrower]);
  const myActivities = useMemo(() => activities.filter((a) => a.borrower_id === borrower?.id).sort((a, b) => new Date(b.created_date) - new Date(a.created_date)), [activities, borrower]);
  const myNotifs = useMemo(() => notifications.filter((n) => n.borrower_id === borrower?.id).sort((a, b) => new Date(b.created_date) - new Date(a.created_date)), [notifications, borrower]);

  if (!borrower) return null;

  const totalBorrowed = myLoans.reduce((s, l) => s + (l.principal_amount || 0), 0);
  let totalPaid = 0, outstanding = 0, totalDue = 0;
  const loanRows = myLoans.map((l) => {
    const insts = myInstallments.filter((i) => i.loan_id === l.id);
    const bal = deriveLoanBalance(insts);
    totalPaid += bal.totalPaid;
    outstanding += bal.outstanding;
    totalDue += bal.totalDue;
    const effectiveStatus = l.status === 'active' && insts.some((i) => i.status === 'overdue') ? 'overdue' : l.status;
    const pct = bal.totalDue > 0 ? Math.min(100, Math.round((bal.totalPaid / bal.totalDue) * 100)) : 0;
    return { l, bal, effectiveStatus, pct };
  });
  const overallPct = totalDue > 0 ? Math.min(100, Math.round((totalPaid / totalDue) * 100)) : 0;
  const nextInst = myInstallments
    .filter((i) => i.status !== 'paid' && i.status !== 'waived')
    .sort((a, b) => toDate(a.due_date) - toDate(b.due_date))[0];
  const whatsappNumber = borrower.whatsapp_number || borrower.phone;
  const hasContact = borrower.phone || whatsappNumber || borrower.email || borrower.address;

  const sendReminder = async (channel) => {
    if (!nextInst) return;
    const loan = myLoans.find((l) => l.id === nextInst.loan_id);
    const msg = buildDueReminder({ borrower, installment: nextInst, loan, settings });
    if (channel === 'whatsapp') window.open(whatsappUrl(borrower.whatsapp_number || borrower.phone, msg), '_blank');
    else window.open(smsUrl(borrower.phone, buildPaymentRequest({ borrower, installment: nextInst, settings })), '_blank');
    try {
      await logNotification({ borrower, loan, installment: nextInst, channel, messageType: 'due_reminder', message: msg, status: 'opened' });
      onReload?.();
    } catch (err) {
      console.error('log reminder error', err);
      toast({ variant: 'destructive', title: 'Reminder not logged', description: err.message });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-slate-100 px-5 py-5 pr-12 text-left sm:px-6">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-100">
              {initials(borrower.name)}
            </span>
            <div className="min-w-0">
              <SheetTitle className="truncate font-display text-slate-900">{borrower.name}</SheetTitle>
              <SheetDescription className="text-xs text-slate-500 tnum">
                {myLoans.length} {myLoans.length === 1 ? 'loan' : 'loans'} · {formatINR(outstanding)} outstanding
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 scrollbar-thin sm:px-6">
          {/* Contact */}
          {hasContact && (
            <Section title="Contact">
              <div className="-mx-2 space-y-0.5">
                {borrower.phone && (
                  <ContactLink href={telHref(borrower.phone)} icon={Phone} iconClass="bg-slate-100 text-slate-600" label={borrower.phone} sub="Tap to call" />
                )}
                {whatsappNumber && (
                  <ContactLink href={whatsappUrl(whatsappNumber)} external icon={MessageCircle} iconClass="bg-emerald-50 text-emerald-600" label={whatsappNumber} sub="Open WhatsApp chat" />
                )}
                {borrower.email && (
                  <ContactLink href={`mailto:${borrower.email}`} icon={Mail} iconClass="bg-slate-100 text-slate-600" label={borrower.email} sub="Send email" />
                )}
                {borrower.address && (
                  <div className="flex items-start gap-3 px-2 py-1.5 text-sm text-slate-600">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500" aria-hidden="true"><MapPin className="h-4 w-4" /></span>
                    <span className="min-w-0 pt-1.5">{borrower.address}</span>
                  </div>
                )}
              </div>
              {borrower.notes && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm italic text-slate-500">{borrower.notes}</p>}
            </Section>
          )}
          {!hasContact && borrower.notes && <p className="rounded-lg bg-slate-50 p-3 text-sm italic text-slate-500">{borrower.notes}</p>}

          {/* Financial summary */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Borrowed</p>
                <p className="truncate font-semibold text-slate-800 tnum">{formatINR(totalBorrowed)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Paid</p>
                <p className="truncate font-semibold text-emerald-600 tnum">{formatINR(totalPaid)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Outstanding</p>
                <p className="truncate font-semibold text-slate-900 tnum">{formatINR(outstanding)}</p>
              </div>
            </div>
            {totalDue > 0 && (
              <div
                className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-label="Overall repayment progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={overallPct}
              >
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${overallPct}%` }} />
              </div>
            )}

            {nextInst && (
              <div className={`mt-4 rounded-lg p-3 ${nextInst.status === 'overdue' ? 'bg-red-50' : 'bg-slate-50'}`}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-500">Next due</span>
                  <span className="text-right font-semibold text-slate-900 tnum">
                    {formatINR(nextInst.total_due - (nextInst.amount_paid || 0))}
                    <span className={`ml-1.5 font-normal ${nextInst.status === 'overdue' ? 'text-red-600' : 'text-slate-500'}`}>
                      · {fmtDate(nextInst.due_date, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => sendReminder('whatsapp')} className="h-10 flex-1 bg-emerald-600 hover:bg-emerald-700"><MessageCircle className="h-4 w-4" /> WhatsApp</Button>
                  <Button variant="outline" onClick={() => sendReminder('sms')} className="h-10 flex-1 bg-white"><Smartphone className="h-4 w-4" /> SMS</Button>
                </div>
              </div>
            )}
          </div>

          {/* Loans */}
          <Section
            title="Loans"
            icon={Landmark}
            action={
              <Button variant="ghost" size="sm" className="h-9 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800" onClick={() => onNewLoan?.(borrower.id)}>
                <Plus className="h-4 w-4" /> New Loan
              </Button>
            }
          >
            {loanRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200">
                <EmptyState
                  compact
                  icon={Landmark}
                  title="No loans yet"
                  description={`Create a loan for ${borrower.name} to generate a repayment schedule.`}
                  action={
                    <Button onClick={() => onNewLoan?.(borrower.id)} className="h-10 bg-emerald-600 hover:bg-emerald-700">
                      <Plus className="h-4 w-4" /> New Loan
                    </Button>
                  }
                />
              </div>
            ) : (
              <ul className="space-y-2">
                {loanRows.map(({ l, bal, effectiveStatus, pct }) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => onOpenLoan?.(l.id)}
                      className="group w-full rounded-lg border border-slate-200 p-3 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-800">{l.loan_number}</span>
                        <span className="flex items-center gap-1">
                          <StatusBadge status={effectiveStatus} />
                          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-emerald-500" aria-hidden="true" />
                        </span>
                      </div>
                      <div className="mt-1.5 flex justify-between text-sm">
                        <span className="text-slate-400">Outstanding</span>
                        <span className="font-semibold text-slate-900 tnum">{formatINR(bal.outstanding)}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div
                          className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"
                          role="progressbar"
                          aria-label={`${l.loan_number} repayment progress`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={pct}
                        >
                          <div className={`h-full rounded-full ${effectiveStatus === 'overdue' ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-9 text-right text-[11px] font-medium text-slate-500 tnum">{pct}%</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Payment history */}
          <Section title="Payments" icon={Receipt}>
            {myPayments.length === 0 ? (
              <EmptyState compact icon={Receipt} title="No payments recorded" />
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {myPayments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="text-slate-700 tnum">{fmtDate(p.payment_date)}</p>
                      <p className="truncate text-xs capitalize text-slate-400">{String(p.payment_method || 'payment').replace(/_/g, ' ')}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold text-slate-900 tnum">{formatINR(p.amount)}</p>
                      <PaymentStatusChip p={p} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Communication history */}
          <Section title="Reminders sent" icon={BellRing}>
            {myNotifs.length === 0 ? (
              <EmptyState compact icon={BellRing} title="No messages sent yet" />
            ) : (
              <ul className="space-y-2">
                {myNotifs.map((n) => (
                  <li key={n.id} className="flex items-center gap-2.5 text-sm">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${n.channel === 'whatsapp' ? 'bg-emerald-500' : 'bg-sky-500'}`} aria-hidden="true" />
                    <span className="w-14 shrink-0 text-xs text-slate-400 tnum">{fmtDate(n.created_date)}</span>
                    <span className="min-w-0 capitalize text-slate-600">{n.channel} · {(n.message_type || 'message').replace(/_/g, ' ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Activity timeline */}
          <Section title="Activity" icon={History}>
            {myActivities.length === 0 ? (
              <EmptyState compact icon={History} title="No activity yet" />
            ) : (
              <ol className="space-y-2.5">
                {myActivities.map((a) => (
                  <li key={a.id} className="flex items-start gap-2.5 text-sm">
                    <span className="w-14 shrink-0 text-xs leading-5 text-slate-400 tnum">{fmtDate(a.created_date)}</span>
                    <span className="min-w-0 text-slate-600">{a.description}</span>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
