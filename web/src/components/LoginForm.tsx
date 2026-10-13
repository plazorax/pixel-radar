import { useState, type FormEvent } from 'react';
import { DISPLAY_NAME, ENV } from '../../../src/shared/app.ts';
import { api } from '../api.ts';
import Logo from './Logo.tsx';

export default function LoginForm({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.login(password);
      onLoggedIn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-88">
        <div className="mb-4 flex items-center justify-center gap-2">
          <Logo className="h-6 w-6" />
          <h1 className="text-base font-semibold tracking-tight">{DISPLAY_NAME}</h1>
        </div>
        <form onSubmit={submit} className="rounded-md border border-line bg-surface p-5">
          <label htmlFor="password" className="block text-[13px] font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={submitting}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'login-error' : undefined}
            className="mt-1.5 h-8 w-full rounded-md border border-line-strong bg-surface px-2.5 text-sm focus:border-ink focus:ring-1 focus:ring-ink focus:outline-none focus-visible:outline-none"
          />
          {error && (
            <p id="login-error" className="mt-2 text-[13px] text-changed" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="mt-4 h-8 w-full rounded-md bg-ink px-4 text-[13px] font-medium text-white hover:bg-ink/85 disabled:opacity-60"
          >
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
        </form>
        <p className="mt-3 text-center text-xs text-muted">
          The password is set with <code className="font-mono">{ENV.password}</code> on the server.
        </p>
      </div>
    </main>
  );
}
