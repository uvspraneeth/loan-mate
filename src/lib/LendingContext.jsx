import { createContext, useContext } from 'react';
import { useLendingData } from './useLendingData';

const Ctx = createContext(null);

export function LendingProvider({ children }) {
  const data = useLendingData();
  return <Ctx.Provider value={data}>{children}</Ctx.Provider>;
}

export function useLending() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLending must be used within LendingProvider');
  return ctx;
}