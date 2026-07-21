import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import AppShell from './AppShell';
import AppRouter from './router';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell>
          <AppRouter />
        </AppShell>
      </AuthProvider>
    </BrowserRouter>
  );
}
