import { Outlet, NavLink } from 'react-router-dom';
import { Wallet, Users, Landmark, BarChart3, Settings, Upload, Search, ScrollText, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import CommandSearch from '@/components/CommandSearch';
import { useLending } from '@/lib/LendingContext';
import { useEffect, useState } from 'react';

const NAV = [
  { to: '/', label: 'Dashboard', icon: Wallet, end: true },
  { to: '/borrowers', label: 'Borrowers', icon: Users },
  { to: '/loans', label: 'Loans', icon: Landmark },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/import', label: 'Import / Export', icon: Upload },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [cmdOpen, setCmdOpen] = useState(false);
  const { borrowers, loans, installments, payments } = useLending();
  const pendingVerify = payments.filter((p) => !p.verified).length;

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const displayName = user?.full_name || user?.email?.split('@')[0] || 'Sai';
  const first = displayName.split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const handleLogout = async () => {
    await logout();
    window.location.assign('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 px-5 h-16 border-b border-slate-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <ScrollText className="h-4 w-4" />
          </div>
          <div>
            <p className="font-display font-bold text-slate-900 leading-none">LoanMate</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Simple lending. Clear payments.</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
              {item.to === '/' && pendingVerify > 0 && (
                <span className="ml-auto rounded-full bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5">{pendingVerify}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
              {first?.[0]?.toUpperCase() || 'A'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">{displayName}</p>
              <p className="text-xs text-slate-400 truncate">{user?.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="md:pl-60">
        {/* Top header */}
        <header className="sticky top-0 z-30 flex items-center gap-3 h-16 px-4 md:px-8 border-b border-slate-200 bg-background/80 backdrop-blur">
          <div className="md:hidden flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <ScrollText className="h-4 w-4" />
            </div>
            <span className="font-display font-bold text-slate-900">LoanMate</span>
          </div>
          <button
            onClick={() => setCmdOpen(true)}
            className="ml-auto md:ml-0 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400 hover:border-slate-300 w-full max-w-md"
          >
            <Search className="h-4 w-4" />
            <span>Search borrowers, loans…</span>
            <kbd className="ml-auto hidden md:inline rounded border border-slate-200 bg-slate-50 px-1.5 text-[10px] text-slate-400">⌘K</kbd>
          </button>
          <button
            onClick={handleLogout}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </header>

        <main className="px-4 md:px-8 py-6 pb-24 md:pb-8">
          <Outlet context={{ greeting, first }} />
        </main>
      </div>

      {/* Mobile bottom bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 flex items-center justify-around border-t border-slate-200 bg-white h-16 px-2">
        {NAV.slice(0, 4).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn('flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-medium', isActive ? 'text-emerald-600' : 'text-slate-400')
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label === 'Dashboard' ? 'Home' : item.label}
            {item.to === '/' && pendingVerify > 0 && (
              <span className="absolute -mt-1 ml-4 rounded-full bg-amber-500 text-white text-[9px] font-bold px-1">{pendingVerify}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <CommandSearch
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        borrowers={borrowers}
        loans={loans}
        installments={installments}
      />
    </div>
  );
}