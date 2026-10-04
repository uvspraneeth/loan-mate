import { useCallback, useEffect, useRef, useState } from 'react';
import { Fingerprint, Loader2, Lock, ShieldAlert } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { Button } from '@/components/ui/button';
import {
  describeUnlockError,
  hasWebCredential,
  isDeviceLockAvailable,
  isNativeLock,
  resetWebCredential,
  unlockWithDevice,
} from '@/lib/deviceLock';

export default function LockScreen({ onUnlock, onUsePassword }) {
  const [status, setStatus] = useState('checking'); // checking | ready | unlocking | unavailable
  const [error, setError] = useState('');
  const autoPrompted = useRef(false);

  const unlock = useCallback(async () => {
    setStatus('unlocking');
    setError('');
    try {
      await unlockWithDevice();
      onUnlock();
    } catch (e) {
      setError(describeUnlockError(e));
      setStatus('ready');
    }
  }, [onUnlock]);

  useEffect(() => {
    let cancelled = false;
    isDeviceLockAvailable().then((available) => {
      if (cancelled) return;
      setStatus(available ? 'ready' : 'unavailable');
      // Android shows the system prompt straight away; browsers need a tap first.
      if (available && isNativeLock() && !autoPrompted.current) {
        autoPrompted.current = true;
        unlock();
      }
    });
    return () => { cancelled = true; };
  }, [unlock]);

  const setUpAgain = () => {
    resetWebCredential();
    unlock();
  };

  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto bg-background">
      {status === 'unavailable' ? (
        <AuthLayout icon={ShieldAlert} title="No screen lock" subtitle="This device has no fingerprint, face unlock or screen PIN set up.">
          <p className="text-sm text-muted-foreground mb-6">
            Set one up in your device settings so LoanMate can stay locked when you&apos;re not using it.
          </p>
          <Button onClick={onUnlock} variant="outline" className="h-11 w-full">Continue without lock</Button>
        </AuthLayout>
      ) : (
        <AuthLayout icon={Lock} title="LoanMate is locked" subtitle="Use your fingerprint, face or device PIN to continue.">
          <Button
            onClick={unlock}
            disabled={status !== 'ready'}
            aria-busy={status === 'unlocking'}
            className="h-11 w-full bg-emerald-600 hover:bg-emerald-700"
          >
            {status === 'ready'
              ? <Fingerprint className="h-4 w-4" aria-hidden="true" />
              : <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {status === 'unlocking' ? 'Waiting for device…' : 'Unlock'}
          </Button>
          <p className="mt-3 min-h-5 text-center text-sm text-red-600" role="alert">{error}</p>
          {error && !isNativeLock() && hasWebCredential() && (
            <button type="button" onClick={setUpAgain} className="mt-1 w-full text-center text-xs text-slate-500 underline-offset-2 hover:underline">
              Removed this browser&apos;s passkey? Set up the lock again
            </button>
          )}
          {onUsePassword && (
            <button type="button" onClick={onUsePassword} className="mt-4 w-full min-h-10 text-center text-sm font-medium text-primary hover:underline">
              Log in with password instead
            </button>
          )}
        </AuthLayout>
      )}
    </div>
  );
}
