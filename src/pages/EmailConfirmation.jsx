import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { db } from '@/api/supabaseClient';

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
      icon={error ? CheckCircle2 : Loader2}
      title={error ? 'Verification failed' : 'Confirming your email'}
      subtitle={error ? error : 'Please wait while we activate your account.'}
    />
  );
}