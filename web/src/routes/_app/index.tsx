import { createFileRoute } from '@tanstack/react-router';
import { useUser, signOut } from '@/lib/auth';

export const Route = createFileRoute('/_app/')({
  component: SessionPage,
});

function SessionPage() {
  const user = useUser();
  return (
    <div className="p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Session</h1>
        <button type="button" onClick={() => void signOut()} className="text-sm text-neutral-400">
          Sign out
        </button>
      </header>
      <p className="mt-4 text-neutral-400">
        Welcome, {user.displayName ?? 'lifter'}. No active session — pick a template to start.
      </p>
    </div>
  );
}
