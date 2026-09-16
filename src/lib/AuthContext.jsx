import React, { createContext, useContext, useEffect, useState } from 'react';
import { db, supabase } from '@/api/supabaseClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    let mounted = true;
    db.auth.me()
      .then((currentUser) => mounted && setUser(currentUser))
      .catch(() => mounted && setUser(null))
      .finally(() => mounted && setIsLoadingAuth(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        const authUser = session?.user;
        setUser(authUser ? {
          ...authUser,
          id: authUser.id,
          full_name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || '',
        } : null);
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const logout = async () => {
    await db.auth.logout();
    setUser(null);
  };

  const navigateToLogin = () => db.auth.redirectToLogin();

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: Boolean(user),
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authError,
      appPublicSettings: null,
      authChecked: !isLoadingAuth,
      logout,
      navigateToLogin,
      checkUserAuth: async () => {
        try {
          setUser(await db.auth.me());
          setAuthError(null);
        } catch {
          setUser(null);
        }
      },
      checkAppState: async () => {},
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
