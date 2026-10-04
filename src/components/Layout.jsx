import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Wallet, Users, Landmark, BarChart3, Settings, Upload, Search, Lock, LogOut, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { useAppLock } from '@/lib/AppLock';
import { forgetUnlocked } from '@/lib/deviceLock';
import CommandSearch from '@/components/CommandSearch';
import Logo from '@/components/Logo';
import { useLending } from '@/lib/LendingContext';
import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const NAV = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: Wallet, end: true },
  { to: '/borrowers', label: 'Borrowers', icon: Users },
  { to: '/loans', label: 'Loans', icon: Landmark },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/import', label: 'Import / Export', icon: Upload },
  { to: '/settings', label: 'Settings', icon: Settings },
];
const MOBILE_PRIMARY = NAV.slice(0, 4);
const MOBILE_MORE = NAV.slice(4);

function CountBadge({ count, className }) {
  if (!count) return null;
  return (
    <span className={cn('rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white tnum', className)} aria-label={`${count} payments need verification`}>
      {count}
    </span>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { lock } = useAppLock();
  const location = useLocation();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { borrowers, loans, installments, payments } = useLending();
  const pendingVerify = payments.filter((p) => !p.verified && !p.rejected_at).length;

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

  // Close the mobile "More" sheet after navigating
  useEffect(() => setMoreOpen(false), [location.pathname]);

  const displayName = user?.full_name || user?.email?.split('@')[0] || 'there';
  const first = displayName.split(' ')[0];
  const initial = first?.[0]?.toUpperCase() || 'L';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const moreActive = MOBILE_MORE.some((item) => location.pathname.startsWith(item.to));

  const handleLock = () => {
    setMoreOpen(false);
    lock();
  };

  const handleLogout = async () => {
    forgetUnlocked();
    await logout();
    window.location.assign('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center px-5 h-16 border-b border-slate-100">
          <Logo tagline />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Main">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute inset-y-1.5 -left-3 w-1 rounded-r-full bg-emerald-600" aria-hidden="true" />}
                  <item.icon className={cn('h-4 w-4', isActive ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-600')} />
                  {item.label}
                  {item.to === '/' && <CountBadge count={pendingVerify} className="ml-auto" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3">
          <div className="flex items-center gap-2 rounded-lg p-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-700 truncate">{displayName}</p>
              <p className="text-xs text-slate-400 truncate">{user?.email}</p>
            </div>
            <button
              onClick={handleLock}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Lock now"
              title="Lock now"
            >
              <Lock className="h-4 w-4" />
            </button>
            <button
              onClick={handleLogout}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="md:pl-60">
        {/* Top header */}
        <header className="sticky top-0 z-30 flex items-center gap-3 h-16 px-4 md:px-8 border-b border-slate-200 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <Logo className="md:hidden" markClassName="h-7 w-7" />
          <button
            onClick={() => setCmdOpen(true)}
            className="ml-auto md:ml-0 flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-400 hover:border-slate-300 w-10 sm:w-full max-w-md justify-center sm:justify-start"
            aria-label="Search borrowers and loans"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Search borrowers, loans…</span>
            <kbd className="ml-auto hidden md:inline rounded border border-slate-200 bg-slate-50 px-1.5 text-[10px] text-slate-400">⌘K</kbd>
          </button>
        </header>

        <main className="mx-auto max-w-7xl px-4 md:px-8 py-6 pb-28 md:pb-10">
          <Outlet context={{ greeting, first }} />
        </main>
      </div>

      {/* Mobile bottom bar */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur h-16 pb-[env(safe-area-inset-bottom)]"
        aria-label="Main"
      >
        {MOBILE_PRIMARY.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn('relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium', isActive ? 'text-emerald-600' : 'text-slate-400')
            }
          >
            <span className="relative">
              <item.icon className="h-5 w-5" />
              {item.to === '/' && <CountBadge count={pendingVerify} className="absolute -top-1.5 -right-3" />}
            </span>
            {item.short || item.label}
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          className={cn('flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium', moreActive ? 'text-emerald-600' : 'text-slate-400')}
          aria-label="More options"
        >
          <MoreHorizontal className="h-5 w-5" />
          More
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <SheetHeader className="text-left">
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-sm font-semibold">{initial}</div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{displayName}</p>
              <p className="text-xs text-slate-400 truncate">{user?.email}</p>
            </div>
          </div>
          <div className="mt-3 space-y-1">
            {MOBILE_MORE.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn('flex h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium', isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-700 hover:bg-slate-50')
                }
              >
                <item.icon className="h-5 w-5 text-slate-400" />
                {item.label}
              </NavLink>
            ))}
            <button onClick={handleLock} className="flex h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Lock className="h-5 w-5 text-slate-400" />
              Lock now
            </button>
            <button onClick={handleLogout} className="flex h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-red-600 hover:bg-red-50">
              <LogOut className="h-5 w-5" />
              Log out
            </button>
          </div>
        </SheetContent>
      </Sheet>

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
