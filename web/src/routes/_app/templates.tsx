import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/templates')({
  component: () => (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Templates</h1>
      <p className="mt-4 text-neutral-400">Workout templates will live here.</p>
    </div>
  ),
});
