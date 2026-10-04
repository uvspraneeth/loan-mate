import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import LockScreen from '@/components/LockScreen';
import { forgetUnlocked, isUnlockedThisSession, markUnlocked } from '@/lib/deviceLock';

// Re-lock when the app comes back after being in the background longer than this.
const LOCK_AFTER_HIDDEN_MS = 60 * 1000;

const AppLockContext = createContext();

// Covers the app with the lock screen while a signed-in user hasn't confirmed it's them
// with the device. Signed out, the login screen is the gate, so there is no lock. A
// password login (or a device unlock) marks this tab unlocked so the reload after
// logging in doesn't ask again. Children stay mounted underneath so unlocking doesn't
// reload data or lose state.
export function AppLockProvider({ enabled, onUsePassword, children }) {
  const [locked, setLocked] = useState(() => !isUnlockedThisSession());
  const isLocked = enabled && locked;
  const isLockedRef = useRef(isLocked);
  const hiddenAt = useRef(null);

  useEffect(() => { isLockedRef.current = isLocked; }, [isLocked]);

  const lock = useCallback(() => {
    forgetUnlocked();
    setLocked(true);
  }, []);

  const unlock = useCallback(() => {
    markUnlocked();
    setLocked(false);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Ignore hides while locked: the system unlock prompt itself backgrounds the page.
        if (!isLockedRef.current) hiddenAt.current = Date.now();
        return;
      }
      if (hiddenAt.current && Date.now() - hiddenAt.current > LOCK_AFTER_HIDDEN_MS) lock();
      hiddenAt.current = null;
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [enabled, lock]);

  return (
    <AppLockContext.Provider value={{ locked: isLocked, lock }}>
      <div inert={isLocked ? '' : undefined} aria-hidden={isLocked || undefined}>
        {children}
      </div>
      {isLocked && <LockScreen onUnlock={unlock} onUsePassword={onUsePassword} />}
    </AppLockContext.Provider>
  );
}

export const useAppLock = () => {
  const context = useContext(AppLockContext);
  if (!context) throw new Error('useAppLock must be used within AppLockProvider');
  return context;
};
