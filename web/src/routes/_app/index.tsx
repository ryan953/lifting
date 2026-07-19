import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { signOut, useUser } from '@/lib/auth';
import { refs, useLiveQuery } from '@/lib/db';
import { useProfile } from '@/lib/profile';
import { ActiveSession } from '@/features/session/ActiveSession';
import { StartSessionSheet } from '@/features/session/StartSessionSheet';

export const Route = createFileRoute('/_app/')({
  component: SessionPage,
});

function SessionPage() {
  const user = useUser();
  const { profile } = useProfile();
  const templates = useLiveQuery(['templates', user.uid], refs.templates(user.uid));
  const [startingTemplateId, setStartingTemplateId] = useState<string | null>(null);

  if (profile?.activeSessionId) {
    return <ActiveSession sessionId={profile.activeSessionId} />;
  }

  const visibleTemplates = (templates.data ?? []).filter((t) => !t.data.isArchived);

  return (
    <div className="p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Start a workout</h1>
        <button type="button" onClick={() => void signOut()} className="text-sm text-neutral-400">
          Sign out
        </button>
      </header>

      <ul className="mt-4 space-y-3">
        {visibleTemplates.map(({ id, data }) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => setStartingTemplateId(id)}
              className="block w-full rounded-2xl bg-surface p-4 text-left"
            >
              <span className="text-lg font-semibold">{data.name}</span>
              <p className="mt-1 text-sm text-neutral-400">
                {data.exercises.length} exercise{data.exercises.length === 1 ? '' : 's'}
              </p>
            </button>
          </li>
        ))}
      </ul>

      {templates.data && visibleTemplates.length === 0 && (
        <p className="mt-8 text-center text-neutral-500">
          No templates yet.{' '}
          <Link to="/templates/$templateId" params={{ templateId: 'new' }} className="text-accent">
            Create one
          </Link>{' '}
          to get started.
        </p>
      )}

      {startingTemplateId && (
        <StartSessionSheet templateId={startingTemplateId} onClose={() => setStartingTemplateId(null)} />
      )}
    </div>
  );
}
