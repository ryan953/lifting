import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { BottomNav } from '@/components/BottomNav';

/** Layout route: everything under it requires a signed-in user. */
export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context }) => {
    if (!context.auth.user) throw redirect({ to: '/login' });
  },
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
