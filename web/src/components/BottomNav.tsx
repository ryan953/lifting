import { Link } from '@tanstack/react-router';

const tabs = [
  { to: '/', label: 'Session', icon: '🏋️' },
  { to: '/templates', label: 'Templates', icon: '📋' },
  { to: '/exercises', label: 'Exercises', icon: '💪' },
  { to: '/history', label: 'History', icon: '📈' },
] as const;

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 mx-auto max-w-lg border-t border-neutral-800 bg-surface pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4">
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className="flex flex-col items-center gap-0.5 py-2 text-xs text-neutral-400 [&.active]:text-accent"
            activeOptions={{ exact: tab.to === '/' }}
          >
            <span aria-hidden className="text-xl">
              {tab.icon}
            </span>
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
