import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

const configs = {
  staging: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY_STAGING as string | undefined,
    authDomain: 'ryan953-lifting-staging.web.app',
    projectId: 'ryan953-lifting-staging',
    appId: '1:1058484026369:web:037ae8b1c210bf77a11400',
  },
  prod: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY_PROD as string | undefined,
    authDomain: 'lifting-prod.web.app',
    projectId: 'lifting-prod',
    appId: '1:1065855410815:web:347df00b5aa2a07aba154a',
  },
} as const;

const env = (import.meta.env.VITE_FIREBASE_ENV as 'staging' | 'prod' | undefined) ?? 'staging';
const useEmulators = import.meta.env.DEV;

export const app = initializeApp(
  useEmulators
    ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-lifting' }
    : { ...configs[env], apiKey: configs[env].apiKey ?? '' },
);

export const auth = getAuth(app);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const functions = getFunctions(app);

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
