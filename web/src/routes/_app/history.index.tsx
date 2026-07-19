import { createFileRoute, Link } from '@tanstack/react-router';
import { limit, orderBy, query, where } from 'firebase/firestore';
import { useState } from 'react';
import { toDisplay } from '@lifting/shared';
import { useUser } from '@/lib/auth';
import { refs, useLiveQuery } from '@/lib/db';
import { useProfile } from '@/lib/profile';

export const Route = createFileRoute('/_app/history/')({
  component: HistoryListPage,
});

const PAGE_SIZE = 20;

function HistoryListPage() {
  const user = useUser();
  const { unit } = useProfile();
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const sessions = useLiveQuery(
    ['sessions', user.uid, 'completed', pageSize],
    query(
      refs.sessions(user.uid),
      where('status', 'in', ['completed', 'abandoned']),
      orderBy('completedAt', 'desc'),
      limit(pageSize),
    ),
  );

  const rows = sessions.data ?? [];

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">History</h1>

      <ul className="mt-4 space-y-3">
        {rows.map(({ id, data }) => {
          const workingSets = data.exercises.reduce((n, ex) => n + ex.sets.filter((s) => !s.isWarmup).length, 0);
          const volume = data.exercises.reduce(
            (v, ex) => v + ex.sets.filter((s) => !s.isWarmup).reduce((sv, s) => sv + s.weightKg * s.reps, 0),
            0,
          );
          return (
            <li key={id}>
              <Link to="/history/$sessionId" params={{ sessionId: id }} className="block rounded-2xl bg-surface p-4">
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">{data.templateName}</span>
                  <span className="text-sm text-neutral-500">
                    {data.completedAt ? new Date(data.completedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-400">
                  {data.exercises.length} exercise{data.exercises.length === 1 ? '' : 's'} · {workingSets} sets ·{' '}
                  {Math.round(toDisplay(volume, unit)).toLocaleString()} {unit} volume
                  {data.status === 'abandoned' && <span className="ml-2 text-amber-400">abandoned</span>}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>

      {rows.length === pageSize && (
        <button type="button" onClick={() => setPageSize((s) => s + PAGE_SIZE)} className="mt-4 w-full py-2 text-sm text-neutral-400">
          Load more
        </button>
      )}

      {sessions.data && rows.length === 0 && (
        <p className="mt-8 text-center text-neutral-500">No completed workouts yet.</p>
      )}
    </div>
  );
}
