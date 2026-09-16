import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Search, User, Landmark, ArrowRight } from 'lucide-react';
import { formatINR } from '@/lib/money';
import { deriveLoanBalance } from '@/lib/loanCalc';

export default function CommandSearch({ open, onOpenChange, borrowers = [], loans = [], installments = [] }) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    for (const b of borrowers) {
      if (b.name?.toLowerCase().includes(q) || b.phone?.includes(q)) {
        out.push({ type: 'borrower', id: b.id, title: b.name, sub: b.phone, to: `/borrowers?open=${b.id}` });
      }
    }
    for (const l of loans) {
      if (l.loan_number?.toLowerCase().includes(q)) {
        const b = borrowers.find((x) => x.id === l.borrower_id);
        const bal = deriveLoanBalance(installments.filter((i) => i.loan_id === l.id));
        out.push({ type: 'loan', id: l.id, title: l.loan_number, sub: `${b?.name || ''} · Outstanding ${formatINR(bal.outstanding)}`, to: `/loans/${l.id}` });
      }
    }
    return out.slice(0, 8);
  }, [query, borrowers, loans, installments]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 overflow-hidden max-w-xl top-[15%] translate-y-0">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by borrower name, phone, or loan number…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>
        <div className="max-h-80 overflow-y-auto scrollbar-thin p-2">
          {!query.trim() && <p className="px-3 py-6 text-center text-sm text-slate-400">Type to search borrowers and loans.</p>}
          {query.trim() && results.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-400">No matches found.</p>}
          {results.map((r) => (
            <button
              key={r.type + r.id}
              onClick={() => { onOpenChange(false); navigate(r.to); }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-slate-50"
            >
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${r.type === 'borrower' ? 'bg-sky-50 text-sky-600' : 'bg-emerald-50 text-emerald-600'}`}>
                {r.type === 'borrower' ? <User className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{r.title}</p>
                <p className="text-xs text-slate-400 truncate">{r.sub}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-300" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}