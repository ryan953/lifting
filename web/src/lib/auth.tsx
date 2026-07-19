import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { auth } from './firebase';

interface AuthState {
  user: User | null;
  /** True until the first onAuthStateChanged callback resolves. */
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(
    () => onAuthStateChanged(auth, (user) => setState({ user, loading: false })),
    [],
  );

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** Signed-in user; only call under a route guarded by requireAuth. */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useUser called outside an authenticated route');
  return user;
}

export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (err: unknown) {
    // Popup is the reliable path on iOS Safari; fall back to redirect only
    // when the environment blocks popups outright.
    const code = (err as { code?: string }).code;
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw err;
  }
}

export function signOut(): Promise<void> {
  return firebaseSignOut(auth);
}
