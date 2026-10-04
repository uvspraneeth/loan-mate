import { Capacitor, registerPlugin } from '@capacitor/core';

// Unlocks the app with the device's own security: fingerprint / face / screen PIN on
// Android (native BiometricPrompt), Windows Hello / Touch ID / device PIN in browsers
// (WebAuthn platform authenticator). This gates the UI only; the data itself is
// protected by the device's Supabase session and RLS.

// Native side: android/app/src/main/java/com/loanmate/app/DeviceLockPlugin.java
const NativeDeviceLock = registerPlugin('DeviceLock');

const CREDENTIAL_KEY = 'loanmate.deviceLock.credentialId';
const UNLOCKED_KEY = 'loanmate.deviceLock.unlocked';

// Per-tab (sessionStorage) flag: set after a device unlock or a password login, cleared
// whenever the app locks. Lets a page reload skip the lock without letting it bypass one.
export const isUnlockedThisSession = () => sessionStorage.getItem(UNLOCKED_KEY) === '1';
export const markUnlocked = () => sessionStorage.setItem(UNLOCKED_KEY, '1');
export const forgetUnlocked = () => sessionStorage.removeItem(UNLOCKED_KEY);

export const isNativeLock = () => Capacitor.isNativePlatform();

export async function isDeviceLockAvailable() {
  try {
    if (isNativeLock()) {
      const { available } = await NativeDeviceLock.isAvailable();
      return available;
    }
    return Boolean(await window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.());
  } catch (e) {
    console.error('device lock availability error', e);
    return false;
  }
}

const randomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));
const toBase64 = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));
const fromBase64 = (value) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

async function unlockWithWebAuthn() {
  const credentialId = localStorage.getItem(CREDENTIAL_KEY);
  if (!credentialId) {
    // First unlock in this browser: register a platform credential. Creating it already
    // requires the device's user verification, so this step is gated too.
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: 'LoanMate' },
        user: { id: randomBytes(16), name: 'LoanMate', displayName: 'LoanMate' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60000,
      },
    });
    localStorage.setItem(CREDENTIAL_KEY, toBase64(credential.rawId));
    return;
  }
  await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: 'public-key', id: fromBase64(credentialId), transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
}

export async function unlockWithDevice() {
  if (isNativeLock()) {
    await NativeDeviceLock.authenticate({ reason: 'Confirm it’s you to open LoanMate' });
  } else {
    await unlockWithWebAuthn();
  }
}

// Browser only: forget the registered credential so the next unlock registers a new one
// (still verified by the device). For when the passkey was removed from the OS.
export const hasWebCredential = () => Boolean(localStorage.getItem(CREDENTIAL_KEY));
export const resetWebCredential = () => localStorage.removeItem(CREDENTIAL_KEY);

export function describeUnlockError(error) {
  if (error?.name === 'NotAllowedError') return 'Unlock was cancelled or timed out.';
  return error?.message || 'Could not unlock. Try again.';
}
