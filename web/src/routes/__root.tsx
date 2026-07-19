import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import type { User } from 'firebase/auth';

export interface RouterContext {
  auth: { user: User | null; loading: boolean };
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});
