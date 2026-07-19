import type { UserProfile, WeightUnit } from '@lifting/shared';
import { useUser } from './auth';
import { refs, useLiveDoc } from './db';

/**
 * Profile for the signed-in user. Under /_app the profile doc always exists
 * (FirstRunSetup gates it), so consumers can rely on a unit being available
 * once data resolves; 'lb' covers the brief pending window.
 */
export function useProfile(): { profile: UserProfile | null; unit: WeightUnit } {
  const user = useUser();
  const doc = useLiveDoc(['profile', user.uid], refs.userProfile(user.uid));
  const profile = doc.data?.data ?? null;
  return { profile, unit: profile?.units ?? 'lb' };
}
