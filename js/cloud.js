/**
 * Cross-device sync.
 *
 * Everything lives under `users/{uid}/…` in Firestore, mirroring the local
 * IndexedDB stores one-for-one. There is no server tier: the security rules are
 * the whole authorization model, so the shapes here must match what
 * firestore/firestore.rules will accept.
 *
 * Conflict handling is deliberately simple and stated plainly rather than
 * pretended away: **last write wins**, per document. Days carry `updatedAt`, so
 * a merge on sign-in keeps the newer copy of a day edited on two devices while
 * offline. Nothing here attempts to merge two edits of the *same* day.
 */

import { initFirebase } from './firebase.js';
import * as store from './store.js';

const COLLECTIONS = ['days', 'favorites', 'supersets', 'custom'];

let firebase = null;
let unsubscribes = [];
let currentUid = null;
let onRemoteChange = null;

export const isAvailable = () => firebase !== null;
export const currentUser = () => firebase?.auth.currentUser ?? null;

/**
 * Boots Firebase if this deployment has a backend, and keeps the store bound to
 * whoever is signed in. Resolves once the first auth state is known, so the UI
 * never flashes signed-out before signed-in.
 */
export async function init(onChange, onRemote) {
  onRemoteChange = onRemote ?? null;
  firebase = await initFirebase();
  if (!firebase) return false;

  const { onAuthStateChanged } = firebase.sdk.auth;

  await new Promise((resolve) => {
    let settled = false;
    onAuthStateChanged(firebase.auth, async (user) => {
      try {
        if (user) await attach(user);
        else detach();
      } catch (error) {
        console.warn('Sync could not start:', error);
      }
      onChange?.(user);
      if (!settled) {
        settled = true;
        resolve();
      }
    });
  });

  return true;
}

// ------------------------------------------------------------------- sign in

export async function signInWithGoogle() {
  const { GoogleAuthProvider, signInWithPopup } = firebase.sdk.auth;
  const provider = new GoogleAuthProvider();
  return signInWithPopup(firebase.auth, provider);
}

export async function signInWithEmail(email, password) {
  const { signInWithEmailAndPassword } = firebase.sdk.auth;
  return signInWithEmailAndPassword(firebase.auth, email, password);
}

export async function registerWithEmail(email, password, displayName) {
  const { createUserWithEmailAndPassword, updateProfile } = firebase.sdk.auth;
  const credential = await createUserWithEmailAndPassword(firebase.auth, email, password);
  if (displayName) await updateProfile(credential.user, { displayName });
  return credential;
}

export async function signOut() {
  const { signOut: fbSignOut } = firebase.sdk.auth;
  await fbSignOut(firebase.auth);
}

// -------------------------------------------------------------------- wiring

const path = (uid, collection) => [`users`, uid, collection];

function docId(collection, record) {
  return collection === 'days' ? record.key : record.id;
}

async function attach(user) {
  if (currentUid === user.uid) return;
  detach();
  currentUid = user.uid;

  const {
    collection,
    doc,
    setDoc,
    deleteDoc,
    onSnapshot,
    getDocs,
    writeBatch,
  } = firebase.sdk.firestore;

  const ref = (name) => collection(firebase.db, ...path(user.uid, name));

  // Push anything this device has that the server hasn't seen, so a first
  // sign-in adopts local history rather than discarding it.
  await mergeLocalUp({ ref, getDocs, writeBatch, doc });

  store.attachRemote({
    put: (name, record) =>
      setDoc(doc(firebase.db, ...path(user.uid, name), docId(name, record)), record, {
        merge: false,
      }),
    remove: (name, id) => deleteDoc(doc(firebase.db, ...path(user.uid, name), id)),
  });

  unsubscribes = COLLECTIONS.map((name) =>
    onSnapshot(
      ref(name),
      (snapshot) => {
        const records = [];
        const removedIds = [];
        for (const change of snapshot.docChanges()) {
          // Firestore echoes our own writes straight back for latency
          // compensation. They are already in the cache, and re-applying them
          // would re-render the screen out from under whatever is being typed.
          if (change.doc.metadata.hasPendingWrites) continue;
          if (change.type === 'removed') removedIds.push(change.doc.id);
          else records.push(change.doc.data());
        }
        if (records.length || removedIds.length) {
          store.applyRemote(name, records, { removedIds });
          onRemoteChange?.();
        }
      },
      (error) => console.warn(`Sync stopped for ${name}:`, error)
    )
  );
}

function detach() {
  for (const stop of unsubscribes) stop();
  unsubscribes = [];
  currentUid = null;
  store.detachRemote();
}

/**
 * One-way merge of local records into an empty-or-partial remote, run once at
 * sign-in. Days already on the server win only if their `updatedAt` is newer,
 * which is what makes signing in on a second device non-destructive.
 */
async function mergeLocalUp({ ref, getDocs, writeBatch, doc }) {
  const local = {
    days: store.allDays(),
    favorites: store.favoriteIds().map((id) => ({ id, at: Date.now() })),
    supersets: store.allSupersets(),
    custom: store.allCustom(),
  };

  for (const name of COLLECTIONS) {
    const snapshot = await getDocs(ref(name));
    const remote = new Map(snapshot.docs.map((entry) => [entry.id, entry.data()]));

    // Firestore batches cap at 500 writes; chunk to stay under it.
    const pending = local[name].filter((record) => {
      const id = docId(name, record);
      const existing = remote.get(id);
      if (!existing) return true;
      if (name !== 'days') return false;
      return (record.updatedAt ?? 0) > (existing.updatedAt ?? 0);
    });

    for (let i = 0; i < pending.length; i += 400) {
      const batch = writeBatch(firebase.db);
      for (const record of pending.slice(i, i + 400)) {
        batch.set(doc(firebase.db, ...path(currentUid, name), docId(name, record)), record);
      }
      await batch.commit();
    }

    // Anything the server has that this device lacks flows in through the
    // snapshot listener attached immediately after this.
  }
}
