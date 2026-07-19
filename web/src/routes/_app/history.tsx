import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/history')({
  component: () => (
    <div className="p-4">
      <h1 className="text-2xl font-bold">History</h1>
      <p className="mt-4 text-neutral-400">Performance history and analytics will live here.</p>
    </div>
  ),
});
