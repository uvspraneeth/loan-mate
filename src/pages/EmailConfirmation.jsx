import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { XCircle, Loader2, AlertCircle } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { db } from '@/api/supabaseClient';
import { cn } from '@/lib/utils';

// AuthLayout sets the icon's className, so these wrappers merge in the spin / error color.
const SpinnerIcon = ({ className, ...props }) => <Loader2 className={cn(className, 'animate-spin')} {...props} />;
const ErrorIcon = ({ className, ...props }) => <XCircle className={cn(className, 'text-red-600')} {...props} />;

export default function EmailConfirmation() {
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');
    const code = params.get('code');
    const type = params.get('type') || 'signup';

    const confirm = async () => {
      if (code) {
        const { error: exchangeError } = await db.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
      } else if (tokenHash) {
        await db.auth.confirmEmail(tokenHash, type);
      } else {
        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        if (!hashParams.get('access_token')) {
          throw new Error('This verification link is missing or incomplete.');
        }
      }

      await db.auth.logout();
      window.location.replace('/login?confirmed=1');
    };

    confirm().catch((verificationError) => {
      setError(verificationError.message || 'This verification link is invalid or expired.');
    });
  }, []);

  return (
    <AuthLayout
      icon={error ? ErrorIcon : SpinnerIcon}
      title={error ? 'Verification failed' : 'Confirming your email'}
      subtitle={error ? 'We couldn’t activate your account with this link.' : 'Please wait while we activate your account.'}
    >
      {error ? (
        <div className="space-y-4">
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Links expire after a while and can only be used once. If you already confirmed, just log in. Otherwise, sign up again to get a fresh link.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button asChild className="h-12 font-medium">
              <Link to="/login">Go to log in</Link>
            </Button>
            <Button asChild variant="outline" className="h-12 font-medium">
              <Link to="/register">Sign up again</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div role="status" aria-live="polite" className="space-y-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-emerald-500" />
          </div>
          <p className="text-center text-sm text-muted-foreground">Verifying your link. You&apos;ll be redirected to log in automatically.</p>
        </div>
      )}
    </AuthLayout>
  );
}
