import { useEffect, useState } from 'react';

/** Small banner when the device is offline; Firestore keeps working locally. */
export function OfflineBadge() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 bg-amber-500/90 py-1 text-center text-xs font-semibold text-neutral-900"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 0.25rem)' }}
    >
      Offline — sets are saved on this device and will sync when you reconnect
    </div>
  );
}
