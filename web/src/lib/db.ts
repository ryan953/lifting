import { QueryClient, useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  collection,
  doc,
  onSnapshot,
  type CollectionReference,
  type DocumentReference,
  type Query,
} from 'firebase/firestore';
import { useEffect } from 'react';
import type {
  ExerciseStats,
  Session,
  UserExercise,
  UserProfile,
  WeeklyStats,
  WorkoutTemplate,
} from '@lifting/shared';
import { db } from './firebase';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Snapshot listeners keep data fresh; Query never needs to refetch.
      staleTime: Infinity,
      gcTime: 5 * 60 * 1000,
      retry: false,
    },
  },
});

// ---------------------------------------------------------------------------
// Typed path helpers. Firestore data is stored as plain JSON-compatible
// objects (epoch-ms numbers, no Timestamp), so converters are pass-through
// casts at a single choke point.
// ---------------------------------------------------------------------------

function typedDoc<T>(path: string, ...segments: string[]): DocumentReference<T> {
  return doc(db, path, ...segments) as DocumentReference<T>;
}

function typedCollection<T>(path: string, ...segments: string[]): CollectionReference<T> {
  return collection(db, path, ...segments) as CollectionReference<T>;
}

export const refs = {
  userProfile: (uid: string) => typedDoc<UserProfile>('users', uid),
  exercises: (uid: string) => typedCollection<UserExercise>('users', uid, 'exercises'),
  exercise: (uid: string, id: string) => typedDoc<UserExercise>('users', uid, 'exercises', id),
  templates: (uid: string) => typedCollection<WorkoutTemplate>('users', uid, 'templates'),
  template: (uid: string, id: string) => typedDoc<WorkoutTemplate>('users', uid, 'templates', id),
  sessions: (uid: string) => typedCollection<Session>('users', uid, 'sessions'),
  session: (uid: string, id: string) => typedDoc<Session>('users', uid, 'sessions', id),
  exerciseStats: (uid: string, exerciseId: string) =>
    typedDoc<ExerciseStats>('users', uid, 'exerciseStats', exerciseId),
  weeklyStats: (uid: string, week: string) => typedDoc<WeeklyStats>('users', uid, 'weeklyStats', week),
};

// ---------------------------------------------------------------------------
// Live hooks: onSnapshot feeds the TanStack Query cache. Subscriptions are
// refcounted per query key and torn down when the last consumer unmounts.
// ---------------------------------------------------------------------------

interface Subscription {
  refCount: number;
  unsubscribe: () => void;
}

const subscriptions = new Map<string, Subscription>();

function retain(key: string, subscribe: () => () => void): () => void {
  let sub = subscriptions.get(key);
  if (!sub) {
    sub = { refCount: 0, unsubscribe: subscribe() };
    subscriptions.set(key, sub);
  }
  sub.refCount++;
  return () => {
    const s = subscriptions.get(key);
    if (!s) return;
    s.refCount--;
    if (s.refCount <= 0) {
      s.unsubscribe();
      subscriptions.delete(key);
    }
  };
}

export type DocResult<T> = { id: string; data: T } | null;
export type ListResult<T> = { id: string; data: T }[];

export function useLiveDoc<T>(queryKey: readonly unknown[], ref: DocumentReference<T> | null): UseQueryResult<DocResult<T>> {
  const key = JSON.stringify(queryKey);

  useEffect(() => {
    if (!ref) return;
    return retain(key, () =>
      onSnapshot(ref, (snap) => {
        const value: DocResult<T> = snap.exists() ? { id: snap.id, data: snap.data() } : null;
        queryClient.setQueryData<DocResult<T>>(queryKey, () => value);
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ref?.path]);

  return useQuery<DocResult<T>>({
    queryKey,
    enabled: ref !== null,
    // The snapshot listener populates the cache; this only runs before the
    // first snapshot arrives and simply waits for it.
    queryFn: () => new Promise<DocResult<T>>(() => {}),
  });
}

export function useLiveQuery<T>(queryKey: readonly unknown[], query: Query<T> | null): UseQueryResult<ListResult<T>> {
  const key = JSON.stringify(queryKey);

  useEffect(() => {
    if (!query) return;
    return retain(key, () =>
      onSnapshot(query, (snap) => {
        const value: ListResult<T> = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
        queryClient.setQueryData<ListResult<T>>(queryKey, () => value);
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return useQuery<ListResult<T>>({
    queryKey,
    enabled: query !== null,
    queryFn: () => new Promise<ListResult<T>>(() => {}),
  });
}
