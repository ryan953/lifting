/**
 * Firebase bootstrap.
 *
 * The app has no build step, so the SDK is imported as ES modules straight from
 * gstatic rather than bundled. Nothing here loads until we know there is a
 * backend to talk to, which keeps the offline/local-only path free of it.
 *
 * Configuration is *discovered*, never committed: Firebase Hosting serves
 * `/__/firebase/init.json` describing whichever project is serving the page, so
 * one artifact works in staging and prod with no keys in the repo. Anywhere
 * else — GitHub Pages, `python3 -m http.server` — that request 404s and the app
 * stays local-only.
 */

const SDK = 'https://www.gstatic.com/firebasejs/12.3.0';

let bootPromise = null;

async function loadConfig() {
  // Served automatically by Firebase Hosting for the project hosting the page.
  for (const url of ['/__/firebase/init.json', './data/firebase-config.json']) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const config = await response.json();
      if (config?.projectId && config?.apiKey) return config;
    } catch {
      // Network error or file absent — try the next candidate.
    }
  }
  return null;
}

/**
 * Resolves to { app, auth, db, sdk } when a backend is configured, or null when
 * the app should run purely locally. Safe to call repeatedly.
 */
export function initFirebase() {
  bootPromise ??= (async () => {
    const config = await loadConfig();
    if (!config) return null;

    const [appModule, authModule, firestoreModule] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);

    const app = appModule.initializeApp(config);
    const auth = authModule.getAuth(app);

    // Firestore keeps its own IndexedDB cache, which is what makes writes work
    // offline and reads instant on a cold load. Multi-tab so two open tabs
    // don't fight over the lease.
    const db = firestoreModule.initializeFirestore(app, {
      localCache: firestoreModule.persistentLocalCache({
        tabManager: firestoreModule.persistentMultipleTabManager(),
      }),
    });

    return { app, auth, db, sdk: { auth: authModule, firestore: firestoreModule } };
  })().catch((error) => {
    console.warn('Firebase unavailable, staying local-only:', error);
    return null;
  });

  return bootPromise;
}
