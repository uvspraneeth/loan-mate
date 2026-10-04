import { forwardRef, useEffect, useRef, useState } from 'react';
import { Share2, MessageCircle, Copy, Download, CheckCircle2, CircleDashed, PartyPopper, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LogoMark } from '@/components/Logo';
import { toast } from '@/components/ui/use-toast';
import { formatINR } from '@/lib/money';
import { buildReceiptText, formatReceiptDate } from '@/lib/receipt';
import { whatsappUrl } from '@/lib/messages';
import { cn } from '@/lib/utils';

function Row({ label, children, strong }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className={cn('text-right', strong ? 'font-semibold text-slate-900' : 'font-medium text-slate-800')}>{children}</span>
    </div>
  );
}

// The visual receipt. Kept to plain colours/fonts so it renders cleanly to an image.
export const ReceiptCard = forwardRef(function ReceiptCard({ receipt: r, className }, ref) {
  return (
    <div ref={ref} className={cn('mx-auto w-full max-w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900', className)}>
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 px-5 pb-5 pt-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white">
              <LogoMark className="h-6 w-6" />
            </span>
            <div>
              <p className="font-display font-bold leading-none">LoanMate</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wider text-emerald-100">Payment receipt</p>
            </div>
          </div>
          <span className="font-mono text-[10px] text-emerald-100">{r.number}</span>
        </div>
        <p className="mt-5 text-xs text-emerald-100">Amount received</p>
        <p className="font-display text-3xl font-bold tracking-tight tnum">{formatINR(r.amount)}</p>
        <p className="mt-1 text-xs text-emerald-100">{formatReceiptDate(r.paymentDate)} · {r.method}</p>
      </div>

      <div className="space-y-2.5 px-5 pt-4 text-sm">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide',
            r.fullyPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          )}
        >
          {r.fullyPaid ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />}
          {r.fullyPaid ? 'Paid in full' : 'Part payment'}
        </span>
        <Row label="Received from" strong>{r.borrowerName}</Row>
        <Row label="Loan">{r.loanNumber}</Row>
        <Row label="Installment">
          {r.installmentNumber}{r.termMonths ? ` of ${r.termMonths}` : ''}
          {r.forMonth && <span className="block text-xs font-normal text-slate-500">{r.forMonth}</span>}
        </Row>
        {r.reference && <Row label="Reference"><span className="break-all font-mono text-xs">{r.reference}</span></Row>}
        {!r.fullyPaid && <Row label="Still due on this installment"><span className="text-amber-700 tnum">{formatINR(r.remainingOnInstallment)}</span></Row>}
      </div>

      <div className="mx-5 my-4 border-t border-dashed border-slate-300" />

      <div className="space-y-2.5 px-5 pb-4 text-sm">
        {r.loanSettled ? (
          <p className="flex items-center justify-center gap-2 rounded-lg bg-emerald-50 py-2.5 font-semibold text-emerald-700">
            <PartyPopper className="h-4 w-4" aria-hidden="true" /> Loan fully repaid
          </p>
        ) : (
          <>
            {r.loanOutstanding != null && <Row label="Loan balance" strong><span className="tnum">{formatINR(r.loanOutstanding)}</span></Row>}
            {r.next && <Row label="Next due"><span className="tnum">{formatINR(r.next.amount)}</span> · {formatReceiptDate(r.next.date)}</Row>}
          </>
        )}
      </div>

      <div className="bg-slate-50 px-5 py-3 text-center text-[11px] text-slate-500">
        {r.receivedBy ? <>Received by <span className="font-medium text-slate-700">{r.receivedBy}</span> · </> : null}
        Thank you!
      </div>
    </div>
  );
});

async function renderReceiptImage(node, fileName) {
  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not render receipt image');
  return new File([blob], fileName, { type: 'image/png' });
}

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Receipt card + share actions. `onShared(channel, text)` lets the caller log the send.
export default function PaymentReceipt({ receipt, onShared, title = 'Payment recorded', className }) {
  const cardRef = useRef(null);
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(null);
  const text = buildReceiptText(receipt);

  // Render the image up front so the share sheet opens straight from the tap
  // (browsers only allow navigator.share during a fresh user gesture).
  // Wait for the dialog/sheet open animation and web fonts so the capture isn't scaled mid-transition.
  useEffect(() => {
    let cancelled = false;
    setImage(null);
    const id = setTimeout(async () => {
      try {
        await document.fonts?.ready;
        if (cancelled || !cardRef.current) return;
        const file = await renderReceiptImage(cardRef.current, `${receipt.number}.png`);
        if (!cancelled) setImage(file);
      } catch (err) {
        console.warn('receipt image render failed', err);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(id); };
  }, [receipt]);

  const canShareImage = !!image && typeof navigator !== 'undefined' && navigator.canShare?.({ files: [image] });
  const canShareText = typeof navigator !== 'undefined' && !!navigator.share;

  const share = async () => {
    setBusy('share');
    try {
      if (canShareImage) {
        await navigator.share({ files: [image], title: `Receipt ${receipt.number}`, text });
      } else if (canShareText) {
        await navigator.share({ title: `Receipt ${receipt.number}`, text });
      } else if (image) {
        downloadFile(image);
        toast({ title: 'Receipt saved', description: 'Attach the image in WhatsApp or any chat.' });
      } else {
        await navigator.clipboard.writeText(text);
        toast({ title: 'Receipt copied', description: 'Paste it into any chat.' });
      }
      onShared?.('share', text);
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('share receipt error', err);
        toast({ variant: 'destructive', title: 'Could not share receipt', description: err.message });
      }
    } finally {
      setBusy(null);
    }
  };

  const sendWhatsApp = () => {
    window.open(whatsappUrl(receipt.borrowerPhone, text), '_blank');
    onShared?.('whatsapp', text);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Receipt copied' });
      onShared?.('copy', text);
    } catch {
      toast({ variant: 'destructive', title: 'Copy not available on this device' });
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div role="status" className="flex items-center justify-center gap-2 text-sm font-semibold text-emerald-700">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {title}
      </div>

      <ReceiptCard ref={cardRef} receipt={receipt} className="shadow-[0_4px_24px_rgba(15,23,42,0.08)]" />

      <div className="mx-auto max-w-[360px] space-y-2">
        <Button type="button" onClick={share} disabled={busy === 'share'} className="h-11 w-full bg-emerald-600 text-base hover:bg-emerald-700">
          {busy === 'share' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Share2 className="h-4 w-4" aria-hidden="true" />}
          Share receipt
        </Button>
        <div className={cn('grid gap-2', image ? 'grid-cols-3' : 'grid-cols-2')}>
          <Button type="button" variant="outline" onClick={sendWhatsApp} className="h-10" aria-label={`Send receipt to ${receipt.borrowerName} on WhatsApp`}>
            <MessageCircle className="h-4 w-4 text-emerald-600" aria-hidden="true" /> WhatsApp
          </Button>
          <Button type="button" variant="outline" onClick={copy} className="h-10" aria-label="Copy receipt text">
            <Copy className="h-4 w-4" aria-hidden="true" /> Copy
          </Button>
          {image && (
            <Button type="button" variant="outline" onClick={() => { downloadFile(image); onShared?.('download', text); }} className="h-10" aria-label="Download receipt image">
              <Download className="h-4 w-4" aria-hidden="true" /> Save
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
