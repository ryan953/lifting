import { useEffect, useState } from 'react';

interface Props {
  /** Epoch ms the rest began (when the set was logged). */
  startedAt: number;
  targetSec: number;
  onDismiss: () => void;
}

export function RestTimer({ startedAt, targetSec, onDismiss }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.floor((now - startedAt) / 1000);
  const remaining = targetSec - elapsed;
  const done = remaining <= 0;

  return (
    <button
      type="button"
      onClick={onDismiss}
      className={`fixed inset-x-4 bottom-24 z-40 mx-auto max-w-md rounded-2xl px-6 py-3 text-center shadow-lg ${
        done ? 'bg-accent text-neutral-900' : 'bg-surface'
      }`}
      aria-live="polite"
    >
      {done ? (
        <span className="font-semibold">Rest done — go!</span>
      ) : (
        <span>
          Rest <span className="font-mono font-semibold">{format(remaining)}</span>
        </span>
      )}
      <span className="ml-2 text-xs opacity-60">tap to dismiss</span>
    </button>
  );
}

function format(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
