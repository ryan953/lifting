import { getDoc, setDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import type { UserProfile, WeightUnit } from '@lifting/shared';
import { refs } from './db';

/** Create the user profile on first sign-in. Returns the profile either way. */
export async function ensureUserProfile(user: User, units: WeightUnit = 'lb'): Promise<UserProfile> {
  const ref = refs.userProfile(user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();

  const profile: UserProfile = {
    displayName: user.displayName ?? 'Lifter',
    units,
    activeSessionId: null,
    createdAt: Date.now(),
  };
  await setDoc(ref, profile);
  return profile;
}
