# Lending App

This app uses Auth0 for optional authentication, with Supabase providing database storage, realtime updates, and payment-proof uploads. Auth0 ID tokens are passed to Supabase so the existing authenticated RLS policies remain active.

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local` and add the project URL and anon key.
4. In Supabase Dashboard, open **Authentication -> Third-Party Auth**, enable Auth0, and set the tenant to `uvs-praneeth` in region `us`.
5. In Auth0, allow `http://localhost:5173` as an allowed callback, logout, and web origin URL.
6. Add an Auth0 **Post Login** Action that adds the Supabase role claim to ID tokens:

	```js
	exports.onExecutePostLogin = async (event, api) => {
	  api.idToken.setCustomClaim('role', 'authenticated');
	};
	```

## Supabase Email Templates

For link-based email verification, update **Authentication -> Email Templates -> Confirm signup** so the confirmation button uses:

```html
<a href="{{ .ConfirmationURL }}">Confirm your email</a>
```

Set the Supabase Site URL to `http://localhost:5173` for local development. After the link is clicked, the app confirms the account and redirects the user to login.

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

Build the APK from Android Studio, or use `npm run mobile:run` with a connected device or emulator. Supabase authentication remains enabled in the Android app; set the Supabase site URL and redirect URL to the deployed web URL used by the app.
