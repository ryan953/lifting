import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/exercises')({
  component: () => (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Exercises</h1>
      <p className="mt-4 text-neutral-400">The exercise library will live here.</p>
    </div>
  ),
});
