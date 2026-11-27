import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const env = import.meta.env;
const projectId = env.VITE_FIREBASE_PROJECT_ID;
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || (projectId ? `${projectId}.firebaseapp.com` : ''),
  projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

// When no keys are set, the app runs in demo mode so the UI still works.
export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

const app = isFirebaseConfigured ? initializeApp(config) : null;
export const auth = app ? getAuth(app) : null;
if (auth) {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
}
export const db = app ? getFirestore(app) : null;