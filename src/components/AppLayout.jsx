import { LendingProvider } from '@/lib/LendingContext';
import Layout from '@/components/Layout';

// Wraps the shared data provider around the layout so every page
// and the nav share one data load.
export default function AppLayout() {
  return (
    <LendingProvider>
      <Layout />
    </LendingProvider>
  );
}