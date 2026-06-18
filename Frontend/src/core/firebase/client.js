import { initializeApp, getApps } from "firebase/app";
import { getDatabase } from "firebase/database";

let firebaseApp = null;

export const getFirebaseApp = () => {
  if (firebaseApp) return firebaseApp;

  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

  if (!apiKey || !projectId) {
    console.warn(
      "[firebase] Missing VITE_FIREBASE_API_KEY or VITE_FIREBASE_PROJECT_ID; Firebase is disabled.",
    );
    return null;
  }

  const existing = getApps()[0];
  if (existing) {
    firebaseApp = existing;
    return firebaseApp;
  }

  const firebaseConfig = {
    apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || `https://${projectId}-default-rtdb.firebaseio.com`,
    projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };

  try {
    firebaseApp = initializeApp(firebaseConfig);
    return firebaseApp;
  } catch (error) {
    console.error("[firebase] Failed to initialize Firebase app:", error?.message || error);
    return null;
  }
};

export const getRealtimeDb = () => {
  try {
    const app = getFirebaseApp();
    if (!app) return null;
    return getDatabase(app);
  } catch (error) {
    console.error("[firebase] Failed to initialize Firebase Realtime DB:", error?.message || error);
    return null;
  }
};

