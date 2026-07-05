import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { signIn, signOut } from '../data';

interface AuthMenuProps {
  session: Session | null;
}

const INPUT =
  'w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm ' +
  'outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900';

// Sign-in for the dashboard owner. There is no sign-up flow on purpose:
// the single account is created in the Supabase dashboard, and RLS only
// accepts writes from the owner's email.
export default function AuthMenu({ session }: AuthMenuProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="hidden text-neutral-500 dark:text-neutral-400 sm:inline">
          {session.user.email}
        </span>
        <button
          onClick={() => signOut().catch(() => undefined)}
          className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Sign out
        </button>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      setOpen(false);
      setEmail('');
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        Sign in
      </button>
      {open && (
        <form
          onSubmit={handleSubmit}
          className="absolute right-0 top-full z-20 mt-2 w-64 space-y-2 rounded-xl border border-neutral-200 bg-card-light p-3 shadow-lg dark:border-neutral-800 dark:bg-card-dark"
        >
          <input
            className={INPUT}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <input
            className={INPUT}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}
    </div>
  );
}
