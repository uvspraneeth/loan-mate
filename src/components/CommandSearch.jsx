import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Search, User, Landmark, ArrowRight, CornerDownLeft, ArrowUp, ArrowDown } from 'lucide-react';
import { formatINR } from '@/lib/money';
import { deriveLoanBalance } from '@/lib/loanCalc';
import { cn } from '@/lib/utils';

const MAX_PER_GROUP = 5;

function Kbd({ children }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-slate-200 bg-white px-1 font-sans text-[10px] font-medium text-slate-500">
      {children}
    </kbd>
  );
}

export default function CommandSearch({ open, onOpenChange, borrowers = [], loans = [], installments = [] }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const qDigits = q.replace(/\D/g, '');
    const borrowerById = new Map(borrowers.map((b) => [b.id, b]));

    const borrowerResults = [];
    for (const b of borrowers) {
      const phoneMatch = b.phone?.includes(q) || (qDigits.length >= 3 && String(b.phone || '').replace(/\D/g, '').includes(qDigits));
      if (b.name?.toLowerCase().includes(q) || phoneMatch) {
        borrowerResults.push({ type: 'borrower', id: b.id, title: b.name, sub: b.phone || 'No phone saved', to: `/borrowers?open=${b.id}` });
        if (borrowerResults.length >= MAX_PER_GROUP) break;
      }
    }

    const loanResults = [];
    for (const l of loans) {
      const b = borrowerById.get(l.borrower_id);
      if (l.loan_number?.toLowerCase().includes(q) || b?.name?.toLowerCase().includes(q)) {
        const bal = deriveLoanBalance(installments.filter((i) => i.loan_id === l.id));
        loanResults.push({
          type: 'loan',
          id: l.id,
          title: l.loan_number,
          sub: b?.name || 'Unknown borrower',
          meta: bal.outstanding > 0 ? `${formatINR(bal.outstanding)} due` : 'Settled',
          to: `/loans/${l.id}`,
        });
        if (loanResults.length >= MAX_PER_GROUP) break;
      }
    }

    return [
      { key: 'borrowers', label: 'Borrowers', items: borrowerResults },
      { key: 'loans', label: 'Loans', items: loanResults },
    ].filter((g) => g.items.length > 0);
  }, [query, borrowers, loans, installments]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Reset the highlighted row whenever the result set changes.
  useEffect(() => {
    setActive(0);
  }, [query]);

  // Keep the highlighted row visible while arrowing through results.
  useEffect(() => {
    const r = flat[active];
    if (r) document.getElementById(`cmd-${r.type}-${r.id}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, flat]);

  const go = (r) => {
    onOpenChange(false);
    navigate(r.to);
  };

  const onKeyDown = (e) => {
    if (!flat.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = flat[active];
      if (r) go(r);
    }
  };

  const hasQuery = !!query.trim();
  const activeItem = flat[active];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 overflow-hidden max-w-xl top-[10%] sm:top-[15%] translate-y-0 w-[calc(100%-2rem)] rounded-xl">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">Search borrowers by name or phone, and loans by loan number or borrower name.</DialogDescription>
        <div className="flex h-14 items-center gap-3 border-b border-slate-100 pl-4 pr-12">
          <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search name, phone, or loan number…"
            aria-label="Search borrowers and loans"
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls="cmd-results"
            aria-autocomplete="list"
            aria-activedescendant={activeItem ? `cmd-${activeItem.type}-${activeItem.id}` : undefined}
            className="h-full w-full bg-transparent text-base sm:text-sm outline-none placeholder:text-slate-400"
          />
        </div>

        <div id="cmd-results" role="listbox" aria-label="Search results" className="max-h-[min(20rem,60vh)] overflow-y-auto scrollbar-thin p-2">
          {!hasQuery && (
            <div className="px-3 py-8 text-center">
              <p className="text-sm font-medium text-slate-700">Find anyone or any loan</p>
              <p className="mt-1 text-xs text-slate-400">Try a name like &ldquo;Priya&rdquo;, a phone number, or a loan number like &ldquo;LN-1001&rdquo;.</p>
            </div>
          )}
          {hasQuery && flat.length === 0 && (
            <div className="px-3 py-8 text-center" role="status">
              <p className="text-sm font-medium text-slate-700">No matches for &ldquo;{query.trim()}&rdquo;</p>
              <p className="mt-1 text-xs text-slate-400">Check the spelling, or search by phone number or loan number instead.</p>
            </div>
          )}
          {groups.map((g) => (
            <div key={g.key} role="group" aria-labelledby={`cmd-group-${g.key}`} className="mb-1 last:mb-0">
              <p id={`cmd-group-${g.key}`} className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {g.label}
              </p>
              {g.items.map((r) => {
                const idx = flat.indexOf(r);
                const isActive = idx === active;
                return (
                  <button
                    key={r.type + r.id}
                    id={`cmd-${r.type}-${r.id}`}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    tabIndex={-1}
                    onClick={() => go(r)}
                    onMouseMove={() => { if (!isActive) setActive(idx); }}
                    className={cn(
                      'flex w-full min-h-12 items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                      isActive ? 'bg-emerald-50' : 'hover:bg-slate-50'
                    )}
                  >
                    <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', r.type === 'borrower' ? 'bg-sky-50 text-sky-600' : 'bg-emerald-50 text-emerald-600', isActive && 'bg-white')}>
                      {r.type === 'borrower' ? <User className="h-4 w-4" aria-hidden="true" /> : <Landmark className="h-4 w-4" aria-hidden="true" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{r.title}</p>
                      <p className="text-xs text-slate-500 truncate tnum">{r.sub}</p>
                    </div>
                    {r.meta && <span className="shrink-0 text-xs font-medium text-slate-600 tnum">{r.meta}</span>}
                    <ArrowRight className={cn('h-4 w-4 shrink-0', isActive ? 'text-emerald-600' : 'text-slate-300')} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="hidden sm:flex items-center gap-4 border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] text-slate-500" aria-hidden="true">
          <span className="flex items-center gap-1"><Kbd><ArrowUp className="h-3 w-3" /></Kbd><Kbd><ArrowDown className="h-3 w-3" /></Kbd> to navigate</span>
          <span className="flex items-center gap-1"><Kbd><CornerDownLeft className="h-3 w-3" /></Kbd> to open</span>
          <span className="flex items-center gap-1"><Kbd>Esc</Kbd> to close</span>
          <span className="ml-auto flex items-center gap-1"><Kbd>⌘</Kbd><Kbd>K</Kbd> anytime</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
