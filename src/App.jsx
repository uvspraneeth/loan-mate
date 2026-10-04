import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { AppLockProvider } from '@/lib/AppLock';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/AppLayout';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import EmailConfirmation from '@/pages/EmailConfirmation';
import Home from '@/pages/Home';
import Borrowers from '@/pages/Borrowers';
import Loans from '@/pages/Loans';
import LoanDetail from '@/pages/LoanDetail';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import Import from '@/pages/Import';
import { Navigate } from 'react-router-dom';
import { isSupabaseConfigured } from '@/api/supabaseClient';
import { LogoMark } from '@/components/Logo';
// Add page imports here

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/auth/confirm" element={<EmailConfirmation />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/borrowers" element={<Borrowers />} />
          <Route path="/loans" element={<Loans />} />
          <Route path="/loans/:id" element={<LoanDetail />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/import" element={<Import />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

// Device lock sits on top of login: it only applies while someone is signed in.
const LockedApp = ({ children }) => {
  const { isAuthenticated, logout } = useAuth();
  // Fallback when the device can't verify: sign out and log in with the password again.
  const logInWithPassword = async () => {
    await logout();
    window.location.assign('/login');
  };
  return <AppLockProvider enabled={isAuthenticated} onUsePassword={logInWithPassword}>{children}</AppLockProvider>;
};

const SupabaseSetupRequired = () => (
  <div className="min-h-screen flex items-center justify-center bg-background px-4">
    <div className="w-full max-w-md text-center space-y-4">
      <LogoMark className="w-14 h-14 mx-auto" />
      <h1 className="text-2xl font-bold text-slate-900">Supabase isn&apos;t configured</h1>
      <p className="text-sm text-slate-500">
        Create a <code className="rounded bg-slate-100 px-1">.env.local</code> file (see <code className="rounded bg-slate-100 px-1">.env.example</code>) with
        {' '}<code className="rounded bg-slate-100 px-1">VITE_SUPABASE_URL</code> and <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_ANON_KEY</code>, then restart the dev server.
      </p>
    </div>
  </div>
);

function App() {
  if (!isSupabaseConfigured) return <SupabaseSetupRequired />;

  return (
    <AuthProvider>
      <LockedApp>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </LockedApp>
    </AuthProvider>
  )
}

export default App
