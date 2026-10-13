import { useCallback, useEffect, useState } from 'react';
import { api } from './api.ts';
import Dashboard from './components/Dashboard.tsx';
import LoginForm from './components/LoginForm.tsx';
import { DISPLAY_NAME } from '../../src/shared/app.ts';
import type { SessionInfo } from '../../src/shared/types.ts';

export default function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(() => {
    api
      .session()
      .then((info) => {
        setSession(info);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(loadSession, [loadSession]);

  if (error) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <p className="text-warn">Could not reach the {DISPLAY_NAME} server: {error}</p>
      </main>
    );
  }
  if (!session) return null;

  if (session.authRequired && !session.authenticated) {
    return <LoginForm onLoggedIn={loadSession} />;
  }

  return (
    <Dashboard
      canLogOut={session.authRequired}
      onUnauthorized={() => setSession({ ...session, authenticated: false })}
      onLogOut={() => api.logout().finally(loadSession)}
    />
  );
}
