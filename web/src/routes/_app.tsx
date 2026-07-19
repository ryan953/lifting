import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import type { WeightUnit } from '@lifting/shared';
import { BottomNav } from '@/components/BottomNav';
import { useUser } from '@/lib/auth';
import { ensureUserProfile } from '@/lib/bootstrap';
import { refs, useLiveDoc } from '@/lib/db';

/** Layout route: everything under it requires a signed-in user. */
export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context }) => {
    if (!context.auth.user) throw redirect({ to: '/login' });
  },
  component: AppLayout,
});

function AppLayout() {
  const user = useUser();
  const profile = useLiveDoc(['profile', user.uid], refs.userProfile(user.uid));

  if (profile.isPending) {
    return <div className="flex min-h-dvh items-center justify-center text-neutral-500">Loading…</div>;
  }

  if (profile.data === null) {
    return <FirstRunSetup />;
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}

function FirstRunSetup() {
  const user = useUser();
  const [busy, setBusy] = useState(false);

  async function choose(units: WeightUnit) {
    setBusy(true);
    // The profile snapshot listener flips the layout to the app once written.
    await ensureUserProfile(user, units);
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Welcome!</h1>
        <p className="mt-2 text-neutral-400">How do you load your bar?</p>
      </div>
      <div className="flex gap-4">
        <button
          type="button"
          disabled={busy}
          onClick={() => void choose('lb')}
          className="rounded-xl bg-white px-8 py-4 text-lg font-semibold text-neutral-900 disabled:opacity-50"
        >
          Pounds
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void choose('kg')}
          className="rounded-xl bg-white px-8 py-4 text-lg font-semibold text-neutral-900 disabled:opacity-50"
        >
          Kilograms
        </button>
      </div>
      <p className="text-sm text-neutral-500">You can change this later in settings.</p>
    </main>
  );
}
