import { Link, useLocation, useNavigate } from 'react-router-dom';

import { ArrowLeft, LayoutDashboard } from 'lucide-react';
import { LogoMark } from '@/components/Logo';
import { Button } from '@/components/ui/button';

export default function PageNotFound() {
    const location = useLocation();
    const navigate = useNavigate();
    const pagePath = location.pathname;

    const canGoBack = typeof window !== 'undefined' && window.history.length > 1;

    return (
        <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
            <div className="w-full max-w-md text-center">
                <div className="relative mx-auto mb-6 inline-flex">
                    <LogoMark className="h-16 w-16 drop-shadow-sm" />
                    <span className="absolute -bottom-2 -right-3 rounded-full border border-slate-200 bg-white px-2 py-0.5 font-display text-xs font-bold text-slate-500 shadow-sm tnum">
                        404
                    </span>
                </div>

                <p className="font-display text-sm font-semibold tracking-wide text-emerald-700">LoanMate</p>
                <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-slate-900">
                    This page went missing
                </h1>
                <p className="mt-3 text-slate-600 leading-relaxed">
                    We couldn&apos;t find{' '}
                    <code className="break-all rounded bg-white px-1.5 py-0.5 text-sm text-slate-700 ring-1 ring-slate-200">{pagePath}</code>.
                    {' '}It may have moved, or the link might be mistyped. Your loans and payments are safe.
                </p>

                <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
                    {canGoBack && (
                        <Button type="button" variant="outline" onClick={() => navigate(-1)} className="h-11 bg-white">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Go back
                        </Button>
                    )}
                    <Button asChild className="h-11 bg-emerald-600 hover:bg-emerald-700">
                        <Link to="/"><LayoutDashboard className="h-4 w-4" aria-hidden="true" /> Go to dashboard</Link>
                    </Button>
                </div>
            </div>
        </main>
    );
}
