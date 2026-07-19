import { createFileRoute, Link } from '@tanstack/react-router';
import { useUser } from '@/lib/auth';
import { refs, useLiveQuery } from '@/lib/db';

export const Route = createFileRoute('/_app/templates/')({
  component: TemplateListPage,
});

function TemplateListPage() {
  const user = useUser();
  const templates = useLiveQuery(['templates', user.uid], refs.templates(user.uid));
  const visible = (templates.data ?? []).filter((t) => !t.data.isArchived);

  return (
    <div className="p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Templates</h1>
        <Link to="/templates/$templateId" params={{ templateId: 'new' }} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-neutral-900">
          + New
        </Link>
      </header>

      <ul className="mt-4 space-y-3">
        {visible.map(({ id, data }) => (
          <li key={id}>
            <Link
              to="/templates/$templateId"
              params={{ templateId: id }}
              className="block rounded-2xl bg-surface p-4"
            >
              <span className="text-lg font-semibold">{data.name}</span>
              <p className="mt-1 text-sm text-neutral-400">
                {data.exercises.length} exercise{data.exercises.length === 1 ? '' : 's'}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      {templates.data && visible.length === 0 && (
        <p className="mt-8 text-center text-neutral-500">
          No templates yet. Create one to plan your workouts.
        </p>
      )}
    </div>
  );
}
