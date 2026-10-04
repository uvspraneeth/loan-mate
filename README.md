# LoanMate

Simple lending. Clear payments. A private loan manager for family & friends lending, built with React + Vite and Supabase (email/password auth, Postgres with row-level security, realtime updates, and payment-proof storage).

## Login and app lock

You sign in with email and password. The session is remembered, so after that the app opens behind a lock screen that uses the device's own security:

- **Android:** fingerprint, face unlock, or the screen PIN / pattern / password (`DeviceLockPlugin.java`, built on AndroidX BiometricPrompt).
- **Browser:** Windows Hello, Touch ID, or the device PIN, through a WebAuthn platform credential. This needs `localhost` or HTTPS.

You aren't asked right after logging in with your password. The app locks again after it has been in the background for more than a minute, or when you tap **Lock now**. If the device can't verify you, **Log in with password instead** signs you out so you can log in again. If the device has no screen lock set up, you can continue without one.

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/migrations/20261004000000_loanmate_schema.sql` in the Supabase SQL editor (or `supabase link` + `supabase db push`). It is idempotent and also upgrades older databases.
3. Copy `.env.example` to `.env.local` and add the project URL and anon key (Project Settings -> API).
4. In **Authentication -> URL Configuration**, set the Site URL to `http://localhost:5173` (or your deployed URL) and add `<site>/auth/confirm` and `<site>/reset-password` as redirect URLs.
5. Supabase's built-in email sender only delivers to members of your Supabase organization and is heavily rate-limited. For real users, set up your own email server under **Authentication -> Emails -> SMTP Settings**.

## Supabase Email Templates

For link-based email verification, update **Authentication -> Email Templates -> Confirm signup** so the confirmation button uses:

```html
<a href="{{ .ConfirmationURL }}">Confirm your email</a>
```

After the link is clicked, the app confirms the account and redirects the user to login.

## Run locally

```bash
npm install
npm run dev
```

## Run with Docker

Create `.env.local` from `.env.example`, add the Supabase values, then run:

```bash
docker compose up --build
```

Open `http://localhost:5173`. Stop the environment with `docker compose down`.

## Android APK

The Android project is already included. If you do not have Android Studio, use the included GitHub Actions workflow at `.github/workflows/android-apk.yml`:

1. Push the project to GitHub.
2. Add repository secrets named `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Open **Actions -> Build Android APK -> Run workflow**.
4. Download `loanmate-debug-apk` from the completed workflow run.

For local builds, install Android Studio and the Android SDK, then run:

```bash
npm install
npx cap add android
npm run mobile:sync
npm run mobile:open
```

Build the APK from Android Studio, or use `npm run mobile:run` with a connected device or emulator. The Android app unlocks with the phone's fingerprint, face, or screen lock. Set `VITE_SITE_URL` to your deployed web URL before building, so confirmation and password-reset emails link to the web app instead of the app's internal `https://localhost`.
