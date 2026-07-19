import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { signInWithGoogle } from '@/lib/auth';

export const Route = createFileRoute('/login')({
  beforeLoad: ({ context }) => {
    if (context.auth.user) throw redirect({ to: '/' });
  },
  component: LoginPage,
});

function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      // onAuthStateChanged re-renders the router with a user; the beforeLoad
      // redirect on this route then sends us home.
      window.location.assign('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Lifting</h1>
        <p className="mt-2 text-neutral-400">Track your progression, session by session.</p>
      </div>
      <button
        type="button"
        onClick={handleSignIn}
        disabled={busy}
        className="rounded-xl bg-white px-6 py-3 font-semibold text-neutral-900 disabled:opacity-50"
      >
        {busy ? 'Signing in…' : 'Sign in with Google'}
      </button>
      {error && <p className="max-w-sm text-center text-sm text-red-400">{error}</p>}
    </main>
  );
}
